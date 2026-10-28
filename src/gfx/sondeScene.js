// ─── Sonde de lisibilité : la scène et sa mesure (route de développement ?sonde=1, spec du lot 3 §1 « 3.0 ») ──────
// main.js monte la carte (ou un sol nu) et attend les modèles ; ce module pose l'œil et le profil de la mission (plans
// proche et lointain, brume, soleil, zoom de la lunette), les personnages des modèles imposés côte à côte sous le
// point regardé, puis mesure chacun par un rendu d'identification : le personnage seul (sa couche three), en blanc
// uni sur noir, dans une cible de rendu de la taille du tampon de dessin. Ce sont donc des pixels réellement rendus :
// 0,75 fois ceux de l'écran en Bas (spec §4 : « silhouette ≥ 80 px et signe ≥ 10 px en Bas »). Enfin il rend l'image
// de la sonde, qui reste à l'écran pour la capture (scripts/capture-mission.mjs, cible sonde).
// Ressources : les personnages clonent les modèles du jeu (géométries, matériaux et textures partagés, jamais copiés
// ni libérés) ; la page de la sonde ne sert qu'à elle et n'est jamais rendue au jeu, rien n'y est donc démonté.
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { zonesFromSkeleton } from '../shot/hitzones.js'
import { BASE_FOV } from '../aim.js'
import { mesureMasque, placesDuGroupe, capVers, plongeeDeg, pixelsAttendus } from './sonde.js'

// Instant du clip Idle (s) où la pose des personnages est prise : debout, bras le long du corps.
export const POSE_S = 0.5

// Zoom de la lunette quand l'adresse n'en donne pas : celui du départ d'une mission (main.js, mountLevel).
const ZOOM_DEPART = 4

// Une couche three par personnage, de 1 à 31 : la couche 0 est celle de l'image, et three n'en a que 32
// (Layers.enable(32) retomberait sur la couche 0).
const PERSONNAGES_MAX = 31

// Visible en jeu : ni caché, ni transparent à opacité nulle (cheveux et cils des sept GLB : prepareModel n'y touche
// pas, characters.js). Le masque, qui dessine tout en blanc plein, ne doit pas les compter.
function visibleEnJeu(o) {
  const ms = Array.isArray(o.material) ? o.material : [o.material]
  return ms.every(m => m && m.visible !== false && !(m.transparent && m.opacity < 0.01))
}

// Personnage de la sonde, depuis un modèle chargé (loadedModel de characters.js : { scene, animations, cfg }) : cloné
// comme un PNJ (spawnCharacter), mais à sa hauteur d'ajustement exacte (cfg.fitHeight, sans la variation heightVar),
// sans teinte (les matériaux du modèle, partagés), immobile dans sa pose Idle (POSE_S), les pieds en y = 0 de son
// groupe. couche : sa couche de masque, posée sur ses seuls maillages visibles en jeu (tous restent dans la couche 0,
// celle de l'image). ombre : projette-t-il une ombre (le rôle d'ombre « civil » des cibles de M2 à M6, spec du lot 3
// §2 e : aucune en Moyen ni en Bas).
export function personnageSonde(modele, { couche, ombre = false }) {
  const { cfg } = modele
  const model = cloneSkinned(modele.scene)
  if (cfg.rotY) model.rotation.y = cfg.rotY
  // Ajustement comme spawnCharacter : boîte du modèle au repos, mise à la hauteur voulue, pieds au sol
  model.updateMatrixWorld(true)
  const boite = new THREE.Box3().setFromObject(model)
  model.scale.multiplyScalar((cfg.fitHeight || 1.8) / ((boite.max.y - boite.min.y) || 1))
  model.updateMatrixWorld(true)
  model.position.y -= new THREE.Box3().setFromObject(model).min.y
  model.traverse(o => {
    if (!o.isMesh) return
    o.frustumCulled = false
    o.castShadow = ombre
    if (visibleEnJeu(o)) o.layers.enable(couche)
  })
  const mixer = new THREE.AnimationMixer(model)
  const nomIdle = (cfg.anims && cfg.anims.idle) || 'Idle'
  const idle = modele.animations.find(c => c.name === nomIdle) || modele.animations.find(c => c.name === 'Idle')
  if (idle) {
    mixer.clipAction(idle).play()
    mixer.update(POSE_S)
  }
  const groupe = new THREE.Group()
  groupe.add(model)
  return { groupe, model, mixer, cfg, couche }
}

// Hauteur (m) de ce qu'il y a sous (x, z) : le dessus du premier solide rencontré en descendant depuis y = depuis
// (la dalle du quai, le tarmac, la route), sinon sol (le sol de la carte, groundY).
export function solSous(x, z, solides, { depuis, sol = 0 }) {
  const rc = new THREE.Raycaster(new THREE.Vector3(x, depuis, z), new THREE.Vector3(0, -1, 0))
  const hit = rc.intersectObjects(solides, false)[0]
  return hit ? hit.point.y : sol
}

// Œil au poste, regard vers le point visé, champ de la lunette (60 / zoom), puis le profil de la mission : plans
// proche et lointain, brume (de la couleur de celle en place, ou du fond), position du soleil. Un champ nul garde ce
// qui est en place : la carte avec le profil de sa mission (main.js le pose après elle ; la carte ne pose plus de
// brume depuis la tâche A3 du lot 3a), ou le sol nu.
export function appliquerProfil({ camera, scene, sun }, { poste, regard, zoom, near, far, brume, soleil }) {
  camera.position.set(...poste)
  camera.lookAt(...regard)
  camera.fov = BASE_FOV / zoom
  if (near) camera.near = near
  if (far) camera.far = far
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  if (brume) {
    const couleur = scene.fog ? scene.fog.color.clone()
      : scene.background && scene.background.isColor ? scene.background.clone() : new THREE.Color(0x87a0b0)
    scene.fog = brume.type === 'lin' ? new THREE.Fog(couleur, brume.debut, brume.fin) : new THREE.FogExp2(couleur, brume.densite)
  }
  if (soleil) sun.position.set(...soleil)
}

// Rendu d'identification : seuls les maillages de la couche `couche` (un personnage), en blanc uni (sans brume) sur
// fond noir, dans une cible de rendu de la taille du tampon de dessin ; plans : plans de coupe (monde) qui ne gardent
// qu'une partie du corps. Rend la boîte des pixels allumés (mesureMasque), ou null. Fond, brume, matériau de la scène,
// couches de la caméra, cible et couleur de fond du renderer, coupe locale : tout est remis ensuite, même si le rendu
// échoue ; la cible et le matériau blanc sont libérés.
export function masque({ renderer, scene, camera }, couche, plans = []) {
  const taille = renderer.getDrawingBufferSize(new THREE.Vector2())
  const cible = new THREE.WebGLRenderTarget(taille.x, taille.y)
  const blanc = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })
  blanc.clippingPlanes = plans.length ? plans : null
  const avant = {
    fond: scene.background, brume: scene.fog, materiau: scene.overrideMaterial, couches: camera.layers.mask,
    cible: renderer.getRenderTarget(), couleur: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
    coupe: renderer.localClippingEnabled,
  }
  try {
    scene.background = null
    scene.fog = null
    scene.overrideMaterial = blanc
    camera.layers.set(couche)
    renderer.localClippingEnabled = true
    renderer.setRenderTarget(cible)
    renderer.setClearColor(0x000000, 1)
    renderer.render(scene, camera)
    const pixels = new Uint8Array(taille.x * taille.y * 4)
    renderer.readRenderTargetPixels(cible, 0, 0, taille.x, taille.y, pixels)
    return mesureMasque(pixels, taille.x, taille.y)
  } finally {
    scene.background = avant.fond
    scene.fog = avant.brume
    scene.overrideMaterial = avant.materiau
    camera.layers.mask = avant.couches
    renderer.setRenderTarget(avant.cible)
    renderer.setClearColor(avant.couleur, avant.alpha)
    renderer.localClippingEnabled = avant.coupe
    cible.dispose()
    blanc.dispose()
  }
}

const dims = m => (m ? { hauteur: m.hauteur, largeur: m.largeur } : null)
const garderAuDessus = y => new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)
const garderEnDessous = y => new THREE.Plane(new THREE.Vector3(0, -1, 0), y)

// Mesures d'un personnage posé : sa silhouette entière, sa tête (ce qui dépasse au-dessus du bas de ses zones de tir,
// crâne et bas du visage, src/shot/hitzones.js) et son buste (des hanches au bas de la tête), en pixels rendus ; sa
// distance à l'œil et la plongée (vers le milieu de sa hauteur), et la silhouette que le calcul de la spec attend.
function mesurerPersonnage(ctx, perso, { poste, zoom, tamponH }) {
  const zones = zonesFromSkeleton(perso.model)
  const tetes = zones.filter(z => z.part === 'tete'), torses = zones.filter(z => z.part === 'torse')
  const teteBas = tetes.length ? Math.min(...tetes.map(z => Math.min(z.a.y, z.b.y) - z.r)) : null
  const hanches = torses.length ? Math.min(...torses.map(z => Math.min(z.a.y, z.b.y))) : null
  const silhouette = masque(ctx, perso.couche)
  const tete = teteBas == null ? null : masque(ctx, perso.couche, [garderAuDessus(teteBas)])
  const torse = teteBas == null || hanches == null ? null : masque(ctx, perso.couche, [garderAuDessus(hanches), garderEnDessous(teteBas)])
  const taille = perso.cfg.fitHeight || 1.8
  const milieu = [perso.groupe.position.x, perso.groupe.position.y + taille / 2, perso.groupe.position.z]
  const distanceM = Math.hypot(milieu[0] - poste[0], milieu[1] - poste[1], milieu[2] - poste[2])
  const plongee = plongeeDeg(poste, milieu)
  return {
    modele: perso.nom, position: perso.groupe.position.toArray().map(v => +v.toFixed(3)),
    distanceM: +distanceM.toFixed(2), plongeeDeg: +plongee.toFixed(2), tailleM: taille,
    silhouette: dims(silhouette), tete: dims(tete), torse: dims(torse),
    attendu: { silhouette: +pixelsAttendus(taille, distanceM, zoom, tamponH, plongee).toFixed(1) },
  }
}

// Sol nu (carte=nu) : un plan de 4 km, solide comme un sol de carte, sous un ciel uni et sa brume.
export function solNu(scene) {
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: 0x8a8a7a }))
  sol.rotation.x = -Math.PI / 2
  sol.receiveShadow = true
  sol.userData.solid = true
  sol.userData.surface = 'sol'
  scene.add(sol)
  sol.updateMatrixWorld(true)
  scene.background = new THREE.Color(0x9ab0c0)
  scene.fog = new THREE.Fog(0x9ab0c0, 150, 1600)
  return sol
}

// La sonde montée et mesurée, sur la carte déjà construite (carte : ce que son constructeur a rendu, groundY et ancres,
// dont oeil et regard, ceux du poste de ses missions ; null pour un sol nu). config : lireSonde (src/gfx/sonde.js).
// deps : solides (maillages qui portent les pieds : solidMeshes() de la carte), modele(nom) (loadedModel de
// characters.js), ombre (les personnages en projettent-ils une), fenetre ([largeur, hauteur] de l'écran, pour le
// relevé). Rend l'état publié par __sonde() : { pret, erreur, config, poste, regard, zoom, ecran, personnages }. Un
// modèle inconnu : pret faux, rien n'est posé.
export function monterSonde(ctx, config, { carte, solides = [], modele, ombre = false, fenetre = null }) {
  const { renderer, scene, camera } = ctx
  const info = carte || {}
  const ancres = info.ancres || {}
  const poste = config.poste || ancres.oeil || [0, 8, 30]
  const regard = config.regard || ancres.regard || [0, 1, 0]
  const zoom = config.zoom || ZOOM_DEPART
  if (config.modeles.length > PERSONNAGES_MAX) {
    return { pret: false, erreur: `au plus ${PERSONNAGES_MAX} personnages (${config.modeles.length} demandés)`, config }
  }
  const modeles = config.modeles.map(nom => ({ nom, m: modele(nom) }))
  const inconnu = modeles.find(x => !x.m)
  if (inconnu) return { pret: false, erreur: `modèle inconnu : ${inconnu.nom}`, config }

  const sols = carte ? solides : [solNu(scene)]
  appliquerProfil(ctx, { ...config, poste, regard, zoom })
  scene.updateMatrixWorld(true)
  const places = placesDuGroupe(regard, poste, modeles.length, config.ecart)
  const persos = modeles.map(({ nom, m }, i) => {
    const p = personnageSonde(m, { couche: i + 1, ombre })
    const [x, z] = places[i]
    p.groupe.position.set(x, solSous(x, z, sols, { depuis: regard[1] + 3, sol: info.groundY || 0 }), z)
    p.groupe.rotation.y = capVers([x, z], [poste[0], poste[2]])
    scene.add(p.groupe)
    return { ...p, nom }
  })
  scene.updateMatrixWorld(true)

  const tampon = renderer.getDrawingBufferSize(new THREE.Vector2())
  const personnages = persos.map(p => mesurerPersonnage(ctx, p, { poste, zoom, tamponH: tampon.y }))
  renderer.render(scene, camera)   // l'image de la sonde, qui reste à l'écran pour la capture
  return {
    pret: true, erreur: null, config, poste, regard, zoom,
    ecran: { fenetre, tampon: [tampon.x, tampon.y], densite: renderer.getPixelRatio() },
    personnages,
  }
}
