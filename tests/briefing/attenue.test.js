import { describe, it, expect, vi, beforeAll } from 'vitest'
import { playCinematic } from '../../src/briefing/index.js'
import { SCENES, KITS, SCRIPTS_DU_KIT, lireScene, lireModule, lireCss, animationsDe, animationsDuHtml, animationsDuScript, cleDeJumelle, pseudoElement } from './analyse-scenes.js'

// G4 (spec cinématiques v2, §3.1 et §3.7) : effets atténués complets. Toute règle qui pose une animation répétée
// (infinite, ou de plus d'un tour) a sa règle jumelle : même sélecteur, .k-reduced ajoutée à la classe de scène
// (.pro.k-reduced …), ou à .st pour le kit (.st.k-reduced …), dans la même feuille, qui met `animation: none` ou une
// autre animation, jouée une fois (pose de repos, anneau fixe, voyant allumé fixe, flash plafonné…) : en effets
// atténués, rien ne se répète hors liste blanche. Le kit pose k-reduced sur #st avant le script de la scène (réglage
// « Effets atténués » du jeu, ?attenue=1 des maquettes et de la route ?cine=).
// - Statique : chaque feuille (les deux kit.css et le CSS de chaque scène de SCENES) est lue règle par règle ; aucune
//   animation n'est posée hors des feuilles (attribut style du HTML, script de la scène ou du kit), où cette lecture ne
//   la verrait pas.
// - Dynamique : chaque cas est joué en entier, sans puis avec l'option ; chaque élément qu'une de ces règles désigne
//   est relevé la première fois qu'il apparaît, et l'animation calculée par jsdom dit s'il la joue. Sans l'option, il
//   doit la jouer (témoin : la garde voit ce qu'elle garde) ; avec, plus jamais. Une famille par effet (§3.7). Plus
//   l'onde de l'écoute, que le script du kit mène (K.wave).
// - Flashs : plafonnés à 0,3 d'opacité en effets atténués (spec du lot 1 §4.5 et §3.7 ici).
// - Frappes (k-frappe du kit, spec §3.3 ; relecture de C5 bis) : jouées une fois, elles ont pourtant leur jumelle, qui
//   pose k-frappe-attenue (un fondu, sans la chute de l'échelle 2,4) ; une règle atténuée ne pose jamais k-frappe.

// Liste blanche : animations répétées qui jouent en effets atténués (règle sans jumelle, ou règle .k-reduced qui en
// pose une), chacune justifiée. N'y ajouter une entrée que par une décision écrite dans la spec (§3.1, G4).
const LISTE_BLANCHE = [
  { source: 'kit', selecteur: '.st .grain', animation: 'k-grain', raison: 'grain du signal, réglé par le lot 1 (monté au tiers pendant un glitch atténué)' },
  { source: 'kit', selecteur: '.st .flick', animation: 'k-flick', raison: 'voile lent : deux baisses de lumière de 0,11 au plus toutes les 5 s' },
  { source: 'm6', selecteur: '.m6 .void::after', animation: 'm6-spin', raison: 'rotation du disque en 22 s' },
]
// En attente : animations de la v1 de m5, dont le chantier du bar possède la maquette (briefing-m5.html, interdite à ce
// chantier jusqu'à sa fusion). Le bar y pose les jumelles (B14 : m5-sm, clignotement de 4 Hz, et les autres) ; chaque
// entrée tombe alors (la garde le demande, voir plus bas), au plus tard en C16. Une animation répétée neuve de m5 n'est
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

// Animations répétées (infinite, ou plus d'un tour) d'une feuille : celles des règles ordinaires, chacune avec sa
// jumelle trouvée ou non (repetees), et celles que posent les règles atténuées elles-mêmes (attenueesRepetees : une
// jumelle qui remplacerait un clignotement par un autre).
// source : { nom, cle (kit ou id de scène), classe (st, pro, m1…), css }
function analyser(source, exemptions = [...LISTE_BLANCHE, ...EN_ATTENTE]) {
  const { regles, keyframes } = lireCss(source.css)
  const attenuees = new Map()   // clé de jumelle → [{ regle, selecteur }]
  for (const r of regles) for (const selecteur of r.selecteurs) {
    const j = cleDeJumelle(selecteur)
    if (j.reduite) attenuees.set(j.cle, [...(attenuees.get(j.cle) || []), { regle: r, selecteur }])
  }
  const repetees = [], attenueesRepetees = []
  for (const r of regles) {
    for (const a of (animationsDe(r.declarations) || []).filter(x => x.tours > 1)) for (const selecteur of r.selecteurs) {
      const e = { source: source.cle, nom: source.nom, selecteur, animation: a.nom, tours: a.tours, ligne: r.ligne }
      e.exemption = exemptions.find(x => x.source === source.cle && x.selecteur === selecteur && x.animation === a.nom) || null
      if (selecteur.includes('k-reduced')) { attenueesRepetees.push(e); continue }
      const j = cleDeJumelle(selecteur)
      if (!j.premiers.includes('.' + source.classe)) e.erreur = `son premier composé ne porte pas .${source.classe} (k-reduced, posée sur #st, ne peut s'y ajouter)`
      const candidates = attenuees.get(j.cle) || []
      const bonne = candidates.find(c => { const t = animationsDe(c.regle.declarations); return t !== null && !t.some(x => x.nom === a.nom) })
      e.jumelle = bonne ? bonne.selecteur : null
      e.jumelleAnimations = bonne ? animationsDe(bonne.regle.declarations).map(x => x.nom) : null
      e.jumelleMuette = !bonne && candidates.length > 0
      repetees.push(e)
    }
  }
  // Frappes des tampons neufs (k-frappe du kit, spec §3.3) : jouées une fois, mais leur chute de l'échelle 2,4 est un
  // mouvement. Chaque règle qui en pose une a sa jumelle, qui pose k-frappe-attenue (un fondu seul) et pas k-frappe ;
  // une règle atténuée ne pose jamais k-frappe. Pas de liste blanche ici.
  const frappes = []
  for (const r of regles) {
    if (!(animationsDe(r.declarations) || []).some(x => x.nom === 'k-frappe')) continue
    for (const selecteur of r.selecteurs) {
      const e = { source: source.cle, nom: source.nom, selecteur, animation: 'k-frappe', frappe: true, ligne: r.ligne }
      const j = cleDeJumelle(selecteur)
      if (selecteur.includes('k-reduced')) e.attenuee = true
      else if (!j.premiers.includes('.' + source.classe)) e.erreur = `son premier composé ne porte pas .${source.classe} (k-reduced, posée sur #st, ne peut s'y ajouter)`
      else {
        const bonne = (attenuees.get(j.cle) || []).find(c => {
          const noms = (animationsDe(c.regle.declarations) || []).map(x => x.nom)
          return noms.includes('k-frappe-attenue') && !noms.includes('k-frappe')
        })
        e.jumelle = bonne ? bonne.selecteur : null
      }
      frappes.push(e)
    }
  }
  return { regles, keyframes, repetees, attenueesRepetees, attenuees, frappes }
}
const enTours = e => (e.tours === Infinity ? 'infinite' : `${e.tours} tours`)
const manquantes = analyse => [
  ...analyse.repetees.filter(e => !e.exemption && (e.erreur || !e.jumelle)).map(e => [e, e.erreur ||
    (e.jumelleMuette ? 'sa règle atténuée ne met ni animation: none ni une autre animation' : 'aucune règle jumelle .k-reduced')]),
  ...analyse.attenueesRepetees.filter(e => !e.exemption).map(e => [e, 'animation répétée en effets atténués, hors liste blanche']),
  ...analyse.frappes.filter(e => e.erreur || e.attenuee || !e.jumelle).map(e => [e, e.erreur ||
    (e.attenuee ? 'k-frappe en effets atténués (sa jumelle est k-frappe-attenue)' : 'aucune jumelle .k-reduced qui pose k-frappe-attenue (spec §3.3)')]),
].sort(([a], [b]) => a.ligne - b.ligne)
  .map(([e, raison]) => `${e.nom}, ligne ${e.ligne} : ${e.selecteur} { animation: ${e.animation}${e.frappe ? '' : ` … ${enTours(e)}`} } : ${raison}`)

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
      'essai, ligne 4 : .m9.k-reduced .b { animation: m9-y … infinite } : animation répétée en effets atténués, hors liste blanche',
    ])
  })

  it('une règle qui ne part pas de la classe de scène est signalée ; la liste blanche dispense de jumelle', () => {
    const css = '.shot .a { animation: m9-x 1s infinite }\n.m9 .b::after { animation: m9-spin 9s infinite }'
    const blanche = [{ source: 'm9', selecteur: '.m9 .b::after', animation: 'm9-spin' }]
    expect(manquantes(analyser(feuille(css), blanche))).toEqual(['essai, ligne 1 : .shot .a { animation: m9-x … infinite } : son premier composé ne porte pas .m9 (k-reduced, posée sur #st, ne peut s\'y ajouter)'])
  })

  it('une animation de plus d\'un tour demande sa jumelle comme une infinie ; -webkit-animation se lit comme animation', () => {
    const css = '.m9 .a { animation: m9-x .5s steps(2) 40 }\n.m9 .b { animation-name: m9-y; animation-iteration-count: 3 }\n' +
      '.m9 .c { -webkit-animation: m9-z 1s infinite }\n.m9 .d { animation: m9-w .4s 1 }'
    expect(manquantes(analyser(feuille(css)))).toEqual([
      'essai, ligne 1 : .m9 .a { animation: m9-x … 40 tours } : aucune règle jumelle .k-reduced',
      'essai, ligne 2 : .m9 .b { animation: m9-y … 3 tours } : aucune règle jumelle .k-reduced',
      'essai, ligne 3 : .m9 .c { animation: m9-z … infinite } : aucune règle jumelle .k-reduced',
    ])
  })

  it('en effets atténués, rien ne se répète : une règle .k-reduced qui pose une animation répétée ne vaut que par la liste blanche', () => {
    const css = '.m9 .a { animation: m9-x 1s steps(2) infinite }\n.m9.k-reduced .a { animation: m9-y 2s steps(2) infinite }\n' +
      '.m9 .b { animation: m9-x 1s infinite }\n.m9.k-reduced .b { animation: m9-y .5s steps(2) 40 }\n' +
      '.m9 .c { animation: m9-x 1s infinite }\n.m9.k-reduced .c { animation: m9-y .3s ease-out }\n' +
      '.m9.k-reduced .d { animation: m9-z 1s infinite }'
    expect(manquantes(analyser(feuille(css)))).toEqual([
      'essai, ligne 2 : .m9.k-reduced .a { animation: m9-y … infinite } : animation répétée en effets atténués, hors liste blanche',
      'essai, ligne 4 : .m9.k-reduced .b { animation: m9-y … 40 tours } : animation répétée en effets atténués, hors liste blanche',
      'essai, ligne 7 : .m9.k-reduced .d { animation: m9-z … infinite } : animation répétée en effets atténués, hors liste blanche',
    ])
    const blanche = ['.a', '.b'].map(c => ({ source: 'm9', selecteur: '.m9.k-reduced ' + c, animation: 'm9-y' }))
    expect(manquantes(analyser(feuille(css), [...blanche, { source: 'm9', selecteur: '.m9.k-reduced .d', animation: 'm9-z' }]))).toEqual([])
  })

  it('une frappe (k-frappe, jouée une fois) a sa jumelle qui pose k-frappe-attenue ; k-frappe ne se joue pas en effets atténués', () => {
    const css = '.m9 .t1.on { --k-rot: -4deg; animation: k-frappe .3s backwards }\n' +
      '.m9 .t2.on { animation: k-frappe .3s .2s backwards }\n.m9.k-reduced .t2.on { animation: none }\n' +
      '.m9 .t3.on { animation-name: k-frappe; animation-duration: .3s }\n.k-reduced.m9 .t3.on { animation: k-frappe-attenue .15s backwards }\n' +
      '.m9.k-reduced .t4.on { animation: k-frappe .3s backwards }\n' +
      '.m9 .t5 { animation: k-frappe .3s backwards }\n.m9.k-reduced .t5 { animation: k-frappe-attenue .15s backwards, k-frappe .3s }\n' +
      '.shot .t6 { animation: k-frappe .3s backwards }'
    expect(manquantes(analyser(feuille(css)))).toEqual([
      'essai, ligne 1 : .m9 .t1.on { animation: k-frappe } : aucune jumelle .k-reduced qui pose k-frappe-attenue (spec §3.3)',
      'essai, ligne 2 : .m9 .t2.on { animation: k-frappe } : aucune jumelle .k-reduced qui pose k-frappe-attenue (spec §3.3)',
      'essai, ligne 6 : .m9.k-reduced .t4.on { animation: k-frappe } : k-frappe en effets atténués (sa jumelle est k-frappe-attenue)',
      'essai, ligne 7 : .m9 .t5 { animation: k-frappe } : aucune jumelle .k-reduced qui pose k-frappe-attenue (spec §3.3)',
      'essai, ligne 8 : .m9.k-reduced .t5 { animation: k-frappe } : k-frappe en effets atténués (sa jumelle est k-frappe-attenue)',
      'essai, ligne 9 : .shot .t6 { animation: k-frappe } : son premier composé ne porte pas .m9 (k-reduced, posée sur #st, ne peut s\'y ajouter)',
    ])
  })

  it('animations hors des feuilles : attribut style du HTML, script (propriété de style, clé d\'objet, setProperty, chaîne CSS)', () => {
    expect(animationsDuHtml('<div style="opacity:.5; --i: 2"></div><svg><text id="t" style="fill:red;animation: m9-x 1s infinite">x</text></svg>' +
      '<p style="-webkit-animation-name: m9-y">y</p>')).toEqual([
      'attribut style de <text id="t"> : fill:red;animation: m9-x 1s infinite',
      'attribut style de <p> : -webkit-animation-name: m9-y',
    ])
    const source = 'export function start(K) {\n' +
      '  K.$("a").style.animation = "m9-x 1s infinite"\n' +
      '  K.$("b").style.animationIterationCount = "infinite"\n' +
      '  K.$("c").style.setProperty("animation-name", "m9-y")\n' +
      '  Object.assign(K.$("d").style, { animation: "m9-z 1s" })\n' +
      '  K.$("e").style.cssText = `left:2px; animation: m9-w ${3}s infinite`\n' +
      '  K.$("f").innerHTML = \'<i style="animation:m9-v 1s infinite"></i>\'\n' +
      '  K.$("g").style.setProperty("--i", 2); K.$("g").addEventListener("animationend", () => {}); K.anim(k => {}, 300)\n' +
      '}\n'
    const { corps } = lireModule(source)
    expect(animationsDuScript(corps, source).map(r => r.split(' : ')[0])).toEqual(['ligne 2', 'ligne 3', 'ligne 4', 'ligne 5', 'ligne 6', 'ligne 7'])
  })
})

describe.each(SOURCES.map(s => [s.nom, s]))('G4 : %s', (nom, source) => {
  it('toute animation répétée a sa règle jumelle atténuée, et rien ne se répète en effets atténués (hors liste blanche et attente) ; toute frappe (k-frappe) a sa jumelle k-frappe-attenue', () => {
    expect(manquantes(analyser(source))).toEqual([])
  })
})

// Hors des feuilles, la lecture règle par règle ne verrait rien : aucune animation posée par le HTML ou le script d'une
// scène, ni par le script des deux kits.
describe.each(Object.keys(SCENES))('G4 : %s, hors des feuilles', id => {
  it('aucune animation posée par un attribut style du HTML ni par le script', () => {
    const scene = lireScene(id)
    expect([...animationsDuHtml(scene.html), ...animationsDuScript(scene.corps, scene.source)]).toEqual([])
  })
})

describe.each(SCRIPTS_DU_KIT.map(k => [k.nom, k]))('G4 : script du %s, hors des feuilles', (nom, kit) => {
  it('aucune animation posée par le script du kit', () => {
    expect(animationsDuScript(kit.programme, kit.source)).toEqual([])
  })
})

describe.each([['liste blanche', LISTE_BLANCHE], ['attente de m5', EN_ATTENTE]])('G4 : %s', (nom, liste) => {
  it('chaque entrée désigne encore une animation répétée de sa source, sans jumelle (sinon la retirer de la liste)', () => {
    const inutiles = []
    for (const e of liste) {
      const sources = SOURCES.filter(s => s.cle === e.source)
      if (!sources.length) { inutiles.push(`${e.source} : source inconnue`); continue }
      for (const s of sources) {
        const a = analyser(s)
        const vue = [...a.repetees, ...a.attenueesRepetees].find(x => x.exemption === e)
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

// Règles à observer dans une scène : animations répétées du kit du jeu (la feuille que playCinematic pose) et de la
// scène, hors liste blanche et attente, et flashs. Un pseudo-élément (::before…), que jsdom ne calcule pas, est vu
// par l'élément qui le porte : sa jumelle doit le désigner avec l'option, et pas sans.
function reglesAObserver(id) {
  const scene = lireScene(id)
  const sources = [{ nom: 'kit du jeu', cle: 'kit', classe: 'st', css: KITS[0].css }, { nom: id, cle: id, classe: scene.classe, css: scene.css }]
  const regles = []
  for (const source of sources) {
    const a = analyser(source)
    for (const e of a.repetees.filter(x => !x.exemption)) {
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
// (pas de 250 ms : chaque état observé tient bien plus longtemps), avec les animations répétées que toutes les règles
// observées lui destinent à cet instant (une règle plus précise peut l'emporter : .rain.r2 sur .rain).
// Sous Vitest, l'import `kit.css?raw` de src/briefing/index.js rend une feuille vide (le CSS n'est pas traité) : la
// feuille du kit du jeu est posée à sa place, sous le même id, avant le montage (playCinematic la garde alors).
async function lecture(id, params, reducedMotion, regles) {
  vi.useFakeTimers(FAKE)
  document.body.innerHTML = '<div id="briefing-root" hidden></div>'
  const kit = document.createElement('style'); kit.id = 'k-kit-css'; kit.textContent = KITS[0].css
  document.head.appendChild(kit)
  const constats = [], poses = []
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
    // onde de l'écoute (#wave de m1 et m6) : ses barres sont menées par le script du kit (K.wave), hors de toute
    // feuille ; leurs hauteurs sont relevées à chaque pas
    const releverOnde = () => { const w = root.querySelector('#wave'); if (w) poses.push([...w.children].map(b => b.style.height).join(' ')) }
    relever(0); releverOnde()
    for (let t = 250; t <= 120000 && root.querySelector('#st'); t += 250) {
      await vi.advanceTimersByTimeAsync(250)
      if (root.querySelector('#st')) { relever(t); releverOnde() }
    }
    await flush()
    if (handle.kit.errors.length) throw new Error(handle.kit.errors.join('\n'))
  } finally {
    vi.useRealTimers(); document.body.innerHTML = ''; document.head.innerHTML = ''
  }
  return { constats, poses }
}

// L'élément joue-t-il l'effet de la règle ? Une animation que lui destine l'une des règles observées (la plus précise
// l'emporte) ; pseudo-élément : tant que sa jumelle ne le désigne pas ; flash : tant qu'il joue le flash de la v1.
const joue = c => (c.regle.pseudo ? !c.jumelleSApplique
  : c.regle.famille === 'flashs plafonnés' ? c.animations.includes(c.regle.animation)
  : c.animations.some(nom => c.designees.has(nom)))
const decrire = c => `${c.regle.nom} : ${c.regle.selecteur} (${c.regle.animation}) sur « ${c.element} » à ${c.t} ms : ${c.regle.pseudo ? (c.jumelleSApplique ? 'jumelle appliquée' : 'jumelle absente') : c.animations.join(', ') || 'aucune animation'}`

// Les lectures (20 : chaque cas, sans puis avec l'option) se font une fois, avant les seuls tests dynamiques.
describe('G4 dynamique : chaque cas joué en entier, sans puis avec l\'option', () => {
  const lectures = []   // { cas, reduit, constats, poses }
  beforeAll(async () => {
    for (const [id, params] of CAS) {
      const regles = reglesAObserver(id)
      for (const reduit of [false, true]) lectures.push({ cas: nomDuCas(id, params), reduit, ...await lecture(id, params, reduit, regles) })
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

  // Onde de l'écoute (#wave de m1 et m6), que l'analyse des feuilles ne voit pas : pendant qu'une ligne de l'écoute
  // parle, K.wave tire une hauteur par barre toutes les 90 ms (témoin : sans l'option, l'onde s'agite) ; en effets
  // atténués, une seule pose, fixe, à plat entre les lignes (spec §3.7 : arrêtée dans sa pose de repos, comme
  // l'égaliseur de la radio).
  it('onde de l\'écoute (K.wave) : sans l\'option, elle s\'agite pendant les lignes ; avec, une seule pose, fixe', () => {
    const parlees = l => new Set(l.poses.filter(p => p.split(' ').some(h => h !== '' && h !== '6%')))
    const vues = lectures.filter(l => parlees(l).size)
    expect(vues.map(l => l.cas + (l.reduit ? ', atténué' : '')).sort()).toEqual(['m1', 'm1, atténué', 'm6', 'm6, atténué'])
    for (const l of vues) {
      if (l.reduit) expect(parlees(l).size, `${l.cas}, avec l'option : poses de l'onde pendant les lignes`).toBe(1)
      else expect(parlees(l).size, `${l.cas}, sans l'option : poses de l'onde pendant les lignes`).toBeGreaterThan(5)
    }
  })
})
