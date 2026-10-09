import { describe, it, expect } from 'vitest'
import { memtestSteps, withSeed, seedOf, measure, runMemtest } from '../../src/gfx/memtest.js'
import { checkMemtest, parseDump, memtestUrl } from '../../scripts/memtest.mjs'

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
