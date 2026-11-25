import { describe, it, expect, vi, beforeAll } from 'vitest'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { playCinematic, registerScene } from '../../src/briefing/index.js'
import { estimate } from '../../src/briefing/kit.js'
import { SCENES } from '../../scripts/port-maquette.mjs'

// Gardes du montage des cinématiques (spec cinématiques v2, §0 et §3.1, G1 à G3), écrites sur la v1 avant tout
// enrichissement : même durée, même texte, même montage. Une seule lecture complète par cas, sous faux minuteurs,
// montée par playCinematic avec le vrai kit ; la scène est enveloppée (registerScene) pour intercepter K.run, qui
// livre cfg.beats, et pour observer les classes de #st avant que son script ne tourne.
// - G1 : durée calculée par la formule du séquenceur (src/briefing/kit.js, start), égale au tableau du §1 de la spec
//   au ms ; onDone arrive à cette durée (± 16 ms, une image) ; chaque temps de la v1 commence au même instant.
// - G2 : liste [qui parle, réplique] de chaque scène et variante, égale à references/repliques-v1.json.
// - G3 : chaque événement [t, id, ±classe] de la v1 (references/chronologie-v1.json) arrive au même instant ; la v2
//   peut en ajouter. Habillage du kit ignoré : ids k-*, classes k-* (préchargement), gl et shake (les glitchs
//   d'ambiance tombent au hasard). Sous faux minuteurs, un minuteur de 0 ms créé pendant l'avance part 1 ms plus
//   tard : un repère à 0 ms d'un temps est relevé 1 ms après son début, dans la v1 comme dans la v2. Si une montée
//   de vitest change ce décalage, G3 rougit sans que le montage ait bougé : lire d'abord les « vu à … ms » de l'échec.
// Scènes hors des gardes, nommées avec leur raison dans HORS_GARDE : m5 tant que le chantier du bar n'est pas
// fusionné (il réécrit briefing-m5.html, ses références s'écriront en C16 depuis sa version, comme l'exception m5
// de G6), ainsi que m5b et killcam, que leurs chantiers créeront. Une scène de SCENES sans cas ni raison rougit.
// Références : ECRIRE_REFERENCES=1 npx vitest run tests/briefing/montage.test.js ajoute les cas absents et ne
// réécrit jamais un cas déjà écrit. Changer une référence existante demande une décision écrite dans la spec, puis
// une retouche à la main de la seule entrée concernée.

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

// Chemin pris depuis ce fichier (__dirname, comme tests/briefing/kit.test.js), pas depuis le dossier courant : lancée
// d'ailleurs (vitest --root), la garde lit et écrit toujours ces références-ci.
const REFERENCES = join(__dirname, 'references')
const FICHIERS = { repliques: join(REFERENCES, 'repliques-v1.json'), chronologie: join(REFERENCES, 'chronologie-v1.json') }
const ECRIRE = process.env.ECRIRE_REFERENCES === '1'
const refs = Object.fromEntries(Object.entries(FICHIERS).map(([nom, f]) => [nom, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}]))

// [scène, paramètres, durée de la v1 en ms] : tableau « Durée » du §1 de la spec.
const CAS = [
  ['m1', {}, 41388], ['m2', {}, 36286], ['m3', {}, 44214], ['m4', {}, 38762], ['m6', {}, 44830],
  ['epilogue', { port: 'libres' }, 48534], ['epilogue', { port: 'enfermes' }, 48906],
  ['prologue-a', {}, 21272], ['prologue-b', {}, 65840],
]
// Scènes du convertisseur (SCENES de scripts/port-maquette.mjs) que G1 à G3 ne gardent pas, chacune avec sa raison
// (spec §3.1, « Portée ») ; toute autre scène de SCENES a son cas dans CAS. m5b et killcam n'existent pas encore :
// le bar (B15) et le lot 4 (K8) les ajouteront à SCENES sans toucher à ce fichier. C16 fait passer m5 et m5b dans CAS.
const HORS_GARDE = {
  m5: 'C16 : le chantier du bar réécrit briefing-m5.html, références écrites depuis sa version',
  m5b: 'C16 : briefing II du chantier du bar (B15), références écrites depuis sa version',
  killcam: 'kill-cam du lot 4 (K8) : scène pilotée par data, sans version v1',
}
const cleDe = (id, params) => id + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')

// Durée d'un temps selon le séquenceur : un temps parlé dure pre + estimation + max(post ?? 350, min - pre -
// estimation), un temps muet son min. Les repères (cues) ne comptent pas : en ajouter ne rallonge jamais un temps.
function dureeDuTemps(b) {
  if (!b.say) return Math.max(0, b.min || 0)
  const parle = (b.pre || 0) + estimate(b.say)
  return parle + Math.max(b.post ?? 350, (b.min || 0) - parle)
}

const IGNOREES = new Set(['gl', 'shake'])
const gardee = c => !IGNOREES.has(c) && !c.startsWith('k-')
const jetons = v => new Set((v || '').split(/\s+/).filter(Boolean))
const MODULES = import.meta.glob('../../src/briefing/scenes/*.js')

// Lecture complète d'un cas : temps lus dans cfg.beats, répliques, événements de classe, instant de onDone.
async function lire(id, params) {
  const charger = MODULES[`../../src/briefing/scenes/${id}.js`]
  if (!charger) throw new Error(`scène absente de src/briefing/scenes : ${id}`)
  const mod = await charger()
  const lu = { runs: 0, temps: [], duree: null, repliques: [], evenements: [], fin: null, erreurs: [], minuteurs: null }
  let t0 = 0, obs = null
  // Un lot d'enregistrements arrive à l'instant de ses mutations : sous faux minuteurs, les microtâches passent avant
  // le minuteur suivant. L'état après chaque enregistrement est l'état d'avant du suivant sur le même élément (ou
  // l'état courant pour le dernier) ; un retrait sans effet (remise à zéro du kit) ne donne aucun événement.
  const releve = records => {
    const t = Math.round(performance.now() - t0), apresDe = new Map(), lot = []
    for (let i = records.length - 1; i >= 0; i--) {
      const r = records[i], el = r.target
      if (!el.id || el.id.startsWith('k-')) continue
      const avant = jetons(r.oldValue), apres = jetons(apresDe.has(el) ? apresDe.get(el) : el.getAttribute('class'))
      apresDe.set(el, r.oldValue)
      const ev = []
      for (const c of apres) if (!avant.has(c) && gardee(c)) ev.push([t, el.id, '+' + c])
      for (const c of avant) if (!apres.has(c) && gardee(c)) ev.push([t, el.id, '-' + c])
      lot.unshift(...ev)
    }
    lu.evenements.push(...lot)
  }
  const cle = 'montage:' + cleDe(id, params)
  registerScene(cle, async () => ({
    ...mod,
    start(K, ctx) {
      const run = K.run
      K.run = cfg => {
        lu.runs++
        let debut = 0
        for (const b of cfg.beats) {
          lu.temps.push(debut); debut += dureeDuTemps(b)
          if (b.say) lu.repliques.push([b.who || 'ANTON', b.say])
        }
        lu.duree = debut
        return run(cfg)
      }
      obs = new MutationObserver(releve)
      obs.observe(K.$('st'), { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true })
      t0 = performance.now()
      return mod.start(K, ctx)
    },
  }))
  vi.useFakeTimers(FAKE)
  document.body.innerHTML = '<div id="briefing-root" hidden></div>'
  try {
    const onDone = () => { releve(obs.takeRecords()); obs.disconnect(); lu.fin = performance.now() - t0 }
    const handle = await playCinematic(cle, { params, onDone })
    await vi.advanceTimersByTimeAsync(120000); await flush()
    lu.erreurs = handle.error ? [String(handle.error)] : handle.kit.errors
    lu.minuteurs = vi.getTimerCount()
  } finally {
    vi.useRealTimers(); document.body.innerHTML = ''; document.head.innerHTML = ''
  }
  return lu
}

// Une entrée par ligne (réplique, événement) : une retouche à la main se lit dans le diff. Le tiret cadratin d'une
// réplique de la v1 (M6, décision D2 de la spec) s'écrit échappé : même chaîne à la lecture, aucun dans le fichier.
const TIRET_CADRATIN = String.fromCharCode(0x2014), ECHAPPE = String.fromCharCode(92) + 'u2014'
const json = v => JSON.stringify(v).split(TIRET_CADRATIN).join(ECHAPPE)
function formater(valeur, retrait = '') {
  if (!Array.isArray(valeur) && valeur && typeof valeur === 'object') {
    const champs = Object.entries(valeur).map(([k, v]) => `${retrait}  ${json(k)}: ${formater(v, retrait + '  ')}`)
    return `{\n${champs.join(',\n')}\n${retrait}}`
  }
  if (Array.isArray(valeur) && valeur.some(Array.isArray)) {
    return `[\n${valeur.map(v => `${retrait}  ${json(v)}`).join(',\n')}\n${retrait}]`
  }
  return json(valeur)
}
function ajouterReference(nom, cle, valeur) {
  if (cle in refs[nom]) return
  refs[nom][cle] = valeur
  mkdirSync(REFERENCES, { recursive: true })
  writeFileSync(FICHIERS[nom], formater(refs[nom]) + '\n')
}

// Ce qui manque à une lecture par rapport à une liste de la v1 (comptée avec ses doublons), avec, pour aider à lire
// l'échec, les instants où le même élément a reçu la même classe.
function manquants(v1, lus) {
  const reste = new Map()
  for (const e of lus) { const k = JSON.stringify(e); reste.set(k, (reste.get(k) || 0) + 1) }
  return v1.filter(e => {
    const k = JSON.stringify(e), n = reste.get(k) || 0
    if (n) reste.set(k, n - 1)
    return !n
  })
}
const expliquer = (absents, lus) => absents.slice(0, 12).map(([t, id, op]) => {
  const vus = lus.filter(e => e[1] === id && e[2] === op).map(e => e[0])
  return `  [${t}, ${id}, ${op}] absent${vus.length ? ` (vu à ${vus.join(', ')} ms)` : ''}`
}).join('\n')

describe.each(CAS)('montage de %s %o', (id, params, dureeV1) => {
  const cle = cleDe(id, params)
  let lu
  beforeAll(async () => {
    lu = await lire(id, params)
    if (ECRIRE && !lu.erreurs.length && lu.runs === 1) {
      ajouterReference('repliques', cle, lu.repliques)
      ajouterReference('chronologie', cle, { temps: lu.temps, evenements: lu.evenements })
    }
  }, 120000)

  it('la lecture est complète : un seul K.run, aucune erreur, aucun minuteur restant', () => {
    expect(lu.runs).toBe(1)
    expect(lu.erreurs).toEqual([])
    expect(lu.minuteurs).toBe(0)
  })

  it(`G1 : dure ${dureeV1} ms au ms près (formule du séquenceur), onDone à cette durée à une image près`, () => {
    expect(lu.duree).toBe(dureeV1)
    expect(lu.fin, 'onDone jamais appelé').not.toBeNull()
    expect(Math.abs(lu.fin - lu.duree)).toBeLessThanOrEqual(16)
  })

  it('G1 : chaque temps de la v1 commence au même instant', () => {
    const ref = refs.chronologie[cle]
    expect(ref, `référence absente pour ${cle} : ECRIRE_REFERENCES=1 npx vitest run tests/briefing/montage.test.js`).toBeDefined()
    const debuts = new Set(lu.temps)
    expect(ref.temps.filter(t => !debuts.has(t)), `débuts des temps lus : ${lu.temps.join(', ')}`).toEqual([])
  })

  it('G2 : mêmes répliques, mêmes voix, dans le même ordre', () => {
    const ref = refs.repliques[cle]
    expect(ref, `référence absente pour ${cle} : ECRIRE_REFERENCES=1 npx vitest run tests/briefing/montage.test.js`).toBeDefined()
    expect(lu.repliques).toEqual(ref)
  })

  it('G3 : chaque repère de la v1 arrive au même instant (on peut en ajouter, ni en retirer ni en décaler)', () => {
    const ref = refs.chronologie[cle]
    expect(ref, `référence absente pour ${cle} : ECRIRE_REFERENCES=1 npx vitest run tests/briefing/montage.test.js`).toBeDefined()
    expect(ref.evenements.length).toBeGreaterThan(0)
    const absents = manquants(ref.evenements, lu.evenements)
    expect(absents, `repères de la v1 absents ou décalés :\n${expliquer(absents, lu.evenements)}\n`).toEqual([])
  })
})

it('les références couvrent exactement les cas gardés (ni cas oublié, ni référence orpheline)', () => {
  const cles = CAS.map(([id, params]) => cleDe(id, params)).sort()
  expect(Object.keys(refs.repliques).sort()).toEqual(cles)
  expect(Object.keys(refs.chronologie).sort()).toEqual(cles)
})

it('chaque scène du convertisseur a son cas ici ou sa raison dans HORS_GARDE (aucune scène hors des gardes en silence)', () => {
  const gardees = new Set(CAS.map(([id]) => id))
  const oubliees = Object.keys(SCENES).filter(id => !gardees.has(id) && !Object.hasOwn(HORS_GARDE, id))
  expect(oubliees, 'scènes de SCENES sans cas dans CAS ni raison dans HORS_GARDE').toEqual([])
  const lesDeux = Object.keys(HORS_GARDE).filter(id => gardees.has(id))
  expect(lesDeux, 'scènes à la fois dans CAS et dans HORS_GARDE : retirer leur exception').toEqual([])
})
