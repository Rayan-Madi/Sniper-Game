import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { markShared } from './gfx/dispose.js'
import { progressOf } from './campaign/loading.js'

// ─── Chargement de personnages 3D (.glb) ────────────────────────────
// Chaque type de PNJ peut avoir un modèle (url) OU plusieurs (urls: [...])
// → un modèle est choisi aléatoirement à chaque apparition (variété).
// fitHeight : redimensionne automatiquement le modèle à cette hauteur (m).
// rotY      : corrige l'orientation si le modèle ne regarde pas vers +Z.
// anims     : mappe idle/walk aux noms des clips (si le modèle est animé).
//
// Pour ajouter les tiens : dépose le .glb dans public/models/ puis édite ici.
// (Voir public/models/README.txt)
// Modèles 3D réalistes AVEC animations Idle/Walk intégrées (s'animent tout seuls).
// Cibles = criminels mafia (hommes + femmes), gardes = homme de main.
// IMPORTANT : aucun modèle n'est partagé entre les rôles.
// Le commanditaire final n'a pas de modèle : il n'est jamais montré.

// Chemin RELATIF à la page (BASE_URL vaut '/' en dev, './' dans le build) :
// un chemin absolu, commençant par /models/, devient file:///C:/models/... sous Electron.
const MODEL_DIR = import.meta.env.BASE_URL + 'models/'

export const MODELS = {
  // CIBLES (criminels importants) — modèles réservés (H + F)
  // mafia_boss.glb, malgré son nom, est un soldat en tenue « vanguard » : c'est
  // une des trois variantes tirées au hasard pour toutes les cibles, pas le boss.
  // tints = variations de teinte subtiles (multiplie la texture) + heightVar = tailles
  // variées → plus jamais deux ennemis strictement identiques côte à côte
  target: {
    fitHeight: 1.85, rotY: 0, heightVar: 0.07, anims: { idle: 'Idle', walk: 'Walk' },
    tints: [0xffffff, 0xe6ecff, 0xffe9df, 0xe2f2e2, 0xf2e2ee],
    variants: [
      { url: MODEL_DIR + 'gangster_man_01.glb' },
      { url: MODEL_DIR + 'mafia_boss.glb' },
      { url: MODEL_DIR + 'mafia_woman_01.glb' },
    ],
  },
  // GARDES — modèle réservé (teintes d'uniforme légèrement différentes)
  guard: {
    url: MODEL_DIR + 'mafia_henchman.glb', fitHeight: 1.85, rotY: 0, heightVar: 0.06,
    tints: [0xffffff, 0xdde6f5, 0xf0e4d6, 0xd9ead9],
    anims: { idle: 'Idle', walk: 'Walk' },
  },
  // CIVILS (figurants) — modèles DIFFÉRENTS des cibles, déclinés en couleurs/tailles
  civilian: {
    fitHeight: 1.8, rotY: 0, heightVar: 0.12, anims: { idle: 'Idle', walk: 'Walk' },
    tints: [0xffffff, 0xccbbaa, 0xaabbcc, 0xbbaacc, 0xccaa99],
    variants: [
      { url: MODEL_DIR + 'gangster_man_02.glb' },
      { url: MODEL_DIR + 'mafia_woman_02.glb' },
      { url: MODEL_DIR + 'mafia_woman_03.glb' },
    ],
  },
}

const loader = new GLTFLoader()
const cache = {}   // type -> [ {scene, animations, cfg} ]

export function hasModel(type) { return !!cache[type] }

// URL des modèles chargés pour un type, dans l'ordre du pool (relecture, tests).
export function poolUrls(type) { return (cache[type] || []).map(p => p.cfg.url) }

// Liste des variantes d'un type, chacune avec sa config (héritée du type)
function variantsFor(type, cfg) {
  const base = { ...cfg }; delete base.variants
  if (cfg.variants) return cfg.variants.map(v => ({ ...base, ...v }))
  return cfg.url ? [{ ...base }] : []
}

// Chargement en cours ou fini (spec du lot 1 §4.4) : sa promesse, s'il est terminé, et un { loaded, total, done } par
// fichier pour l'avancement. main.js le lance au démarrage ; une mission ou une manche lancée avant sa fin attend
// derrière l'écran PRÉPARATION DU DOSSIER (campaign/loading.js), sinon ses PNJ seraient procéduraux.
let loading = null
let settled = true
let files = []

// Promesse tenue quand chaque modèle est chargé ou en échec (jamais rejetée). Sans chargement lancé : déjà tenue.
export function charactersReady() { return loading || Promise.resolve() }

// Vrai quand rien n'est en cours de chargement : départ immédiat, sans écran ni attente.
export function charactersSettled() { return settled }

// Avancement de 0 à 1 : par octets reçus si chaque réponse donne sa taille, sinon par fichiers (progressOf). 1
// seulement quand tout est fini ; 1 aussi sans chargement lancé.
export function charactersProgress() { return settled ? 1 : progressOf(files) }

export function preloadCharacters() {
  const entries = Object.entries(MODELS)
  if (entries.length === 0) return Promise.resolve()
  settled = false
  files = []
  loading = Promise.all(entries.map(async ([type, cfg]) => {
    // Promise.all garde l'ordre des variantes, pas celui d'arrivée des fichiers :
    // en PvP, les deux machines tirent leurs modèles avec la même graine et
    // doivent donc avoir des pools rangés pareil.
    const loaded = await Promise.all(variantsFor(type, cfg).map(async (vcfg) => {
      const f = { loaded: 0, total: 0, done: false }
      files.push(f)
      try {
        // Avancement du FileLoader de three : total vaut 0 quand la réponse ne donne pas sa taille
        const gltf = await loader.loadAsync(vcfg.url, e => { f.loaded = e.loaded; f.total = e.lengthComputable ? e.total : 0 })
        console.log('[characters] chargé:', type, vcfg.url)
        return { scene: prepareModel(gltf.scene), animations: gltf.animations, cfg: vcfg }
      } catch (e) {
        console.warn('[characters] échec', vcfg.url, e)
        return null
      } finally {
        f.done = true
      }
    }))
    const pool = loaded.filter(Boolean)
    if (pool.length) cache[type] = pool
  })).then(() => { settled = true })
  return loading
}

// Modèle chargé, une fois pour toutes. Certains .glb (ex : gangster_man_02) exportent le matériau du CORPS en
// « transparent » alors qu'il est 100 % opaque : il rendrait en alpha-blending et le cou, le torse paraîtraient
// fantomatiques. On force l'opacité de tout matériau marqué transparent dont l'opacité vaut 1 (les cheveux, eux, sont
// à opacity 0, réellement transparents : on n'y touche pas). Puis tout est marqué partagé (spec du lot 1 §4.2) :
// géométries, matériaux et textures servent à toutes les instances (SkeletonUtils.clone les reprend par référence) et
// ne sont jamais libérés avec un PNJ.
function prepareModel(root) {
  root.traverse(o => {
    if (!o.isMesh) return
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m && m.transparent && m.opacity >= 0.99) {
        m.transparent = false; m.depthWrite = true; m.needsUpdate = true
      }
    }
  })
  return markShared(root)
}

// Personnages écartés hors champ (spec du lot 1 §4.3). three calcule la sphère englobante d'un maillage animé une
// seule fois, sur sa première pose : un bras ou une jambe qui en sort faisait disparaître le personnage en bord
// d'écran, d'où frustumCulled = false jusqu'ici (tous dessinés, même derrière la caméra). Chaque instance reçoit une
// sphère généreuse, calculée une fois : centre à mi-hauteur (au-dessus du centre de la boîte de repos), rayon de 1,25
// fois la hauteur d'ajustement. Elle est posée dans le repère du parent du modèle (pieds à y = 0), puis ramenée dans
// celui de chaque maillage animé : elle suit ensuite le PNJ, qui ne déplace que son groupe.
// Pourquoi 1,25 et non 0,75 (spec) : mesuré sommet par sommet sur les sept modèles, 25 images par clip joué, la marche
// tient dans 0,75, mais Dance (la foule de M6 et du PvP) en sort de 43 cm, Death (le corps reste 8 s) de 78 cm et Look
// de quelques millimètres. À 1,25, tous les clips joués tiennent avec au moins 11 cm de marge.
const CULL_RADIUS = 1.25
function setCullSpheres(model, height, cx, cz) {
  model.updateMatrixWorld(true)   // le modèle n'a pas encore de parent : matrixWorld mène au repère de son futur parent
  const center = new THREE.Vector3(cx, height / 2, cz)
  model.traverse(o => {
    if (!o.isSkinnedMesh) return
    const toLocal = o.matrixWorld.clone().invert()
    o.boundingSphere = new THREE.Sphere(center.clone().applyMatrix4(toLocal),
      height * CULL_RADIUS / o.matrixWorld.getMaxScaleOnAxis())
    o.frustumCulled = true
  })
}

// Instance clonée (variante au hasard, ou précise via opts.match) + mixer.
export function spawnCharacter(type, opts = {}) {
  const pool = cache[type]
  if (!pool) return null
  let candidates = pool
  if (opts.match) {
    const filtered = pool.filter(p => p.cfg.url.includes(opts.match))
    if (filtered.length) candidates = filtered
  }
  const pick = candidates[Math.floor(Math.random() * candidates.length)]
  const cfg = pick.cfg
  const model = cloneSkinned(pick.scene)
  if (cfg.rotY) model.rotation.y = cfg.rotY

  // Variation de taille aléatoire (foule moins uniforme)
  const fit = (cfg.fitHeight || 0) * (1 + (cfg.heightVar ? (Math.random() - 0.5) * cfg.heightVar : 0))

  // Auto-fit : redimensionne à fitHeight et pose les pieds au sol (y=0)
  let culled = false
  if (fit) {
    model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model)
    const size = new THREE.Vector3(); box.getSize(size)
    const h = size.y || 1
    const s = fit / h
    model.scale.multiplyScalar(s)
    model.updateMatrixWorld(true)
    const box2 = new THREE.Box3().setFromObject(model)
    model.position.y -= box2.min.y                     // pieds au sol
    const c = box2.getCenter(new THREE.Vector3())
    setCullSpheres(model, fit, c.x, c.z)
    culled = true
  } else if (cfg.scale) {
    model.scale.setScalar(cfg.scale)
  }

  // Teinte de vêtements aléatoire (variété de la foule à partir d'un seul modèle). La teinte blanche laisse la texture
  // telle quelle : l'instance garde alors les matériaux du modèle (partagés). Une autre teinte copie le matériau, qui
  // est à l'instance et sera libéré avec elle (NPC.dispose) ; la copie garde les textures du modèle (Material.copy les
  // reprend par référence), mais pas la marque « partagé » que Material.clone recopie avec userData.
  let tint = null
  if (cfg.tints && cfg.tints.length) tint = cfg.tints[Math.floor(Math.random() * cfg.tints.length)]
  const recolor = tint != null && tint !== 0xffffff
  model.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true
      if (!culled) o.frustumCulled = false   // sans sphère d'instance (modèle sans fitHeight) : toujours dessiné
      if (recolor) {
        o.material = o.material.clone()
        delete o.material.userData.shared
        o.material.color = new THREE.Color(tint)
      }
    }
  })

  const mixer = new THREE.AnimationMixer(model)
  const actions = {}
  for (const clip of pick.animations) actions[clip.name] = mixer.clipAction(clip)
  const firstAction = pick.animations.length ? mixer.clipAction(pick.animations[0]) : null

  // Pas d'animation fournie ET pas noRig ? On articule le squelette nous-mêmes.
  // (noRig = modèle réaliste laissé en pose statique propre)
  const rig = (!firstAction && !cfg.noRig) ? findBones(model) : null
  return { model, mixer, actions, firstAction, rig, cfg }
}

// ─── Animation procédurale du squelette (si le .glb n'a pas de clips) ──
const BONE_EXCLUDE = /twist|hand|finger|thumb|index|middle|pinky|ring\d|vol|socket|fx|_ik|ik_|toe|ball|_end|end_|eye|jaw|ribbon|helper|ctrl|prop|weapon|root/i

// Repère les os jambe/bras (gère Unreal, Valve Biped, Mixamo)
function findBones(model) {
  const rig = {}
  model.traverse(o => {
    const raw = o.name || ''
    if (!raw) return
    const n = raw.toLowerCase()
    if (BONE_EXCLUDE.test(n)) return
    const left  = n.includes('left')  || n.includes('_l_') || n.endsWith('_l')
    const right = n.includes('right') || n.includes('_r_') || n.endsWith('_r')
    const side = left ? 'L' : right ? 'R' : null
    if (!side) return
    let part = null
    if (n.includes('upperarm')) part = 'upperArm'
    else if (n.includes('forearm') || n.includes('lowerarm')) part = 'lowerArm'
    else if (n.includes('thigh') || n.includes('upleg') || n.includes('upperleg')) part = 'upperLeg'
    else if (n.includes('calf') || n.includes('shin') || n.includes('lowerleg') ||
             (n.includes('leg') && !n.includes('upleg') && !n.includes('upperleg'))) part = 'lowerLeg'
    else if (n.includes('arm') && !n.includes('forearm')) part = 'upperArm'
    if (!part) return
    const key = part + side
    if (!rig[key]) { rig[key] = o; o.userData._restQ = o.quaternion.clone() }
  })
  return rig
}

function setBone(bone, ang, axis) {
  if (!bone) return
  bone.quaternion.copy(bone.userData._restQ)
  if (axis === 'z') bone.rotateZ(ang)
  else if (axis === 'y') bone.rotateY(ang)
  else bone.rotateX(ang)
}

// Anime un rig détecté. moving = marche/course, sinon idle léger.
export function animateRig(rig, moving, t, axis = 'x') {
  if (!rig) return
  const spd = moving ? 9 : 1.4
  const amp = moving ? 0.55 : 0.06
  const s = Math.sin(t * spd) * amp
  setBone(rig.upperLegL,  s, axis); setBone(rig.upperLegR, -s, axis)
  setBone(rig.upperArmL, -s * 0.6, axis); setBone(rig.upperArmR, s * 0.6, axis)
  // genoux : légère flexion sur le retour de jambe
  if (rig.lowerLegL) setBone(rig.lowerLegL, moving ? Math.max(0, -s) * 0.8 : 0, axis)
  if (rig.lowerLegR) setBone(rig.lowerLegR, moving ? Math.max(0, s) * 0.8 : 0, axis)
}
