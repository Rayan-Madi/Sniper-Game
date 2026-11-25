import { describe, it, expect, vi, afterEach } from 'vitest'
import * as THREE from 'three'
import { fakeMixamo } from '../shot/fakeMixamo.js'
import { markShared } from '../../src/gfx/dispose.js'
import { zonesFromSkeleton } from '../../src/shot/hitzones.js'

// Scène de la sonde de lisibilité (route ?sonde=1, spec du lot 3 §1 « 3.0 » ; plan du lot 3a, tâche S0) :
// src/gfx/sondeScene.js pose les personnages des modèles imposés sur la carte, règle l'œil et le profil (plans proche
// et lointain, brume, soleil), puis mesure chacun par un rendu d'identification : le personnage seul (sa couche three),
// en blanc uni sur noir, dans une cible de rendu de la taille du tampon de dessin (pixels rendus : 0,75 fois ceux de
// l'écran en Bas). La silhouette entière, la tête (au-dessus du bas de sa zone de tir) et le buste (des hanches au bas
// de la tête) se mesurent par plans de coupe. Le rendu WebGL lui-même se vérifie dans Chrome (la sonde mesurée contre
// le calcul de la spec) ; ici, un faux renderer relève l'état de chaque rendu.
//
// Témoin : avant la tâche S0 (commit 267ca90), un personnage ne se pose que par le tirage du jeu (spawnCharacter :
// taille au hasard selon heightVar, teinte au hasard, aucune couche, ombre toujours), les pieds sur le sol de la carte
// (groundY), et la caméra garde le profil de la carte (plan lointain à 200 m, brume de la carte) ; rien ne se mesure.
// Sans src/gfx/sondeScene.js, les tests tournent sur ces règles (regleAvant) et échouent sur elles (vus rouges).

// Faux GLTFLoader pour le tirage du jeu (règle d'avant) : chaque fichier rend un squelette Mixamo synthétique.
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const { fakeMixamo } = await import('../shot/fakeMixamo.js')
  return { GLTFLoader: class { loadAsync() { const f = fakeMixamo(); return Promise.resolve({ scene: f.scene, animations: f.animations }) } } }
})

const C = await import('../../src/characters.js')
vi.spyOn(console, 'log').mockImplementation(() => {})
await C.preloadCharacters()
vi.restoreAllMocks()

const SONDE_JS = '../../src/gfx/sonde.js'   // chemins dans des variables : Vite refuserait un fichier absent
const { mesureMasque, placesDuGroupe, capVers } = await import(/* @vite-ignore */ SONDE_JS)
  .catch(() => ({ mesureMasque: () => null, placesDuGroupe: () => [], capVers: () => 0 }))
const SCENE_JS = '../../src/gfx/sondeScene.js'
const S = await import(/* @vite-ignore */ SCENE_JS).catch(() => null)

// Règles d'avant la tâche S0.
const regleAvant = {
  // Le tirage du jeu : spawnCharacter dans le pool du modèle (taille et teinte au hasard), sans couche ni pose.
  personnageSonde: (modele) => {
    const c = C.spawnCharacter(modele.type)
    const groupe = new THREE.Group()
    groupe.add(c.model)
    return { groupe, model: c.model, mixer: c.mixer, cfg: c.cfg }
  },
  // Les pieds sur le sol de la carte (groundY), quoi qu'il y ait dessous.
  solSous: (x, z, solides, { sol = 0 } = {}) => sol,
  // Le profil de la carte, inchangé.
  appliquerProfil: () => {},
  masque: () => null,
  monterSonde: () => ({ pret: false, erreur: 'pas de sonde' }),
  POSE_S: 0.5,
}
const { personnageSonde, solSous, appliquerProfil, masque, monterSonde, POSE_S } = S ?? regleAvant

afterEach(() => vi.restoreAllMocks())

// Modèle chargé tel que loadedModel le rend : la scène partagée (marquée, comme prepareModel), ses clips et la
// configuration de son pool. Des cheveux comme ceux des GLB du jeu : transparents à opacité nulle, invisibles. Les
// pieds 30 cm au-dessus de l'origine du modèle, comme un export peut les poser : l'ajustement doit les ramener au sol.
function modeleFaux({ fitHeight = 1.85 } = {}) {
  const f = fakeMixamo()
  f.scene.position.y = 0.3
  const cheveux = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3).translate(0, 1.7, 0),
    new THREE.MeshStandardMaterial({ transparent: true, opacity: 0 }))
  cheveux.name = 'Hair'
  f.scene.add(cheveux)
  markShared(f.scene)
  return {
    scene: f.scene, animations: f.animations, type: 'civilian',
    cfg: { ...C.MODELS.civilian, url: '/models/faux.glb', fitHeight, variants: undefined },
  }
}
const maillages = racine => { const out = []; racine.traverse(o => { if (o.isMesh) out.push(o) }); return out }
const hauteur = obj => { obj.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(obj); return { h: b.max.y - b.min.y, bas: b.min.y } }

describe('personnageSonde : le modèle imposé, tel quel', () => {
  // spawnCharacter multiplie la hauteur par 1 + (hasard - 0,5) × heightVar (12 % pour le pool des civils) : la sonde
  // mesurerait un autre personnage à chaque capture.
  it('à sa hauteur d\'ajustement exacte (fitHeight), pieds au sol, quel que soit le hasard', () => {
    for (const r of [0.01, 0.99]) {
      vi.spyOn(Math, 'random').mockReturnValue(r)
      const p = personnageSonde(modeleFaux({ fitHeight: 1.8 }), { couche: 1 })
      const { h, bas } = hauteur(p.groupe)
      expect(h, `hasard ${r}`).toBeCloseTo(1.8, 6)
      expect(bas, `hasard ${r}`).toBeCloseTo(0, 6)
      vi.restoreAllMocks()
    }
  })

  it('sans teinte : les matériaux du modèle, partagés, jamais copiés', () => {
    for (const r of [0.3, 0.7]) {   // la teinte blanche est la première des teintes : 0,3 et 0,7 en tirent une autre
      vi.spyOn(Math, 'random').mockReturnValue(r)
      const modele = modeleFaux()
      const source = new Map(maillages(modele.scene).map(m => [m.name, m.material]))
      const p = personnageSonde(modele, { couche: 1 })
      for (const m of maillages(p.model)) {
        expect(m.material, `${m.name}, hasard ${r}`).toBe(source.get(m.name))
        expect(m.material.userData.shared).toBe(true)
      }
      vi.restoreAllMocks()
    }
  })

  // Les cheveux et les cils des sept GLB sont transparents à opacité nulle (prepareModel n'y touche pas) : invisibles
  // en jeu, ils ne doivent pas entrer dans le masque, qui les dessinerait en blanc plein.
  it('la couche du masque sur ses seuls maillages visibles en jeu ; tous restent dans l\'image (couche 0)', () => {
    const p = personnageSonde(modeleFaux(), { couche: 3 })
    const ms = maillages(p.model)
    expect(ms.find(m => m.name === 'Body')?.layers.isEnabled(3)).toBe(true)
    expect(ms.find(m => m.name === 'Hair')?.layers.isEnabled(3) ?? false).toBe(false)
    for (const m of ms) expect(m.layers.isEnabled(0), m.name).toBe(true)
  })

  // Spec du lot 3, §2 e : à partir de M2, les cibles ont le rôle d'ombre « civil » (aucune ombre en Moyen ni en Bas).
  it('ombre selon ce qu\'on lui dit (le rôle d\'ombre des cibles de M2 à M6)', () => {
    for (const ombre of [false, true]) {
      const p = personnageSonde(modeleFaux(), { couche: 1, ombre })
      for (const m of maillages(p.model)) expect(m.castShadow, `${m.name}, ombre ${ombre}`).toBe(ombre)
    }
  })

  it('immobile dans sa pose Idle, prise à POSE_S secondes du clip', () => {
    const modele = modeleFaux()
    const p = personnageSonde(modele, { couche: 1 })
    const action = p.mixer.existingAction(modele.animations.find(c => c.name === 'Idle'))
    expect(action, 'action Idle').toBeTruthy()
    expect(action.isRunning()).toBe(true)
    expect(action.time).toBeCloseTo(POSE_S, 9)
  })
})

describe('solSous : les pieds sur ce qu\'il y a sous le point', () => {
  const dalle = () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(34, 0.35, 26), new THREE.MeshLambertMaterial())
    m.position.set(0, 0.17, -2)   // la dalle du quai de M3 (src/maps/m3-port.js), dessus à 0,345 m
    m.updateMatrixWorld(true)
    return m
  }

  it('sur le dessus du premier solide en descendant (la dalle du port, 0,345 m)', () => {
    expect(solSous(0, -0.5, [dalle()], { depuis: 4.3, sol: 0 })).toBeCloseTo(0.345, 6)
  })

  it('hors de tout solide : le sol de la carte', () => {
    expect(solSous(100, 100, [dalle()], { depuis: 4.3, sol: 0.2 })).toBe(0.2)
  })

  it('ce qui est au-dessus du point de départ ne compte pas (la flèche d\'une grue)', () => {
    const fleche = new THREE.Mesh(new THREE.BoxGeometry(18, 0.7, 0.7), new THREE.MeshLambertMaterial())
    fleche.position.set(0, 22, -0.5)
    fleche.updateMatrixWorld(true)
    expect(solSous(0, -0.5, [fleche, dalle()], { depuis: 4.3, sol: 0 })).toBeCloseTo(0.345, 6)
  })
})

// Caméra, scène et soleil du jeu, avec le profil d'une carte (celle de M4 aujourd'hui : brume linéaire de 70 à 160 m).
function cadre() {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x9ab0c0)
  scene.fog = new THREE.Fog(0x9ab0c0, 70, 160)
  const sun = new THREE.DirectionalLight(0xffffff, 1)
  sun.position.set(20, 40, 10)
  return { camera, scene, sun }
}
const profil430 = { poste: [0, 37.5, 428.5], regard: [0, 1.2, 0], zoom: 20, near: 1, far: 1700, brume: { type: 'lin', debut: 150, fin: 1600 }, soleil: [4, 60, 2] }

describe('appliquerProfil : l\'œil au poste, le profil de la mission', () => {
  it('œil au poste, regard vers le point visé, champ de 60 / zoom', () => {
    const c = cadre()
    appliquerProfil(c, profil430)
    expect(c.camera.position.toArray()).toEqual([0, 37.5, 428.5])
    const vise = new THREE.Vector3(0, 1.2, 0).sub(new THREE.Vector3(0, 37.5, 428.5)).normalize()
    expect(c.camera.getWorldDirection(new THREE.Vector3()).dot(vise)).toBeGreaterThan(1 - 1e-9)
    expect(c.camera.fov).toBeCloseTo(3, 9)
    expect(c.camera.projectionMatrix.elements[5]).toBeCloseTo(1 / Math.tan(1.5 * Math.PI / 180), 6)
  })

  // Plan lointain à 200 m aujourd'hui (scene.js) : à 430 m, rien ne serait dessiné.
  it('plans proche et lointain de la mission', () => {
    const c = cadre()
    appliquerProfil(c, profil430)
    expect([c.camera.near, c.camera.far]).toEqual([1, 1700])
    expect(c.camera.projectionMatrix.elements[10]).toBeCloseTo(-(1700 + 1) / (1700 - 1), 9)
  })

  it('brume linéaire ou exponentielle, de la couleur de celle de la carte', () => {
    const c = cadre()
    appliquerProfil(c, profil430)
    expect(c.scene.fog.isFog && !c.scene.fog.isFogExp2).toBe(true)
    expect([c.scene.fog.near, c.scene.fog.far, c.scene.fog.color.getHex()]).toEqual([150, 1600, 0x9ab0c0])
    const d = cadre()
    appliquerProfil(d, { ...profil430, brume: { type: 'exp2', densite: 0.0035 } })
    expect(d.scene.fog.isFogExp2).toBe(true)
    expect([d.scene.fog.density, d.scene.fog.color.getHex()]).toEqual([0.0035, 0x9ab0c0])
  })

  it('soleil déplacé', () => {
    const c = cadre()
    appliquerProfil(c, profil430)
    expect(c.sun.position.toArray()).toEqual([4, 60, 2])
  })

  it('un champ absent garde ce que la carte a posé', () => {
    const c = cadre()
    const brume = c.scene.fog
    appliquerProfil(c, { poste: [0, 20, 130], regard: [0, 1, -4], zoom: 12, near: null, far: null, brume: null, soleil: null })
    expect([c.camera.near, c.camera.far]).toEqual([0.1, 200])
    expect(c.scene.fog).toBe(brume)
    expect(c.sun.position.toArray()).toEqual([20, 40, 10])
    expect(c.camera.fov).toBeCloseTo(5, 9)
  })
})

// Faux renderer : relève l'état de la scène, de la caméra et du renderer à chaque rendu ; dessin(rendu) rend les
// pixels (RGBA, lignes du bas vers le haut) que readRenderTargetPixels copie, ou null (rien d'allumé).
function fauxRenderer({ largeur = 64, hauteur = 48, dessin = () => null } = {}) {
  const etat = { cible: null, couleur: new THREE.Color(0x123456), alpha: 0.5 }
  const vus = []
  return {
    vus,
    localClippingEnabled: false,
    getDrawingBufferSize: v => v.set(largeur, hauteur),
    getPixelRatio: () => 1,
    getRenderTarget: () => etat.cible,
    setRenderTarget(c) { etat.cible = c },
    getClearColor: c => c.copy(etat.couleur),
    getClearAlpha: () => etat.alpha,
    setClearColor(c, a = 1) { etat.couleur = new THREE.Color(c); etat.alpha = a },
    clear() {},
    render(scene, camera) {
      vus.push({
        cible: etat.cible, fond: scene.background, brume: scene.fog, remplace: scene.overrideMaterial,
        plans: scene.overrideMaterial ? scene.overrideMaterial.clippingPlanes : null, coupe: this.localClippingEnabled,
        couches: camera.layers.mask, couleur: etat.couleur.getHex(), alpha: etat.alpha,
      })
    },
    readRenderTargetPixels(cible, x, y, w, h, buf) { const d = dessin(vus[vus.length - 1], w, h); if (d) buf.set(d) },
  }
}
// Rectangle allumé (x0..x1, y0..y1, y depuis le haut), au format de readPixels.
function rect(w, h, x0, x1, y0, y1) {
  const px = new Uint8Array(w * h * 4)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px[((h - 1 - y) * w + x) * 4] = 255
  return px
}

describe('masque : le rendu d\'identification d\'un personnage', () => {
  const ctx = (renderer) => {
    const { camera, scene } = cadre()
    return { renderer, camera, scene }
  }

  it('le personnage seul (sa couche), blanc uni sur noir, sans fond ni brume, dans une cible de la taille du tampon', () => {
    const r = fauxRenderer({ largeur: 64, hauteur: 48 })
    masque(ctx(r), 2)
    expect(r.vus).toHaveLength(1)
    const v = r.vus[0]
    expect(v.couches).toBe(1 << 2)
    expect([v.fond, v.brume]).toEqual([null, null])
    expect(v.remplace.isMeshBasicMaterial).toBe(true)
    expect(v.remplace.color.getHex()).toBe(0xffffff)
    expect(v.remplace.fog).toBe(false)
    expect(v.cible && v.cible.isWebGLRenderTarget).toBe(true)
    expect([v.cible.width, v.cible.height]).toEqual([64, 48])
    expect([v.couleur, v.alpha]).toEqual([0x000000, 1])
  })

  it('rend la mesure du masque lu', () => {
    const r = fauxRenderer({ largeur: 64, hauteur: 48, dessin: (v, w, h) => rect(w, h, 30, 33, 5, 40) })
    expect(masque(ctx(r), 1)).toEqual(mesureMasque(rect(64, 48, 30, 33, 5, 40), 64, 48))
    expect(masque(ctx(r), 1).hauteur).toBe(36)
  })

  it('plans de coupe : pendant ce rendu seulement, avec la coupe locale allumée', () => {
    const r = fauxRenderer()
    const plan = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.5)
    masque(ctx(r), 1, [plan])
    expect(r.vus[0].plans).toEqual([plan])
    expect(r.vus[0].coupe).toBe(true)
  })

  it('tout est remis ensuite : fond, brume, matériau, couches, cible, couleur de fond, coupe', () => {
    const r = fauxRenderer()
    const c = ctx(r)
    const avant = { fond: c.scene.background, brume: c.scene.fog, couches: c.camera.layers.mask }
    masque(c, 2, [new THREE.Plane()])
    expect(c.scene.background).toBe(avant.fond)
    expect(c.scene.fog).toBe(avant.brume)
    expect(c.scene.overrideMaterial).toBeNull()
    expect(c.camera.layers.mask).toBe(avant.couches)
    expect(r.getRenderTarget()).toBeNull()
    expect(r.getClearColor(new THREE.Color()).getHex()).toBe(0x123456)
    expect(r.getClearAlpha()).toBe(0.5)
    expect(r.localClippingEnabled).toBe(false)
  })

  it('remis aussi quand le rendu échoue', () => {
    const r = fauxRenderer()
    r.render = () => { throw new Error('contexte perdu') }
    const c = ctx(r)
    const fond = c.scene.background
    expect(() => masque(c, 2)).toThrow('contexte perdu')
    expect(c.scene.background).toBe(fond)
    expect(c.scene.overrideMaterial).toBeNull()
    expect(c.camera.layers.mask).toBe(1)
    expect(r.getRenderTarget()).toBeNull()
  })

  it('la cible de rendu et le matériau blanc sont libérés', () => {
    const cibles = vi.spyOn(THREE.WebGLRenderTarget.prototype, 'dispose')
    const materiaux = vi.spyOn(THREE.MeshBasicMaterial.prototype, 'dispose')
    masque(ctx(fauxRenderer()), 1)
    expect(cibles).toHaveBeenCalledTimes(1)
    expect(materiaux).toHaveBeenCalledTimes(1)
  })
})

describe('monterSonde : la scène de la sonde, mesurée', () => {
  // Ce que rend la carte de M4 (src/maps/m4-base.js) : son sol et ses ancres, l'œil et le regard de son poste.
  const carte = { groundY: 0.2, ancres: { oeil: [0, 14.5, 21], regard: [0, 1, -6] } }
  const config = { ...profil430, modeles: ['verne', 'halder', 'rossi'], ecart: 5, carte: 4, qualite: 'bas' }
  // Le sol solide sous les cibles (0,25 m : la peinture épaisse de l'hélipad de M4) n'est pas le sol de la carte
  // (groundY, 0,2 m, le tarmac) : les pieds vont sur ce qu'il y a dessous.
  const sol = () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial())
    m.rotation.x = -Math.PI / 2
    m.position.y = 0.25
    m.updateMatrixWorld(true)
    return m
  }
  // Silhouette de 30 px, tête de 5 px, buste de 12 px de large dans le faux tampon (selon les plans de coupe du rendu).
  const dessin = (v, w, h) => (!v.plans ? rect(w, h, 10, 15, 4, 33) : v.plans.length === 1 ? rect(w, h, 11, 14, 4, 8) : rect(w, h, 8, 19, 9, 16))
  const monter = (cfg = config, deps = {}) => {
    const c = cadre()
    const renderer = fauxRenderer({ largeur: 96, hauteur: 54, dessin })
    const modeles = new Map()
    const etat = monterSonde({ ...c, renderer }, cfg, {
      carte, solides: [sol()], ombre: false, fenetre: [1920, 1080],
      modele: nom => (['verne', 'halder', 'rossi'].includes(nom) ? (modeles.get(nom) || modeles.set(nom, modeleFaux()).get(nom)) : null),
      ...deps,
    })
    return { ...c, renderer, etat }
  }
  const groupes = scene => scene.children.filter(o => o.isGroup)

  it('un personnage par modèle, côte à côte sous le point regardé, tourné vers le poste, les pieds sur le sol', () => {
    const { scene } = monter()
    const g = groupes(scene)
    expect(g).toHaveLength(3)
    const places = placesDuGroupe(config.regard, config.poste, 3, 5)
    g.forEach((o, i) => {
      expect(o.position.x).toBeCloseTo(places[i][0], 9)
      expect(o.position.z).toBeCloseTo(places[i][1], 9)
      expect(o.position.y).toBeCloseTo(0.25, 6)
      expect(o.rotation.y).toBeCloseTo(capVers(places[i], [config.poste[0], config.poste[2]]), 9)
    })
  })

  it('chacun mesuré par trois rendus (silhouette, tête, buste), puis l\'image de la sonde, rendue en dernier comme le jeu', () => {
    const { renderer, scene } = monter()
    expect(renderer.vus).toHaveLength(3 * 3 + 1)
    expect(renderer.vus.slice(0, 9).map(v => v.couches)).toEqual([2, 2, 2, 4, 4, 4, 8, 8, 8])
    const dernier = renderer.vus[9]
    expect(dernier.cible).toBeNull()
    expect(dernier.remplace).toBeNull()
    expect(dernier.couches).toBe(1)
    expect(dernier.fond).toBe(scene.background)
  })

  // Bas de la tête : le bas de ses zones de tir (crâne et bas du visage, src/shot/hitzones.js) ; hanches : le bas du
  // torse. La tête est ce qui dépasse au-dessus, le buste ce qui est entre les deux.
  it('la tête au-dessus du bas de ses zones, le buste des hanches au bas de la tête', () => {
    const { renderer, scene } = monter({ ...config, modeles: ['verne'] })
    const [perso] = groupes(scene)
    const zones = zonesFromSkeleton(perso.children[0])
    const teteBas = Math.min(...zones.filter(z => z.part === 'tete').map(z => Math.min(z.a.y, z.b.y) - z.r))
    const hanches = Math.min(...zones.filter(z => z.part === 'torse').map(z => Math.min(z.a.y, z.b.y)))
    const [sil, tete, buste] = renderer.vus
    expect(sil.plans).toBeNull()
    expect(tete.plans).toHaveLength(1)
    expect(tete.plans[0].normal.toArray()).toEqual([0, 1, 0])
    expect(tete.plans[0].constant).toBeCloseTo(-teteBas, 9)
    expect(buste.plans).toHaveLength(2)
    expect(buste.plans[0].normal.toArray()).toEqual([0, 1, 0])
    expect(buste.plans[0].constant).toBeCloseTo(-hanches, 9)
    expect(buste.plans[1].normal.toArray()).toEqual([0, -1, 0])
    expect(buste.plans[1].constant).toBeCloseTo(teteBas, 9)
    expect(hanches).toBeLessThan(teteBas)
  })

  it('l\'état rendu : prêt, chaque personnage avec ses mesures en pixels du tampon, sa distance et la taille attendue', () => {
    const { etat } = monter()
    expect(etat.pret).toBe(true)
    expect(etat.erreur).toBeNull()
    expect(etat.ecran).toEqual({ fenetre: [1920, 1080], tampon: [96, 54], densite: 1 })
    expect(etat.personnages.map(p => p.modele)).toEqual(['verne', 'halder', 'rossi'])
    const p = etat.personnages[1]
    expect(p.silhouette).toEqual({ hauteur: 30, largeur: 6 })
    expect(p.tete).toEqual({ hauteur: 5, largeur: 4 })
    expect(p.torse).toEqual({ hauteur: 8, largeur: 12 })
    expect(p.distanceM).toBeCloseTo(Math.hypot(37.5 - (0.25 + 1.85 / 2), 428.5), 2)   // au centimètre
    expect(p.attendu.silhouette).toBeGreaterThan(0)
  })

  it('modèle inconnu : la sonde le dit et ne pose personne', () => {
    const { etat, scene, renderer } = monter({ ...config, modeles: ['verne', 'fantome'] })
    expect(etat.pret).toBe(false)
    expect(etat.erreur).toMatch(/inconnu.*fantome/)
    expect(groupes(scene)).toHaveLength(0)
    expect(renderer.vus).toHaveLength(0)
  })

  // Une couche three par personnage, de 1 à 31 (la couche 0 est celle de l'image) : au-delà, Layers.enable(32)
  // retomberait sur la couche 0 (1 << 32 vaut 1) et le masque compterait toute la scène.
  it('plus de 31 personnages : la sonde le refuse et ne pose personne', () => {
    const trop = Array.from({ length: 32 }, () => 'verne')
    const { etat, scene, renderer } = monter({ ...config, modeles: trop })
    expect(etat.pret).toBe(false)
    expect(etat.erreur).toMatch(/31/)
    expect(groupes(scene)).toHaveLength(0)
    expect(renderer.vus).toHaveLength(0)
    expect(monter({ ...config, modeles: trop.slice(0, 31) }).etat.pret).toBe(true)
  })

  it('sans poste ni regard : ceux de la carte ; sans zoom : ×4, celui du départ d\'une mission', () => {
    const { camera } = monter({ ...config, poste: null, regard: null, zoom: null, modeles: [] })
    expect(camera.position.toArray()).toEqual([0, 14.5, 21])
    expect(camera.fov).toBeCloseTo(15, 9)
  })

  it('sans carte (sol nu) : un grand sol, et les pieds dessus', () => {
    const { scene } = monter({ ...config, modeles: ['verne'] }, { carte: null, solides: [] })
    const sols = scene.children.filter(o => o.isMesh && o.userData.solid && o.userData.surface === 'sol')
    expect(sols).toHaveLength(1)
    expect(groupes(scene)[0].position.y).toBeCloseTo(0, 6)
  })
})
