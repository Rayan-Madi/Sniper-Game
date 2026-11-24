// Les patrons du Bivouac, le bar de M5 (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.2, §8 ; tâche B10
// du plan m5-bar) : les hommes du colonel attablés, Fernand derrière son zinc, Lise qui sert, Albert devant la course, les
// deux ouvriers et Sorel, qui entre à 18:30. Chacun est un clone d'un modèle GLB du jeu (spawnCharacter de
// src/characters.js), tiré sous withSeed tant que le casting strict du lot 3 (tâche A6) n'est pas fusionné, et dont le
// modèle est vérifié sur cfg.url : la retombée silencieuse de characters.js (un autre modèle si celui demandé manque)
// est ici une erreur.
//
// Par-dessus les clips des modèles (les 7 GLB ont les mêmes 20 clips) :
// - assis, le corps est porté par son siège : son dessous (bas des fesses et des cuisses) et ses pieds sont mesurés une
//   fois par modèle et par clip, sur la peau recalculée, et le groupe est posé pour que le dessous s'enfonce de 0 à
//   2,5 cm dans l'assise, en partant du décalage du plan (chaise 0, tabouret +0,33 m) ; sur une chaise, qui est trop
//   petit pour elle (les pieds décollés de plus de 4 cm) grandit au montage jusqu'à les poser ;
// - les clips se fondent en courbe douce ; chaque clip est coupé en deux, le bas du corps (bassin et jambes) et le haut :
//   un geste (Look, Point, Threaten, Wave) ne prend que le haut, et l'on menace assis sans quitter sa chaise ;
// - après mixer.update, la tête (os Neck et Head, trouvés par leur nom exact) se tourne vers ce qu'on lui donne à
//   regarder, à 70° au plus de la face du corps, par un ressort amorti (départ et arrivée en douceur) ; qui parle hoche
//   la tête ;
// - qui marche (Lise, Sorel, Fernand, un patron attablé qui s'est levé) suit des points de passage (itineraire de
//   src/bar/plan.js), au pas, par moveCircle contre les boîtes du plan, sauf la sienne et la banquette qui le porte ; se
//   lever et s'asseoir changent de clip et de hauteur ensemble.
// La personne vue par le regard (src/bar/regard.js) a la tête sur l'os Head et la face du corps (ou du siège), jamais
// celle de la tête tournée (spec §3.5, « Réglé en B3 ») : modifiée sur place à chaque image.
//
// Jamais de peau animée dans un rayon (spec §3.2) : on vise une capsule invisible par personne. Aucun personnage ne
// projette d'ombre : une ombre de contact peinte au sol sous chacun. Les accessoires (verre, cartes) tiennent sous l'os
// /RightHand$/ lui-même, le tablier de Lise sous son bassin. Aucun Math.random ici (les tirages de characters.js sont
// sous withSeed, les nôtres au générateur à graine de src/shot/acoustics.js), ni minuteur : tout avance par update(dt).
// dispose() libère ce que la personne possède (clone, squelettes, matériaux teintés, accessoires, ombre, capsule), rien
// du modèle partagé, et oublie le clone dans son mixer (uncacheRoot), comme NPC.dispose (src/npc.js).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { spawnCharacter, MODELS } from '../characters.js'
import { withSeed } from '../gfx/memtest.js'
import { disposeObject, isShared } from '../gfx/dispose.js'
import { generateur } from '../shot/acoustics.js'
import { moveCircle, forwardOf } from '../prologue/fpsController.js'
import { lathe, tint } from '../prologue/decor.js'
import { SIEGES, ANCRES, BOITES } from './plan.js'
import { ESCORTE } from './seance.js'
import { PATRONS } from './reglages.js'

const RAD = Math.PI / 180

// ─── Os et clips ───────────────────────────────────────────────────

// Les os que le bar touche, par la fin exacte de leur nom (préfixes mixamorig, mixamorig2, mixamorig12… : les deux-points
// sont retirés par three) : jamais HeadTop_End, jamais un doigt.
export const OS = Object.freeze({ tete: /Head$/, cou: /Neck$/, mainDroite: /RightHand$/, hanches: /Hips$/ })

// Le premier os de l'arbre dont le nom finit comme il faut ; une erreur s'il n'y en a pas.
export function trouverOs(racine, nom) {
  const motif = OS[nom]
  if (!motif) throw new Error(`patrons : os inconnu « ${nom} »`)
  let trouve = null
  racine.traverse(o => { if (!trouve && o.isBone && motif.test(o.name)) trouve = o })
  if (!trouve) throw new Error(`patrons : aucun os ${motif} dans le modèle`)
  return trouve
}

// Le bas du corps : bassin et jambes ; le reste (colonne, cou, tête, bras, mains) fait le haut.
const BAS = /(Hips|UpLeg|Leg|Foot|ToeBase|Toe_End)$/
const moities = new WeakMap()   // clip du modèle → { bas, haut } : les mêmes pistes, rien de copié
function moitiesDe(clip) {
  let m = moities.get(clip)
  if (!m) {
    const bas = [], haut = []
    for (const t of clip.tracks) (BAS.test(t.name.slice(0, t.name.lastIndexOf('.'))) ? bas : haut).push(t)
    m = { bas: new THREE.AnimationClip(`${clip.name} (bas)`, clip.duration, bas),
      haut: new THREE.AnimationClip(`${clip.name} (haut)`, clip.duration, haut) }
    moities.set(clip, m)
  }
  return m
}

// ─── Qui, où ───────────────────────────────────────────────────────

// La catégorie du regard et de la jauge (REGARD.tolerance, SOUPCON.temoins) : escorte, fernand, albert, civil.
export function categorieDe(role) {
  if (ESCORTE.includes(role)) return 'escorte'
  if (role === 'fernand' || role === 'albert') return role
  return 'civil'
}

// Le pool de characters.js (target, guard, civilian) qui contient ce modèle.
function typeDuModele(modele) {
  const fin = `/${modele}.glb`
  for (const [type, cfg] of Object.entries(MODELS)) {
    const urls = cfg.variants ? cfg.variants.map(v => v.url) : cfg.url ? [cfg.url] : []
    if (urls.some(u => u.endsWith(fin))) return type
  }
  throw new Error(`patrons : modèle inconnu « ${modele} »`)
}

const siegeDe = ref => {
  const s = typeof ref === 'string' ? SIEGES.find(x => x.id === ref) : ref
  if (!s || !Number.isFinite(s.x)) throw new Error(`patrons : siège inconnu « ${ref} »`)
  return s
}
// Un poste : une ancre (« fernand », « lise.zinc », « ouvriers.0 ») ou un point { x, z, lacet? }.
function posteDe(ref) {
  let p = ref
  if (typeof ref === 'string') {
    const [a, b] = ref.split('.')
    p = ANCRES[a]
    if (b !== undefined) p = p && p[b]
  }
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) throw new Error(`patrons : poste inconnu « ${ref} »`)
  return p
}

// La graine d'une personne : celle du casting, mêlée à son rôle (FNV-1a).
function graineDe(graine, role) {
  let h = 0x811c9dc5 ^ (graine >>> 0)
  for (const ch of String(role)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193)
  return h >>> 0
}

const borne = (v, a, b) => Math.max(a, Math.min(b, v))
const enrouler = a => Math.atan2(Math.sin(a), Math.cos(a))
const doux = k => k * k * (3 - 2 * k)
// L'angle signé (radians) de la direction (x, z) depuis la face (fx, fz), au sol : positif à gauche, comme le lacet
const angleDepuis = (fx, fz, x, z) => Math.atan2(fz * x - fx * z, fx * x + fz * z)

// Ressort amorti critique, intégré implicitement (stable à tout pas) : etat.x va vers la cible sans la dépasser, départ
// et arrivée en douceur. omega : sa raideur (environ 4 / le temps d'y arriver à 90 %).
function ressort(etat, cible, omega, dt) {
  const f = 1 + 2 * dt * omega, hoo = dt * omega * omega, inv = 1 / (f + dt * hoo)
  const x = (f * etat.x + dt * etat.v + dt * hoo * cible) * inv
  etat.v = (etat.v + hoo * (cible - etat.x)) * inv
  etat.x = x
}

// ─── Le dessous du corps assis, et ses pieds ───────────────────────
// Le plus bas de la peau autour du bassin (bas des fesses et des cuisses) et celui des pieds, dans la pose assise d'un
// clip, mesurés sur un clone (peau recalculée sur le processeur) une fois par modèle et par clip, rapportés à l'échelle
// du clone : un autre clone du même modèle, d'une autre taille, les retrouve sans mesure.
const assises = new Map()   // « url|clip » → { dessous, pieds } : hauteurs sans l'échelle ni le décalage du clone
const PORTEURS = /(Hips|UpLeg|Spine)$/   // les os qui portent la peau du bassin (une basque de veste comprise)
const PIEDS = /(Foot|ToeBase)$/          // ceux qui portent la peau des pieds
function mesureAssise(ch, model, clip, rayon) {
  const cle = `${ch.cfg.url}|${clip.name}`
  if (!assises.has(cle)) {
    const mesure = new THREE.AnimationMixer(model)
    mesure.clipAction(clip).play()
    mesure.update(0)
    model.updateMatrixWorld(true)
    const hanches = trouverOs(model, 'hanches').getWorldPosition(new THREE.Vector3())
    const sol = model.parent ? model.parent.getWorldPosition(new THREE.Vector3()).y : 0   // le groupe, s'il est déjà placé
    const v = new THREE.Vector3()
    let bas = Infinity, pieds = Infinity
    model.traverse(m => {
      if (!m.isSkinnedMesh) return
      const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, pos = m.geometry.attributes.position
      const porte = m.skeleton.bones.map(b => PORTEURS.test(b.name)), pied = m.skeleton.bones.map(b => PIEDS.test(b.name))
      for (let i = 0; i < pos.count; i++) {
        let j = 0
        for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, j)) j = k
        const os = si.getComponent(i, j)
        if (!porte[os] && !pied[os]) continue
        m.getVertexPosition(i, v)
        v.applyMatrix4(m.matrixWorld)
        if (pied[os]) pieds = Math.min(pieds, v.y)
        else if (v.y < bas && Math.hypot(v.x - hanches.x, v.z - hanches.z) <= rayon) bas = v.y
      }
    })
    mesure.stopAllAction()
    mesure.uncacheRoot(model)
    if (!Number.isFinite(bas)) throw new Error(`patrons : rien sous le bassin de ${ch.cfg.url} en ${clip.name}`)
    if (!Number.isFinite(pieds)) throw new Error(`patrons : aucun pied à ${ch.cfg.url} en ${clip.name}`)
    const brut = h => (h - sol - model.position.y) / model.scale.y
    assises.set(cle, { dessous: brut(bas), pieds: brut(pieds) })
  }
  return assises.get(cle)
}

// ─── Accessoires, ombre, capsule ───────────────────────────────────

// Un demi : le verre plein de bière, sa mousse ; posé en y = 0, ouvert en haut.
function geoVerre() {
  const r = 0.034, h = 0.125
  const biere = tint(lathe([[0, 0], [r * 0.86, 0], [r, h * 0.84], [0, h * 0.84]], 12), 0xb8741c)
  const mousse = tint(lathe([[0, h * 0.84], [r, h * 0.84], [r * 1.01, h], [0, h]], 12), 0xeee4cc)
  return mergeGeometries([biere, mousse])
}
// Cinq cartes en éventail autour de leur coin bas, face vers −z (vers qui les tient, le modèle regardant vers +z).
function geoCartes() {
  const cartes = []
  for (let i = 0; i < 5; i++) {
    const g = tint(new THREE.BoxGeometry(0.056, 0.086, 0.0015), i % 2 ? 0xece6d8 : 0xe2d8c4)
    g.translate(0, 0.043, -i * 0.0018)
    g.rotateZ((i - 2) * 0.2)
    cartes.push(g)
  }
  return mergeGeometries(cartes)
}
// L'ombre de contact : un disque de rayon 0,5, noir au centre, transparent au bord (alpha par sommet, sans texture).
function geoOmbre() {
  const anneaux = [[0, 1], [0.28, 0.85], [0.5, 0]], seg = 20
  const pos = [], col = [], idx = []
  pos.push(0, 0, 0); col.push(0, 0, 0, 1)
  for (let a = 1; a < anneaux.length; a++) {
    for (let s = 0; s < seg; s++) {
      const t = s / seg * Math.PI * 2
      pos.push(Math.cos(t) * anneaux[a][0], 0, Math.sin(t) * anneaux[a][0]); col.push(0, 0, 0, anneaux[a][1])
    }
  }
  for (let s = 0; s < seg; s++) {
    const n = (s + 1) % seg
    idx.push(0, 1 + n, 1 + s)
    idx.push(1 + s, 1 + n, 1 + seg + s, 1 + n, 1 + seg + n, 1 + seg + s)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4))
  g.setIndex(idx)
  return g
}

// Pose un objet sous un os, à l'endroit `place` (une matrice dans le repère du patron, sur la pose du moment) : il suit
// ensuite l'os, échelle du modèle compensée.
function attacher(objet, os, place) {
  os.updateWorldMatrix(true, false)
  new THREE.Matrix4().copy(os.matrixWorld).invert().multiply(place).decompose(objet.position, objet.quaternion, objet.scale)
  os.add(objet)
}

// ─── Un patron ─────────────────────────────────────────────────────

// Une personne du Bivouac. role : son identifiant (clé de PERSONNES, src/bar/textes.js) ; modele : le GLB demandé ;
// teinte : la couleur de ses matériaux (copiés, la teinte remplace la leur comme dans characters.js) ; siege (assise) ou
// poste (debout), et lacet (debout) ; accessoire : 'verre', 'cartes', 'tablier' ou rien ; graine : ses tirages.
export function creerPatron({ role, modele, teinte = 0xffffff, siege = null, poste = null, lacet = null, accessoire = null,
  graine = PATRONS.graine, absent = false, reglages = PATRONS, boites = BOITES } = {}) {
  if (!siege === !poste) throw new Error(`patrons : « ${role} » a un siège ou un poste, l'un des deux`)
  const type = typeDuModele(modele)
  const fin = `/${modele}.glb`
  // match : le characters.js de la branche ; model : celui du casting strict du lot 3 (A6, dans main), qui ignore match
  // (chacun ignore l'option de l'autre). Les tirages de main ne sont pas ceux d'ici (le modèle imposé n'y est pas tiré) :
  // une même graine n'y donne pas la même taille, et l'assise tient à toutes les tailles (voir grandirPourSaChaise)
  const ch = withSeed(graine, () => spawnCharacter(type, { match: fin, model: modele }))
  if (!ch) throw new Error(`patrons : « ${role} » demande ${modele}, mais les modèles du jeu ne sont pas chargés`)
  const { model, mixer } = ch
  if (!ch.cfg.url.endsWith(fin)) {
    mixer.uncacheRoot(model); disposeObject(model)
    throw new Error(`patrons : « ${role} » demande ${modele}, characters.js rend ${ch.cfg.url} (modèle absent du chargement)`)
  }
  const R = reglages
  // ce qui arrête sa marche : les boîtes du plan, sauf la sienne (le carré d'un patron attablé, à sa place) et la
  // banquette qui le porte (Dussart) : il en part debout, et y revient
  const banquette = siege ? siegeDe(siege).banquette : null
  const obstacles = Object.freeze(boites.filter(b => b.id !== role && !(banquette && b.id === banquette)))
  const hasard = generateur(graine)
  const entre = ([a, b]) => a + (b - a) * hasard()
  const group = new THREE.Group()
  group.name = `patron-${role}`
  try {
    group.add(model)
    const os = { tete: trouverOs(model, 'tete'), cou: trouverOs(model, 'cou'), mainDroite: trouverOs(model, 'mainDroite'),
      hanches: trouverOs(model, 'hanches') }

    // teinte (matériaux copiés : ils sont à la personne), aucune ombre projetée, l'ombre du soleil reçue
    model.traverse(o => {
      if (!o.isMesh) return
      o.castShadow = false
      o.receiveShadow = true
      const copie = m => { if (!isShared(m)) return m; const c = m.clone(); delete c.userData.shared; return c }
      o.material = Array.isArray(o.material) ? o.material.map(copie) : copie(o.material)
      for (const m of [].concat(o.material)) m.color.setHex(teinte)
    })

    // ── les clips, coupés en haut et bas, fondus en courbe douce ──
    const clips = Object.fromEntries(Object.entries(ch.actions).map(([nom, a]) => [nom, a.getClip()]))
    const actions = new Map()   // « clip|moitié » → action
    const vitesse = entre(R.clips.vitesse)
    function actionDe(nom, moitie) {
      const cle = `${nom}|${moitie}`
      if (!actions.has(cle)) {
        if (!clips[nom]) throw new Error(`patrons : le modèle ${modele} n'a pas de clip « ${nom} »`)
        const a = mixer.clipAction(moitiesDe(clips[nom])[moitie])
        a.time = hasard() * clips[nom].duration   // l'instant de départ ; la seconde moitié se cale sur la première
        a.timeScale = nom === R.clips.marche ? R.marche.vitesse / R.marche.vitesseClip : vitesse
        a.userData = { clip: nom, moitie }
        actions.set(cle, a)
      }
      return actions.get(cle)
    }
    // l'autre moitié du même clip : une moitié qui repart se cale sur elle si elle joue (les bras suivent les jambes)
    const soeur = a => actions.get(`${a.userData.clip}|${a.userData.moitie === 'bas' ? 'haut' : 'bas'}`)
    // une couche : ses actions, leur avancée k vers leur poids voulu (de 0 à 1), poids effectifs normalisés
    const couches = { bas: [], haut: [] }
    function viser(couche, poids, immediat) {   // poids : Map action → poids voulu
      const c = couches[couche]
      for (const a of poids.keys()) {
        if (!c.some(e => e.action === a)) {
          const b = soeur(a)
          if (b && b.isRunning()) a.time = b.time
          c.push({ action: a, k: 0, voulu: 0 }); a.enabled = true; a.setEffectiveWeight(0); a.play()
        }
      }
      for (const e of c) { e.voulu = poids.get(e.action) || 0; if (immediat) e.k = e.voulu }
    }
    let fondu = R.clips.fonduS
    function avancerCouches(dt) {
      for (const c of Object.values(couches)) {
        let somme = 0
        for (const e of c) {
          const pas = fondu > 0 ? dt / fondu : 1
          e.k = e.k < e.voulu ? Math.min(e.voulu, e.k + pas) : Math.max(e.voulu, e.k - pas)
          e.w = doux(e.k)
          somme += e.w
        }
        for (let i = c.length - 1; i >= 0; i--) {
          const e = c[i]
          if (e.k === 0 && e.voulu === 0) { e.action.stop(); c.splice(i, 1); continue }
          e.action.setEffectiveWeight(somme > 0 ? e.w / somme : 0)
        }
      }
    }
    let melange = new Map()   // nom de clip → poids voulu (la pose de base : assis, debout, en marche, à demi levé)
    let geste = null
    function appliquer(immediat = false) {
      const bas = new Map(), haut = new Map()
      for (const [nom, w] of melange) { bas.set(actionDe(nom, 'bas'), w); haut.set(actionDe(nom, 'haut'), w) }
      viser('bas', bas, immediat)
      viser('haut', geste ? new Map([[actionDe(geste, 'haut'), 1]]) : haut, immediat)
    }
    const clipPrincipal = () => [...melange].sort((a, b) => b[1] - a[1])[0][0]

    // ── la place : assis sur un siège, ou debout à un poste ──
    const pos = { x: 0, z: 0 }
    let y = 0, pose, siegeActuel = null, levee = 0
    const corps = { x: 0, v: 0 }   // le lacet du corps, en ressort
    let lacetVoulu = 0
    const clipAssis = s => R.clips.assis[s.banquette ? 'banquette' : s.type]
    const assise = s => mesureAssise(ch, model, clips[clipAssis(s)], R.assise.rayonM)
    const surCeClone = h => h * model.scale.y + model.position.y   // une hauteur de mesureAssise, sur ce clone
    // la hauteur du groupe sur ce siège : le dessous du corps s'enfonce de 0 à enfoncementM dans l'assise, en partant du
    // décalage du plan
    const hauteurSur = s => {
      const d = surCeClone(assise(s).dessous)
      return borne(s.decalage, s.hauteur - R.assise.enfoncementM - d, s.hauteur - d)
    }
    // Sur une chaise (la banquette comprise), les pieds au sol : une personne trop petite pour elle, que l'assise
    // relèverait au point de lui décoller les pieds de plus de piedsMaxM, grandit jusqu'à la plus petite taille qui tient
    // les deux (enfoncée de enfoncementM, les pieds à piedsMaxM). Au montage seulement, jamais sous les yeux du joueur.
    // Enfoncé de enfoncementM, le groupe est à y = h − e − d et les pieds à y + p : h − e − échelle × (dessous − pieds),
    // le décalage du clone s'annulant (ses pieds au sol debout, model.position.y, suit son échelle, et grandit avec elle).
    function grandirPourSaChaise(s) {
      if (s.type !== 'chaise') return
      const m = assise(s)
      const voulue = (s.hauteur - R.assise.enfoncementM - R.assise.piedsMaxM) / (m.dessous - m.pieds)
      if (!(model.scale.y < voulue)) return
      const f = voulue / model.scale.y
      model.scale.multiplyScalar(f)
      model.position.y *= f
      model.updateMatrixWorld(true)
    }
    if (siege) {
      const s = siegeDe(siege)
      if (!clips[clipAssis(s)]) throw new Error(`patrons : le modèle ${modele} n'a pas de clip « ${clipAssis(s)} »`)
      grandirPourSaChaise(s)
      siegeActuel = s
      melange = new Map([[clipAssis(s), 1]])
      y = hauteurSur(s)
      pos.x = s.x; pos.z = s.z
      corps.x = lacetVoulu = s.lacet
      pose = 'assis'
    } else {
      const p = posteDe(poste)
      melange = new Map([[R.clips.debout, 1]])
      pos.x = p.x; pos.z = p.z
      corps.x = lacetVoulu = lacet ?? p.lacet ?? 0
      pose = 'debout'
      levee = 1
    }
    appliquer(true)
    mixer.update(0)
    model.updateMatrixWorld(true)

    // ── accessoire : posé sur la pose de départ (le groupe à l'origine), puis il suit son os ──
    let objet = null
    if (accessoire) {
      const place = new THREE.Matrix4()
      const main = os.mainDroite, ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3()
      main.matrixWorld.extractBasis(ax, ay, az)
      ay.normalize(); az.normalize()   // ay : vers les doigts ; az : la paume
      const poignet = main.getWorldPosition(new THREE.Vector3())
      if (accessoire === 'verre') {
        const c = poignet.clone().addScaledVector(ay, 0.07).addScaledVector(az, 0.04)
        place.makeTranslation(c.x, c.y - 0.06, c.z)
        objet = new THREE.Mesh(geoVerre(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }))
        attacher(objet, main, place)
      } else if (accessoire === 'cartes') {
        const c = poignet.clone().addScaledVector(ay, 0.05).add(new THREE.Vector3(0, 0.03, 0))
        place.compose(c, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0)), new THREE.Vector3(1, 1, 1))
        objet = new THREE.Mesh(geoCartes(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }))
        attacher(objet, main, place)
      } else if (accessoire === 'tablier') {
        const h = os.hanches.getWorldPosition(new THREE.Vector3())
        place.makeTranslation(h.x, h.y - 0.17, h.z - 0.02)
        objet = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.22, 0.46, 12, 1, true, -0.95, 1.9),
          new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.9, side: THREE.DoubleSide }))
        attacher(objet, os.hanches, place)
      } else {
        throw new Error(`patrons : accessoire inconnu « ${accessoire} »`)
      }
      objet.name = `${accessoire}-${role}`
      objet.castShadow = false
      objet.receiveShadow = true
    }

    // ── ombre de contact, capsule de visée ──
    const ombre = new THREE.Mesh(geoOmbre(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true,
      opacity: R.ombre.opacite, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
    ombre.name = `ombre-${role}`
    ombre.castShadow = false
    ombre.receiveShadow = false
    group.add(ombre)
    const C = R.capsule
    const cible = new THREE.Mesh(new THREE.CapsuleGeometry(C.rayonM, C.hauteurM - 2 * C.rayonM, 4, 8), new THREE.MeshBasicMaterial())
    cible.name = `capsule-${role}`
    cible.visible = false
    Object.assign(cible.userData, { barId: role, type: 'personne' })
    group.add(cible)

    // ── la tête ──
    const T = R.tete, omegaTete = 4 / T.reponseS, omegaCorps = 4 / R.marche.virageS
    const tete = { regard: null, lacet: { x: 0, v: 0 }, tangage: { x: 0, v: 0 }, poids: { x: 0, v: 0 }, parle: false, parleK: 0,
      phase: hasard() * Math.PI * 2 }
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qd = new THREE.Quaternion(), va = new THREE.Vector3()
    const vb = new THREE.Vector3(), HAUT = new THREE.Vector3(0, 1, 0)
    // tourne l'os de `lacet` autour de la verticale puis de `tangage` autour de l'horizontale `axe` (repère du monde)
    function tourner(o, dLacet, dTangage, axe) {
      if (dLacet === 0 && dTangage === 0) return
      qd.setFromAxisAngle(HAUT, dLacet)
      if (dTangage !== 0) qd.premultiply(qa.setFromAxisAngle(axe, dTangage))
      o.parent.getWorldQuaternion(qb)
      o.quaternion.premultiply(qa.copy(qb).invert().multiply(qd).multiply(qb))
    }
    function couchesDeTete(dt) {
      os.tete.getWorldQuaternion(qa)
      va.set(0, 0, 1).applyQuaternion(qa)   // la face de la tête, sur le clip
      const f = forwardOf(corps.x)
      const lacetClip = angleDepuis(f.x, f.z, va.x, va.z), tangageClip = Math.asin(borne(va.y, -1, 1))
      let lacetVise = lacetClip, tangageVise = tangageClip
      if (tete.regard) {
        vb.setFromMatrixPosition(os.tete.matrixWorld)
        const dx = tete.regard.x - vb.x, dy = tete.regard.y - vb.y, dz = tete.regard.z - vb.z
        lacetVise = borne(angleDepuis(f.x, f.z, dx, dz), -T.maxDeg * RAD, T.maxDeg * RAD)
        tangageVise = borne(Math.atan2(dy, Math.hypot(dx, dz)), -T.tangageMaxDeg * RAD, T.tangageMaxDeg * RAD)
      }
      ressort(tete.lacet, lacetVise, omegaTete, dt)
      ressort(tete.tangage, tangageVise, omegaTete, dt)
      ressort(tete.poids, tete.regard ? 1 : 0, omegaTete, dt)
      tete.lacet.x = borne(tete.lacet.x, -T.maxDeg * RAD, T.maxDeg * RAD)
      const poids = borne(tete.poids.x, 0, 1)
      tete.parleK = borne(tete.parleK + (tete.parle ? dt : -dt) / 0.4, 0, 1)
      tete.phase = (tete.phase + dt * T.hochementHz * Math.PI * 2) % (Math.PI * 2)
      const hochement = T.hochementDeg * RAD * doux(tete.parleK) * Math.sin(tete.phase)
      const dLacet = poids * (tete.lacet.x - lacetClip), dTangage = poids * (tete.tangage.x - tangageClip)
      if (Math.abs(dLacet) < 1e-7 && Math.abs(dTangage) < 1e-7 && hochement === 0) return
      // l'axe du tangage : l'horizontale à gauche de la face, une fois tournée
      const l = Math.atan2(va.x, va.z) + dLacet
      vb.set(Math.sin(l), 0, Math.cos(l)).cross(HAUT).normalize()
      tourner(os.cou, dLacet * T.partCou, dTangage * T.partCou, vb)
      tourner(os.tete, dLacet * (1 - T.partCou), dTangage * (1 - T.partCou) + hochement, vb)
    }

    // ── marche, lever, s'asseoir ──
    let route = null, etape = 0, bloque = false, retenu = 0, lacetFinal = null
    let transition = null   // { t, duree, de: { x, y, z }, vers: { x, y, z }, levee: [de, vers], fin }
    function partir(vers, leveeVoulue, duree, fin) {
      transition = { t: 0, duree, de: { x: pos.x, y, z: pos.z }, vers, levee: [levee, leveeVoulue], fin }
    }
    function marcher(dt) {
      const M = R.marche
      const but = route[etape]
      const dx = but.x - pos.x, dz = but.z - pos.z, d = Math.hypot(dx, dz)
      if (d <= M.arriveeM) {
        pos.x = but.x; pos.z = but.z
        if (++etape >= route.length) arreter(false)
        return
      }
      const pas = Math.min(d, M.vitesse * dt)
      if (pas <= 0) return
      const n = moveCircle(pos, dx / d * pas, dz / d * pas, M.rayonM, obstacles)
      const fait = Math.hypot(n.x - pos.x, n.z - pos.z)
      pos.x = n.x; pos.z = n.z
      lacetVoulu = Math.atan2(-dx, -dz)
      retenu = fait < 0.2 * pas ? retenu + dt : 0
      if (retenu >= M.bloqueS) arreter(true)
    }
    function arreter(retenue) {
      route = null; bloque = retenue; retenu = 0
      if (lacetFinal != null && !retenue) lacetVoulu = lacetFinal
      pose = 'debout'
      fondu = R.clips.fonduS
      melange = new Map([[R.clips.debout, 1]]); appliquer()
    }

    // present : faux tant que la personne est absente (Sorel avant 18:30) ; createRegards la saute alors (ni témoin, ni
    // fixée), et la compte dès qu'elle entre, sans être recréé
    const personne = { id: role, categorie: categorieDe(role), x: 0, y: 0, z: 0, lacet: corps.x, present: true }
    let present = true, disposed = false
    const centreOmbre = new THREE.Vector3()
    function placer(dt) {
      group.position.set(pos.x, y, pos.z)
      group.rotation.y = corps.x + Math.PI   // le modèle regarde vers +z ; le lacet 0 regarde vers −z
      group.updateMatrixWorld(true)
      avancerCouches(dt)
      mixer.update(dt)
      couchesDeTete(dt)
      os.tete.updateWorldMatrix(true, false)
      va.setFromMatrixPosition(os.tete.matrixWorld)
      personne.x = va.x; personne.y = va.y; personne.z = va.z; personne.lacet = corps.x
      // capsule : centrée sous la tête (sousTeteM), de la tête jusqu'au buste, à l'aplomb de la tête
      group.worldToLocal(va)
      cible.position.set(va.x, va.y - C.sousTeteM, va.z)
      // ombre : au sol, sous les cuisses de qui est assis, sous les pieds de qui est debout
      const k = doux(borne(levee, 0, 1))
      const [la, pa] = R.ombre.assis, [ld, pd] = R.ombre.debout
      centreOmbre.set(0, 0.004 - y, 0.18 * (1 - k))
      ombre.position.copy(centreOmbre)
      ombre.scale.set(la + (ld - la) * k, 1, pa + (pd - pa) * k)
    }

    const patron = {
      role, modele, cfg: ch.cfg, group, model, mixer, os, cible, ombre, personne, obstacles,
      accessoire: objet,
      categorie: personne.categorie,
      get position() { return { x: pos.x, z: pos.z } },
      get lacet() { return corps.x },
      get assis() { return pose === 'assis' },
      get pose() { return pose },
      get clip() { return clipPrincipal() },
      get action() { return actionDe(clipPrincipal(), 'bas') },
      get gesteEnCours() { return geste },
      get enMarche() { return route !== null },
      get bloque() { return bloque },
      get present() { return present },

      // la tête suit ce point { x, y, z } (lu à chaque image : un objet tenu à jour sur place, l'œil de Viktor ou la tête
      // d'un autre), à 70° au plus de la face du corps ; null : elle revient au clip
      regarder(point) { tete.regard = point || null },
      // qui parle hoche la tête
      parler(oui) { tete.parle = !!oui },
      // un geste du haut du corps (PATRONS.clips.gestes), ou null : le clip de la pose revient
      geste(nom) {
        if (nom != null && !R.clips.gestes.includes(nom)) throw new Error(`patrons : geste inconnu « ${nom} »`)
        geste = nom ?? null
        fondu = R.clips.fonduS
        appliquer()
      },
      // assis : se lever, sur place (demi : à moitié, « il se lève à demi »)
      seLever({ demi = false } = {}) {
        if (pose !== 'assis') return
        const but = demi ? R.lever.demi : 1
        if (but <= levee) return
        fondu = R.lever.dureeS   // le poids des clips va du même pas que le corps : (but − levee) en dureeS × (but − levee)
        const assis = clipAssis(siegeActuel)
        melange = new Map([[assis, 1 - but], [R.clips.debout, but]].filter(([, w]) => w > 0))
        appliquer()
        const haut = hauteurSur(siegeActuel)
        partir({ x: pos.x, y: haut * (1 - but), z: pos.z }, but, R.lever.dureeS * (but - levee), () => {
          if (but === 1) { pose = 'debout'; siegeActuel = null }
        })
      },
      // debout : s'asseoir sur ce siège (on y va d'abord : le corps glisse jusqu'à lui pendant qu'il s'assoit)
      asseoir(ref) {
        if (pose === 'assis') return
        const s = siegeDe(ref)
        route = null
        siegeActuel = s
        fondu = R.lever.dureeS
        melange = new Map([[clipAssis(s), 1]])
        appliquer()
        lacetVoulu = s.lacet
        pose = 'assis'
        partir({ x: s.x, y: hauteurSur(s), z: s.z }, 0, R.lever.dureeS, () => {})
      },
      // debout : marcher par ces points ({ x, z }), au pas, contre ses obstacles ; lacet : la face voulue à l'arrivée.
      // Les points : itineraire(position, vers) de src/bar/plan.js (qui sort des boîtes où l'on est déjà, la sienne comprise)
      marcher(points, { lacet: fin = null } = {}) {
        if (pose === 'assis') throw new Error(`patrons : « ${role} » est assis, il doit se lever avant de marcher`)
        if (!points || points.length === 0) return
        route = points.map(p => ({ x: p.x, z: p.z }))
        etape = 0; bloque = false; retenu = 0; lacetFinal = fin
        pose = 'marche'
        fondu = R.clips.fonduS
        melange = new Map([[R.clips.marche, 1]]); appliquer()
      },
      // absent (Sorel avant 18:30) : ni dessiné, ni visé
      setPresent(oui) {
        present = !!oui
        personne.present = present
        group.visible = present
        if (present) cible.layers.set(0)
        else cible.layers.disableAll()
      },
      update(dt) {
        if (disposed) return
        dt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0
        if (route) marcher(dt)
        if (transition) {
          transition.t += dt
          const k = doux(borne(transition.t / transition.duree, 0, 1))
          pos.x = transition.de.x + (transition.vers.x - transition.de.x) * k
          pos.z = transition.de.z + (transition.vers.z - transition.de.z) * k
          y = transition.de.y + (transition.vers.y - transition.de.y) * k
          const [l0, l1] = transition.levee
          levee = l0 + (l1 - l0) * k
          if (transition.t >= transition.duree) { y = transition.vers.y; levee = l1; const fin = transition.fin; transition = null; fin() }
        }
        ressort(corps, corps.x + enrouler(lacetVoulu - corps.x), omegaCorps, dt)
        corps.x = enrouler(corps.x)
        placer(dt)
      },
      // l'état de la personne (accroches de développement, tests)
      etat() {
        return { role, pose, clip: clipPrincipal(), geste, levee, x: pos.x, y, z: pos.z, lacet: corps.x, enMarche: route !== null, bloque, present }
      },
      dispose() {
        if (disposed) return
        disposed = true
        mixer.stopAllAction()
        mixer.uncacheRoot(model)
        disposeObject(group)
      },
    }
    if (absent) patron.setPresent(false)
    placer(0)
    return patron
  } catch (e) {
    mixer.stopAllAction()
    mixer.uncacheRoot(model)
    disposeObject(group.children.length ? group : model)
    throw e
  }
}

// ─── Le casting ────────────────────────────────────────────────────

// Toutes les personnes du Bivouac (PATRONS.casting), sous un groupe. personnes : celles du regard (createRegards de
// src/bar/regard.js), dans l'ordre du casting, modifiées sur place à chaque image ; cibles : leurs capsules (createInteract,
// cle: 'barId'). stats() : ce que le casting dessine (§8 : ≤ 10 personnes, ≤ 300 000 triangles, ≤ 40 maillages animés).
export function creerCasting({ casting = PATRONS.casting, graine = PATRONS.graine, reglages = PATRONS, boites = BOITES } = {}) {
  const group = new THREE.Group()
  group.name = 'patrons'
  const liste = []
  try {
    for (const e of casting) {
      const p = creerPatron({ ...e, graine: graineDe(graine, e.role), reglages, boites })
      liste.push(p)
      group.add(p.group)
    }
  } catch (err) {
    liste.forEach(p => p.dispose())
    throw err
  }
  let disposed = false
  return {
    group,
    liste,
    patrons: new Map(liste.map(p => [p.role, p])),
    cibles: liste.map(p => p.cible),
    personnes: liste.map(p => p.personne),
    update(dt) {
      if (disposed) return
      for (const p of liste) p.update(dt)
    },
    stats() {
      let appels = 0, triangles = 0, animes = 0, sommetsAnimes = 0
      group.traverseVisible(o => {
        if (!o.isMesh) return
        const g = o.geometry
        appels++
        triangles += (g.index ? g.index.count : g.attributes.position.count) / 3
        if (o.isSkinnedMesh) { animes++; sommetsAnimes += g.attributes.position.count }
      })
      return { personnes: liste.filter(p => p.present).length, appels, triangles: Math.round(triangles), animes, sommetsAnimes }
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const p of liste) p.dispose()
      group.removeFromParent()
    },
  }
}
