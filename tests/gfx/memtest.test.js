import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { memtestSteps, withSeed, seedOf, measure, runMemtest } from '../../src/gfx/memtest.js'
import { checkMemtest, parseDump, memtestUrl, measureWithRetry, compareM6 } from '../../scripts/memtest.mjs'

describe('memtestSteps : la partie scriptée de la spec du lot 1 §4.1', () => {
  const steps = memtestSteps()
  const names = steps.map(s => s.etape)

  it('menu, première image de M1, M1 à M6, retour au menu, 10 montages de M6, menu, 5 arènes PvP, menu', () => {
    expect(names).toEqual([
      'menu', 'premiere-image', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'menu-campagne',
      'M6-1', 'M6-2', 'M6-3', 'M6-4', 'M6-5', 'M6-6', 'M6-7', 'M6-8', 'M6-9', 'M6-10', 'menu-m6',
      'pvp-1', 'pvp-2', 'pvp-3', 'pvp-4', 'pvp-5', 'menu-final',
    ])
  })

  it('chaque étape dit quoi monter', () => {
    expect(steps[0]).toEqual({ etape: 'menu', type: 'menu' })
    expect(steps[1]).toEqual({ etape: 'premiere-image', type: 'premiere', n: 1 })
    expect(steps[4]).toEqual({ etape: 'M3', type: 'mission', n: 3 })
    expect(steps[18]).toEqual({ etape: 'M6-10', type: 'mission', n: 6 })
    expect(steps[20]).toEqual({ etape: 'pvp-1', type: 'pvp', i: 1 })
    expect(steps[25]).toEqual({ etape: 'menu-final', type: 'menu', apresPvp: true })
  })

  // Première image d'une mission (spec du lot 1 §4.6) : mesurée à froid, aucun shader de mission encore compilé, donc
  // juste après le menu de départ, comme la première mission d'une session.
  it('la première image est mesurée juste après le menu de départ, avant toute mission', () => {
    expect(steps.findIndex(s => s.type === 'premiere')).toBe(1)
    expect(steps.filter(s => s.type === 'premiere')).toHaveLength(1)
  })
})

describe('withSeed et seedOf : chaque montage d\'une même étape tire le même hasard', () => {
  it('même graine, même suite ; Math.random rendu ensuite', () => {
    const orig = Math.random
    const a = withSeed(42, () => [Math.random(), Math.random(), Math.random()])
    const b = withSeed(42, () => [Math.random(), Math.random(), Math.random()])
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(3)
    expect(Math.random).toBe(orig)
  })

  it('Math.random rendu même si le montage échoue', () => {
    const orig = Math.random
    expect(() => withSeed(1, () => { throw new Error('carte') })).toThrow('carte')
    expect(Math.random).toBe(orig)
  })

  // La première image monte la foule de M1 : l'étape M1 qui suit dessine les mêmes modèles et garde ses compteurs.
  it('la première image tire le hasard de M1', () => {
    const steps = memtestSteps()
    expect(seedOf(steps.find(s => s.etape === 'premiere-image'))).toBe(seedOf(steps.find(s => s.etape === 'M1')))
  })

  it('les montages de M6 partagent une graine, différente de celle de M5', () => {
    const steps = memtestSteps()
    const m6 = steps.filter(s => s.type === 'mission' && s.n === 6).map(seedOf)
    expect(new Set(m6).size).toBe(1)
    expect(seedOf(steps.find(s => s.etape === 'M5'))).not.toBe(m6[0])
    const pvp = steps.filter(s => s.type === 'pvp').map(seedOf)
    expect(new Set(pvp).size).toBe(1)
  })
})

describe('measure : compteurs du renderer et tas JS', () => {
  it('relève géométries, textures, programmes, appels, triangles et tas en Mo', () => {
    const info = { memory: { geometries: 461, textures: 31 }, programs: Array(14).fill({}), render: { calls: 312, triangles: 1254321 } }
    expect(measure(info, { usedJSHeapSize: 85.4e6 }))
      .toEqual({ geometries: 461, textures: 31, programmes: 14, appels: 312, triangles: 1254321, tasMo: 85 })
  })

  it('tas inconnu hors de Chrome : null', () => {
    const info = { memory: { geometries: 0, textures: 0 }, programs: null, render: { calls: 0, triangles: 0 } }
    expect(measure(info, undefined)).toEqual({ geometries: 0, textures: 0, programmes: 0, appels: 0, triangles: 0, tasMo: null })
  })

  // Critère « partie complète » (spec du lot 1 §6, reformulé le 9 octobre 2026, §8) : son seuil ajoute les ressources
  // des modèles chargés, relevées par la route (characters.js, modelResources) et publiées avec chaque relevé.
  it('publie les géométries et textures des modèles chargés quand on les lui donne', () => {
    const info = { memory: { geometries: 447, textures: 32 }, programs: [], render: { calls: 540, triangles: 10506 } }
    expect(measure(info, undefined, { geometries: 38, textures: 29 })).toEqual({
      geometries: 447, textures: 32, programmes: 0, appels: 540, triangles: 10506, tasMo: null,
      geometriesModeles: 38, texturesModeles: 29,
    })
  })
})

describe('runMemtest : monte, rend, mesure, publie', () => {
  const steps = [{ etape: 'menu', type: 'menu' }, { etape: 'M1', type: 'mission', n: 1 }]

  it('une entrée par étape, dans l\'ordre, publiée au fil de l\'eau puis terminée', async () => {
    const log = []
    let k = 0
    const reports = []
    const entries = await runMemtest({
      steps,
      act: s => log.push('monte ' + s.etape),
      render: s => log.push('rend ' + s.etape),
      snapshot: () => ({ geometries: ++k }),
      report: (e, state) => reports.push([e.length, state]),
      pause: async () => {},
    })
    expect(log).toEqual(['monte menu', 'rend menu', 'monte M1', 'rend M1'])
    expect(entries).toEqual([{ etape: 'menu', geometries: 1 }, { etape: 'M1', geometries: 2 }])
    expect(reports).toEqual([[1, 'en-cours'], [2, 'en-cours'], [2, 'fini']])
  })

  // Étape premiere-image : la préparation (act) et la première image (render) publient leurs durées et leurs comptes,
  // rangés après les compteurs du renderer. Une étape qui ne renvoie rien (ou autre chose qu'un objet) n'ajoute rien.
  it('ce que renvoient act et render est ajouté à l\'entrée de l\'étape', async () => {
    const entries = await runMemtest({
      steps,
      act: async s => s.etape === 'M1' ? { precompilation: true, preparationMs: 12.5 } : 3,
      render: s => s.etape === 'M1' ? { premiereImageMs: 40.2 } : undefined,
      snapshot: () => ({ geometries: 7 }),
      report: () => {},
      pause: async () => {},
    })
    expect(entries).toEqual([
      { etape: 'menu', geometries: 7 },
      { etape: 'M1', geometries: 7, precompilation: true, preparationMs: 12.5, premiereImageMs: 40.2 },
    ])
  })

  it('une étape qui échoue arrête la mesure et le dit', async () => {
    const reports = []
    const entries = await runMemtest({
      steps,
      act: s => { if (s.etape === 'M1') throw new Error('carte introuvable') },
      render: () => {},
      snapshot: () => ({ geometries: 1 }),
      report: (e, state) => reports.push([e.map(x => x.etape), state]),
      pause: async () => {},
    })
    expect(entries.at(-1)).toEqual({ etape: 'M1', erreur: 'carte introuvable' })
    expect(reports.at(-1)).toEqual([['menu', 'M1'], 'erreur'])
  })
})

describe('checkMemtest : seuils du §6 de la spec', () => {
  // Résultat qui tient tous les seuils : on en dérive un qui en casse un seul à la fois. Chaque relevé porte les
  // ressources des modèles chargés, publiées par la route (geometriesModeles, texturesModeles).
  const base = { geometries: 500, textures: 40, programmes: 20, appels: 300, triangles: 900000, tasMo: 80,
    geometriesModeles: 38, texturesModeles: 29 }
  const good = () => memtestSteps().map(s => ({ etape: s.etape, ...base }))
  const set = (entries, etape, patch) => entries.map(e => e.etape === etape ? { ...e, ...patch } : e)
  const failed = r => r.filter(c => !c.ok).map(c => c.critere)
  // Les trois retours au menu d'après le menu de départ, changés ensemble (ils doivent rester identiques).
  const RETOURS = ['menu-campagne', 'menu-m6', 'menu-final']
  const retours = (entries, patch) => RETOURS.reduce((e, etape) => set(e, etape, patch), entries)

  it('tout tenu : aucun échec', () => {
    const r = checkMemtest(good())
    expect(failed(r)).toEqual([])
    expect(r.length).toBeGreaterThanOrEqual(4)
  })

  // Critère « partie complète » reformulé le 9 octobre 2026 (spec du lot 1 §8, qui remplace le §6 d'origine) : au
  // retour de campagne, le renderer garde en plus les ressources des modèles GLB, partagées et gardées pour la session.
  it('partie complète : géométries au plus menu + 2 % + celles des modèles, textures au plus menu + 2 + celles des modèles', () => {
    // 500 × 1,02 + 38 = 548 ; 40 + 2 + 29 = 71
    expect(failed(checkMemtest(retours(good(), { geometries: 548 })))).toEqual([])
    expect(failed(checkMemtest(retours(good(), { geometries: 549 })))).toEqual(['partie complète'])
    expect(failed(checkMemtest(retours(good(), { textures: 71 })))).toEqual([])
    expect(failed(checkMemtest(retours(good(), { textures: 72 })))).toEqual(['partie complète'])
  })

  it('partie complète : les nombres des modèles sont ceux que la route publie, jamais des constantes', () => {
    const autres = good().map(e => ({ ...e, geometriesModeles: 10, texturesModeles: 5 }))
    // 500 × 1,02 + 10 = 520 ; 40 + 2 + 5 = 47
    expect(failed(checkMemtest(retours(autres, { geometries: 520, textures: 47 })))).toEqual([])
    expect(failed(checkMemtest(retours(autres, { geometries: 521 })))).toEqual(['partie complète'])
    expect(failed(checkMemtest(retours(autres, { textures: 48 })))).toEqual(['partie complète'])
  })

  // Les nombres des modèles sont ceux du retour de campagne, l'étape dont on juge le seuil : ceux d'une autre étape
  // (menu de départ avant tout chargement, ou modèle arrivé plus tard) ne comptent pas.
  it('partie complète : les nombres des modèles sont lus au retour de campagne, pas à une autre étape', () => {
    const avant = good().map(e => ({ ...e, geometriesModeles: 0, texturesModeles: 0 }))
    const charges = set(avant, 'menu-campagne', { geometriesModeles: 38, texturesModeles: 29 })
    // 500 × 1,02 + 38 = 548 ; 40 + 2 + 29 = 71, alors que les autres étapes donneraient 510 et 42
    expect(failed(checkMemtest(retours(charges, { geometries: 548, textures: 71 })))).toEqual([])
    const plusTard = set(good(), 'menu-campagne', { geometriesModeles: 10, texturesModeles: 5 })
    // 500 × 1,02 + 10 = 520 ; 40 + 2 + 5 = 47, alors que les autres étapes donneraient 548 et 71
    expect(failed(checkMemtest(retours(plusTard, { geometries: 521 })))).toEqual(['partie complète'])
    expect(failed(checkMemtest(retours(plusTard, { textures: 48 })))).toEqual(['partie complète'])
  })

  it('partie complète : sans les nombres des modèles, échec (jamais un succès par défaut)', () => {
    const sans = good().map(({ geometriesModeles, texturesModeles, ...e }) => e)
    expect(failed(checkMemtest(sans))).toEqual(['partie complète'])
    expect(failed(checkMemtest(set(good(), 'menu-campagne', { geometriesModeles: null })))).toEqual(['partie complète'])
  })

  it('partie complète : menu-m6 et menu-final identiques à menu-campagne, en géométries et en textures', () => {
    expect(failed(checkMemtest(set(good(), 'menu-m6', { geometries: 501 })))).toEqual(['partie complète'])
    expect(failed(checkMemtest(set(good(), 'menu-final', { textures: 41 })))).toEqual(['partie complète'])
    expect(failed(checkMemtest(set(good(), 'menu-final', { geometries: 499 })))).toEqual(['partie complète'])   // sous le seuil, mais différent
    expect(failed(checkMemtest(good().filter(e => e.etape !== 'menu-m6')))).toEqual(['partie complète'])
    // Les programmes n'en sont pas : les shaders du PvP restent compilés, menu-final en a plus.
    expect(failed(checkMemtest(set(good(), 'menu-final', { programmes: 25 })))).toEqual([])
  })

  it('10 montages de M6 : rien ne bouge entre le 2e et le 10e', () => {
    for (const k of ['geometries', 'textures', 'programmes']) {
      expect(failed(checkMemtest(set(good(), 'M6-10', { [k]: base[k] + 1 })))).toEqual(['10 montages de M6'])
    }
    expect(failed(checkMemtest(set(good(), 'M6-1', { geometries: 400 })))).toEqual([])   // le 1er peut différer
  })

  it('PvP : rien ne bouge après la 1re arène', () => {
    expect(failed(checkMemtest(set(good(), 'pvp-3', { textures: 41 })))).toEqual(['PvP'])
    expect(failed(checkMemtest(set(good(), 'pvp-5', { geometries: 499 })))).toEqual(['PvP'])
  })

  // Seuil Bas : 1,4 M pour le lot 1 (géométrie des personnages seule), 0,8 M reporté au lot poids (spec du lot 1 §8).
  it('triangles de M6 à la vue de départ : 1,5 M en Moyen (par défaut), 1,4 M en Bas', () => {
    expect(failed(checkMemtest(set(good(), 'M6', { triangles: 1.5e6 })))).toEqual([])
    expect(failed(checkMemtest(set(good(), 'M6', { triangles: 1.5e6 + 1 })))).toEqual(['triangles de M6'])
    expect(failed(checkMemtest(set(good(), 'M6', { triangles: 1.4e6 }), { qualite: 'bas' }))).toEqual([])
    expect(failed(checkMemtest(set(good(), 'M6', { triangles: 1.4e6 + 1 }), { qualite: 'bas' }))).toEqual(['triangles de M6'])
    expect(failed(checkMemtest(set(good(), 'M6', { triangles: 1330361 }), { qualite: 'bas' }))).toEqual([])   // mesure de L4
    expect(failed(checkMemtest(set(good(), 'M6', { triangles: 1.5e6 + 1 }), { qualite: 'auto' }))).toEqual(['triangles de M6'])
    expect(failed(checkMemtest(set(good(), 'M6', { triangles: 3e6 }), { qualite: 'haut' }))).toEqual([])   // pas de seuil en Haut
  })

  it('étape absente ou en erreur : échec, jamais un succès par défaut', () => {
    const sansPvp = good().filter(e => !e.etape.startsWith('pvp'))
    expect(failed(checkMemtest(sansPvp))).toEqual(['PvP'])
    const erreur = [...good().slice(0, 3), { etape: 'M3', erreur: 'x' }]
    expect(failed(checkMemtest(erreur))).toEqual(['mesure complète', 'partie complète', '10 montages de M6', 'PvP', 'triangles de M6'])
  })
})

describe('memtestUrl : adresse de la route', () => {
  it('images par étape, qualité transmise, précompilation coupée sur demande (mesure d\'avant la tâche L7)', () => {
    const base = 'http://localhost:5173/'
    expect(memtestUrl(base, { images: 3 })).toBe('http://localhost:5173/?memtest=1&images=3')
    expect(memtestUrl(base, { images: 5, qualite: 'bas' })).toBe('http://localhost:5173/?memtest=1&images=5&qualite=bas')
    expect(memtestUrl(base, { images: 3, precompilation: false })).toBe('http://localhost:5173/?memtest=1&images=3&precompilation=0')
    expect(memtestUrl(base, { images: 3, precompilation: true })).toBe('http://localhost:5173/?memtest=1&images=3')
  })
})

describe('parseDump : sortie de Chrome --dump-dom', () => {
  it('lit le titre, la qualité demandée et les étapes du <pre id="memtest">', () => {
    const html = `<html><head><title>memtest:fini</title></head><body><div id="menu">x</div>
<pre id="memtest" data-qualite="bas" style="position:fixed">[
 {
  "etape": "menu",
  "geometries": 461
 },
 {
  "etape": "M1",
  "erreur": "a &lt; b &amp;&amp; c &gt; d"
 }
]</pre></body></html>`
    expect(parseDump(html)).toEqual({
      title: 'memtest:fini',
      qualite: 'bas',
      etapes: [{ etape: 'menu', geometries: 461 }, { etape: 'M1', erreur: 'a < b && c > d' }],
    })
  })

  it('page sans mesure : titre lu, aucune étape', () => {
    expect(parseDump('<html><head><title>Sniper</title></head><body></body></html>'))
      .toEqual({ title: 'Sniper', qualite: '', etapes: [] })
  })
})

// Critère de performance du lot 2 (spec du lot 2, §5) : triangles et appels de dessin de M6, à la vue de départ, à
// ±3 % d'une mesure de référence (celle du lot 1, en Moyen).
describe('compareM6 : M6 à ±3 % d\'une mesure de référence', () => {
  const avec = (appels, triangles) => [{ etape: 'menu', appels: 540, triangles: 10506 }, { etape: 'M6', appels, triangles }]
  const ref = avec(294, 1422955)
  const failed = r => r.filter(c => !c.ok).map(c => c.critere)

  it('mêmes compteurs : tenu ; un critère pour les triangles, un pour les appels', () => {
    const r = compareM6(avec(294, 1422955), ref)
    expect(r.map(c => c.critere)).toEqual(['triangles de M6', 'appels de M6'])
    expect(failed(r)).toEqual([])
  })

  it('écart de 3 % au plus, dans les deux sens : tenu ; au-delà : échec', () => {
    expect(failed(compareM6(avec(294, 1422955 * 1.03), ref))).toEqual([])
    expect(failed(compareM6(avec(294, 1422955 * 0.97), ref))).toEqual([])
    expect(failed(compareM6(avec(294, 1422955 * 1.031), ref))).toEqual(['triangles de M6'])
    expect(failed(compareM6(avec(294, 1422955 * 0.969), ref))).toEqual(['triangles de M6'])
    expect(failed(compareM6(avec(302, 1422955), ref))).toEqual([])          // 294 × 1,03 = 302,8
    expect(failed(compareM6(avec(303, 1422955), ref))).toEqual(['appels de M6'])
    expect(failed(compareM6(avec(285, 1422955), ref))).toEqual(['appels de M6'])   // 294 × 0,97 = 285,2
  })

  it('M6 absente ou en erreur, d\'un côté ou de l\'autre : échec, jamais un succès par défaut', () => {
    const sans = [{ etape: 'menu', appels: 540, triangles: 10506 }]
    expect(failed(compareM6(sans, ref))).toEqual(['triangles de M6', 'appels de M6'])
    expect(failed(compareM6(ref, sans))).toEqual(['triangles de M6', 'appels de M6'])
    expect(failed(compareM6([{ etape: 'M6', erreur: 'x' }], ref))).toEqual(['triangles de M6', 'appels de M6'])
  })
})

// Serveur Vite fraîchement lancé (plan du lot 2, tâche T8) : la première mesure peut s'arrêter à « memtest:modeles »
// sans aucune étape, les modules se compilant à la première visite pendant que le temps virtuel de Chrome s'écoule ;
// une seconde mesure trouve les modules prêts. measureWithRetry la relance alors une fois, et le dit.
describe('measureWithRetry : un nouvel essai après un arrêt sur serveur froid', () => {
  const page = (title, etapes = []) => `<html><head><title>${title}</title></head><body>` +
    (title.startsWith('memtest:') ? `<pre id="memtest" data-qualite="moyen">${JSON.stringify(etapes)}</pre>` : '') + '</body></html>'
  const froid = page('memtest:modeles')
  const fini = page('memtest:fini', [{ etape: 'menu', geometries: 409 }])
  // Fausse mesure : rend les pages données, une par appel, et compte les appels.
  const mesures = (...pages) => {
    const appels = []
    const measure = async essai => { appels.push(essai); return { html: pages[appels.length - 1], code: 0, secondes: appels.length } }
    return { measure, appels }
  }

  it('arrêt à memtest:modeles sans aucune étape : un second essai, signalé, dont le résultat est rendu', async () => {
    const { measure, appels } = mesures(froid, fini)
    const log = []
    const r = await measureWithRetry(measure, { log: m => log.push(m) })
    expect(appels).toEqual([1, 2])
    expect(r.essais).toBe(2)
    expect(r.dump.title).toBe('memtest:fini')
    expect(r.dump.etapes).toEqual([{ etape: 'menu', geometries: 409 }])
    expect(r.secondes).toBe(2)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatch(/memtest:modeles/)
    expect(log[0]).toMatch(/nouvel essai/)
  })

  it('un seul nouvel essai : deux arrêts de suite rendent le second, inachevé', async () => {
    const { measure, appels } = mesures(froid, froid, fini)
    const r = await measureWithRetry(measure, { log: () => {} })
    expect(appels).toEqual([1, 2])
    expect(r.essais).toBe(2)
    expect(r.dump.title).toBe('memtest:modeles')
  })

  it('mesure finie, en erreur, arrêtée en cours d\'étapes ou page sans mesure : aucun nouvel essai', async () => {
    for (const p of [fini, page('memtest:erreur'), page('memtest:en-cours', [{ etape: 'menu' }, { etape: 'M1' }]),
      page('memtest:modeles', [{ etape: 'menu' }]), page('Sniper'), '']) {
      const { measure, appels } = mesures(p, fini)
      const log = []
      const r = await measureWithRetry(measure, { log: m => log.push(m) })
      expect([p, appels, r.essais, log]).toEqual([p, [1], 1, []])
    }
  })
})

// Mesures versionnées dans les annexes (README des annexes, « Après le lot 1 ») : la mesure de fin de lot (tâche L8)
// tient les seuils du §6 de la spec, reformulés le 9 octobre 2026 (§8), en Moyen et en Bas ; la référence d'avant
// correction en dépasse quatre sur cinq. Sans cette garde, un changement de checkMemtest pourrait démentir les annexes
// et leur README sans que rien ne le signale.
describe('annexes : mesures versionnées du lot 1', () => {
  const annexe = nom => JSON.parse(readFileSync(resolve(__dirname, '../../docs/superpowers/specs/annexes', nom), 'utf8'))
  const failed = r => r.filter(c => !c.ok).map(c => c.critere)

  it('fin de lot : les cinq seuils tenus en Moyen et en Bas', () => {
    for (const nom of ['2026-10-07-memtest-apres-lot1.json', '2026-10-07-memtest-apres-lot1-bas.json']) {
      const r = annexe(nom)
      expect(r.etat).toBe('memtest:fini')
      const crit = checkMemtest(r.etapes, { qualite: r.qualite })
      expect(crit).toHaveLength(5)
      expect([nom, r.qualite, failed(crit)]).toEqual([nom, nom.endsWith('-bas.json') ? 'bas' : 'moyen', []])
    }
  })

  it('référence d\'avant correction : quatre seuils dépassés sur cinq', () => {
    const r = annexe('2026-10-07-memtest-reference.json')
    expect(failed(checkMemtest(r.etapes, { qualite: r.qualite })))
      .toEqual(['partie complète', '10 montages de M6', 'PvP', 'triangles de M6'])
  })
})
