// La salle du Bivouac, le bar de M5 (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.1, §8, §9 ; tâche B9 du
// plan m5-bar). Décor procédural FUSIONNÉ PAR MATÉRIAU (un appel de dessin par matériau, createBatcher), posé sur les
// boîtes de src/bar/plan.js : les murs, les cloisons, les portes et les meubles sont dessinés là où le plan arrête le pas
// de Viktor, la voix et la vue (une seule source de vérité). Arrêté dans les années 90 : zinc, Formica, juke-box,
// baby-foot, télé à tube, néon « LE BIV UAC » au O mort.
//
// Lumière : le soleil de 18 h, bas, entre par la vitrine et ses stores à lames orange (un spot dehors, la seule ombre,
// figée après la première image par qui rend la salle) ; une hémisphère chaude ; quatre PointLight sans ombre (globes du
// zinc, télé, ampoule du couloir, juke-box) ; le reste en lueurs additives fusionnées. Les valeurs qui se règlent à
// l'œil sont dans DECOR (src/bar/reglages.js).
//
// Ce qu'on vise (createInteract, clé barId) : des capsules invisibles, une par siège libre, par objet à examiner
// (OBJETS_VISABLES) et au mange-debout est ; les occultants sont des boîtes invisibles tirées des murs, cloisons et
// portes du plan. Jamais de maillage animé dans un rayon. Aucun Math.random : le hasard est à graine (DECOR.graine), et
// tout ce qui bouge (néon, télé, ventilateur) n'avance que par update(dt).
//
// Classes de three : seulement celles que le jeu utilise déjà ailleurs (three est d'un seul bloc dans le bundle
// principal : une classe de plus l'y ferait grossir, même importée par le seul morceau du bar).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { canvasTexture, createBatcher, indexed } from '../gfx/batcher.js'
import { V, rod, lathe, rounded, tint, raisedPanel, fromTriangles } from '../prologue/decor.js'
import { generateur } from '../shot/acoustics.js'
import { SALLE, BOITES, SIEGES, TABLES, ANCRES, PLACES } from './plan.js'
import { DECOR } from './reglages.js'

const H = SALLE.plafond   // 3 m sous plafond
const LAMBRIS = 1.1       // hauteur du lambris (et de la cimaise)
const VITRINE = { bas: 0.9, haut: 2.4 }   // l'allège et le linteau de la vitrine
const TAU = Math.PI * 2

// Les objets à examiner (E) : une capsule chacun, identifiant = clé de ANCRES (et de OBJETS, src/bar/textes.js, pour
// photo, journal et fenêtre) ; la porte (sortir en maintenant E) et le WC (la file des toilettes) en sont.
export const OBJETS_VISABLES = Object.freeze(['photo', 'journal', 'fenetre', 'jukebox', 'cible', 'porte', 'wc'])

// ─── Géométrie ─────────────────────────────────────────────────────

// Boîte donnée par ses bornes, déjà placée dans la salle.
const bornes = (x0, x1, y0, y1, z0, z1) =>
  new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
// UV du monde : les faces verticales prennent (x + z) / su et y / sv, les horizontales x / su et z / sv ; le lambris, le
// parquet et l'enduit gardent la même échelle d'un mur à l'autre. Géométrie déjà placée.
function uvMonde(g, su, sv = su, v0 = 0) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, x / su, z / sv)
    else uv.setXY(i, (Math.abs(n.getX(i)) > 0.5 ? z : x) / su, (y - v0) / sv)
  }
  return g
}
// Plan horizontal de x0 à x1, de z0 à z1, à la hauteur y, tourné vers le haut (ou vers le bas : plafond).
function horizontal(x0, x1, z0, z1, y, dessous = false) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0)
  g.rotateX(dessous ? Math.PI / 2 : -Math.PI / 2)
  return g.translate((x0 + x1) / 2, y, (z0 + z1) / 2)
}
// Plan vertical w × h, centré en (x, y, z), tourné vers n : 'x+', 'x-', 'z+' ou 'z-'.
const TOURNE = { 'z+': 0, 'z-': Math.PI, 'x+': Math.PI / 2, 'x-': -Math.PI / 2 }
const vertical = (w, h, x, y, z, n) => new THREE.PlaneGeometry(w, h).rotateY(TOURNE[n]).translate(x, y, z)
// UV recadrées sur le rectangle [x, y, largeur, hauteur] (pixels) d'une planche de L × Hp pixels (canvas, y vers le bas).
function recadre(g, [x, y, w, h], L, Hp) {
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * w) / L, 1 - (y + h) / Hp + uv.getY(i) * h / Hp)
  return g
}
// Recadre sur une bande [u0, u1] × [v0, v1] de la texture (fractions)
function bande(g, u0, u1, v0, v1) {
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0))
  return g
}

// ─── Textures dessinées ────────────────────────────────────────────
// Chaque fonction dessine dans un canvas 2D (sans contexte, sous jsdom, rien n'est dessiné : la texture reste unie).

function dessinerParquet(hasard) {
  return (g, w, h) => {   // 4 lames de 12 cm sur 1,6 m, chêne foncé verni, usé au passage
    const n = 4, lh = h / n
    for (let i = 0; i < n; i++) {
      let x = -hasard() * w
      while (x < w) {
        const l = w * (0.55 + hasard() * 0.45), c = 58 + hasard() * 24
        g.fillStyle = `rgb(${c + 16},${c * 0.74 + 4},${c * 0.46})`
        g.fillRect(x, i * lh, l, lh)
        for (let k = 0; k < 7; k++) {   // fil du bois
          g.strokeStyle = `rgba(30,16,8,${0.12 + hasard() * 0.18})`; g.lineWidth = 1
          const y = i * lh + 3 + hasard() * (lh - 6)
          g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + l * 0.3, y + hasard() * 4 - 2, x + l * 0.6, y + hasard() * 4 - 2, x + l, y); g.stroke()
        }
        g.fillStyle = 'rgba(10,5,2,.85)'; g.fillRect(x, i * lh, 2, lh)   // joint de bout
        x += l
      }
      g.fillStyle = 'rgba(10,5,2,.9)'; g.fillRect(0, i * lh, w, 2)        // joint de rive
    }
  }
}
function dessinerLambris(g, w, h) {   // 4 planches verticales de 10 cm, rainurées, plus sombres au pied (les chaussures)
  for (let i = 0; i < 4; i++) {
    const x = i * w / 4, c = 70 + (i % 2) * 6
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `rgb(${c + 24},${c - 4},${c - 30})`); gr.addColorStop(1, `rgb(${c - 14},${c - 34},${c - 50})`)
    g.fillStyle = gr; g.fillRect(x, 0, w / 4, h)
    g.fillStyle = 'rgba(15,8,4,.85)'; g.fillRect(x, 0, 3, h)
    g.fillStyle = 'rgba(255,220,170,.08)'; g.fillRect(x + 3, 0, 2, h)
  }
}
function dessinerEnduit(hasard) {
  return (g, w, h) => {   // enduit jauni par trente ans de fumée : plus sombre vers le plafond, taches
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5e4a30'); gr.addColorStop(0.45, '#8a7048'); gr.addColorStop(1, '#9a8058')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 320; i++) {   // taches fines, peu marquées
      const x = hasard() * w, y = hasard() * h, r = 3 + hasard() * 12
      g.fillStyle = `rgba(${hasard() < 0.5 ? '60,40,20' : '170,140,95'},${0.02 + hasard() * 0.03})`
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill()
    }
    for (let i = 0; i < 18; i++) {     // coulures de fumée, depuis le haut
      const x = hasard() * w, l = h * (0.15 + hasard() * 0.3)
      const c = g.createLinearGradient(0, 0, 0, l); c.addColorStop(0, 'rgba(50,32,16,.12)'); c.addColorStop(1, 'rgba(50,32,16,0)')
      g.fillStyle = c; g.fillRect(x, 0, 2 + hasard() * 5, l)
    }
  }
}
function dessinerFaience(g, w, h) {   // carreaux blancs de cuisine, 15 cm, joints gris
  g.fillStyle = '#c8cec4'; g.fillRect(0, 0, w, h)
  g.fillStyle = '#7d847a'
  for (let i = 0; i < 4; i++) { g.fillRect(i * w / 4, 0, 2, h); g.fillRect(0, i * h / 4, w, 2) }
}
function dessinerLueurs(g, w, h) {   // à gauche une tache ronde et douce, à droite une bande douce
  const r = g.createRadialGradient(h / 2, h / 2, 0, h / 2, h / 2, h / 2)
  r.addColorStop(0, '#ffffff'); r.addColorStop(0.4, '#808080'); r.addColorStop(1, '#000000')
  g.fillStyle = r; g.fillRect(0, 0, h, h)
  const b = g.createLinearGradient(0, 0, 0, h); b.addColorStop(0, '#000'); b.addColorStop(0.5, '#fff'); b.addColorStop(1, '#000')
  g.fillStyle = b; g.fillRect(h, 0, w - h, h)
  const m = g.createLinearGradient(h, 0, w, 0); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.15, 'rgba(0,0,0,0)'); m.addColorStop(0.85, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)')
  g.fillStyle = m; g.fillRect(h, 0, w - h, h)
}

// Le néon : « LE BIVOUAC » en tubes, lettre par lettre dans des cases fixes ; le haut de la planche porte toutes les
// lettres sauf le O, le bas le O seul (son plan à lui, qui s'éteint et se rallume).
const NEON = { L: 1024, H: 256, case: 92, espace: 46 }
const NEON_LETTRES = ['L', 'E', ' ', 'B', 'I', 'V', 'O', 'U', 'A', 'C']
const neonCentre = i => {   // centre de la case de la lettre i, en pixels
  const largeur = NEON_LETTRES.reduce((s, c) => s + (c === ' ' ? NEON.espace : NEON.case), 0)
  let x = (NEON.L - largeur) / 2
  for (let k = 0; k < i; k++) x += NEON_LETTRES[k] === ' ' ? NEON.espace : NEON.case
  return x + NEON.case / 2
}
const NEON_O = NEON_LETTRES.indexOf('O')
function dessinerNeon(g, w, h) {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h)
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 100px "Arial Narrow", Arial, sans-serif'; g.lineJoin = 'round'
  const tube = (c, x, y) => {
    g.shadowColor = '#ff5a00'; g.shadowBlur = 22; g.lineWidth = 12; g.strokeStyle = '#ff6a10'; g.strokeText(c, x, y)
    g.shadowBlur = 6; g.lineWidth = 5; g.strokeStyle = '#ffd8a0'; g.strokeText(c, x, y)
    g.shadowBlur = 0
  }
  NEON_LETTRES.forEach((c, i) => { if (c !== ' ' && i !== NEON_O) tube(c, neonCentre(i), h / 4) })
  tube('O', neonCentre(NEON_O), h * 3 / 4)
}

// La rue au couchant, vue par la vitrine : la caserne d'en face à contre-jour, le château d'eau sur sa colline.
function dessinerDehors(hasard) {
  return (g, w, h) => {
    const hz = h * 0.6
    const ciel = g.createLinearGradient(0, 0, 0, hz)
    ciel.addColorStop(0, '#3c2c44'); ciel.addColorStop(0.55, '#b0603a'); ciel.addColorStop(1, '#f2a85a')
    g.fillStyle = ciel; g.fillRect(0, 0, w, hz)
    const soleil = g.createRadialGradient(w * 0.62, hz - 18, 0, w * 0.62, hz - 18, w * 0.3)
    soleil.addColorStop(0, 'rgba(255,236,190,1)'); soleil.addColorStop(0.12, 'rgba(255,200,120,.8)'); soleil.addColorStop(1, 'rgba(255,160,80,0)')
    g.fillStyle = soleil; g.fillRect(0, 0, w, hz + 40)
    g.fillStyle = '#4a2a26'   // la colline et le château d'eau
    g.beginPath(); g.moveTo(0, hz - 30); g.quadraticCurveTo(w * 0.2, hz - 70, w * 0.42, hz - 28); g.lineTo(w * 0.42, hz); g.lineTo(0, hz); g.fill()
    g.fillRect(w * 0.19, hz - 170, 14, 110)
    g.beginPath(); g.moveTo(w * 0.19 - 34, hz - 170); g.lineTo(w * 0.19 + 48, hz - 170); g.lineTo(w * 0.19 + 30, hz - 205); g.lineTo(w * 0.19 - 16, hz - 205); g.fill()
    g.fillStyle = '#2e1a1a'   // la caserne : un long mur, des fenêtres à barreaux, le portail et son mât
    g.fillRect(0, hz - 64, w, 64)
    for (let x = 30; x < w; x += 70) { g.fillStyle = `rgba(255,190,110,${0.08 + hasard() * 0.1})`; g.fillRect(x, hz - 50, 26, 20) }
    g.fillStyle = '#1e1212'; g.fillRect(w * 0.47, hz - 72, 120, 72); g.fillRect(w * 0.47 + 150, hz - 140, 4, 140)
    g.fillStyle = '#5a1e1a'; g.fillRect(w * 0.47 + 154, hz - 138, 34, 20)
    const rue = g.createLinearGradient(0, hz, 0, h); rue.addColorStop(0, '#6a4632'); rue.addColorStop(1, '#2a1a12')
    g.fillStyle = rue; g.fillRect(0, hz, w, h - hz)
    g.fillStyle = 'rgba(240,170,90,.25)'; g.fillRect(0, hz + 34, w, 6)   // le trottoir d'en face
    g.fillStyle = 'rgba(20,10,6,.5)'; g.fillRect(0, h - 70, w, 70)       // le trottoir du bar, à l'ombre
  }
}

// La course du tiercé : une bande qui se répète en largeur, que la télé fait défiler (décalage, rien à redessiner).
function dessinerTele(hasard) {
  return (g, w, h) => {
    g.fillStyle = '#9ab8c8'; g.fillRect(0, 0, w, h * 0.3)
    g.fillStyle = '#6a7a64'; g.fillRect(0, h * 0.3, w, h * 0.12)     // les tribunes, au loin
    g.fillStyle = '#3e7a3a'; g.fillRect(0, h * 0.42, w, h * 0.58)    // la piste
    g.fillStyle = '#e8ece4'; g.fillRect(0, h * 0.55, w, 3)
    for (let x = 0; x < w; x += 16) g.fillRect(x, h * 0.55, 3, 12)    // la lice
    const couleurs = ['#c83030', '#e8d040', '#3050c0', '#f0f0f0']
    for (let i = 0; i < 4; i++) {
      const x = 20 + i * 58 + hasard() * 10, y = h * 0.72 + (i % 2) * 10
      g.fillStyle = '#3a2214'
      g.beginPath(); g.ellipse(x, y, 18, 8, 0, 0, TAU); g.fill()
      g.fillRect(x + 12, y - 14, 6, 12); g.fillRect(x - 14, y + 4, 4, 14); g.fillRect(x + 10, y + 4, 4, 14)
      g.fillStyle = couleurs[i]; g.fillRect(x - 3, y - 16, 8, 9)
    }
  }
}

function dessinerVoyant(g, w, h) {   // en haut OCCUPÉ (rouge), en bas LIBRE (vert)
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 13px Arial, sans-serif'
  g.fillStyle = '#7a1a14'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f0e0d0'; g.fillText('OCCUPÉ', w / 2, h / 4)
  g.fillStyle = '#1e5a2a'; g.fillRect(0, h / 2, w, h / 2); g.fillStyle = '#e0f0d8'; g.fillText('LIBRE', w / 2, h * 3 / 4)
}

// La planche des affiches (1024 × 1024) : la photo de la brigade, l'ardoise, le journal, le fanion, la cible, les
// plaques, la façade du juke-box. Rectangles [x, y, largeur, hauteur] en pixels.
const AFF = 1024
const ZONES_AFF = Object.freeze({
  photo: [0, 0, 512, 360], ardoise: [512, 0, 300, 400], journal: [816, 0, 208, 296], fanion: [0, 380, 240, 200],
  cible: [256, 380, 256, 256], wc: [528, 420, 160, 96], prive: [704, 420, 200, 72], jukebox: [528, 540, 240, 160],
})
function dessinerAffiches(hasard) {
  return g => {
    g.textAlign = 'center'; g.textBaseline = 'middle'
    {   // « BRIGADE MOTORISÉE 14 » : 24 hommes en trois rangs devant le Bivouac, sans visage reconnaissable
      const [x, y, w, h] = ZONES_AFF.photo
      g.fillStyle = '#b89a70'; g.fillRect(x, y, w, h)
      g.fillStyle = '#8a7050'; g.fillRect(x, y, w, h * 0.42)                       // la façade du bar
      g.fillStyle = '#6a5238'; g.fillRect(x + w * 0.3, y + 18, w * 0.4, 30)
      g.fillStyle = '#c8b088'; g.font = 'bold 20px Georgia, serif'; g.fillText('LE BIVOUAC', x + w / 2, y + 34)
      for (let rang = 0; rang < 3; rang++) for (let i = 0; i < 8; i++) {
        const cx = x + 44 + i * 60 + (rang % 2) * 22, base = y + h - 60 - (2 - rang) * 40, s = 1 - rang * 0.06
        g.fillStyle = '#3a3024'; g.fillRect(cx - 17 * s, base - 50 * s, 34 * s, 70 * s)       // la vareuse
        g.fillStyle = '#9a8264'; g.beginPath(); g.ellipse(cx, base - 62 * s, 10 * s, 12 * s, 0, 0, TAU); g.fill()   // le visage, flou
        g.fillStyle = '#2a2218'; g.fillRect(cx - 12 * s, base - 78 * s, 24 * s, 7 * s)           // le béret
      }
      const v = g.createRadialGradient(x + w / 2, y + h / 2, h * 0.3, x + w / 2, y + h / 2, w * 0.62)
      v.addColorStop(0, 'rgba(60,40,20,0)'); v.addColorStop(1, 'rgba(60,40,20,.6)')
      g.fillStyle = v; g.fillRect(x, y, w, h)
      g.fillStyle = '#ece0c4'; g.fillRect(x, y + h - 34, w, 34)
      g.fillStyle = '#3a2c1c'; g.font = 'bold 18px "Courier New", monospace'; g.fillText('BRIGADE MOTORISÉE 14', x + w / 2, y + h - 17)
    }
    {   // l'ardoise : le plat du jour à la craie
      const [x, y, w, h] = ZONES_AFF.ardoise
      g.fillStyle = '#1e2420'; g.fillRect(x, y, w, h)
      g.fillStyle = 'rgba(230,230,220,.06)'; for (let i = 0; i < 30; i++) g.fillRect(x + hasard() * w, y + hasard() * h, 30 + hasard() * 60, 3)
      g.fillStyle = '#e8e4d8'; g.font = 'bold 34px "Segoe Script", "Bradley Hand", cursive'
      g.fillText('PLAT DU JOUR', x + w / 2, y + 50)
      g.font = '26px "Segoe Script", "Bradley Hand", cursive'
      const lignes = ['Bœuf carottes', 'Œuf mayonnaise', 'Tarte aux pommes', '', 'Café 6 F', 'Demi 9 F']
      lignes.forEach((l, i) => g.fillText(l, x + w / 2 + (hasard() - 0.5) * 6, y + 120 + i * 44))
    }
    {   // le journal du jour (bonus, spec §3.14) : la une sur les trois officiers de la base
      const [x, y, w, h] = ZONES_AFF.journal
      g.fillStyle = '#ddd6c4'; g.fillRect(x, y, w, h)
      g.fillStyle = '#1a1a1a'; g.font = 'bold 26px Georgia, serif'; g.fillText('LE COURRIER', x + w / 2, y + 26)
      g.fillRect(x + 8, y + 44, w - 16, 2)
      g.font = 'bold 19px Georgia, serif'
      ;['TROIS OFFICIERS', 'ABATTUS', 'À LA BASE'].forEach((l, i) => g.fillText(l, x + w / 2, y + 70 + i * 22))
      g.font = 'italic 11px Georgia, serif'
      g.fillText('Le tireur aurait tiré', x + w / 2, y + 142); g.fillText('à plus de 400 mètres', x + w / 2, y + 156)
      g.fillStyle = '#8a8478'; for (let c = 0; c < 2; c++) for (let l = 0; l < 14; l++) g.fillRect(x + 10 + c * 98, y + 176 + l * 8, 88 - (l % 5 === 4 ? 30 : 0), 3)
    }
    {   // le fanion de la 14 : pointe en bas
      const [x, y, w, h] = ZONES_AFF.fanion
      g.fillStyle = '#2a4a2a'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w / 2, y + h); g.fill()
      g.fillStyle = '#d8b040'; g.beginPath(); g.moveTo(x + 16, y + 10); g.lineTo(x + w - 16, y + 10); g.lineTo(x + w / 2, y + h - 26); g.closePath(); g.lineWidth = 4; g.strokeStyle = '#d8b040'; g.stroke()
      g.font = 'bold 56px Georgia, serif'; g.fillText('14', x + w / 2, y + 62)
      g.font = 'bold 15px Georgia, serif'; g.fillText('BRIGADE MOTORISÉE', x + w / 2, y + 22)
    }
    {   // la cible de fléchettes
      const [x, y, w] = ZONES_AFF.cible, cx = x + w / 2, cy = y + w / 2, R = w / 2 - 2
      g.fillStyle = '#141414'; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill()
      for (let s = 0; s < 20; s++) {
        const a0 = (s - 0.5) / 20 * TAU, a1 = (s + 0.5) / 20 * TAU, clair = s % 2 === 0
        const anneau = (r0, r1, c) => { g.fillStyle = c; g.beginPath(); g.arc(cx, cy, r1, a0, a1); g.arc(cx, cy, r0, a1, a0, true); g.fill() }
        anneau(R * 0.16, R * 0.74, clair ? '#e6dcc0' : '#1a1a1a'); anneau(R * 0.74, R * 0.8, clair ? '#b82820' : '#1e6a30')
        anneau(R * 0.8, R * 0.98, clair ? '#e6dcc0' : '#1a1a1a'); anneau(R * 0.98, R * 1.04, clair ? '#b82820' : '#1e6a30')
        anneau(R * 0.42, R * 0.48, clair ? '#b82820' : '#1e6a30')
      }
      g.fillStyle = '#1e6a30'; g.beginPath(); g.arc(cx, cy, R * 0.16, 0, TAU); g.fill()
      g.fillStyle = '#b82820'; g.beginPath(); g.arc(cx, cy, R * 0.07, 0, TAU); g.fill()
    }
    {   // les plaques émaillées : WC, PRIVÉ
      const plaque = ([x, y, w, h], texte, taille) => {
        g.fillStyle = '#e8e4da'; g.fillRect(x, y, w, h); g.fillStyle = '#1e3a7a'; g.fillRect(x + 6, y + 6, w - 12, h - 12)
        g.fillStyle = '#f0ece2'; g.font = `bold ${taille}px Arial, sans-serif`; g.fillText(texte, x + w / 2, y + h / 2 + 2)
      }
      plaque(ZONES_AFF.wc, 'WC', 56); plaque(ZONES_AFF.prive, 'PRIVÉ', 40)
    }
    {   // la façade du juke-box : les titres derrière la vitre
      const [x, y, w, h] = ZONES_AFF.jukebox
      g.fillStyle = '#2a1410'; g.fillRect(x, y, w, h)
      for (let c = 0; c < 4; c++) for (let l = 0; l < 6; l++) {
        g.fillStyle = l % 2 ? '#e8dcc0' : '#f0d8a0'; g.fillRect(x + 8 + c * 58, y + 8 + l * 25, 52, 20)
        g.fillStyle = '#8a2a1a'; g.fillRect(x + 12 + c * 58, y + 14 + l * 25, 18 + hasard() * 26, 3)
        g.fillStyle = '#3a2a1a'; g.fillRect(x + 12 + c * 58, y + 21 + l * 25, 14 + hasard() * 30, 2)
      }
    }
  }
}

// ─── La salle ──────────────────────────────────────────────────────

// Construit la salle. attenue : effets atténués (spec §9), lu au montage : néon et télé fixes.
export function creerSalle({ attenue = false } = {}) {
  const group = new THREE.Group(); group.name = 'bivouac'
  const hasard = generateur(DECOR.graine)
  const entre = ([a, b]) => a + hasard() * (b - a)
  const owned = { mats: [], texs: [] }
  const tex = (w, h, draw, opts) => { const t = canvasTexture(w, h, draw, opts); owned.texs.push(t); return t }
  const mat = (Classe, name, params, ud = {}) => {
    const m = new Classe(params); m.name = name; Object.assign(m.userData, ud); owned.mats.push(m); return m
  }
  const lambert = (name, params, ud) => mat(THREE.MeshLambertMaterial, name, params, ud)
  const phong = (name, params, ud) => mat(THREE.MeshPhongMaterial, name, params, ud)
  const basic = (name, params) => mat(THREE.MeshBasicMaterial, name, params, { receive: false })

  // ── textures ──
  const T = {
    parquet: tex(256, 256, dessinerParquet(hasard), { repeat: [1, 1] }),
    lambris: tex(128, 128, dessinerLambris, { repeat: [1, 1] }),
    enduit: tex(256, 256, dessinerEnduit(hasard), { repeat: [1, 1] }),
    faience: tex(128, 128, dessinerFaience, { repeat: [1, 1] }),
    lueurs: tex(256, 128, dessinerLueurs),
    neon: tex(NEON.L, NEON.H, dessinerNeon),
    dehors: tex(1024, 512, dessinerDehors(hasard)),
    tele: tex(256, 128, dessinerTele(hasard), { repeat: [0.5, 1] }),
    voyant: tex(64, 64, dessinerVoyant),
    affiches: tex(AFF, AFF, dessinerAffiches(hasard)),
  }
  T.parquet.anisotropy = 8; T.lambris.anisotropy = 4; T.affiches.anisotropy = 4
  T.voyant.repeat.set(1, 0.5); T.voyant.offset.y = 0.5   // OCCUPÉ (setWcOccupe)

  // ── matériaux : un appel de dessin chacun ──
  // userData.cast : le maillage projette l'ombre du soleil (murs, meubles, stores) ; receive false : il ne la reçoit pas
  const M = {
    parquet: lambert('parquet', { color: 0xffffff, map: T.parquet }),
    lambris: lambert('lambris', { color: 0xffffff, map: T.lambris }, { cast: true }),
    enduit: lambert('enduit', { color: 0xffffff, map: T.enduit }, { cast: true }),
    plafond: lambert('plafond', { color: 0x7a6248, emissive: 0x120c07 }, { cast: true }),   // jauni ; il arrête le soleil qui passerait au-dessus des murs
    bois: lambert('bois', { color: 0x4a2c1a }, { cast: true }),
    zinc: phong('zinc', { color: 0x5a6064, specular: 0xb0b6ba, shininess: 55 }, { cast: true }),
    chrome: phong('chrome', { color: 0x9a9ea2, specular: 0xffffff, shininess: 90 }, { cast: true }),
    laiton: phong('laiton', { color: 0x8a6a30, specular: 0xd8b070, shininess: 60 }, { cast: true }),
    formica: lambert('formica', { vertexColors: true }, { cast: true }),
    skai: phong('skai', { color: 0x5a1a16, specular: 0x3a2a26, shininess: 30 }, { cast: true }),
    stores: lambert('stores', { color: 0xe08a30, emissive: 0x4a1e06, side: THREE.DoubleSide }, { cast: true }),   // émissif : le soleil derrière les lames
    couleurs: lambert('couleurs', { vertexColors: true }, { cast: true }),
    bouteilles: phong('bouteilles', { vertexColors: true, specular: 0x9a8a70, shininess: 70 }),
    affiches: lambert('affiches', { color: 0xffffff, map: T.affiches }),
    faience: lambert('faience', { color: 0xffffff, map: T.faience }),
    miroir: phong('miroir', { color: 0x16120e, specular: 0x8a7a6a, shininess: 90 }),
    vitre: lambert('vitre', { color: 0xa8b8c0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }, { receive: false }),
    verres: phong('verres', { color: 0xc8d4d0, specular: 0xffffff, shininess: 100, transparent: true, opacity: 0.32, depthWrite: false }, { receive: false }),
    lampes: basic('lampes', { vertexColors: true }),
    lueurs: basic('lueurs', { map: T.lueurs, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    neon: basic('neon', { map: T.neon, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    neonO: basic('neonO', { map: T.neon, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    dehors: basic('dehors', { map: T.dehors, fog: false }),
    teleEcran: basic('teleEcran', { map: T.tele }),
    voyantWc: basic('voyantWc', { map: T.voyant }),
  }
  const B = createBatcher()
  const glows = []   // lueurs additives (fausse lumière), fusionnées avec le matériau lueurs
  const lueur = (geo, hex, rond = true) => glows.push(tint(rond ? bande(geo, 0, 0.5, 0, 1) : bande(geo, 0.5, 1, 0, 1), hex))
  const add = (m, geo, place) => B.add(m, geo, place)
  const box = (m, x0, x1, y0, y1, z0, z1) => add(m, bornes(x0, x1, y0, y1, z0, z1))
  const coul = (geo, hex) => tint(geo, hex)   // pour les matériaux à couleur par sommet

  // ── sols et plafonds ──
  const parquet = g => uvMonde(g, 1.6, 0.48)
  add(M.parquet, parquet(horizontal(SALLE.minX, SALLE.maxX, SALLE.minZ, SALLE.maxZ, 0)))
  add(M.parquet, parquet(horizontal(-2.6, -1.4, -7.5, SALLE.minZ, 0)))                 // le couloir des toilettes
  add(M.plafond, horizontal(SALLE.minX, SALLE.maxX, SALLE.minZ, SALLE.maxZ, H, true))
  add(M.plafond, horizontal(-2.6, -1.4, -7.5, SALLE.minZ, H, true))

  // ── murs : les boîtes du plan, enduit jauni ; lambris, cimaise et plinthe sur les faces de la salle ──
  const enduit = g => uvMonde(g, 2.5, 3)
  const special = new Set(['vitrine-ouest', 'vitrine-est', 'porte-entree', 'porte-cuisine', 'porte-wc'])
  for (const b of BOITES) {
    if (b.son === 'meuble' || special.has(b.id)) continue
    add(M.enduit, enduit(bornes(b.minX, b.maxX, 0, H, b.minZ, b.maxZ)))
  }
  // vitrine : allège et linteau ; portes : linteau, et le WC entre ses deux pans de mur
  const boite = id => BOITES.find(b => b.id === id)
  for (const id of ['vitrine-ouest', 'vitrine-est']) {
    const b = boite(id)
    add(M.enduit, enduit(bornes(b.minX, b.maxX, 0, VITRINE.bas, b.minZ, b.maxZ)))
    add(M.enduit, enduit(bornes(b.minX, b.maxX, VITRINE.haut, H, b.minZ, b.maxZ)))
  }
  { const b = boite('porte-entree'); add(M.enduit, enduit(bornes(b.minX, b.maxX, VITRINE.haut, H, b.minZ, b.maxZ))) }
  { const b = boite('porte-cuisine'); add(M.enduit, enduit(bornes(b.minX, b.maxX, 2.12, H, b.minZ, b.maxZ))) }
  {
    const b = boite('porte-wc')
    add(M.enduit, enduit(bornes(b.minX, -2.4, 0, H, b.minZ, b.maxZ)))
    add(M.enduit, enduit(bornes(-1.6, b.maxX, 0, H, b.minZ, b.maxZ)))
    add(M.enduit, enduit(bornes(-2.4, -1.6, 2.1, H, b.minZ, b.maxZ)))
  }
  // les linteaux du couloir : à l'entrée du couloir (mur nord) et à la bouche du sas
  add(M.enduit, enduit(bornes(-2.6, -1.4, 2.3, H, SALLE.minZ - 0.2, SALLE.minZ)))
  add(M.enduit, enduit(bornes(-2.6, -1.4, 2.4, H, -4.0, -3.9)))

  // Les faces des murs tournées vers la salle (et le couloir) : [x0, z0, x1, z1, nx, nz], la normale vers la pièce.
  const FACES = [
    [SALLE.minX, SALLE.minZ, -2.7, SALLE.minZ, 0, 1], [-1.3, SALLE.minZ, SALLE.maxX, SALLE.minZ, 0, 1],   // nord
    [-2.7, SALLE.minZ, -2.7, -3.9, -1, 0], [-1.3, SALLE.minZ, -1.3, -3.9, 1, 0],                          // le sas
    [-2.6, -7.5, -2.6, -3.9, 1, 0], [-1.4, -7.5, -1.4, -3.9, -1, 0],                                      // le couloir
    [-2.6, -7.5, -2.4, -7.5, 0, 1], [-1.6, -7.5, -1.4, -7.5, 0, 1],                                       // autour du WC
    [SALLE.minX, SALLE.minZ, SALLE.minX, -2.6, 1, 0], [SALLE.minX, -1.8, SALLE.minX, 2.5, 1, 0],           // ouest
    [SALLE.minX, 2.5, -3.8, 2.5, 0, -1], [-3.8, 2.5, -3.8, SALLE.maxZ, 1, 0],                             // la réserve
    [-3.8, SALLE.maxZ, -1, SALLE.maxZ, 0, -1],                                                            // sud plein
    [SALLE.maxX, SALLE.minZ, SALLE.maxX, SALLE.maxZ, -1, 0],                                              // est
    [-1, SALLE.maxZ, 3, SALLE.maxZ, 0, -1], [4, SALLE.maxZ, SALLE.maxX, SALLE.maxZ, 0, -1],               // sous la vitrine
  ]
  const contre = ([x0, z0, x1, z1, nx, nz], y0, y1, prof) => {   // boîte posée contre la face, prof vers la pièce
    if (nz !== 0) return bornes(Math.min(x0, x1), Math.max(x0, x1), y0, y1, Math.min(z0, z0 + nz * prof), Math.max(z0, z0 + nz * prof))
    return bornes(Math.min(x0, x0 + nx * prof), Math.max(x0, x0 + nx * prof), y0, y1, Math.min(z0, z1), Math.max(z0, z1))
  }
  for (const f of FACES) {
    add(M.lambris, uvMonde(contre(f, 0, LAMBRIS, 0.02), 0.4, LAMBRIS))
    add(M.bois, contre(f, LAMBRIS - 0.01, LAMBRIS + 0.05, 0.035))   // la cimaise
    add(M.bois, contre(f, 0, 0.1, 0.03))                             // la plinthe
  }

  // ── la vitrine et la porte d'entrée (mur sud) ──
  const zv = SALLE.maxZ
  for (const [x0, x1] of [[-1, -0.94], [0.97, 1.03], [2.94, 3], [4, 4.06], [5.94, 6]]) box(M.bois, x0, x1, VITRINE.bas, VITRINE.haut, zv, zv + 0.1)   // les montants
  for (const [x0, x1] of [[-1, 3], [4, 6]]) {
    box(M.bois, x0, x1, VITRINE.haut - 0.05, VITRINE.haut, zv, zv + 0.1)                                // traverse haute
    box(M.bois, x0, x1, VITRINE.bas - 0.01, VITRINE.bas + 0.025, zv - 0.07, zv + 0.02)                  // l'appui
    add(M.vitre, vertical(x1 - x0, VITRINE.haut - VITRINE.bas, (x0 + x1) / 2, (VITRINE.bas + VITRINE.haut) / 2, zv + 0.06, 'z-'))
  }
  {   // la porte : bâti, battant vitré en haut, plein en bas, poignée ; la clochette au-dessus, côté salle
    const b = boite('porte-entree')
    box(M.bois, b.minX, b.minX + 0.06, 0, 2.2, zv, zv + 0.12); box(M.bois, b.maxX - 0.06, b.maxX, 0, 2.2, zv, zv + 0.12)
    box(M.bois, b.minX, b.maxX, 2.14, VITRINE.haut, zv, zv + 0.12)
    const x0 = b.minX + 0.06, x1 = b.maxX - 0.06, z0 = zv + 0.02, z1 = zv + 0.08
    box(M.bois, x0, x1, 0, 1.05, z0, z1); box(M.bois, x0, x1, 2.0, 2.14, z0, z1)
    box(M.bois, x0, x0 + 0.1, 1.05, 2.0, z0, z1); box(M.bois, x1 - 0.1, x1, 1.05, 2.0, z0, z1)
    add(M.bois, raisedPanel(0.66, 0.75, 0.04, 0.012).rotateY(Math.PI).translate((x0 + x1) / 2, 0.55, z0))
    add(M.vitre, vertical(x1 - x0 - 0.2, 0.95, (x0 + x1) / 2, 1.525, zv + 0.05, 'z-'))
    add(M.laiton, rod(V(x1 - 0.12, 1.02, z0), V(x1 - 0.12, 1.02, z0 - 0.06), 0.012, 8))
    add(M.laiton, rod(V(x1 - 0.12, 1.02, z0 - 0.06), V(x1 - 0.26, 1.02, z0 - 0.06), 0.012, 8))
    add(M.laiton, rod(V(3.92, 2.3, zv), V(3.92, 2.3, zv - 0.1), 0.006, 6))                             // la clochette
    add(M.laiton, lathe([[0, 0.05], [0.012, 0.048], [0.028, 0.025], [0.038, 0], [0.04, -0.004], [0, -0.004]], 12), { x: 3.92, y: 2.2, z: zv - 0.1 })
    add(M.couleurs, coul(horizontal(3.05, 3.95, 3.86, 4.42, 0.006), 0x3a2414))                         // le paillasson
  }
  // les stores à lames orange, à l'intérieur de la vitrine : baissés à l'ouest et à l'est, à mi-hauteur au milieu (le
  // soleil y entre en plein, au-dessus de la table A) ; lames inclinées : le soleil bas passe entre elles
  {
    const sections = [[-0.94, 0.94, VITRINE.bas + 0.04], [1.06, 2.94, 1.5], [4.06, 5.94, VITRINE.bas + 0.04]]
    const zs = zv - 0.08, pas = 0.045
    for (const [x0, x1, bas] of sections) {
      const w = x1 - x0, cx = (x0 + x1) / 2
      for (let y = VITRINE.haut - 0.06; y > bas; y -= pas) add(M.stores, new THREE.BoxGeometry(w, 0.003, 0.05), { x: cx, y, z: zs, rx: 0.62 })
      add(M.stores, new THREE.BoxGeometry(w + 0.01, 0.018, 0.055), { x: cx, y: bas, z: zs })                // barre de charge
      add(M.stores, new THREE.BoxGeometry(w + 0.04, 0.05, 0.07), { x: cx, y: VITRINE.haut - 0.025, z: zs })  // caisson
      if (bas > 1.2) add(M.stores, new THREE.BoxGeometry(w, 0.07, 0.05), { x: cx, y: VITRINE.haut - 0.09, z: zs })   // lames remontées
      for (const f of [0.12, 0.5, 0.88]) add(M.couleurs, coul(rod(V(x0 + w * f, VITRINE.haut - 0.05, zs + 0.028), V(x0 + w * f, bas, zs + 0.028), 0.0015, 3), 0xd8c8b0))
    }
  }
  // dehors : la rue au couchant, à 4,5 m de la vitrine, hors du brouillard
  add(M.dehors, vertical(26, 14, 2.5, 2, 9, 'z-'))

  // ── le couloir des toilettes : porte du WC (OCCUPÉ), ampoule nue ──
  {
    const z = -7.5, x0 = -2.4, x1 = -1.6
    box(M.bois, x0 - 0.06, x0, 0, 2.1, z - 0.02, z + 0.02); box(M.bois, x1, x1 + 0.06, 0, 2.1, z - 0.02, z + 0.02)
    box(M.bois, x0 - 0.06, x1 + 0.06, 2.04, 2.1, z - 0.02, z + 0.02)
    box(M.bois, x0, x1, 0, 2.04, z - 0.08, z - 0.02)
    add(M.bois, raisedPanel(0.6, 0.8, 0.04, 0.01).translate(-2, 0.55, z - 0.02))
    add(M.bois, raisedPanel(0.6, 0.8, 0.04, 0.01).translate(-2, 1.5, z - 0.02))
    add(M.affiches, recadre(vertical(0.2, 0.12, -2, 1.68, z - 0.005, 'z+'), ZONES_AFF.wc, AFF, AFF))
    add(M.voyantWc, vertical(0.12, 0.05, -1.75, 1.12, z - 0.006, 'z+'))
    add(M.laiton, rod(V(-1.7, 1.0, z - 0.01), V(-1.7, 1.0, z + 0.05), 0.01, 8))
    add(M.couleurs, coul(rod(V(-2.0, H, -6.2), V(-2.0, 2.66, -6.2), 0.004, 4), 0x1a1410))
    add(M.lampes, coul(new THREE.SphereGeometry(0.045, 12, 8), 0xfff0c8), { x: -2.0, y: 2.62, z: -6.2 })
    lueur(horizontal(-2.6, -1.4, -7.3, -5.0, 0.006), 0x3a2a14)
    lueur(horizontal(-2.4, -1.6, -6.8, -5.6, H - 0.006, true), 0x2a2010)
  }

  // ── l'arrière-cuisine, derrière sa porte entrouverte (on n'en voit qu'une lame) ──
  {
    add(M.faience, uvMonde(horizontal(-8.2, SALLE.minX - 0.2, -4.3, -0.1, 0), 0.6))
    add(M.plafond, horizontal(-8.2, SALLE.minX - 0.2, -4.3, -0.1, 2.8, true))
    add(M.faience, uvMonde(vertical(4.2, 2.8, -8.2, 1.4, -2.2, 'x+'), 0.6))
    add(M.faience, uvMonde(vertical(2.0, 2.8, -7.2, 1.4, -4.3, 'z+'), 0.6))
    add(M.faience, uvMonde(vertical(2.0, 2.8, -7.2, 1.4, -0.1, 'z-'), 0.6))
    box(M.zinc, -8.2, -7.6, 0, 0.9, -3.8, -0.6)
    add(M.lampes, coul(new THREE.BoxGeometry(0.08, 0.04, 1.2), 0xe4f0ee), { x: -7.2, y: 2.76, z: -2.2 })
    lueur(horizontal(-8.2, -6.2, -3.6, -0.8, 0.006), 0x1e2a26)
    lueur(vertical(3, 1.4, -8.19, 1.9, -2.2, 'x+'), 0x16201e, false)
    // le bâti de la porte, côté salle
    const b = boite('porte-cuisine')
    box(M.bois, SALLE.minX - 0.2, SALLE.minX + 0.02, 0, 2.12, b.minZ, b.minZ + 0.05)
    box(M.bois, SALLE.minX - 0.2, SALLE.minX + 0.02, 0, 2.12, b.maxZ - 0.05, b.maxZ)
    box(M.bois, SALLE.minX - 0.2, SALLE.minX + 0.02, 2.05, 2.12, b.minZ, b.maxZ)
  }
  // le battant, sur son pivot (la charnière au nord), entrouvert vers la cuisine ; un hublot
  const porteCuisine = new THREE.Group(); porteCuisine.name = 'porte-cuisine'
  {
    const b = boite('porte-cuisine'), largeur = b.maxZ - b.minZ - 0.1
    porteCuisine.position.set(SALLE.minX - 0.12, 0, b.minZ + 0.05)
    porteCuisine.rotation.y = -0.55
    const parts = [new THREE.BoxGeometry(0.04, 2.03, largeur).translate(0, 1.015, largeur / 2)]
    parts.push(new THREE.TorusGeometry(0.13, 0.015, 6, 20).rotateY(Math.PI / 2).translate(0.022, 1.5, largeur / 2))
    parts.push(new THREE.TorusGeometry(0.13, 0.015, 6, 20).rotateY(Math.PI / 2).translate(-0.022, 1.5, largeur / 2))
    const g = mergeGeometries(parts.map(p => indexed(p))); parts.forEach(p => p.dispose())
    const battant = new THREE.Mesh(g, M.bois); battant.castShadow = true; battant.receiveShadow = true
    porteCuisine.add(battant)
    group.add(porteCuisine)
  }

  // ── la réserve (au sud du zinc) : sa porte PRIVÉ ──
  {
    const x = -3.8, z0 = 3.25, z1 = 4.05
    box(M.bois, x, x + 0.03, 0, 2.08, z0 - 0.06, z0); box(M.bois, x, x + 0.03, 0, 2.08, z1, z1 + 0.06)
    box(M.bois, x, x + 0.03, 2.02, 2.08, z0 - 0.06, z1 + 0.06)
    box(M.bois, x, x + 0.025, 0, 2.02, z0, z1)
    add(M.bois, raisedPanel(0.6, 0.8, 0.04, 0.01).rotateY(Math.PI / 2).translate(x + 0.025, 0.55, (z0 + z1) / 2))
    add(M.bois, raisedPanel(0.6, 0.7, 0.04, 0.01).rotateY(Math.PI / 2).translate(x + 0.025, 1.45, (z0 + z1) / 2))
    add(M.affiches, recadre(vertical(0.2, 0.072, x + 0.04, 1.85, (z0 + z1) / 2 + 0.1, 'x+'), ZONES_AFF.prive, AFF, AFF))
    add(M.laiton, rod(V(x + 0.03, 1.0, z1 - 0.08), V(x + 0.08, 1.0, z1 - 0.08), 0.01, 8))
  }

  // ── le zinc : façade à panneaux, plateau de zinc, repose-pieds, tireuses, percolateur ──
  const Z = boite('zinc')
  {
    const xf = Z.maxX, haut = 1.1
    box(M.bois, Z.minX, xf - 0.02, 0.1, haut - 0.06, Z.minZ, Z.maxZ)                 // le corps
    box(M.bois, Z.minX, xf - 0.04, 0, 0.1, Z.minZ + 0.02, Z.maxZ)                     // le socle, en retrait
    const n = 10, pasZ = (Z.maxZ - Z.minZ) / n
    for (let i = 0; i < n; i++) {
      const zc = Z.minZ + (i + 0.5) * pasZ
      add(M.bois, raisedPanel(pasZ - 0.1, 0.66, 0.035, 0.012).rotateY(Math.PI / 2).translate(xf - 0.02, 0.56, zc))
      box(M.bois, xf - 0.02, xf, 0.12, haut - 0.06, zc + pasZ / 2 - 0.02, zc + pasZ / 2 + 0.02)   // pilastre
    }
    box(M.zinc, Z.minX, xf + 0.02, haut - 0.06, haut, Z.minZ, Z.maxZ)                 // le plateau
    add(M.zinc, rod(V(xf + 0.02, haut - 0.03, Z.minZ), V(xf + 0.02, haut - 0.03, Z.maxZ), 0.032, 10))   // le bec
    add(M.laiton, rod(V(xf + 0.12, 0.2, Z.minZ + 0.1), V(xf + 0.12, 0.2, Z.maxZ - 0.1), 0.022, 10))    // le repose-pieds
    for (let z = Z.minZ + 0.3; z < Z.maxZ; z += 1.2) add(M.laiton, rod(V(xf, 0.2, z), V(xf + 0.12, 0.2, z), 0.012, 6))
    // les tireuses (deux colonnes) et l'égouttoir
    for (const zc of [-1.5, 1.15]) {
      const x = -4.1
      add(M.chrome, rod(V(x, haut, zc), V(x, 1.44, zc), 0.035, 12))
      add(M.chrome, rod(V(x, 1.44, zc - 0.13), V(x, 1.44, zc + 0.13), 0.03, 10))
      for (const dz of [-0.1, 0.1]) {
        add(M.chrome, rod(V(x, 1.44, zc + dz), V(x + 0.07, 1.36, zc + dz), 0.012, 6))
        add(M.couleurs, coul(rod(V(x + 0.03, 1.46, zc + dz), V(x + 0.04, 1.6, zc + dz), 0.014, 6), 0x1a1612))
      }
      box(M.chrome, x - 0.05, x + 0.14, haut, haut + 0.02, zc - 0.2, zc + 0.2)
    }
    // le percolateur, au bout nord du zinc ; ses tasses dessus
    add(M.chrome, rounded(0.32, 0.36, 0.5, 0.04), { x: -4.15, y: haut + 0.18, z: -2.5 })
    for (const dz of [-0.12, 0.12]) add(M.chrome, rod(V(-4.32, 1.2, -2.5 + dz), V(-4.42, 1.2, -2.5 + dz), 0.03, 10))
    for (let i = 0; i < 4; i++) add(M.couleurs, coul(lathe([[0, 0], [0.025, 0], [0.032, 0.05], [0.028, 0.05], [0.02, 0.006], [0, 0.006]], 10), 0xe8e2d4), { x: -4.15 + (i % 2) * 0.08 - 0.04, y: haut + 0.36, z: -2.62 + Math.floor(i / 2) * 0.1 })
    // un cendrier jaune, un torchon et des verres retournés
    add(M.couleurs, coul(lathe([[0, 0], [0.06, 0], [0.065, 0.025], [0.05, 0.025], [0.045, 0.01], [0, 0.01]], 14), 0xd8b020), { x: -4.05, y: haut, z: -0.4 })
    add(M.couleurs, coul(horizontal(-4.32, -3.92, 1.6, 2.3, haut + 0.004), 0xd8d0c0))
    for (let i = 0; i < 6; i++) add(M.verres, verre(), { x: -4.2 + (i % 2) * 0.16, y: haut + 0.005, z: 1.7 + Math.floor(i / 2) * 0.2 })
    // le journal du jour, plié sur le zinc
    add(M.affiches, recadre(horizontal(-0.15, 0.15, -0.21, 0.21, 0), ZONES_AFF.journal, AFF, AFF), { x: -4.08, y: haut + 0.003, z: 0.4, ry: Math.PI / 2 + 0.2 })   // la une lisible du zinc
    // les globes au-dessus du zinc, et leur lumière sur le plateau
    for (const zc of [-2.1, -0.4, 1.3]) globe(-4.1, 2.08, zc, 0.13)   // bas : ils ne cachent pas le néon
    for (const zc of [-2.1, -0.4, 1.3]) lueur(horizontal(-4.55, -3.65, zc - 0.45, zc + 0.45, haut + 0.003), 0x40240c)
  }

  // ── derrière le zinc : les étagères rétroéclairées, le miroir, les bouteilles ; le néon au-dessus ──
  const E = boite('etageres')
  {
    box(M.bois, E.minX, E.maxX, 0, 0.9, E.minZ, E.maxZ)
    for (let i = 0; i < 6; i++) add(M.bois, raisedPanel(0.5, 0.6, 0.03, 0.01).rotateY(Math.PI / 2).translate(E.maxX, 0.46, E.minZ + 0.36 + i * 0.6))
    box(M.bois, E.minX, E.maxX, 0.9, 0.93, E.minZ, E.maxZ)
    add(M.miroir, vertical(E.maxZ - E.minZ - 0.1, 1.35, E.minX + 0.012, 1.62, (E.minZ + E.maxZ) / 2, 'x+'))
    for (const z of [E.minZ, E.maxZ - 0.05]) box(M.bois, E.minX, E.maxX, 0.93, 2.36, z, z + 0.05)   // montants
    box(M.bois, E.minX, E.maxX, 2.3, 2.36, E.minZ, E.maxZ)                                              // corniche
    const etages = [1.2, 1.55, 1.9]
    for (const y of etages) {
      box(M.bois, E.minX + 0.01, E.maxX, y - 0.02, y, E.minZ + 0.05, E.maxZ - 0.05)
      add(M.lampes, coul(new THREE.BoxGeometry(0.012, 0.012, E.maxZ - E.minZ - 0.12), 0xffc070), { x: E.maxX - 0.03, y: y - 0.028, z: (E.minZ + E.maxZ) / 2 })
      lueur(vertical(E.maxZ - E.minZ - 0.1, 0.34, E.minX + 0.016, y + 0.14, (E.minZ + E.maxZ) / 2, 'x+'), 0x4a2a0e, false)
    }
    // les bouteilles : une douzaine par étagère, formes et couleurs tirées à graine
    const FORMES = [
      [[0, 0], [0.037, 0], [0.037, 0.2], [0.03, 0.235], [0.014, 0.26], [0.013, 0.31], [0, 0.31]],     // vin, liqueur
      [[0, 0], [0.042, 0], [0.042, 0.17], [0.034, 0.2], [0.016, 0.23], [0.015, 0.28], [0, 0.28]],     // pastis
      [[0, 0], [0.045, 0], [0.045, 0.12], [0.02, 0.16], [0.012, 0.2], [0.012, 0.24], [0, 0.24]],      // eau-de-vie
    ]
    const TEINTES = [0x2f5a2a, 0x8a4a14, 0xb8c4a8, 0x6a1a1a, 0xc8a030, 0x2a4a7a, 0x5a3a18]
    for (const y of [0.93, ...etages]) {
      let z = E.minZ + 0.12
      while (z < E.maxZ - 0.12) {
        const f = FORMES[Math.floor(hasard() * FORMES.length)], c = TEINTES[Math.floor(hasard() * TEINTES.length)]
        add(M.bouteilles, coul(lathe(f, 10), c), { x: E.minX + 0.14 + hasard() * 0.1, y, z })
        z += 0.12 + hasard() * 0.18
        if (y === 0.93 && z > 0.2) break   // sur le comptoir du fond : quelques-unes, puis les verres
      }
    }
    for (let i = 0; i < 10; i++) add(M.verres, verre(), { x: E.minX + 0.12 + (i % 2) * 0.12, y: 0.93, z: 0.6 + Math.floor(i / 2) * 0.16 })
    // le néon « LE BIV UAC », au-dessus du miroir : la planche du haut sans le O, le O sur son plan à lui
    const largeur = 3.0, hauteur = largeur * (NEON.H / 2) / NEON.L, zc = 0.6, yc = 2.72
    add(M.neon, bande(vertical(largeur, hauteur, E.minX + 0.03, yc, zc, 'x+'), 0, 1, 0.5, 1))
    const u0 = (neonCentre(NEON_O) - NEON.case / 2) / NEON.L, u1 = (neonCentre(NEON_O) + NEON.case / 2) / NEON.L
    const decalage = (neonCentre(NEON_O) / NEON.L - 0.5) * largeur
    add(M.neonO, bande(vertical(largeur * (u1 - u0), hauteur, E.minX + 0.032, yc, zc - decalage, 'x+'), u0, u1, 0, 0.5))
    add(M.couleurs, coul(bornes(E.minX, E.minX + 0.02, yc - hauteur / 2, yc + hauteur / 2, zc - largeur / 2, zc + largeur / 2), 0x16120e))   // la tôle
    lueur(vertical(largeur + 0.6, 0.9, E.minX + 0.022, yc, zc, 'x+'), 0x5a2206, false)
  }

  // ── les tabourets du zinc et les chaises : un siège dessiné sur chaque siège du plan ──
  for (const s of SIEGES) {
    const place = { x: s.x, z: s.z, ry: s.lacet }
    if (s.type === 'tabouret') {
      add(M.skai, new THREE.CylinderGeometry(0.18, 0.17, 0.07, 18).translate(0, s.hauteur - 0.035, 0), place)
      add(M.chrome, new THREE.CylinderGeometry(0.17, 0.15, 0.02, 14).translate(0, s.hauteur - 0.08, 0), place)
      add(M.chrome, rod(V(0, 0.02, 0), V(0, s.hauteur - 0.08, 0), 0.025, 10), place)
      add(M.chrome, new THREE.TorusGeometry(0.17, 0.011, 6, 18).rotateX(Math.PI / 2).translate(0, 0.3, 0), place)
      for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; add(M.chrome, rod(V(0, 0.3, 0), V(Math.cos(a) * 0.17, 0.3, Math.sin(a) * 0.17), 0.007, 4), place) }
      add(M.chrome, new THREE.CylinderGeometry(0.2, 0.21, 0.02, 18).translate(0, 0.01, 0), place)
    } else {
      // chaise de bistrot en bois courbé, tournée vers -z dans son repère : le dossier derrière (+z)
      add(M.bois, new THREE.CylinderGeometry(0.2, 0.2, 0.03, 18).translate(0, s.hauteur - 0.015, 0), place)
      for (const [x, z] of [[-0.14, -0.13], [0.14, -0.13], [-0.14, 0.13], [0.14, 0.13]]) add(M.bois, rod(V(x, s.hauteur - 0.03, z), V(x * 1.25, 0, z * 1.25), 0.014, 6), place)
      add(M.bois, new THREE.TorusGeometry(0.16, 0.008, 4, 16).rotateX(Math.PI / 2).translate(0, 0.17, 0), place)
      for (const x of [-0.15, 0.15]) add(M.bois, rod(V(x, s.hauteur - 0.03, 0.15), V(x, 0.84, 0.2), 0.013, 6), place)
      add(M.bois, new THREE.TorusGeometry(0.15, 0.013, 5, 12, Math.PI).translate(0, 0.84, 0.2), place)
      add(M.bois, new THREE.TorusGeometry(0.15, 0.01, 4, 12, Math.PI).rotateX(Math.PI).translate(0, 0.74, 0.19), place)
    }
  }

  // ── les tables : rondes (A, D) et carrées (B, C) en Formica, les mange-debout ──
  const FORMICA = { A: 0xd4c08a, D: 0xd4c08a, B: 0x8fa486, C: 0x8fa486 }
  for (const [id, t] of Object.entries(TABLES)) {
    const haut = 0.75
    if (id === 'A' || id === 'D') {
      add(M.formica, coul(new THREE.CylinderGeometry(0.3, 0.3, 0.028, 28), FORMICA[id]), { x: t.x, y: haut - 0.014, z: t.z })
      add(M.chrome, new THREE.CylinderGeometry(0.302, 0.302, 0.022, 28, 1, true), { x: t.x, y: haut - 0.014, z: t.z })
      add(M.chrome, rod(V(t.x, 0, t.z), V(t.x, haut - 0.03, t.z), 0.03, 10))
      for (const a of [0, Math.PI / 2]) add(M.chrome, new THREE.BoxGeometry(0.5, 0.03, 0.05), { x: t.x, y: 0.015, z: t.z, ry: a + Math.PI / 4 })
    } else {
      add(M.formica, coul(new THREE.BoxGeometry(0.6, 0.028, 0.6), FORMICA[id]), { x: t.x, y: haut - 0.014, z: t.z })
      for (const [a, b] of [[[-0.3, -0.3], [0.3, -0.3]], [[-0.3, 0.3], [0.3, 0.3]], [[-0.3, -0.3], [-0.3, 0.3]], [[0.3, -0.3], [0.3, 0.3]]]) {
        add(M.chrome, rod(V(t.x + a[0], haut - 0.014, t.z + a[1]), V(t.x + b[0], haut - 0.014, t.z + b[1]), 0.015, 6))
      }
      for (const [dx, dz] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]]) add(M.chrome, rod(V(t.x + dx, 0, t.z + dz), V(t.x + dx, haut - 0.03, t.z + dz), 0.016, 8))
    }
  }
  for (const id of ['mange-debout-est', 'mange-debout-porte']) {
    const b = boite(id), x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2, haut = 1.1
    add(M.formica, coul(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 28), 0x7a3426), { x, y: haut - 0.015, z })
    add(M.chrome, new THREE.CylinderGeometry(0.302, 0.302, 0.024, 28, 1, true), { x, y: haut - 0.015, z })
    add(M.chrome, rod(V(x, 0, z), V(x, haut - 0.03, z), 0.035, 10))
    add(M.chrome, new THREE.CylinderGeometry(0.24, 0.26, 0.025, 20), { x, y: 0.0125, z })
  }
  // ce qui est posé sur les tables : le café noir de Dussart et le demi de Lenoir, la belote de B, le pastis d'Albert
  {
    const tasse = (x, z) => add(M.couleurs, coul(lathe([[0, 0], [0.028, 0], [0.034, 0.06], [0.03, 0.06], [0.024, 0.006], [0, 0.006]], 12), 0xeee8dc), { x, y: 0.75, z })
    tasse(TABLES.A.x - 0.12, TABLES.A.z + 0.05)
    add(M.couleurs, coul(new THREE.CylinderGeometry(0.07, 0.07, 0.006, 14), 0xeee8dc), { x: TABLES.A.x - 0.12, y: 0.753, z: TABLES.A.z + 0.05 })
    add(M.verres, verre(0.04, 0.16), { x: TABLES.A.x + 0.05, y: 0.75, z: TABLES.A.z - 0.12 })
    add(M.couleurs, coul(new THREE.CylinderGeometry(0.036, 0.034, 0.12, 12), 0xd89a30), { x: TABLES.A.x + 0.05, y: 0.815, z: TABLES.A.z - 0.12 })
    add(M.verres, verre(0.03, 0.1), { x: TABLES.D.x + 0.08, y: 0.75, z: TABLES.D.z - 0.06 })
    add(M.couleurs, coul(new THREE.CylinderGeometry(0.027, 0.026, 0.06, 12), 0xe0d070), { x: TABLES.D.x + 0.08, y: 0.785, z: TABLES.D.z - 0.06 })
    add(M.couleurs, coul(horizontal(-0.1, 0.1, -0.14, 0.14, 0), 0xd8d2c0), { x: TABLES.D.x - 0.08, y: 0.752, z: TABLES.D.z + 0.05, ry: 0.3 })   // le journal des courses
    for (let i = 0; i < 9; i++) {   // les cartes de la belote
      const a = hasard() * TAU, r = 0.05 + hasard() * 0.15
      add(M.couleurs, coul(new THREE.BoxGeometry(0.056, 0.002, 0.086), i % 3 ? 0xf0ece0 : 0x8a2a2a), { x: TABLES.B.x + Math.cos(a) * r, y: 0.751 + i * 0.002, z: TABLES.B.z + Math.sin(a) * r, ry: hasard() * TAU })
    }
    for (const t of ['A', 'C', 'D']) { const p = TABLES[t]; globe(p.x, 2.25, p.z, 0.15); lueur(horizontal(p.x - 0.45, p.x + 0.45, p.z - 0.45, p.z + 0.45, 0.752), 0x3a2410) }
  }

  // ── l'applique au-dessus de la table B : la seule lueur du coin, la belote reste dans la pénombre ──
  {
    const t = TABLES.B, y = 1.95, z = SALLE.minZ
    add(M.laiton, rod(V(t.x, y - 0.06, z), V(t.x, y - 0.06, z + 0.12), 0.008, 6))
    add(M.laiton, new THREE.CylinderGeometry(0.035, 0.035, 0.012, 12).rotateX(Math.PI / 2), { x: t.x, y: y - 0.06, z: z + 0.006 })
    add(M.lampes, coul(new THREE.SphereGeometry(0.075, 14, 10).scale(1, 0.75, 1), 0xc07838), { x: t.x, y, z: z + 0.14 })
    lueur(vertical(1.3, 1.1, t.x, y + 0.05, z + 0.006, 'z+'), 0x34200e)
    lueur(horizontal(t.x - 0.5, t.x + 0.5, t.z - 0.5, t.z + 0.5, 0.752), 0x22140a)
  }

  // ── la banquette de skaï sous la vitrine, à la table A ──
  {
    const b = boite('banquette-A'), cx = (b.minX + b.maxX) / 2, w = b.maxX - b.minX
    box(M.bois, b.minX + 0.01, b.maxX - 0.01, 0, 0.36, b.minZ + 0.02, b.maxZ - 0.02)
    add(M.skai, rounded(w - 0.02, 0.09, 0.48, 0.03), { x: cx, y: 0.405, z: b.minZ + 0.25 })
    add(M.skai, rounded(w - 0.02, 0.5, 0.12, 0.03), { x: cx, y: 0.66, z: b.maxZ - 0.12, rx: 0.08 })
    box(M.bois, b.minX, b.maxX, 0.36, 0.92, b.maxZ - 0.05, b.maxZ - 0.01)
  }

  // ── le juke-box, contre le mur sud ──
  const J = boite('jukebox')
  {
    const cx = (J.minX + J.maxX) / 2, z0 = J.minZ + 0.05, z1 = J.maxZ - 0.03, w = 0.6
    add(M.couleurs, coul(bornes(cx - w / 2, cx + w / 2, 0, 1.15, z0, z1), 0x4a1410))
    add(M.couleurs, coul(new THREE.CylinderGeometry(w / 2, w / 2, z1 - z0, 18, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), 0x4a1410), { x: cx, y: 1.15, z: (z0 + z1) / 2 })
    add(M.affiches, recadre(vertical(0.46, 0.3, cx, 0.98, z0 - 0.004, 'z-'), ZONES_AFF.jukebox, AFF, AFF))
    for (const dx of [-0.27, 0.27]) add(M.lampes, coul(new THREE.BoxGeometry(0.035, 1.05, 0.02), 0xffa040), { x: cx + dx, y: 0.6, z: z0 - 0.005 })
    add(M.lampes, coul(new THREE.TorusGeometry(0.27, 0.018, 6, 20, Math.PI), 0xff5030), { x: cx, y: 1.15, z: z0 - 0.006 })
    add(M.lampes, coul(new THREE.BoxGeometry(0.5, 0.025, 0.02), 0x60d0a0), { x: cx, y: 0.78, z: z0 - 0.006 })
    for (let i = 0; i < 7; i++) add(M.chrome, new THREE.BoxGeometry(0.44, 0.012, 0.012), { x: cx, y: 0.2 + i * 0.06, z: z0 - 0.006 })
    lueur(horizontal(cx - 0.8, cx + 0.8, J.minZ - 1.2, J.minZ + 0.1, 0.007), 0x4a1a0c)
  }

  // ── le baby-foot ──
  {
    const b = boite('babyfoot'), cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, L = 0.71, l = 0.34   // dans sa boîte de 1,5 × 0,8 m
    add(M.couleurs, coul(bornes(cx - L, cx + L, 0.62, 0.66, cz - l, cz + l), 0x2a6a2a))                    // le terrain
    for (const s of [-1, 1]) {
      add(M.bois, bornes(cx - L, cx + L, 0.62, 0.9, Math.min(cz + s * l, cz + s * (l - 0.07)), Math.max(cz + s * l, cz + s * (l - 0.07))))   // les longs côtés
      add(M.bois, bornes(Math.min(cx + s * L, cx + s * (L - 0.08)), Math.max(cx + s * L, cx + s * (L - 0.08)), 0.6, 0.9, cz - l, cz + l))     // les bouts (les buts)
      for (const t of [-1, 1]) add(M.bois, bornes(cx + s * (L - 0.1) - 0.04, cx + s * (L - 0.1) + 0.04, 0, 0.62, cz + t * (l - 0.08) - 0.04, cz + t * (l - 0.08) + 0.04))
    }
    const barres = [-0.53, -0.38, -0.23, -0.08, 0.08, 0.23, 0.38, 0.53], joueurs = [1, 2, 5, 3, 3, 5, 2, 1]
    barres.forEach((dx, i) => {
      const x = cx + dx, rouge = [0, 1, 3, 5].includes(i)
      add(M.chrome, rod(V(x, 0.8, cz - 0.4), V(x, 0.8, cz + 0.4), 0.008, 6))
      const cote = rouge ? 1 : -1   // chaque équipe tient ses barres de son côté
      add(M.couleurs, coul(rod(V(x, 0.8, cz + cote * l), V(x, 0.8, cz + cote * 0.4), 0.017, 8), 0x1a1612))
      for (let k = 0; k < joueurs[i]; k++) {
        const z = cz + (k - (joueurs[i] - 1) / 2) * (0.5 / Math.max(joueurs[i], 2))
        add(M.couleurs, coul(new THREE.BoxGeometry(0.03, 0.11, 0.022), rouge ? 0xb02a22 : 0x2a46a0), { x, y: 0.75, z })
      }
    })
  }

  // ── le mur est : la cible de fléchettes, la télé du tiercé ──
  {
    const c = ANCRES.cible
    add(M.couleurs, coul(bornes(SALLE.maxX - 0.035, SALLE.maxX, c.y - 0.33, c.y + 0.33, c.z - 0.33, c.z + 0.33), 0x2a1e16))   // le liège
    add(M.affiches, recadre(new THREE.CircleGeometry(0.23, 32).rotateY(-Math.PI / 2), ZONES_AFF.cible, AFF, AFF), { x: SALLE.maxX - 0.04, y: c.y, z: c.z })
    for (const [dy, dz] of [[0.05, 0.02], [-0.08, -0.06], [0.02, -0.12]]) add(M.couleurs, coul(rod(V(SALLE.maxX - 0.04, c.y + dy, c.z + dz), V(SALLE.maxX - 0.13, c.y + dy + 0.01, c.z + dz), 0.005, 4), 0xc04020))
  }
  {
    const t = ANCRES.tele, x = SALLE.maxX - 0.33, inclinaison = 0.14
    add(M.chrome, rod(V(SALLE.maxX, t.y - 0.25, t.z), V(x + 0.1, t.y - 0.22, t.z), 0.02, 8))
    box(M.chrome, x - 0.02, SALLE.maxX, t.y - 0.27, t.y - 0.25, t.z - 0.18, t.z + 0.18)
    add(M.couleurs, coul(rounded(0.42, 0.4, 0.5, 0.04), 0x2a2826), { x, y: t.y, z: t.z, rz: inclinaison })
    add(M.couleurs, coul(new THREE.BoxGeometry(0.2, 0.3, 0.36), 0x2a2826), { x: x + 0.22, y: t.y + 0.03, z: t.z, rz: inclinaison })
    const ecran = vertical(0.36, 0.27, 0, 0.02, 0, 'x-').translate(-0.212, 0, 0)
    add(M.teleEcran, ecran, { x, y: t.y, z: t.z, rz: inclinaison })
    lueur(vertical(1.3, 1.0, SALLE.maxX - 0.02, t.y, t.z, 'x-'), 0x101a30)
  }

  // ── le mur nord : la photo de la brigade, le fanion, le téléphone mural à fil ──
  const zn = SALLE.minZ
  {
    const p = ANCRES.photo
    box(M.bois, p.x - 0.37, p.x + 0.37, p.y - 0.27, p.y + 0.27, zn, zn + 0.03)
    add(M.affiches, recadre(vertical(0.66, 0.46, p.x, p.y, zn + 0.032, 'z+'), ZONES_AFF.photo, AFF, AFF))
    // le fanion, pointe en bas, pendu à sa baguette
    const fx = -5.45, fy = 2.15, w = 0.36, h = 0.3
    const f = fromTriangles([-w / 2, 0, 0, 0, -h, 0, w / 2, 0, 0])
    const [ax, ay, aw, ah] = ZONES_AFF.fanion, uv = f.attributes.uv
    const uvs = [[ax, ay], [ax + aw / 2, ay + ah], [ax + aw, ay]]
    uvs.forEach(([u, v], i) => uv.setXY(i, u / AFF, 1 - v / AFF))
    add(M.affiches, f, { x: fx, y: fy, z: zn + 0.012 })
    add(M.laiton, rod(V(fx - w / 2 - 0.02, fy + 0.005, zn + 0.015), V(fx + w / 2 + 0.02, fy + 0.005, zn + 0.015), 0.005, 6))
    // le téléphone mural : boîtier, cadran, combiné accroché à gauche, fil tortillé qui pend
    const tl = ANCRES.telephone, zt = zn + 0.04
    add(M.couleurs, coul(rounded(0.18, 0.24, 0.08, 0.025), 0xd8ccae), { x: tl.x, y: tl.y, z: zn + 0.04 })
    add(M.couleurs, coul(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 18).rotateX(Math.PI / 2), 0xb8ae98), { x: tl.x, y: tl.y - 0.02, z: zt + 0.042 })
    add(M.couleurs, coul(new THREE.TorusGeometry(0.04, 0.005, 4, 18), 0x2a2622), { x: tl.x, y: tl.y - 0.02, z: zt + 0.05 })
    const hx = tl.x - 0.13
    add(M.couleurs, coul(rounded(0.05, 0.22, 0.05, 0.02), 0xd8ccae), { x: hx, y: tl.y + 0.01, z: zt })
    for (const dy of [-0.1, 0.12]) add(M.couleurs, coul(new THREE.CylinderGeometry(0.035, 0.03, 0.05, 12).rotateX(Math.PI / 2), 0xd8ccae), { x: hx, y: tl.y + dy, z: zt + 0.02 })
    const fil = [], debut = V(hx, tl.y - 0.11, zt), fin = V(tl.x, tl.y - 0.12, zt), tours = 18, n = tours * 6
    let avant = null
    for (let i = 0; i <= n; i++) {
      const s = i / n, a = s * tours * TAU
      const c = V(debut.x + (fin.x - debut.x) * s, debut.y + (fin.y - debut.y) * s - 0.32 * Math.sin(s * Math.PI), debut.z + 0.01)
      const p = V(c.x + Math.cos(a) * 0.012, c.y, c.z + Math.sin(a) * 0.012)
      if (avant) fil.push(rod(avant, p, 0.0035, 3))
      avant = p
    }
    const g = mergeGeometries(fil.map(x => indexed(x))); fil.forEach(x => x.dispose())
    add(M.couleurs, coul(g, 0xc8bca0))
  }

  // ── le mur sud plein : l'ardoise du plat du jour ──
  {
    const x = -2.85, y = 1.62
    box(M.bois, x - 0.32, x + 0.32, y - 0.42, y + 0.42, SALLE.maxZ - 0.025, SALLE.maxZ)
    add(M.affiches, recadre(vertical(0.56, 0.75, x, y, SALLE.maxZ - 0.027, 'z-'), ZONES_AFF.ardoise, AFF, AFF))
  }

  // ── le ventilateur du plafond : moteur fixe, pales qui tournent (au temps de jeu) ──
  const VENT = { x: 0.3, y: 2.62, z: -2.0 }
  add(M.laiton, rod(V(VENT.x, H, VENT.z), V(VENT.x, VENT.y + 0.1, VENT.z), 0.015, 8))
  add(M.laiton, new THREE.CylinderGeometry(0.09, 0.11, 0.12, 16), { x: VENT.x, y: VENT.y + 0.05, z: VENT.z })
  const ventilateur = new THREE.Mesh((() => {
    const p = []
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * TAU
      p.push(new THREE.BoxGeometry(0.5, 0.01, 0.12).rotateX(0.18).translate(0.38, 0, 0).rotateY(a))
      p.push(new THREE.BoxGeometry(0.16, 0.012, 0.03).translate(0.11, 0.004, 0).rotateY(a))
    }
    const g = mergeGeometries(p.map(x => indexed(x))); p.forEach(x => x.dispose()); return g
  })(), M.bois)
  ventilateur.name = 'ventilateur'; ventilateur.position.set(VENT.x, VENT.y, VENT.z); ventilateur.receiveShadow = true
  group.add(ventilateur)

  // ── fusion du décor : un maillage par matériau, puis les lueurs ──
  add(M.lueurs, mergeGeometries(glows.map(g => indexed(g)))); glows.forEach(g => g.dispose())
  B.finish(group)

  // ── lumière ──
  const S = DECOR.soleil
  const soleil = new THREE.SpotLight(S.couleur, S.intensite, 0, S.angle, S.penombre, 0)
  soleil.name = 'soleil'
  {   // posé dehors, au sud de la vitrine, dans la direction du soleil (hauteur et azimut depuis le sud vers l'ouest)
    const h = S.hauteurDeg * Math.PI / 180, a = S.azimutDeg * Math.PI / 180
    soleil.target.position.set(...S.vise)
    soleil.position.set(S.vise[0] - S.distance * Math.cos(h) * Math.sin(a), S.vise[1] + S.distance * Math.sin(h), S.vise[2] + S.distance * Math.cos(h) * Math.cos(a))
  }
  soleil.castShadow = true
  soleil.shadow.mapSize.set(S.carte, S.carte)
  soleil.shadow.bias = -0.0005; soleil.shadow.normalBias = 0.02
  soleil.shadow.camera.near = S.distance - 15; soleil.shadow.camera.far = S.distance + 20
  group.add(soleil, soleil.target)
  const C = DECOR.ciel
  const ciel = new THREE.HemisphereLight(C.haut, C.bas, C.intensite); ciel.name = 'ciel'; group.add(ciel)
  const point = (nom, [x, y, z]) => {
    const L = DECOR.lampes[nom], l = new THREE.PointLight(L.couleur, L.intensite, L.portee, 2)
    l.name = nom; l.position.set(x, y, z); group.add(l); return l
  }
  const lumieres = {
    soleil, ciel,
    zinc: point('zinc', [-4.0, 2.2, 0.2]),
    tele: point('tele', [5.3, 2.15, ANCRES.tele.z]),
    couloir: point('couloir', [-2.0, 2.55, -6.2]),
    jukebox: point('jukebox', [-1.6, 1.0, 3.55]),
  }

  // ── ce qu'on vise : capsules invisibles (clé barId) et occultants (murs, cloisons, portes du plan) ──
  const invisible = new THREE.MeshBasicMaterial(); invisible.name = 'capsule'; owned.mats.push(invisible)
  const cibles = []
  const capsule = (barId, geo, x, y, z, plus = {}) => {
    const m = new THREE.Mesh(geo, invisible); m.position.set(x, y, z); m.visible = false
    m.name = `capsule-${barId}`; Object.assign(m.userData, { barId, ...plus })
    group.add(m); cibles.push(m); return m
  }
  for (const s of SIEGES.filter(x => !x.occupant)) capsule(s.id, new THREE.CapsuleGeometry(0.22, 0.3, 4, 8), s.x, s.hauteur, s.z, { type: 'siege' })
  const objet = (id, w, h, d, x, y, z) => capsule(id, new THREE.BoxGeometry(w, h, d), x, y, z, { type: 'objet' })
  objet('photo', 0.78, 0.58, 0.1, ANCRES.photo.x, ANCRES.photo.y, zn + 0.06)
  objet('journal', 0.36, 0.1, 0.46, ANCRES.journal.x, 1.14, ANCRES.journal.z)
  objet('fenetre', 0.9, 1.1, 0.12, ANCRES.fenetre.x, ANCRES.fenetre.y, SALLE.maxZ - 0.1)
  objet('jukebox', 0.66, 1.5, 0.7, ANCRES.jukebox.x, 0.75, (J.minZ + J.maxZ) / 2)
  objet('cible', 0.12, 0.6, 0.6, SALLE.maxX - 0.08, ANCRES.cible.y, ANCRES.cible.z)
  objet('porte', 1.0, 2.1, 0.15, ANCRES.porte.x, 1.05, SALLE.maxZ - 0.08)
  objet('wc', 0.9, 2.0, 0.12, -2.0, 1.0, -7.5 + 0.08)
  {
    const p = PLACES.mangeDeboutEst, b = boite('mange-debout-est')
    capsule('mangeDeboutEst', new THREE.BoxGeometry(0.62, 0.5, 0.62), (b.minX + b.maxX) / 2, 0.95, (b.minZ + b.maxZ) / 2,
      { type: 'place', pretexte: p.pretexte, x: p.x, z: p.z, lacet: p.lacet })
  }
  const occultants = BOITES.filter(b => b.son !== 'meuble').map(b => {
    const m = new THREE.Mesh(bornes(b.minX, b.maxX, -0.1, H + 0.1, b.minZ, b.maxZ), invisible)
    m.visible = false; m.name = `occultant-${b.id}`; m.userData.boite = b.id
    group.add(m); return m
  })

  // ── ce qui bouge : néon, télé, ventilateur ──
  const N = DECOR.neon, TV = DECOR.tele
  M.neonO.color.setScalar(N.mort)
  let attente = entre(N.reposS), restants = 0, allume = 0, apres = 0
  function neon(dt) {
    if (allume > 0) {
      allume -= dt
      if (allume <= 0) { M.neonO.color.setScalar(N.mort); attente = restants > 0 ? apres : entre(N.reposS) }
      return
    }
    attente -= dt
    if (attente > 0) return
    if (restants === 0) restants = Math.min(N.eclats[1], N.eclats[0] + Math.floor(hasard() * (N.eclats[1] - N.eclats[0] + 1)))
    restants--
    allume = entre(N.eclatS); apres = entre(N.entreS) - allume
    M.neonO.color.setScalar(N.allume)
  }
  let plan = entre(TV.planS)
  const eclairer = e => { M.teleEcran.color.setScalar(e); lumieres.tele.intensity = DECOR.lampes.tele.intensite * e }
  eclairer(attenue ? (TV.eclat[0] + TV.eclat[1]) / 2 : entre(TV.eclat))

  let disposed = false
  return {
    group,
    collisions: BOITES,          // moveCircle : les boîtes du plan, rien d'autre
    cibles,                      // capsules invisibles, userData.barId (createInteract, cle: 'barId')
    occultants,                  // boîtes invisibles des murs, cloisons et portes : elles arrêtent la visée
    lumieres,
    brouillard: new THREE.Fog(DECOR.brouillard.couleur, DECOR.brouillard.pres, DECOR.brouillard.loin),
    ventilateur,
    porteCuisine,
    // le voyant de la porte du WC : OCCUPÉ (le routier, de 240 à 300 s, src/bar/seance.js) ou LIBRE
    setWcOccupe(occupe) { T.voyant.offset.y = occupe ? 0.5 : 0 },
    update(dt) {
      if (disposed) return
      dt = Math.min(Math.max(+dt || 0, 0), 0.1)
      ventilateur.rotation.y = (ventilateur.rotation.y + dt * DECOR.ventilateur.toursParS * TAU) % TAU
      if (attenue) return   // §9 : néon et télé fixes, la course du tiercé comprise
      T.tele.offset.x = (T.tele.offset.x + dt * TV.defilement) % 1
      neon(dt)
      plan -= dt
      if (plan <= 0) { plan = entre(TV.planS); eclairer(entre(TV.eclat)) }
    },
    // maillages, points et lignes visibles, et leurs triangles (la mesure du budget du décor, spec §8)
    stats() {
      let drawables = 0, triangles = 0
      group.traverseVisible(o => {
        if (!(o.isMesh || o.isPoints || o.isLine)) return
        drawables++
        const g = o.geometry
        triangles += (g.index ? g.index.count : g.attributes.position.count) / 3
      })
      return { drawables, triangles: Math.round(triangles) }
    },
    dispose() {
      if (disposed) return
      disposed = true
      const geos = new Set(), mats = new Set(owned.mats), texs = new Set(owned.texs)
      group.traverse(o => {
        if (o.geometry) geos.add(o.geometry)
        for (const m of [].concat(o.material || [])) mats.add(m)
      })
      for (const m of mats) for (const k in m) { const v = m[k]; if (v && v.isTexture) texs.add(v) }
      soleil.shadow.dispose()
      geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); texs.forEach(t => t.dispose())
      group.clear()
    },
  }

  // un globe opalin pendu au plafond par son fil : plus clair à l'équateur qu'aux pôles (il se lit rond), et sa lumière
  // en halo au plafond
  function globe(x, y, z, r) {
    add(M.couleurs, coul(rod(V(x, H, z), V(x, y + r * 0.9, z), 0.004, 4), 0x1a1410))
    add(M.laiton, new THREE.CylinderGeometry(0.03, 0.05, 0.05, 10), { x, y: y + r * 0.95, z })
    const g = coul(new THREE.SphereGeometry(r, 16, 12), 0xf0b878), p = g.attributes.position, c = g.attributes.color
    for (let i = 0; i < p.count; i++) { const k = 0.55 + 0.45 * (1 - Math.abs(p.getY(i)) / r); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k) }
    add(M.lampes, g, { x, y, z })
    lueur(horizontal(x - 0.7, x + 0.7, z - 0.7, z + 0.7, H - 0.004, true), 0x2a1a0c)
  }
  // un verre (gobelet), ouvert en haut, posé en y = 0
  function verre(r = 0.032, h = 0.09) {
    return lathe([[0, 0], [r * 0.85, 0], [r, h], [r * 0.9, h], [r * 0.78, 0.006], [0, 0.006]], 10)
  }
}
