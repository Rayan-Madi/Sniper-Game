// ─── Sonde de lisibilité à longue distance (spec du lot 3, §1 « 3.0 » et §4 : porte de décision) ──────────────────
// Partie pure de la route de développement ?sonde=1 (main.js, src/gfx/sondeScene.js) : lecture des paramètres de
// l'adresse, mesure du masque d'identification d'un personnage, placement du groupe sous le point regardé, taille
// qu'un objet doit avoir à l'écran. Ni DOM ni three : scripts/capture-mission.mjs (par scripts/sonde.mjs) écrit
// l'adresse que lireSonde relit, et les tests importent ce module directement.
import { PRESETS } from './quality.js'
import { BASE_FOV } from '../aim.js'

// Écart (m) entre deux personnages côte à côte, faute d'autre réglage : Vosko et Mira, « toujours à deux pas »
// (spec §3, 1,2 à 1,5 m).
export const ECART_DEFAUT = 1.4

// n nombres séparés par des virgules (« -28,41,146 »), tous lisibles ; sinon null.
function nombres(v, n) {
  if (v == null || v === '') return null
  const x = v.split(',').map(s => (s.trim() === '' ? NaN : Number(s)))
  return x.length === n && x.every(Number.isFinite) ? x : null
}
// Nombre strictement positif ; sinon null.
function positif(v) {
  if (v == null || v.trim() === '') return null
  const x = Number(v)
  return Number.isFinite(x) && x > 0 ? x : null
}

// Brume : « lin:debut:fin » (linéaire, en mètres, début avant la fin) ou « exp2:densite » (exponentielle) ; sinon null.
export function lireBrume(v) {
  if (!v) return null
  const [type, ...p] = v.split(':')
  if (type === 'lin' && p.length === 2) {
    const [debut, fin] = p.map(s => (s.trim() === '' ? NaN : Number(s)))
    if (Number.isFinite(debut) && Number.isFinite(fin) && debut >= 0 && fin > debut) return { type: 'lin', debut, fin }
  }
  if (type === 'exp2' && p.length === 1) {
    const densite = positif(p[0])
    if (densite) return { type: 'exp2', densite }
  }
  return null
}

// Nom de fichier d'un modèle sans dossier ni extension : « /models/mafia_boss.glb » → « mafia_boss ».
export const nomDeModele = v => v.split(/[?#]/)[0].split('/').pop().replace(/\.glb$/i, '')

// Paramètres de la route (location.search), ou null sans sonde=1. Une valeur illisible vaut null (la scène garde
// alors ce qui est en place, la carte et le profil de sa mission, voir sondeScene.js) :
//   poste=x,y,z (œil), regard=x,y,z (point visé, sous lequel se posent les personnages), near=… far=… (m ; far plus
//   loin que near), brume=lin:debut:fin | exp2:densite, soleil=x,y,z (position du soleil, qui vise l'origine),
//   zoom=… (grossissement de la lunette, au moins 1 : champ vertical de 60 / zoom), qualite=auto|bas|moyen|haut,
//   modele=nom[,nom…] (fichiers des modèles du jeu, nom nu ou adresse), ecart=… (m entre deux personnages),
//   carte=1…6 | nu (sans elle : la mission en cours).
export function lireSonde(search) {
  const q = new URLSearchParams(search)
  if (!q.has('sonde')) return null
  const near = positif(q.get('near'))
  const far = positif(q.get('far'))
  const zoom = q.get('zoom') != null && q.get('zoom').trim() !== '' ? Number(q.get('zoom')) : NaN
  const carte = q.get('carte') || ''
  return {
    poste: nombres(q.get('poste'), 3),
    regard: nombres(q.get('regard'), 3),
    near,
    far: far && (!near || far > near) ? far : null,
    brume: lireBrume(q.get('brume')),
    soleil: nombres(q.get('soleil'), 3),
    zoom: Number.isFinite(zoom) && zoom >= 1 ? zoom : null,
    qualite: PRESETS.includes(q.get('qualite')) ? q.get('qualite') : null,
    modeles: (q.get('modele') || '').split(',').map(s => s.trim()).filter(Boolean).map(nomDeModele),
    ecart: positif(q.get('ecart')) ?? ECART_DEFAUT,
    carte: carte === 'nu' ? 'nu' : /^[1-6]$/.test(carte) ? Number(carte) : null,
  }
}

// Boîte des pixels allumés d'un masque RGBA lu par readPixels (lignes du BAS vers le haut, comme WebGL), en pixels du
// tampon, y compté depuis le haut de l'image : { gauche, droite, haut, bas, largeur, hauteur, pixels }. Un pixel
// compte si son rouge atteint le seuil (le masque est blanc sur noir) ; null si rien n'est allumé.
export function mesureMasque(rgba, largeur, hauteur, seuil = 128) {
  let gauche = Infinity, droite = -1, haut = Infinity, bas = -1, pixels = 0
  for (let r = 0; r < hauteur; r++) {
    const y = hauteur - 1 - r
    const ligne = r * largeur * 4
    for (let x = 0; x < largeur; x++) {
      if (rgba[ligne + x * 4] < seuil) continue
      pixels++
      if (x < gauche) gauche = x
      if (x > droite) droite = x
      if (y < haut) haut = y
      if (y > bas) bas = y
    }
  }
  return pixels ? { gauche, droite, haut, bas, largeur: droite - gauche + 1, hauteur: bas - haut + 1, pixels } : null
}

// Pieds (x, z) de n personnages côte à côte, centrés sous le point regardé, sur la perpendiculaire à la visée vue de
// dessus, de gauche à droite vu du poste : aucun ne passe derrière un autre.
export function placesDuGroupe(regard, poste, n, ecart) {
  const dx = regard[0] - poste[0], dz = regard[2] - poste[2]
  const l = Math.hypot(dx, dz) || 1
  const droiteX = -dz / l, droiteZ = dx / l   // la droite du tireur qui regarde vers le point visé
  return Array.from({ length: n }, (_, i) => {
    const k = (i - (n - 1) / 2) * ecart
    return [regard[0] + droiteX * k, regard[2] + droiteZ * k]
  })
}

// Cap (rotation autour de Y) qui tourne le +Z d'un modèle de `depuis` vers `vers` ([x, z]), comme NPC.
export function capVers(depuis, vers) {
  return Math.atan2(vers[0] - depuis[0], vers[1] - depuis[1])
}

// Angle (degrés) de la visée sous l'horizontale, de l'œil vers un point ([x, y, z]).
export function plongeeDeg(oeil, point) {
  return Math.atan2(oeil[1] - point[1], Math.hypot(point[0] - oeil[0], point[2] - oeil[2])) * 180 / Math.PI
}

// Hauteur à l'écran (pixels) d'un objet vertical de `taille` m vu à `distance` m dans la lunette au grossissement
// `zoom` (champ vertical de 60 / zoom, src/aim.js), sur une image de `hauteurPx` pixels de haut (l'écran, ou le
// tampon de dessin : 0,75 fois l'écran en Bas). Vu en plongée de `plongee` degrés, l'objet paraît plus court de cos θ.
// Sans plongée, c'est le calcul de la spec du lot 3 (§2, critères de lisibilité).
export function pixelsAttendus(taille, distance, zoom, hauteurPx, plongee = 0) {
  const demiChamp = (BASE_FOV / zoom) * Math.PI / 360
  return (hauteurPx / 2) * (taille * Math.cos(plongee * Math.PI / 180) / distance) / Math.tan(demiChamp)
}
