import { describe, it, expect, vi } from 'vitest'
import { playCinematic } from '../../src/briefing/index.js'
import { SCENES, KITS, lireScene, lireModule, lireCss, appelsDe, chainesDe, smilDuHtml, SMIL, animationsDe, decouper } from './analyse-scenes.js'

// G5 (spec cinématiques v2, §3.1 et §3.3) : ce qui bouge dans une scène ne coûte pas de repeint.
// - Un @keyframes n'anime que transform, opacity ou stroke-dashoffset (composition, ou petit tracé) ; ceux de la v1 qui
//   animent autre chose (tremblés de M6, développements de photo…) sont dans FIGEE, liste qui ne peut que raccourcir :
//   chaque entrée y dit exactement ce que son @keyframes anime encore hors de ces trois propriétés. C5 en a retiré la
//   pluie (prologues, M3) et les balayages (.track du kit, .roll et .sb de M3), passés en transform : voir plus bas,
//   « même trajet que la v1 », ce qui garde que l'image n'a pas changé.
// - Le script d'une scène n'a aucun setInterval (que le convertisseur ne redirige pas vers K.at, ni le gel ni « rejouer »
//   ne l'arrêteraient), aucune animation Web Animations (element.animate) ni SMIL (<animate>, <set>…), que le kit ne
//   sait ni geler ni rejouer, et pas plus de Math.random que la v1 : tout tirage neuf passe par K.graine.

const PERMISES = new Set(['transform', 'opacity', 'stroke-dashoffset'])
const HORS_ANIMATION = new Set(['animation-timing-function'])   // réglage d'une étape, pas une propriété animée

// Liste figée de la v1, par source (kit : les deux feuilles du kit) : @keyframes → propriétés animées hors des trois
// permises. N'y ajouter aucune entrée : une exception demande une décision écrite dans la spec.
const FIGEE = {
  kit: { 'k-crt': ['height', 'width'], 'k-develop': ['filter'], 'k-eq': ['height'] },
  m2: { 'm2-dev': ['filter'] },
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

// ── même trajet que la v1 (tâche C5 : même image, moins de repeints) ──
// Ce que C5 a passé en transform défile exactement comme dans la v1, dont les trajets sont relevés ici (7fa375d), en cqw.
// - Motif en tuiles qui glissait dans sa boîte par background-position (pluie) : la boîte glisse maintenant avec son
//   motif, du même vecteur par tour. Elle garde le coin haut gauche de la v1, où le motif s'ancre (une tuile en cqw
//   vaut rarement un nombre entier de pixels : décalé d'une tuile entière, le motif glisserait encore d'une fraction de
//   pixel, vu sur les captures de C5), grandit en bas et à droite pour couvrir à chaque instant du tour toute la boîte
//   de la v1, et chaque tour part d'un nombre entier de tuiles (même motif qu'au repos) : le motif tombe aux mêmes places.
//   boite : [haut, droite, bas, gauche] (inset) ; tuile : [largeur, hauteur] ; tour : [x, y] que background-position
//   parcourait en un tour, que la v2 parcourt en translate.
// - Bande qui descendait par top (balayage du signal, défilement des caméras) : top de départ et d'arrivée d'un tour,
//   refaits par le même top de base et translateY.
const TUILES_V1 = [
  ...['prologue-a', 'prologue-b'].flatMap(source => [
    { source, selecteurs: ['.pro .rain'], animation: 'pro-rain', boite: [-12, -12, -12, -12], tuile: [5, 9], tour: [-1.2, 9] },
    { source, selecteurs: ['.pro .rain', '.pro .rain.r2'], animation: 'pro-rain2', boite: [-12, -12, -12, -12], tuile: [9, 16], tour: [-2.2, 16] },
  ]),
  { source: 'm3', selecteurs: ['.m3 .rain::before'], animation: 'm3-rainA', boite: [0, 0, 0, 0], tuile: [11, 11], tour: [-11, 33] },
  { source: 'm3', selecteurs: ['.m3 .rain::after'], animation: 'm3-rainB', boite: [0, 0, 0, 0], tuile: [6, 6], tour: [-6, 18] },
]
const BANDES_V1 = [
  { source: 'kit', selecteurs: ['.st .track'], animation: 'k-track', trajet: [-5, 60] },
  { source: 'm3', selecteurs: ['.m3 .feed .roll'], animation: 'm3-roll', trajet: [-4, 44] },
]
const COTES = ['haut', 'droite', 'bas', 'gauche']
const PRES = 1e-6
const nombre = v => Math.round(v * 1e6) / 1e6

// Déclarations d'un élément, dans l'ordre : celles des règles qui citent chacun des sélecteurs (le suivant l'emporte,
// comme le plus précis dans la feuille : .rain puis .rain.r2).
function cascade(regles, selecteurs) {
  return selecteurs.flatMap(sel => regles.filter(r => r.selecteurs.includes(sel)).flatMap(r => r.declarations))
}
const derniere = (decls, prop) => decls.filter(([p]) => p === prop).map(([, v]) => v).pop()

// Longueur CSS : { v, u } (u : cqw ou %, null pour 0 sans unité) ; toute autre unité est refusée.
function longueur(texte) {
  const m = String(texte).trim().match(/^([-+]?(?:\d+\.?\d*|\.\d+))(cqw|%)?$/)
  if (!m || (!m[2] && parseFloat(m[1]) !== 0)) throw new Error(`longueur non prise en charge par la garde : « ${texte} »`)
  return { v: parseFloat(m[1]), u: m[2] || null }
}
const enCqw = texte => { const l = longueur(texte); if (l.u === '%') throw new Error(`cqw attendus : « ${texte} »`); return l.v }

// Boîte d'un élément positionné : [haut, droite, bas, gauche] en cqw (inset, puis top, right, bottom, left, dans
// l'ordre des déclarations) ; undefined pour un côté jamais posé.
function boite(decls) {
  const b = [undefined, undefined, undefined, undefined]
  for (const [p, v] of decls) {
    if (p === 'inset') {
      const n = v.split(/\s+/).map(enCqw)
      b.splice(0, 4, n[0], n[1] ?? n[0], n[2] ?? n[0], n[3] ?? n[1] ?? n[0])
    }
    const i = ['top', 'right', 'bottom', 'left'].indexOf(p)
    if (i >= 0) b[i] = v === 'auto' ? undefined : enCqw(v)
  }
  return b
}

// Motif de fond : position et taille de la tuile en cqw (background-position, background-size, ou le raccourci
// background : « url(…) 0 0 / 11cqw 11cqw ») ; taille null si jamais posée (auto).
function motif(decls) {
  let position = [0, 0], tuile = null
  for (const [p, v] of decls) {
    if (p === 'background-position') position = v.split(/\s+/).map(enCqw)
    if (p === 'background-size') tuile = v.split(/\s+/).map(enCqw)
    if (p === 'background') {
      const jetons = decouper(v, ' ').map(j => j.trim()).filter(Boolean)
      const barre = jetons.indexOf('/'), longueurs = jetons.filter(j => /^[-+]?(?:\d|\.\d)/.test(j))
      position = barre > 0 ? jetons.slice(barre - 2, barre).map(enCqw) : longueurs.length ? longueurs.slice(0, 2).map(enCqw) : [0, 0]
      tuile = barre > 0 ? jetons.slice(barre + 1, barre + 3).map(enCqw) : null
    }
  }
  return { position, tuile }
}

// Translation posée par une liste de déclarations (une étape de @keyframes) : [x, y] en { v, u } ; null si elle ne pose
// pas transform. none, translate(x[, y]), translateX(x), translateY(y), et leurs suites ; toute autre fonction refusée.
function translation(decls) {
  const t = derniere(decls, 'transform')
  if (t === undefined) return null
  const res = [{ v: 0, u: null }, { v: 0, u: null }]
  if (t.trim() === 'none') return res
  const ajouter = (i, texte) => {
    const l = longueur(texte)
    if (l.v !== 0 && res[i].v !== 0 && l.u !== res[i].u) throw new Error(`unités mêlées dans « ${t} »`)
    res[i] = { v: nombre(res[i].v + l.v), u: l.v !== 0 ? l.u : res[i].u }
  }
  const reste = t.replace(/(translate[XY]?)\(([^)]*)\)/g, (_, f, args) => {
    const a = args.split(',').map(s => s.trim())
    if (f === 'translateX') ajouter(0, a[0])
    else if (f === 'translateY') ajouter(1, a[0])
    else { ajouter(0, a[0]); if (a[1] !== undefined) ajouter(1, a[1]) }
    return ''
  })
  if (reste.trim()) throw new Error(`transform non pris en charge par la garde : « ${t} »`)
  return res
}

// Étapes d'un @keyframes, par avancement (0 à 100) : [{ a, declarations }] triées ; from = 0, to = 100.
function etapes(kf) {
  return kf.etapes.flatMap(e => e.cles.split(',').map(c => c.trim()).map(c => ({
    a: c === 'from' ? 0 : c === 'to' ? 100 : parseFloat(c), declarations: e.declarations,
  }))).sort((x, y) => x.a - y.a)
}

// Ce qu'anime un @keyframes hors de transform (le calque doit glisser en transform, rien d'autre).
const autresQueTransform = kf => [...new Set(kf.etapes.flatMap(e => e.declarations.map(([p]) => p)))]
  .filter(p => p !== 'transform' && p !== 'animation-timing-function')

// Lecture commune : déclarations de l'élément, animation qu'il joue, son @keyframes et la translation de début et de
// fin d'un tour (celle de l'étape 0, sinon aucune ; celle de l'étape 100, sinon aucune). Les écarts y sont ajoutés.
function lireTrajet(css, cas, ecarts) {
  const { regles, keyframes } = lireCss(css)
  const decls = cascade(regles, cas.selecteurs), sel = cas.selecteurs.at(-1)
  if (!decls.length) { ecarts.push(`${sel} : règle introuvable`); return null }
  if (!(animationsDe(decls) || []).some(a => a.nom === cas.animation)) { ecarts.push(`${sel} ne joue plus ${cas.animation}`); return null }
  const kf = keyframes.find(k => k.nom === cas.animation)
  if (!kf) { ecarts.push(`@keyframes ${cas.animation} introuvable`); return null }
  const autres = autresQueTransform(kf)
  if (autres.length) { ecarts.push(`@keyframes ${cas.animation} anime ${autres.join(', ')} : le calque doit glisser en transform, rien d'autre`); return null }
  const base = derniere(decls, 'transform')
  if (base !== undefined && base.trim() !== 'none') { ecarts.push(`${sel} a un transform de base (${base}) : trajet non lisible`); return null }
  const es = etapes(kf), zero = [{ v: 0, u: null }, { v: 0, u: null }]
  const debut = (es[0].a === 0 && translation(es[0].declarations)) || zero
  const fin = (es.at(-1).a === 100 && translation(es.at(-1).declarations)) || zero
  if ([...debut, ...fin].some(l => l.u === '%')) { ecarts.push(`@keyframes ${cas.animation} : translation en %, trajet non lisible en cqw`); return null }
  return { decls, debut: debut.map(l => l.v), fin: fin.map(l => l.v) }
}

// Écarts d'un motif en tuiles à son trajet de la v1 (vide si même image).
function ecartsDeTuiles(css, cas) {
  const ecarts = [], lu = lireTrajet(css, cas, ecarts)
  if (!lu) return ecarts
  const sel = cas.selecteurs.at(-1), { debut, fin } = lu
  const tour = [nombre(fin[0] - debut[0]), nombre(fin[1] - debut[1])]
  if (Math.abs(tour[0] - cas.tour[0]) > PRES || Math.abs(tour[1] - cas.tour[1]) > PRES) {
    ecarts.push(`${sel} : un tour déplace le motif de (${tour.join(', ')}) cqw, la v1 de (${cas.tour.join(', ')})`)
  }
  const { position, tuile } = motif(lu.decls)
  if (!tuile || tuile[0] !== cas.tuile[0] || tuile[1] !== cas.tuile[1]) ecarts.push(`${sel} : tuile ${tuile ? tuile.join(' × ') : 'auto'} cqw, la v1 ${cas.tuile.join(' × ')}`)
  if (position[0] !== 0 || position[1] !== 0) ecarts.push(`${sel} : background-position (${position.join(', ')}) cqw, la v1 (0, 0)`)
  const b = boite(lu.decls)
  if (b.some(c => c === undefined)) { ecarts.push(`${sel} : boîte incomplète (${b.map((c, i) => `${COTES[i]} ${c ?? '?'}`).join(', ')})`); return ecarts }
  // le motif s'ancre au coin haut gauche du calque : ce coin reste celui de la v1
  if (b[0] !== cas.boite[0] || b[3] !== cas.boite[3]) {
    ecarts.push(`${sel} : coin haut gauche du calque à (${b[3]}, ${b[0]}) cqw, la v1 à (${cas.boite[3]}, ${cas.boite[0]}) : agrandir le calque en bas et à droite, pas en haut ni à gauche`)
  }
  // le tour part d'un nombre entier de tuiles : même motif qu'au repos (et qu'au départ du tour de la v1)
  if ([0, 1].some(i => Math.abs(debut[i] / cas.tuile[i] - Math.round(debut[i] / cas.tuile[i])) > PRES)) {
    ecarts.push(`${sel} : le tour part de (${debut.map(nombre).join(', ')}) cqw, pas d'un nombre entier de tuiles (${cas.tuile.join(' × ')}) : le motif sauterait à chaque tour`)
  }
  // la boîte, translatée, couvre la boîte de la v1 : aux deux bouts du tour (le trajet est droit, les bords aussi)
  for (const [dx, dy] of [debut, fin]) {
    const manque = [b[0] + dy - cas.boite[0], b[1] - dx - cas.boite[1], b[2] - dy - cas.boite[2], b[3] + dx - cas.boite[3]]
    manque.forEach((m, i) => {
      if (m > PRES) ecarts.push(`${sel} : à (${nombre(dx)}, ${nombre(dy)}) cqw, le calque laisse ${nombre(m)} cqw à découvert en ${COTES[i]} de la boîte de la v1`)
    })
  }
  return ecarts
}

// Écarts d'une bande à son trajet de la v1.
function ecartsDeBande(css, cas) {
  const ecarts = [], lu = lireTrajet(css, cas, ecarts)
  if (!lu) return ecarts
  const sel = cas.selecteurs.at(-1), haut = boite(lu.decls)[0]
  if (haut === undefined) return [...ecarts, `${sel} : top de base absent`]
  if (lu.debut[0] || lu.fin[0]) ecarts.push(`${sel} : la bande se déplace aussi en largeur`)
  const trajet = [nombre(haut + lu.debut[1]), nombre(haut + lu.fin[1])]
  if (trajet[0] !== cas.trajet[0] || trajet[1] !== cas.trajet[1]) ecarts.push(`${sel} : descend de ${trajet[0]} à ${trajet[1]} cqw, la v1 de ${cas.trajet[0]} à ${cas.trajet[1]}`)
  return ecarts
}

describe('outils de la garde du trajet (témoins sur des feuilles écrites ici)', () => {
  const cas = { selecteurs: ['.x .r'], animation: 'x-pluie', boite: [-12, -12, -12, -12], tuile: [5, 9], tour: [-1.2, 9] }
  const feuille = (boiteCss, kf) => `.x .r { position: absolute; ${boiteCss}; background-size: 5cqw 9cqw; animation: x-pluie .42s linear infinite }\n@keyframes x-pluie { ${kf} }`

  it('la pluie de la v1 (background-position) n\'est pas un trajet en transform', () => {
    expect(ecartsDeTuiles(feuille('inset: -12cqw', 'to { background-position: -1.2cqw 9cqw }'), cas))
      .toEqual(['@keyframes x-pluie anime background-position : le calque doit glisser en transform, rien d\'autre'])
  })

  it('passée en transform sans agrandir sa boîte, elle laisse un bord à découvert ; agrandie en bas et à droite, le tour partant d\'une tuile plus haut, non', () => {
    expect(ecartsDeTuiles(feuille('inset: -12cqw', 'to { transform: translate(-1.2cqw, 9cqw) }'), cas)).toEqual([
      '.x .r : à (-1.2, 9) cqw, le calque laisse 9 cqw à découvert en haut de la boîte de la v1',
      '.x .r : à (-1.2, 9) cqw, le calque laisse 1.2 cqw à découvert en droite de la boîte de la v1',
    ])
    // agrandie en bas et à droite, le tour partant d'une tuile plus haut : coin haut gauche (ancre du motif) inchangé
    expect(ecartsDeTuiles(feuille('inset: -12cqw -13.2cqw -21cqw -12cqw', 'from { transform: translate(0, -9cqw) } to { transform: translate(-1.2cqw, 0) }'), cas)).toEqual([])
    expect(ecartsDeTuiles(feuille('inset: -12cqw; right: -13.2cqw; bottom: -21cqw', 'from { transform: translateY(-9cqw) } to { transform: translateX(-1.2cqw) translateY(0) }'), cas)).toEqual([])
    expect(ecartsDeTuiles(feuille('inset: -12cqw -13.2cqw -12cqw -12cqw', 'from { transform: translate(0, -9cqw) } to { transform: translate(-1.2cqw, 0) }'), cas))
      .toEqual(['.x .r : à (0, -9) cqw, le calque laisse 9 cqw à découvert en bas de la boîte de la v1'])
  })

  it('agrandie vers le haut ou vers la gauche, même d\'une tuile entière : relevé (le motif, ancré au coin haut gauche, glisserait d\'une fraction de pixel)', () => {
    const coin = (x, y) => `.x .r : coin haut gauche du calque à (${x}, ${y}) cqw, la v1 à (-12, -12) : agrandir le calque en bas et à droite, pas en haut ni à gauche`
    // premier essai de C5, écarté sur les captures : calque monté d'une tuile, tour parti du repos
    expect(ecartsDeTuiles(feuille('inset: -21cqw -13.2cqw -12cqw -12cqw', 'to { transform: translate(-1.2cqw, 9cqw) }'), cas)).toEqual([coin(-12, -21)])
    expect(ecartsDeTuiles(feuille('inset: -12cqw -13.2cqw -12cqw -12cqw; top: -21cqw', 'from { transform: none } to { transform: translateX(-1.2cqw) translateY(9cqw) }'), cas)).toEqual([coin(-12, -21)])
    expect(ecartsDeTuiles(feuille('inset: -12cqw -13.2cqw -21cqw -17cqw', 'from { transform: translate(0, -9cqw) } to { transform: translate(-1.2cqw, 0) }'), cas)).toEqual([coin(-17, -12)])
  })

  it('un tour parti d\'une fraction de tuile, déplacé d\'un autre vecteur ou sur une autre tuile : relevé', () => {
    const bonne = 'from { transform: translate(0, -9cqw) } to { transform: translate(-1.2cqw, 0) }'
    expect(ecartsDeTuiles(feuille('inset: -12cqw -13.2cqw -30cqw -12cqw', 'from { transform: translate(0, -13.5cqw) } to { transform: translate(-1.2cqw, -4.5cqw) }'), cas))
      .toEqual(['.x .r : le tour part de (0, -13.5) cqw, pas d\'un nombre entier de tuiles (5 × 9) : le motif sauterait à chaque tour'])
    expect(ecartsDeTuiles(feuille('inset: -12cqw -13.2cqw -21cqw -12cqw', 'from { transform: translate(0, -9cqw) } to { transform: translate(-1cqw, 0) }'), cas))
      .toEqual(['.x .r : un tour déplace le motif de (-1, 9) cqw, la v1 de (-1.2, 9)'])
    expect(ecartsDeTuiles(feuille('inset: -12cqw -13.2cqw -21cqw -12cqw', bonne).replace('5cqw 9cqw', '5cqw 10cqw'), cas))
      .toEqual(['.x .r : tuile 5 × 10 cqw, la v1 5 × 9'])
  })

  it('une bande qui descend par top n\'a pas de trajet en transform ; par translateY, son départ et son arrivée sont lus', () => {
    const bande = { selecteurs: ['.x .b'], animation: 'x-b', trajet: [-5, 60] }
    const css = kf => `.x .b { position: absolute; left: 0; right: 0; height: 4cqw; top: -5cqw; animation: x-b 6.5s linear infinite }\n@keyframes x-b { ${kf} }`
    expect(ecartsDeBande(css('0% { top: -5cqw } 100% { top: 60cqw }'), bande)).toEqual(['@keyframes x-b anime top : le calque doit glisser en transform, rien d\'autre'])
    expect(ecartsDeBande(css('to { transform: translateY(65cqw) }'), bande)).toEqual([])
    expect(ecartsDeBande(css('to { transform: translateY(60cqw) }'), bande)).toEqual(['.x .b : descend de -5 à 55 cqw, la v1 de -5 à 60'])
  })
})

const sourcesDe = cle => (cle === 'kit' ? KITS.map(k => ({ nom: k.nom, css: k.css })) : [{ nom: cle, css: lireScene(cle).css }])

describe.each(TUILES_V1.map(c => [c.source, c.selecteurs.at(-1), c]))('G5, même trajet que la v1 : %s, %s', (source, sel, cas) => {
  it(`le motif (${cas.animation}) glisse en transform avec sa boîte, sans rien découvrir, aux mêmes places`, () => {
    for (const s of sourcesDe(cas.source)) expect(ecartsDeTuiles(s.css, cas), s.nom).toEqual([])
  })
})

describe.each(BANDES_V1.map(c => [c.source, c.selecteurs.at(-1), c]))('G5, même trajet que la v1 : %s, %s', (source, sel, cas) => {
  it(`la bande (${cas.animation}) descend en transform, du même départ à la même arrivée`, () => {
    for (const s of sourcesDe(cas.source)) expect(ecartsDeBande(s.css, cas), s.nom).toEqual([])
  })
})

// Le trait du scanner de M3 (.sb) descendait par top de 0 à 100 % de la hauteur de son flux (le flux change de taille
// en vignette : top suivait). Il descend maintenant par translateY(100 %) d'un calque qui a la hauteur du flux (haut et
// bas à 0, sans height : 100 % de sa hauteur, celle du flux), et le trait est son ::before ; le calque lui-même ne
// peint rien (sinon, pendant le balayage, tout le flux prendrait la couleur du trait).
it('G5, même trajet que la v1 : m3, le trait du scanner (.sb) descend de tout le flux, en neuf pas, en transform', () => {
  const { regles, keyframes } = lireCss(lireScene('m3').css)
  const calque = cascade(regles, ['.m3 .feed .sb']), calqueB = cascade(regles, ['.m3 .feed .sb', '.m3 #camB .sb'])
  expect({ boite: boite(calque), height: derniere(calque, 'height') ?? null }).toEqual({ boite: [0, 0, 0, 0], height: null })
  expect(calqueB.filter(([p]) => /^(background|box-shadow)/.test(p))).toEqual([])
  // le trait de la v1, en haut du calque, aux couleurs de chaque caméra
  const trait = sels => { const d = cascade(regles, sels); return [boite(d)[0], derniere(d, 'height'), derniere(d, 'background'), derniere(d, 'box-shadow')] }
  expect(trait(['.m3 .feed .sb::before'])).toEqual([0, '.3cqw', '#eafff0', '0 0 1cqw .35cqw rgba(140,255,170,.75)'])
  expect(trait(['.m3 .feed .sb::before', '.m3 #camB .sb::before'])).toEqual([0, '.3cqw', '#eef7ff', '0 0 1cqw .35cqw rgba(140,200,255,.75)'])
  // mêmes pas et mêmes instants que la v1 : [avancement, position du trait en % de la hauteur du flux, opacité]
  expect(derniere(cascade(regles, ['.m3 .feed.enh .sb']), 'animation')).toBe('m3-sb 1.2s steps(9, end) forwards')
  const kf = keyframes.find(k => k.nom === 'm3-sb')
  expect(autresQueTransform(kf).filter(p => p !== 'opacity')).toEqual([])
  expect(etapes(kf).map(e => {
    const t = translation(e.declarations)
    return [e.a, t && t[0].v === 0 ? `${t[1].v}${t[1].u || ''}` : null, parseFloat(derniere(e.declarations, 'opacity'))]
  })).toEqual([[0, '0', 1], [99, '100%', 1], [100, '100%', 0]])
})

// ── lumière du matin de l'épilogue (tâche C5 ; spec §3.4, E11-E12) ──
// La respiration des rayons (epi-breathe) se joue sur l'opacité d'un conteneur HTML, que la carte graphique compose
// sans repeindre, et plus sur le g du svg flouté des rayons (blur .6cqw), qu'il fallait repeindre et flouter à nouveau
// à chaque image. Même image : le fondu en screen des rayons sur la photo passe au conteneur (une opacité animée
// l'isole : un descendant en screen ne se fondrait plus que dans le conteneur vide).
const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
const decrireEl = el => `${el.localName}${el.id ? '#' + el.id : ''}${el.getAttribute('class') ? '.' + el.getAttribute('class').trim().split(/\s+/).join('.') : ''}`

describe.each([['libres'], ['enfermes']])('G5 : respiration des rayons de l\'épilogue (%s)', port => {
  it('sur l\'opacité d\'un conteneur HTML, hors de tout filtre, qui porte le fondu en screen des rayons', async () => {
    vi.useFakeTimers(FAKE)
    document.body.innerHTML = '<div id="briefing-root" hidden></div>'
    const kit = document.createElement('style'); kit.id = 'k-kit-css'; kit.textContent = KITS[0].css
    document.head.appendChild(kit)
    const ecarts = []
    let leve = false
    try {
      await playCinematic('epilogue', { params: { port } })
      const root = document.getElementById('briefing-root')
      for (let t = 0; t <= 60000 && root.querySelector('#st') && !root.querySelector('#povB.sun'); t += 250) await vi.advanceTimersByTimeAsync(250)
      const st = root.querySelector('#st')
      leve = !!root.querySelector('#povB.sun')
      const respirent = leve ? [...st.querySelectorAll('*')].filter(el => (animationsDe([['animation', getComputedStyle(el).animation || 'none']]) || []).some(a => a.nom === 'epi-breathe')) : []
      if (leve && !respirent.length) ecarts.push('aucun élément ne respire (epi-breathe)')
      for (const el of respirent) {
        const d = decrireEl(el)
        if (el instanceof SVGElement) ecarts.push(`${d} : élément SVG, repeint avec tout son svg à chaque image`)
        for (let a = el; a && a !== st; a = a.parentElement) {
          const f = getComputedStyle(a).filter || ''
          if (/blur\(|drop-shadow\(/.test(f)) ecarts.push(`${d} : sous le filtre de ${decrireEl(a)} (${f})`)
        }
        if (!el.querySelector('.rays')) ecarts.push(`${d} : ne contient pas les rayons (.rays)`)
        const fondu = getComputedStyle(el).mixBlendMode || 'normal'
        if (fondu !== 'screen') ecarts.push(`${d} : fondu ${fondu}, la v1 fondait les rayons en screen`)
        for (const e of el.querySelectorAll('*')) {
          const m = getComputedStyle(e).mixBlendMode
          if (m && m !== 'normal') ecarts.push(`${decrireEl(e)} : fondu ${m} dans le conteneur qui respire (il ne se fondrait plus dans la photo)`)
        }
      }
    } finally {
      vi.useRealTimers(); document.body.innerHTML = ''; document.head.innerHTML = ''
    }
    expect(leve, 'le soleil ne se lève jamais (#povB.sun)').toBe(true)
    expect(ecarts).toEqual([])
  })
})
