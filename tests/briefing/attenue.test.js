import { describe, it, expect, vi, beforeAll } from 'vitest'
import { playCinematic } from '../../src/briefing/index.js'
import { SCENES, KITS, lireScene, lireCss, animationsDe, cleDeJumelle, pseudoElement } from './analyse-scenes.js'

// G4 (spec cinématiques v2, §3.1 et §3.7) : effets atténués complets. Toute règle qui pose une animation infinie a sa
// règle jumelle : même sélecteur, .k-reduced ajoutée à la classe de scène (.pro.k-reduced …), ou à .st pour le kit
// (.st.k-reduced …), dans la même feuille, qui met `animation: none` ou une autre animation (pose de repos, anneau
// fixe, voyant allumé fixe…). Le kit pose k-reduced sur #st avant le script de la scène (réglage « Effets atténués »
// du jeu, ?attenue=1 des maquettes et de la route ?cine=).
// - Statique : chaque feuille (les deux kit.css et le CSS de chaque scène de SCENES) est lue règle par règle.
// - Dynamique : chaque cas est joué en entier, sans puis avec l'option ; chaque élément qu'une de ces règles désigne
//   est relevé la première fois qu'il apparaît, et l'animation calculée par jsdom dit s'il la joue. Sans l'option, il
//   doit la jouer (témoin : la garde voit ce qu'elle garde) ; avec, plus jamais. Une famille par effet (§3.7).
// - Flashs : plafonnés à 0,3 d'opacité en effets atténués (spec du lot 1 §4.5 et §3.7 ici).

// Liste blanche : animations infinies gardées telles quelles en effets atténués, chacune justifiée. N'y ajouter une
// entrée que par une décision écrite dans la spec (§3.1, G4).
const LISTE_BLANCHE = [
  { source: 'kit', selecteur: '.st .grain', animation: 'k-grain', raison: 'grain du signal, réglé par le lot 1 (monté au tiers pendant un glitch atténué)' },
  { source: 'kit', selecteur: '.st .flick', animation: 'k-flick', raison: 'voile lent : deux baisses de lumière de 0,11 au plus toutes les 5 s' },
  { source: 'm6', selecteur: '.m6 .void::after', animation: 'm6-spin', raison: 'rotation du disque en 22 s' },
]
// En attente : animations de la v1 de m5, dont le chantier du bar possède la maquette (briefing-m5.html, interdite à ce
// chantier jusqu'à sa fusion). Le bar y pose les jumelles (B14 : m5-sm, clignotement de 4 Hz, et les autres) ; chaque
// entrée tombe alors (la garde le demande, voir plus bas), au plus tard en C16. Une animation infinie neuve de m5 n'est
// pas en attente : elle a sa jumelle comme partout.
const EN_ATTENTE = [
  { source: 'm5', selecteur: '.m5 .scn.rx .lcd .rxl', animation: 'k-blink' },
  { source: 'm5', selecteur: '.m5 .scn.rx .sbars i:nth-child(-n+10)', animation: 'm5-sm' },
  { source: 'm5', selecteur: '.m5 #virc', animation: 'm5-ants' },
  { source: 'm5', selecteur: '.m5 #sight', animation: 'm5-ants' },
  { source: 'm5', selecteur: '.m5 #repli', animation: 'm5-ants' },
]
// Flashs (animations courtes d'un voile clair) : en effets atténués, la jumelle joue un flash plafonné à 0,3.
const FLASHS = [
  { source: 'kit', selecteur: '.st .evp.on .flash', animation: 'k-flash' },
  { source: 'm2', selecteur: '.m2 .flash2.on', animation: 'm2-flash' },
  { source: 'm3', selecteur: '.m3 .feed .fx.on', animation: 'm3-fx' },
]
const FLASH_MAX = 0.3

// Familles d'effets (spec §3.7), par nom d'animation ; un nom absent va dans « autres », gardée comme les autres.
const FAMILLES = {
  'caméra à l\'épaule': ['pro-hh', 'epi-hh'],
  'pluie': ['pro-rain', 'pro-rain2', 'm3-rainA', 'm3-rainB'],
  'clignotements': ['k-blink'],
  'ondes et anneaux': ['k-pulse', 'pro-ringc', 'epi-ringc'],
  'téléphone qui vibre, avatar qui saute': ['epi-buzz', 'pro-vib', 'pro-avj'],
  'balayages du signal': ['k-track', 'm3-roll'],
  'radio qui parle': ['k-eq'],
  'lumière du matin': ['epi-breathe', 'epi-dust'],
  'M6 : tremblés, parasites, danse, cœur': ['m6-jit', 'm6-txj', 'm6-tl', 'm6-ta', 'm6-tb', 'm6-tc', 'k-grain', 'm6-dance', 'm6-hb'],
}
const familleDe = nom => Object.keys(FAMILLES).find(f => FAMILLES[f].includes(nom)) || 'autres'

// ── analyse statique ──

// Animations infinies d'une feuille (hors règles atténuées elles-mêmes), chacune avec sa jumelle trouvée ou non.
// source : { nom, cle (kit ou id de scène), classe (st, pro, m1…), css }
function analyser(source, exemptions = [...LISTE_BLANCHE, ...EN_ATTENTE]) {
  const { regles, keyframes } = lireCss(source.css)
  const attenuees = new Map()   // clé de jumelle → [{ regle, selecteur }]
  for (const r of regles) for (const selecteur of r.selecteurs) {
    const j = cleDeJumelle(selecteur)
    if (j.reduite) attenuees.set(j.cle, [...(attenuees.get(j.cle) || []), { regle: r, selecteur }])
  }
  const infinies = []
  for (const r of regles) {
    for (const a of (animationsDe(r.declarations) || []).filter(x => x.infinie)) for (const selecteur of r.selecteurs) {
      if (selecteur.includes('k-reduced')) continue
      const j = cleDeJumelle(selecteur)
      const e = { source: source.cle, nom: source.nom, selecteur, animation: a.nom, ligne: r.ligne }
      e.exemption = exemptions.find(x => x.source === source.cle && x.selecteur === selecteur && x.animation === a.nom) || null
      if (!j.premiers.includes('.' + source.classe)) e.erreur = `son premier composé ne porte pas .${source.classe} (k-reduced, posée sur #st, ne peut s'y ajouter)`
      const candidates = attenuees.get(j.cle) || []
      const bonne = candidates.find(c => { const t = animationsDe(c.regle.declarations); return t !== null && !t.some(x => x.nom === a.nom) })
      e.jumelle = bonne ? bonne.selecteur : null
      e.jumelleAnimations = bonne ? animationsDe(bonne.regle.declarations).map(x => x.nom) : null
      e.jumelleMuette = !bonne && candidates.length > 0
      infinies.push(e)
    }
  }
  return { regles, keyframes, infinies, attenuees }
}
const manquantes = analyse => analyse.infinies.filter(e => !e.exemption && (e.erreur || !e.jumelle)).map(e =>
  `${e.nom}, ligne ${e.ligne} : ${e.selecteur} { animation: ${e.animation} … infinite } : ` +
  (e.erreur || (e.jumelleMuette ? 'sa règle atténuée ne met ni animation: none ni une autre animation' : 'aucune règle jumelle .k-reduced')))

const SOURCES = [
  ...KITS.map(k => ({ nom: k.nom, cle: 'kit', classe: 'st', css: k.css })),
  ...Object.keys(SCENES).map(id => { const s = lireScene(id); return { nom: id, cle: id, classe: s.classe, css: s.css } }),
]

describe('outils de la garde (témoins sur des feuilles écrites ici)', () => {
  const feuille = css => ({ nom: 'essai', cle: 'm9', classe: 'm9', css })

  it('une animation infinie sans jumelle est relevée ; avec sa jumelle (animation: none), non', () => {
    const sans = '.m9 .a { animation: m9-x 1s steps(2) infinite } .m9 .b { animation: m9-y .3s forwards }'
    expect(manquantes(analyser(feuille(sans)))).toEqual(['essai, ligne 1 : .m9 .a { animation: m9-x … infinite } : aucune règle jumelle .k-reduced'])
    expect(manquantes(analyser(feuille(sans + '\n.m9.k-reduced .a { animation: none }')))).toEqual([])
  })

  it('la jumelle se reconnaît quel que soit l\'ordre des classes de son premier composé, pour chaque sélecteur d\'une liste', () => {
    const css = '.m9 .r.on, .m9 .r.bz ~ .v { animation: m9-z .09s infinite }\n.k-reduced.m9 .r.on { animation: none }'
    expect(manquantes(analyser(feuille(css)))).toEqual(['essai, ligne 1 : .m9 .r.bz ~ .v { animation: m9-z … infinite } : aucune règle jumelle .k-reduced'])
    expect(manquantes(analyser(feuille(css + '\n.m9.k-reduced .r.bz ~ .v { animation: m9-repos 1s }')))).toEqual([])
  })

  it('une jumelle qui ne touche pas à l\'animation, ou qui la remet, ne compte pas ; animation-iteration-count compte', () => {
    const css = '.m9 .a { animation: m9-x 1s infinite }\n.m9.k-reduced .a { opacity: .5 }\n' +
      '.m9 .b { animation-name: m9-y; animation-iteration-count: infinite }\n.m9.k-reduced .b { animation: m9-y 2s infinite }'
    expect(manquantes(analyser(feuille(css)))).toEqual([
      'essai, ligne 1 : .m9 .a { animation: m9-x … infinite } : sa règle atténuée ne met ni animation: none ni une autre animation',
      'essai, ligne 3 : .m9 .b { animation: m9-y … infinite } : sa règle atténuée ne met ni animation: none ni une autre animation',
    ])
  })

  it('une règle qui ne part pas de la classe de scène est signalée ; la liste blanche dispense de jumelle', () => {
    const css = '.shot .a { animation: m9-x 1s infinite }\n.m9 .b::after { animation: m9-spin 9s infinite }'
    const blanche = [{ source: 'm9', selecteur: '.m9 .b::after', animation: 'm9-spin' }]
    expect(manquantes(analyser(feuille(css), blanche))).toEqual(['essai, ligne 1 : .shot .a { animation: m9-x … infinite } : son premier composé ne porte pas .m9 (k-reduced, posée sur #st, ne peut s\'y ajouter)'])
  })
})

describe.each(SOURCES.map(s => [s.nom, s]))('G4 : %s', (nom, source) => {
  it('toute animation infinie a sa règle jumelle atténuée (hors liste blanche et attente)', () => {
    expect(manquantes(analyser(source))).toEqual([])
  })
})

describe.each([['liste blanche', LISTE_BLANCHE], ['attente de m5', EN_ATTENTE]])('G4 : %s', (nom, liste) => {
  it('chaque entrée désigne encore une animation infinie de sa source, sans jumelle (sinon la retirer de la liste)', () => {
    const inutiles = []
    for (const e of liste) {
      const sources = SOURCES.filter(s => s.cle === e.source)
      if (!sources.length) { inutiles.push(`${e.source} : source inconnue`); continue }
      for (const s of sources) {
        const vue = analyser(s).infinies.find(x => x.exemption === e)
        if (!vue) inutiles.push(`${s.nom} : ${e.selecteur} { animation: ${e.animation} } n'existe plus`)
        else if (vue.jumelle) inutiles.push(`${s.nom} : ${e.selecteur} a maintenant sa jumelle ${vue.jumelle}`)
      }
    }
    expect(inutiles).toEqual([])
  })
})

// Opacités posées par un @keyframes (toutes étapes).
const opacitesDe = kf => kf.etapes.flatMap(e => e.declarations.filter(([p]) => p === 'opacity').map(([, v]) => parseFloat(v)))

describe.each(FLASHS.map(f => [f.selecteur, f]))('G4 : flash %s', (sel, flash) => {
  it(`en effets atténués, sa jumelle joue un flash d'au plus ${FLASH_MAX} d'opacité`, () => {
    for (const source of SOURCES.filter(s => s.cle === flash.source)) {
      const a = analyser(source)
      const original = a.regles.find(r => r.selecteurs.includes(sel))
      expect(original && animationsDe(original.declarations).map(x => x.nom), `${source.nom} : ${sel} ne joue plus ${flash.animation}`).toEqual([flash.animation])
      const jumelles = a.attenuees.get(cleDeJumelle(sel).cle) || []
      expect(jumelles.length, `${source.nom} : aucune règle jumelle .k-reduced pour ${sel}`).toBeGreaterThan(0)
      for (const nomKf of jumelles.flatMap(j => animationsDe(j.regle.declarations) || []).map(x => x.nom)) {
        const kf = a.keyframes.find(k => k.nom === nomKf)
        expect(kf, `${source.nom} : @keyframes ${nomKf} introuvable dans la même feuille`).toBeDefined()
        const opacites = opacitesDe(kf)
        expect(opacites.length, `@keyframes ${nomKf} sans opacité`).toBeGreaterThan(0)
        expect(Math.max(...opacites), `@keyframes ${nomKf}`).toBeLessThanOrEqual(FLASH_MAX)
      }
    }
  })
})

// ── lectures dynamiques ──

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

// Chaque scène de SCENES, l'épilogue dans ses deux variantes (choix du port).
const VARIANTES = { epilogue: [{ port: 'libres' }, { port: 'enfermes' }] }
const CAS = Object.keys(SCENES).flatMap(id => (VARIANTES[id] || [{}]).map(params => [id, params]))
const nomDuCas = (id, params) => id + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')

// Règles à observer dans une scène : animations infinies du kit du jeu (la feuille que playCinematic pose) et de la
// scène, hors liste blanche et attente, et flashs. Un pseudo-élément (::before…), que jsdom ne calcule pas, est vu
// par l'élément qui le porte : sa jumelle doit le désigner avec l'option, et pas sans.
function reglesAObserver(id) {
  const scene = lireScene(id)
  const sources = [{ nom: 'kit du jeu', cle: 'kit', classe: 'st', css: KITS[0].css }, { nom: id, cle: id, classe: scene.classe, css: scene.css }]
  const regles = []
  for (const source of sources) {
    const a = analyser(source)
    for (const e of a.infinies.filter(x => !x.exemption)) {
      const pseudo = pseudoElement(e.selecteur)
      regles.push({ ...e, famille: familleDe(e.animation), pseudo,
        cible: pseudo ? e.selecteur.slice(0, -pseudo.length) : e.selecteur,
        cibleJumelle: e.jumelle && pseudo ? e.jumelle.slice(0, -pseudo.length) : e.jumelle })
    }
    for (const f of FLASHS.filter(x => x.source === source.cle)) {
      const jumelles = a.attenuees.get(cleDeJumelle(f.selecteur).cle) || []
      regles.push({ ...f, nom: source.nom, famille: 'flashs plafonnés', pseudo: null, cible: f.selecteur,
        remplacement: jumelles.flatMap(j => animationsDe(j.regle.declarations) || []).map(x => x.nom)[0] || null })
    }
  }
  return regles
}

// Noms des animations que jsdom calcule pour un élément (le raccourci `animation` tel qu'écrit, sinon les détaillées).
function animationsCalculees(el) {
  const cs = getComputedStyle(el)
  const lues = cs.animation ? animationsDe([['animation', cs.animation]])
    : animationsDe([['animation-name', cs.animationName || 'none'], ['animation-iteration-count', cs.animationIterationCount || '1']])
  return (lues || []).map(a => a.nom)
}

// Une lecture complète d'un cas : pour chaque règle, chaque élément qu'elle désigne, relevé à sa première apparition
// (pas de 250 ms : chaque état observé tient bien plus longtemps), avec les animations infinies que toutes les règles
// observées lui destinent à cet instant (une règle plus précise peut l'emporter : .rain.r2 sur .rain).
// Sous Vitest, l'import `kit.css?raw` de src/briefing/index.js rend une feuille vide (le CSS n'est pas traité) : la
// feuille du kit du jeu est posée à sa place, sous le même id, avant le montage (playCinematic la garde alors).
async function lecture(id, params, reducedMotion, regles) {
  vi.useFakeTimers(FAKE)
  document.body.innerHTML = '<div id="briefing-root" hidden></div>'
  const kit = document.createElement('style'); kit.id = 'k-kit-css'; kit.textContent = KITS[0].css
  document.head.appendChild(kit)
  const constats = []
  try {
    const handle = await playCinematic(id, { params, reducedMotion })
    const root = document.getElementById('briefing-root')
    const vus = regles.map(() => new Set())
    const relever = t => regles.forEach((r, i) => {
      for (const el of root.querySelectorAll(r.cible)) {
        if (vus[i].has(el)) continue
        vus[i].add(el)
        const designees = new Set(regles.filter(x => !x.pseudo && el.matches(x.cible)).map(x => x.animation))
        constats.push({ regle: r, t, element: el.id || el.getAttribute('class') || el.localName, designees,
          animations: animationsCalculees(el), jumelleSApplique: r.cibleJumelle ? el.matches(r.cibleJumelle) : false })
      }
    })
    relever(0)
    for (let t = 250; t <= 120000 && root.querySelector('#st'); t += 250) {
      await vi.advanceTimersByTimeAsync(250)
      if (root.querySelector('#st')) relever(t)
    }
    await flush()
    if (handle.kit.errors.length) throw new Error(handle.kit.errors.join('\n'))
  } finally {
    vi.useRealTimers(); document.body.innerHTML = ''; document.head.innerHTML = ''
  }
  return constats
}

// L'élément joue-t-il l'effet de la règle ? Une animation que lui destine l'une des règles observées (la plus précise
// l'emporte) ; pseudo-élément : tant que sa jumelle ne le désigne pas ; flash : tant qu'il joue le flash de la v1.
const joue = c => (c.regle.pseudo ? !c.jumelleSApplique
  : c.regle.famille === 'flashs plafonnés' ? c.animations.includes(c.regle.animation)
  : c.animations.some(nom => c.designees.has(nom)))
const decrire = c => `${c.regle.nom} : ${c.regle.selecteur} (${c.regle.animation}) sur « ${c.element} » à ${c.t} ms : ${c.regle.pseudo ? (c.jumelleSApplique ? 'jumelle appliquée' : 'jumelle absente') : c.animations.join(', ') || 'aucune animation'}`

// Les lectures (20 : chaque cas, sans puis avec l'option) se font une fois, avant les seuls tests dynamiques.
describe('G4 dynamique : chaque cas joué en entier, sans puis avec l\'option', () => {
  const lectures = []   // { cas, reduit, constats }
  beforeAll(async () => {
    for (const [id, params] of CAS) {
      const regles = reglesAObserver(id)
      for (const reduit of [false, true]) lectures.push({ cas: nomDuCas(id, params), reduit, constats: await lecture(id, params, reduit, regles) })
    }
  }, 600000)

  const constatsDe = (famille, reduit) => lectures.filter(l => l.reduit === reduit).flatMap(l => l.constats).filter(c => c.regle.famille === famille)

  describe.each([...Object.keys(FAMILLES), 'autres'])('famille « %s »', famille => {
    it('sans l\'option, chaque élément désigné joue son animation (témoin : la garde voit ce qu\'elle garde)', () => {
      const constats = constatsDe(famille, false)
      if (famille !== 'autres') expect(constats.length, 'aucun élément de la famille vu pendant les lectures').toBeGreaterThan(0)
      expect(constats.filter(c => !joue(c)).map(decrire)).toEqual([])
    })

    it('avec l\'option (k-reduced sur #st), aucun ne la joue plus', () => {
      expect(constatsDe(famille, true).filter(joue).map(decrire)).toEqual([])
    })
  })

  it('flashs : sans l\'option, le flash de la v1 (témoin) ; avec, celui de la jumelle, plafonné', () => {
    const sans = constatsDe('flashs plafonnés', false), avec = constatsDe('flashs plafonnés', true)
    expect(new Set(sans.map(c => c.regle.selecteur))).toEqual(new Set(FLASHS.map(f => f.selecteur)))
    expect(sans.filter(c => !joue(c)).map(decrire)).toEqual([])
    expect(avec.filter(c => joue(c) || !c.regle.remplacement || !c.animations.includes(c.regle.remplacement)).map(decrire)).toEqual([])
  })

  it('chaque cas voit les mêmes règles avec et sans l\'option (rien n\'échappe à la lecture atténuée)', () => {
    const ecarts = []
    for (const [id, params] of CAS) {
      const regles = reduit => new Set(lectures.find(l => l.cas === nomDuCas(id, params) && l.reduit === reduit).constats.map(c => `${c.regle.selecteur} (${c.regle.animation})`))
      const sans = regles(false), avec = regles(true)
      for (const r of sans) if (!avec.has(r)) ecarts.push(`${nomDuCas(id, params)} : ${r} vue sans l'option seulement`)
      for (const r of avec) if (!sans.has(r)) ecarts.push(`${nomDuCas(id, params)} : ${r} vue avec l'option seulement`)
    }
    expect(ecarts).toEqual([])
  })
})
