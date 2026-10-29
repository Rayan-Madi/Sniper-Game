import { describe, it, expect } from 'vitest'
import { SCENES, KITS, lireScene, lireModule, lireCss, appelsDe, chainesDe, smilDuHtml, SMIL } from './analyse-scenes.js'

// G5 (spec cinématiques v2, §3.1 et §3.3) : ce qui bouge dans une scène ne coûte pas de repeint.
// - Un @keyframes n'anime que transform, opacity ou stroke-dashoffset (composition, ou petit tracé) ; ceux de la v1 qui
//   animent autre chose (pluie, balayages, tremblés de M6…) sont dans FIGEE, liste qui ne peut que raccourcir : chaque
//   entrée y dit exactement ce que son @keyframes anime encore hors de ces trois propriétés (C5 en retire la pluie et les
//   balayages en les passant en transform ; l'entrée doit alors tomber avec eux).
// - Le script d'une scène n'a aucun setInterval (que le convertisseur ne redirige pas vers K.at, ni le gel ni « rejouer »
//   ne l'arrêteraient), aucune animation Web Animations (element.animate) ni SMIL (<animate>, <set>…), que le kit ne
//   sait ni geler ni rejouer, et pas plus de Math.random que la v1 : tout tirage neuf passe par K.graine.

const PERMISES = new Set(['transform', 'opacity', 'stroke-dashoffset'])
const HORS_ANIMATION = new Set(['animation-timing-function'])   // réglage d'une étape, pas une propriété animée

// Liste figée de la v1, par source (kit : les deux feuilles du kit) : @keyframes → propriétés animées hors des trois
// permises. N'y ajouter aucune entrée : une exception demande une décision écrite dans la spec.
const FIGEE = {
  kit: { 'k-track': ['top'], 'k-crt': ['height', 'width'], 'k-develop': ['filter'], 'k-eq': ['height'] },
  'prologue-a': { 'pro-rain': ['background-position'], 'pro-rain2': ['background-position'] },
  'prologue-b': { 'pro-rain': ['background-position'], 'pro-rain2': ['background-position'] },
  m2: { 'm2-dev': ['filter'] },
  m3: { 'm3-rainA': ['background-position'], 'm3-rainB': ['background-position'], 'm3-sb': ['top'], 'm3-roll': ['top'] },
  m6: { 'm6-jit': ['clip-path'], 'm6-txj': ['clip-path'], 'm6-tl': ['left', 'top'], 'm6-ta': ['clip-path'], 'm6-tb': ['clip-path'], 'm6-tc': ['clip-path'] },
}

// Math.random de chaque maquette dans la v1 ; une scène sans version v1 (m5b du bar, killcam du lot 4) : 0.
const MATH_RANDOM_V1 = { m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0, epilogue: 0, 'prologue-a': 0, 'prologue-b': 0 }

// @keyframes d'une feuille et ce qu'ils animent hors des propriétés permises : { nom: ['top', …] } (trié).
function horsPermises(css) {
  const res = {}
  for (const kf of lireCss(css).keyframes) {
    const props = new Set(kf.etapes.flatMap(e => e.declarations.map(([p]) => p)))
    res[kf.nom] = [...new Set([...(res[kf.nom] || []), ...[...props].filter(p => !PERMISES.has(p) && !HORS_ANIMATION.has(p))])].sort()
  }
  return res
}

// Écarts d'une feuille à sa liste figée : un @keyframes qui anime une propriété de plus, ou une entrée à raccourcir.
function ecartsALaListe(css, figee = {}) {
  const lus = horsPermises(css), ecarts = []
  for (const [nom, props] of Object.entries(lus)) {
    const permisV1 = figee[nom] || []
    const neuves = props.filter(p => !permisV1.includes(p))
    if (neuves.length) ecarts.push(`@keyframes ${nom} anime ${neuves.join(', ')} : seuls transform, opacity et stroke-dashoffset sont permis`)
  }
  for (const [nom, props] of Object.entries(figee)) {
    const encore = lus[nom] || []
    const tombees = props.filter(p => !encore.includes(p))
    if (tombees.length) ecarts.push(`liste figée à raccourcir : ${nom} n'anime plus ${tombees.join(', ')}${nom in lus ? '' : ' (@keyframes absent)'}`)
  }
  return ecarts
}

// Ce que le script d'une scène fait contre le rendu (G5) : relevé lisible, vide si tout va bien.
function scriptHorsRegles(corps, source, html, mathRandomPermis) {
  const appels = appelsDe(corps, source), { mathRandom, setInterval, animate } = appels
  const res = []
  if (setInterval.length) res.push(`setInterval ligne ${setInterval.join(', ')} : passer par K.at (le gel et « rejouer » l'arrêtent)`)
  if (animate.length) res.push(`element.animate ligne ${animate.join(', ')} : ni gelé ni rejoué par le kit`)
  if (mathRandom.length > mathRandomPermis) res.push(`${mathRandom.length} Math.random (v1 : ${mathRandomPermis}), lignes ${mathRandom.join(', ')} : tirer par K.graine`)
  const balise = new RegExp(`<(${SMIL.join('|')})[\\s/>]`, 'i')
  const smil = [
    ...smilDuHtml(html),
    ...chainesDe(corps, source).filter(c => balise.test(c.texte)).map(c => `ligne ${c.ligne} « ${c.texte.slice(0, 40)} »`),
    ...appels.smil.map(l => `ligne ${l}, élément créé par le script`),
  ]
  if (smil.length) res.push(`SMIL : ${smil.join(' ; ')}`)
  return res
}

describe('outils de la garde (témoins sur des sources écrites ici)', () => {
  it('un @keyframes neuf sur top est relevé ; transform, opacity, stroke-dashoffset et animation-timing-function non', () => {
    const css = '.x { animation: a 1s } @keyframes a { from { transform: none; opacity: 0; animation-timing-function: ease } to { stroke-dashoffset: 0 } }\n' +
      '@keyframes b { 50% { top: 2cqw; opacity: .5 } }'
    expect(ecartsALaListe(css)).toEqual(['@keyframes b anime top : seuls transform, opacity et stroke-dashoffset sont permis'])
    expect(ecartsALaListe(css, { b: ['top'] })).toEqual([])
  })

  it('une entrée figée qui n\'anime plus sa propriété, ou dont le @keyframes a disparu, est à retirer', () => {
    const css = '@keyframes pluie { to { transform: translateY(9cqw) } }'
    expect(ecartsALaListe(css, { pluie: ['background-position'], roule: ['top'] })).toEqual([
      'liste figée à raccourcir : pluie n\'anime plus background-position',
      'liste figée à raccourcir : roule n\'anime plus top (@keyframes absent)',
    ])
  })

  it('setInterval (appelé ou lu sur window), element.animate, Math.random au-delà de la v1 et SMIL sont relevés', () => {
    const source = 'export function start(K) {\n  setInterval(() => {}, 90)\n  const t = window.setInterval\n  K.$("x").animate([{ opacity: 0 }], 300)\n' +
      '  const r = Math.random()\n  K.$("y").innerHTML = \'<animate attributeName="r"/>\'\n  document.createElementNS("http://www.w3.org/2000/svg", "set")\n}\n'
    const { corps } = lireModule(source)
    expect(scriptHorsRegles(corps, source, '<svg><animateTransform/></svg>', 0)).toEqual([
      'setInterval ligne 2, 3 : passer par K.at (le gel et « rejouer » l\'arrêtent)',
      'element.animate ligne 4 : ni gelé ni rejoué par le kit',
      '1 Math.random (v1 : 0), lignes 5 : tirer par K.graine',
      'SMIL : animateTransform ; ligne 6 « <animate attributeName="r"/> » ; ligne 7, élément créé par le script',
    ])
    expect(scriptHorsRegles(corps, source, '', 1).some(r => r.includes('Math.random'))).toBe(false)
  })

  it('K.at, K.anim et K.graine passent (le script d\'une scène v2 ordinaire)', () => {
    const source = 'export function start(K) {\n  const g = K.graine(7)\n  K.at(300, () => K.anim(k => {}, 900))\n  K.on("set")\n}\n'
    const { corps } = lireModule(source)
    expect(scriptHorsRegles(corps, source, '<svg><circle/></svg>', 0)).toEqual([])
  })
})

const SOURCES = [
  ...KITS.map(k => ({ nom: k.nom, cle: 'kit', css: k.css })),
  ...Object.keys(SCENES).map(id => ({ nom: id, cle: id, css: lireScene(id).css })),
]

describe.each(SOURCES.map(s => [s.nom, s]))('G5 : %s', (nom, source) => {
  it('@keyframes : transform, opacity et stroke-dashoffset seulement, hors liste figée de la v1 (qui ne peut que raccourcir)', () => {
    expect(ecartsALaListe(source.css, FIGEE[source.cle])).toEqual([])
  })
})

describe.each(Object.keys(SCENES))('G5 : script de %s', id => {
  it('aucun setInterval, aucune animation Web Animations ni SMIL, pas plus de Math.random que la v1', () => {
    const scene = lireScene(id)
    expect(scriptHorsRegles(scene.corps, scene.source, scene.html, MATH_RANDOM_V1[id] ?? 0)).toEqual([])
  })
})

it('la liste figée ne nomme que des sources lues ici (kit et scènes du convertisseur)', () => {
  expect(Object.keys(FIGEE).filter(cle => cle !== 'kit' && !SCENES[cle])).toEqual([])
})
