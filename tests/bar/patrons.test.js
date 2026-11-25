// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import * as THREE from 'three'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PATRONS } from '../../src/bar/reglages.js'
import { SIEGES, BOITES, ANCRES, PLACES, itineraire } from '../../src/bar/plan.js'
import { forwardOf } from '../../src/prologue/fpsController.js'
import { createInteract } from '../../src/prologue/interact.js'
import { trackDisposals } from '../gfx/fakeRenderer.js'
import { resourcesOf, countDisposals } from '../gfx/fakeGltf.js'

// Les patrons du Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.2, §8, §10 ; plan
// docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B10). Sous Node : les trois modèles du bar (mafia_boss,
// gangster_man_02, mafia_woman_03) sont les vrais GLB du dépôt, lus par GLTFLoader (les textures échouent sans bruit, la
// géométrie, les os et les clips suffisent) ; les quatre autres, que le bar n'emploie pas, sont le personnage synthétique
// de tests/gfx/fakeGltf.js. Chaque test de comportement a été vu rouge sur le témoin écrit à côté de son assertion,
// glissé seul dans le module fini (sorties dans shots/bar/b10/temoins/, hors dépôt).

const DIR = resolve(__dirname, '../../public/models')
const REELS = ['mafia_boss', 'gangster_man_02', 'mafia_woman_03']
const gltf = vi.hoisted(() => ({ echec: new Set(), reels: [], charges: [], buffers: new Map() }))
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async importOriginal => {
  const orig = await importOriginal()
  const { fakeCharacter } = await import('../gfx/fakeGltf.js')
  const { readFileSync: lire } = await import('node:fs')
  const { resolve: chemin } = await import('node:path')
  const parse = nom => {
    if (!gltf.buffers.has(nom)) gltf.buffers.set(nom, lire(chemin(__dirname, '../../public/models', nom + '.glb')))
    const buf = gltf.buffers.get(nom)
    return new Promise((ok, ko) => new orig.GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', ok, ko))
  }
  return {
    GLTFLoader: class {
      async loadAsync(url) {
        if ([...gltf.echec].some(k => url.includes(k))) throw new Error(`échec simulé : ${url}`)
        const reel = gltf.reels.find(k => url.endsWith(`/${k}.glb`))
        const g = reel ? await parse(reel) : fakeCharacter()
        gltf.charges.push({ url, ...g })
        return g
      }
    },
  }
})

// Le spawnCharacter du casting strict du lot 3 (tâche A6, dans main depuis a2e3fca) ne lit plus `match` : un modèle s'y
// impose par `model`, sinon il est tiré dans le pool de son rôle. lot3 : ce choix-là, imité sur le characters.js de la
// branche (qui n'a que `match`, et à qui l'on passe aussi `model` : le test tient encore une fois main fusionnée). Ses
// tirages ne sont pas ceux de main (main ne tire pas le modèle imposé) : les tailles de main sont couvertes à part, aux
// deux bouts de heightVar (« portés par leur siège quelle que soit leur taille »).
const casting3 = vi.hoisted(() => ({ lot3: false }))
vi.mock('../../src/characters.js', async importOriginal => {
  const orig = await importOriginal()
  return {
    ...orig,
    spawnCharacter(type, opts = {}) {
      if (!casting3.lot3) return orig.spawnCharacter(type, opts)
      const fichier = opts.model === undefined ? null : String(opts.model).split('/').pop().replace(/\.glb$/i, '')
      return orig.spawnCharacter(type, fichier ? { match: `/${fichier}.glb`, model: opts.model } : {})
    },
  }
})
// fixe : withSeed rend ce nombre à chaque tirage (Math.random constant) : la taille de characters.js à l'un des bouts de
// heightVar (0 : la plus petite ; presque 1 : la plus grande), quel que soit l'ordre des tirages ; null : withSeed lui-même.
const tirage = vi.hoisted(() => ({ fixe: null }))
vi.mock('../../src/gfx/memtest.js', async importOriginal => {
  const orig = await importOriginal()
  return {
    ...orig,
    withSeed(graine, fn) {
      if (tirage.fixe == null) return orig.withSeed(graine, fn)
      const avant = Math.random
      Math.random = () => tirage.fixe
      try { return fn() } finally { Math.random = avant }
    },
  }
})

// Modules neufs (cache des modèles de characters.js, ressources déjà libérées de gfx/dispose.js), modèles chargés :
// reels, ceux qui sont lus dans leur GLB (les autres sont le personnage synthétique).
async function charger({ echec = [], reels = REELS } = {}) {
  vi.resetModules()
  gltf.echec = new Set(echec)
  gltf.reels = reels
  gltf.charges = []
  vi.stubGlobal('self', globalThis)   // GLTFLoader lit URL sur self, que Node n'a pas
  const muets = ['log', 'warn', 'error'].map(k => vi.spyOn(console, k).mockImplementation(() => {}))
  const characters = await import('../../src/characters.js')
  await characters.preloadCharacters()
  muets.forEach(s => s.mockRestore())
  vi.unstubAllGlobals()
  const patrons = await import('../../src/bar/patrons.js')
  const { withSeed } = await import('../../src/gfx/memtest.js')
  return { characters, ...patrons, withSeed }
}

const RAD = Math.PI / 180
const DT = 1 / 60
const avance = (qui, s) => { for (let i = 0, n = Math.round(s / DT); i < n; i++) qui.update(DT) }
const enfants = (racine, f) => { const out = []; racine.traverse(o => { if (f(o)) out.push(o) }); return out }
const siege = id => SIEGES.find(s => s.id === id)

// Le maillage comme vérité : chaque sommet en coordonnées monde sur la pose du moment (peau recalculée sur le processeur).
function sommets(patron, garder) {
  const out = [], v = new THREE.Vector3()
  patron.group.updateMatrixWorld(true)
  for (const m of enfants(patron.model, o => o.isSkinnedMesh)) {
    const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, pos = m.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      let j = 0
      for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, j)) j = k
      const os = m.skeleton.bones[si.getComponent(i, j)].name
      m.getVertexPosition(i, v)
      v.applyMatrix4(m.matrixWorld)
      if (garder(v, os)) out.push(v.clone())
    }
  }
  return out
}
// Le bas des fesses : le plus bas du corps au-dessus de l'assise (à 0,2 m de son centre, au-dessus des mollets)
const basDesFesses = (p, s) => Math.min(...sommets(p, v => Math.hypot(v.x - s.x, v.z - s.z) <= 0.2 && v.y > 0.2).map(v => v.y))
// Le bas des pieds : le plus bas des sommets portés par les os des pieds
const basDesPieds = p => Math.min(...sommets(p, (v, os) => /(Foot|Toe)/.test(os)).map(v => v.y))

// L'angle (degrés, signé) de la face de la tête (le +Z de l'os Head, à l'horizontale) depuis la face du corps
function lacetTete(p) {
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(p.os.tete.getWorldQuaternion(new THREE.Quaternion()))
  const c = forwardOf(p.lacet)
  return Math.atan2(c.z * f.x - c.x * f.z, c.x * f.x + c.z * f.z) / RAD
}
// Le tangage (degrés) de la face de la tête : positif vers le haut
function tangageTete(p) {
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(p.os.tete.getWorldQuaternion(new THREE.Quaternion()))
  return Math.asin(f.y) / RAD
}
const point = o => o.getWorldPosition(new THREE.Vector3())

// ─── Os trouvés par leur nom ───────────────────────────────────────
// Les os d'un modèle, tels que GLTFLoader les nomme (deux-points retirés : « mixamorig2:Head » devient « mixamorig2Head »),
// rangés comme dans l'en-tête JSON du GLB.
function squelette(fichier) {
  const buf = readFileSync(resolve(DIR, fichier))
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'))
  const noeuds = json.nodes.map(n => { const o = n.mesh != null ? new THREE.Object3D() : new THREE.Bone(); o.name = THREE.PropertyBinding.sanitizeNodeName(n.name || ''); return o })
  json.nodes.forEach((n, i) => (n.children || []).forEach(c => noeuds[i].add(noeuds[c])))
  const racine = new THREE.Group()
  for (const i of json.scenes[json.scene || 0].nodes) racine.add(noeuds[i])
  return racine
}

describe('les os de la tête, du cou, de la main droite et du bassin', () => {
  let trouverOs
  beforeAll(async () => { ({ trouverOs } = await import('../../src/bar/patrons.js')) })
  for (const [fichier, prefixe] of [['mafia_boss.glb', 'mixamorig'], ['mafia_woman_03.glb', 'mixamorig2'],
    ['mafia_woman_02.glb', 'mixamorig8'], ['gangster_man_02.glb', 'mixamorig12']]) {
    it(`${fichier} (« ${prefixe} ») : Head, Neck, RightHand et Hips, jamais HeadTop_End ni un doigt`, () => {
      const racine = squelette(fichier)
      expect(trouverOs(racine, 'tete').name).toBe(`${prefixe}Head`)     // témoin : recherche de « head » qui prend HeadTop_End
      expect(trouverOs(racine, 'cou').name).toBe(`${prefixe}Neck`)
      expect(trouverOs(racine, 'mainDroite').name).toBe(`${prefixe}RightHand`)
      expect(trouverOs(racine, 'hanches').name).toBe(`${prefixe}Hips`)
      expect(() => trouverOs(new THREE.Group(), 'tete')).toThrow(/Head/)
    })
  }
})

// ─── Le casting, sur les en-têtes des GLB ──────────────────────────
// Les comptes de chaque modèle, lus dans son en-tête : triangles, maillages animés (un par primitive d'un nœud à
// peau : three en fait un SkinnedMesh chacune) et leurs sommets.
function comptes(modele) {
  const buf = readFileSync(resolve(DIR, `${modele}.glb`))
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'))
  let triangles = 0, animes = 0, sommetsAnimes = 0
  for (const n of json.nodes) {
    if (n.mesh == null) continue
    for (const p of json.meshes[n.mesh].primitives) {
      triangles += json.accessors[p.indices].count / 3
      if (n.skin != null) { animes++; sommetsAnimes += json.accessors[p.attributes.POSITION].count }
    }
  }
  return { triangles, animes, sommetsAnimes }
}
function budget(casting) {
  const t = { personnes: casting.length, triangles: 0, animes: 0, sommetsAnimes: 0 }
  for (const c of casting) { const k = comptes(c.modele); t.triangles += k.triangles; t.animes += k.animes; t.sommetsAnimes += k.sommetsAnimes }
  return t
}

describe('le casting du Bivouac', () => {
  it('tient le budget du §8 sur les comptes des en-têtes : ≤ 10 personnes, ≤ 300 000 triangles, ≤ 40 maillages animés', () => {
    const casting = PATRONS.casting   // témoin : dix gangster_man_01 (549 330 triangles)
    const b = budget(casting)
    expect(b.personnes).toBeLessThanOrEqual(10)
    expect(b.triangles).toBeLessThanOrEqual(300000)
    expect(b.animes).toBeLessThanOrEqual(40)
    expect(b.sommetsAnimes).toBeLessThanOrEqual(300000)
    expect(casting.filter(c => c.modele === 'gangster_man_01')).toEqual([])
    // §3.2 : 5 mafia_boss, 4 gangster_man_02 (Fernand, Albert, les deux ouvriers), 1 mafia_woman_03 : 283 k triangles (282 999)
    expect(b).toEqual({ personnes: 10, triangles: 282999, animes: 36, sommetsAnimes: 267798 })
    // les modèles demandés sont ceux que characters.js connaît
    expect(new Set(casting.map(c => c.modele))).toEqual(new Set(REELS))
    // chacun à une place du plan, une seule fois
    expect(new Set(casting.map(c => c.role)).size).toBe(casting.length)
    for (const c of casting) expect(!!c.siege !== !!c.poste, c.role).toBe(true)
  })
})

// ─── Les patrons, sur les vrais modèles ────────────────────────────

describe('les patrons, sur les vrais modèles', () => {
  let m, casting
  beforeAll(async () => {
    m = await charger()
    casting = m.creerCasting()
  }, 60000)
  afterAll(() => casting && casting.dispose())
  const qui = role => casting.patrons.get(role)

  it('le casting monte dix personnes, chacune du modèle demandé, à sa place', () => {
    expect(casting.liste.map(p => p.role)).toEqual(PATRONS.casting.map(c => c.role))
    for (const c of PATRONS.casting) {
      const p = qui(c.role)
      expect(p.modele).toBe(c.modele)
      expect(p.cfg.url.endsWith(`/${c.modele}.glb`), c.role).toBe(true)
      if (c.siege) expect([p.position.x, p.position.z], c.role).toEqual([siege(c.siege).x, siege(c.siege).z])
    }
    expect(qui('sorel').present).toBe(false)                                // il entre à 18:30
    expect(qui('sorel').group.visible).toBe(false)
    expect(enfants(casting.group, o => o.isSkinnedMesh).length).toBe(36)
  })

  it('aucun personnage ne projette d\'ombre', () => {
    const projettent = enfants(casting.group, o => o.isMesh && o.castShadow).map(o => o.name)
    expect(projettent).toEqual([])                                          // témoin : castShadow = true de characters.js:211
  })

  it('sur chaise, en Sit, le bas des fesses à 0,45 ± 0,03 m et les pieds au sol ; Dussart en Talk sur la banquette', () => {
    for (const role of ['lenoir', 'mattei', 'haas', 'albert', 'dussart']) {
      const p = qui(role), s = siege(PATRONS.casting.find(c => c.role === role).siege)
      expect(p.clip, role).toBe(s.banquette ? 'Talk' : 'Sit')
      const fesses = basDesFesses(p, s)
      expect(Math.abs(fesses - 0.45), `${role} : fesses à ${fesses.toFixed(3)} m`).toBeLessThanOrEqual(0.03)   // témoin : seatY 0,2 de M6
      const pieds = basDesPieds(p)
      expect(pieds, `${role} : pieds à ${pieds.toFixed(3)} m`).toBeGreaterThan(-0.03)
      expect(pieds, `${role} : pieds à ${pieds.toFixed(3)} m`).toBeLessThan(0.05)
    }
  })

  it('les trois modèles du bar, sur une chaise, la banquette ou un tabouret, portés par leur siège quelle que soit leur taille', () => {
    // les tailles de characters.js aux deux bouts de heightVar et au milieu, puis trois graines : main (casting strict du
    // lot 3) tire la taille avant le reste, la branche après le modèle, et une même graine n'y donne pas la même taille
    const CAS = [{ fixe: 0 }, { fixe: 0.5 }, { fixe: 1 - 1e-9 }, { graine: 7 }, { graine: 11 }, { graine: 12 }]
    const faux = []
    for (const modele of REELS) {
      for (const id of ['C-nord', 'A-sud', 'tabouret-3']) {
        const s = siege(id)
        for (const cas of CAS) {
          tirage.fixe = cas.fixe ?? null
          let p
          try { p = m.creerPatron({ role: 'essai', modele, siege: id, graine: cas.graine ?? 7 }) } finally { tirage.fixe = null }
          p.update(DT)
          const nom = `${modele} sur ${id}, ${cas.fixe ?? `graine ${cas.graine}`}, échelle ${p.model.scale.y.toFixed(3)}`
          const fesses = basDesFesses(p, s), pieds = basDesPieds(p)
          if (Math.abs(fesses - s.hauteur) > 0.03) faux.push(`${nom} : fesses à ${fesses.toFixed(3)} m`)
          if (s.type === 'chaise' && !(pieds > -0.03 && pieds < 0.05)) faux.push(`${nom} : pieds à ${pieds.toFixed(3)} m`)
          p.dispose()
        }
      }
    }
    expect(faux).toEqual([])   // témoin : le plus petit gangster_man_02 (0,959) relevé de 4,1 cm sur sa chaise, pieds à 6,2 cm
  })

  it('la tête suit ce qu\'on lui donne à regarder, à 70° au plus de la face du corps', () => {
    const p = qui('lenoir')
    const tete = point(p.os.tete)
    const f = forwardOf(p.lacet + 40 * RAD)                                 // 40° à gauche, à hauteur de tête
    p.regarder({ x: tete.x + 2 * f.x, y: tete.y, z: tete.z + 2 * f.z })
    avance(p, 2)
    expect(lacetTete(p)).toBeCloseTo(40, 0)
    const derriere = forwardOf(p.lacet + 170 * RAD)                         // presque dans son dos
    p.regarder({ x: tete.x + 2 * derriere.x, y: tete.y, z: tete.z + 2 * derriere.z })
    avance(p, 2)
    expect(lacetTete(p)).toBeLessThanOrEqual(70.5)                          // témoin : sans borne, 170°
    expect(lacetTete(p)).toBeGreaterThan(65)
    p.regarder(null)
    avance(p, 2)
    expect(Math.abs(lacetTete(p))).toBeLessThan(15)                         // rendue au clip
  })

  it('la tête tourne en douceur : elle part lentement, accélère, puis se pose', () => {
    const p = qui('mattei')
    p.regarder(null); avance(p, 2)
    const tete = point(p.os.tete), depart = lacetTete(p)
    const f = forwardOf(p.lacet + 60 * RAD)
    p.regarder({ x: tete.x + 2 * f.x, y: tete.y, z: tete.z + 2 * f.z })
    const angles = [depart]
    for (let i = 0; i < 60; i++) { p.update(DT); angles.push(lacetTete(p)) }
    const pas = angles.slice(1).map((a, i) => a - angles[i])
    expect(pas[0]).toBeLessThan(Math.max(...pas) / 3)                       // témoin : vitesse constante dès la première image
    expect(pas[pas.length - 1]).toBeLessThan(Math.max(...pas) / 3)          // et elle ralentit en arrivant
    p.regarder(null)
  })

  it('qui parle hoche la tête ; qui se tait, non', () => {
    const p = qui('haas')
    p.regarder(null); p.parler(false); avance(p, 2)
    const ecart = () => { const t = []; for (let i = 0; i < 90; i++) { p.update(DT); t.push(tangageTete(p)) } return Math.max(...t) - Math.min(...t) }
    const muet = ecart()
    p.parler(true); avance(p, 0.5)
    const parle = ecart()
    expect(parle).toBeGreaterThan(muet + 3)                                 // témoin : parler() sans effet
    p.parler(false); avance(p, 1.5)
    expect(ecart()).toBeLessThan(muet + 1)
  })

  it('la personne vue du regard : sa tête sur l\'os, sa face celle du corps (jamais celle de la tête tournée)', () => {
    const p = qui('lenoir')
    const s = siege('A-nord')
    const tete = point(p.os.tete)
    const f = forwardOf(p.lacet - 65 * RAD)
    p.regarder({ x: tete.x + 2 * f.x, y: tete.y, z: tete.z + 2 * f.z })
    avance(p, 2)
    const t = point(p.os.tete)
    expect(p.personne).toMatchObject({ id: 'lenoir', categorie: 'escorte' })
    expect([p.personne.x, p.personne.y, p.personne.z].map(v => +v.toFixed(6))).toEqual([t.x, t.y, t.z].map(v => +v.toFixed(6)))
    expect(p.personne.lacet).toBeCloseTo(s.lacet, 9)                        // témoin : le lacet de la tête, 65° plus loin
    expect(p.personne.y).toBeGreaterThan(1.0); expect(p.personne.y).toBeLessThan(1.4)   // assis (B3 : environ 1,25 m)
    expect(Object.fromEntries(casting.liste.map(x => [x.role, x.categorie]))).toEqual({ fernand: 'fernand', dussart: 'escorte',
      lenoir: 'escorte', mattei: 'escorte', haas: 'escorte', sorel: 'escorte', lise: 'civil', albert: 'albert', 'ouvrier-1': 'civil', 'ouvrier-2': 'civil' })
    expect(casting.personnes.map(x => x.id)).toEqual(casting.liste.map(x => x.role))
    expect(casting.personnes[2]).toBe(p.personne)                           // le même objet, modifié sur place (B3)
    p.regarder(null)
  })

  it('absent, Sorel n\'est ni témoin ni fixé ; entré, le même regard le compte', async () => {
    const { createRegards } = await import('../../src/bar/regard.js')
    const sorel = qui('sorel'), t = sorel.personne
    const regards = createRegards(casting.personnes)                        // tout le casting, Sorel compris, au montage
    const f = forwardOf(t.lacet)                                            // Viktor à 2 m devant lui, qui fixe sa tête
    const oeil = { x: t.x + 2 * f.x, y: 1.65, z: t.z + 2 * f.z }
    const vue = () => ({ oeil, direction: { x: t.x - oeil.x, y: t.y - oeil.y, z: t.z - oeil.z } })
    let emis = []
    for (let i = 0; i < 120; i++) emis.push(...regards.update(DT, vue()))
    expect(regards.etat('sorel')).toMatchObject({ voit: false, fixe: false, fixation: 0 })   // témoin : témoin depuis la porte
    expect(emis.filter(e => e.qui === 'sorel')).toEqual([])
    expect(t.present).toBe(false)                                           // ce que le regard lit
    sorel.setPresent(true)                                                  // il entre (18:30)
    expect(t.present).toBe(true)
    for (let i = 0; i < 120; i++) emis.push(...regards.update(DT, vue()))
    expect(regards.etat('sorel').voit).toBe(true)
    expect(emis.filter(e => e.qui === 'sorel' && e.type === 'remarque')).toHaveLength(1)
    sorel.setPresent(false)
    expect(t.present).toBe(false)
  })

  it('verre et cartes dans la main droite, sous l\'os RightHand lui-même ; le tablier de Lise sur son bassin', () => {
    for (const role of ['fernand', 'mattei', 'haas', 'ouvrier-1', 'ouvrier-2']) {
      const a = qui(role).accessoire
      expect(a, role).toBeTruthy()
      expect(a.parent.name, role).toMatch(/^mixamorig\d*RightHand$/)       // témoin : l'heuristique de _addPhoneProp (LeftHand)
      expect(a.parent).toBe(qui(role).os.mainDroite)
    }
    const tablier = qui('lise').accessoire
    expect(tablier.parent).toBe(qui('lise').os.hanches)
    expect(qui('lenoir').accessoire).toBeNull()
    // le verre reste dans la main : à moins de 15 cm du poignet, quelle que soit la pose
    expect(point(qui('fernand').accessoire).distanceTo(point(qui('fernand').os.mainDroite))).toBeLessThan(0.15)
  })

  it('on vise des capsules invisibles, jamais un maillage animé', () => {
    expect(casting.cibles.map(c => c.userData.barId)).toEqual(casting.liste.map(p => p.role))
    for (const c of casting.cibles) {
      expect(c.visible, c.userData.barId).toBe(false)
      expect(c.userData.type).toBe('personne')
      expect(enfants(c, o => o.isSkinnedMesh)).toEqual([])                // témoin : cibles = modèles des patrons
    }
    expect(() => createInteract({ camera: new THREE.PerspectiveCamera(), targets: casting.cibles, cle: 'barId' })).not.toThrow()
    // la capsule de Lenoir, assis, couvre sa tête et son buste
    const p = qui('lenoir'), c = point(p.cible), t = point(p.os.tete)
    expect(Math.hypot(c.x - t.x, c.z - t.z)).toBeLessThan(0.15)
    expect(t.y - c.y).toBeGreaterThan(0.2); expect(t.y - c.y).toBeLessThan(0.6)
  })

  it('les gestes ne prennent que le haut du corps : assis, Haas menace sans quitter sa chaise', () => {
    const p = qui('haas')
    const hanches = () => point(p.os.hanches).y
    const main = () => point(p.os.mainDroite)
    avance(p, 1)
    const assis = hanches(), mainAssise = main()
    p.geste('Threaten')
    avance(p, 1.5)
    expect(hanches()).toBeLessThan(assis + 0.05)                            // témoin : le clip entier (hanches à 1,05 m)
    expect(main().distanceTo(mainAssise)).toBeGreaterThan(0.15)             // le bras, lui, menace
    expect(p.gesteEnCours).toBe('Threaten')
    p.geste(null)
    avance(p, 1.5)
    expect(main().distanceTo(mainAssise)).toBeLessThan(0.05)
    expect(() => p.geste('Dance')).toThrow(/Dance/)
  })
})

describe('se lever, marcher, s\'asseoir', () => {
  let m
  beforeAll(async () => { m = await charger() }, 60000)

  it('assis sur un tabouret, se lever le pose debout au sol ; à demi, il reste entre les deux', () => {
    const p = m.creerPatron({ role: 'essai', modele: 'mafia_boss', siege: 'tabouret-3', graine: 3 })
    p.update(DT)
    expect(p.group.position.y).toBeGreaterThan(0.25)                        // relevé de 0,33 m sur le tabouret
    p.seLever()
    avance(p, 1.5)
    expect(p.assis).toBe(false)
    expect(p.group.position.y).toBe(0)                                      // témoin : le clip change, le corps reste en l'air
    expect(basDesPieds(p)).toBeLessThan(0.03)
    expect(point(p.os.hanches).y).toBeGreaterThan(0.9)
    p.dispose()
    const h = m.creerPatron({ role: 'haas', modele: 'mafia_boss', siege: 'B-nord', graine: 3 })
    avance(h, 0.5)
    const y0 = point(h.os.hanches).y
    h.seLever({ demi: true })
    avance(h, 1.5)
    const y1 = point(h.os.hanches).y
    expect(y1).toBeGreaterThan(y0 + 0.1); expect(y1).toBeLessThan(0.95)
    h.dispose()
  })

  it('levé d\'une chaise ou d\'un tabouret, il en est sorti : ni l\'assise ni le dossier dans ses jambes', () => {
    // Le siège tel que src/bar/salle.js le dessine, dans son repère (face vers −z, le dossier derrière, vers +z) : la
    // chaise, son assise (disque de 0,2 m, de 0,42 à 0,45 m) et son dossier (|x| ≤ 0,165 m, z de 0,135 à 0,215 m, de 0,42
    // à 1 m) ; le tabouret, son assise et son repose-pieds (disque de 0,18 m, de 0,25 à 0,76 m).
    const dansLeSiege = (w, s) => {
      const dx = w.x - s.x, dz = w.z - s.z, c = Math.cos(s.lacet), sn = Math.sin(s.lacet)
      const x = c * dx - sn * dz, z = sn * dx + c * dz, r = Math.hypot(x, z)
      if (s.type === 'tabouret') return r <= 0.18 && w.y >= 0.25 && w.y <= 0.76
      return (r <= 0.2 && w.y >= 0.42 && w.y <= 0.45) || (Math.abs(x) <= 0.165 && z >= 0.135 && z <= 0.215 && w.y >= 0.42 && w.y <= 1)
    }
    const faux = []
    for (const modele of REELS) {
      for (const id of ['B-sud', 'B-nord', 'A-nord', 'D-nord', 'tabouret-3']) {
        for (const fixe of [0, 1 - 1e-9]) {   // les deux bouts de heightVar : le plus grand déborde le plus
          const s = siege(id)
          tirage.fixe = fixe
          let p
          try { p = m.creerPatron({ role: 'essai', modele, siege: id, graine: 7 }) } finally { tirage.fixe = null }
          p.update(DT)
          p.seLever(); avance(p, 1.5)
          const n = sommets(p, w => dansLeSiege(w, s)).length
          if (p.assis || n > 0) faux.push(`${modele} sur ${id}, échelle ${p.model.scale.y.toFixed(3)} : ${n} sommets dans son siège`)
          p.dispose()
        }
      }
    }
    expect(faux).toEqual([])   // témoin : debout sur place, le corps dans l'assise et le dossier (Mattei, revue de B10)
  })

  it('se lever ne le fait jamais reculer dans un mur ; sur la banquette, Dussart reste devant elle', () => {
    // une chaise à 0,5 m du mur nord, tournée vers le sud : derrière elle, la place manque
    const s = { id: 'essai-mur', type: 'chaise', table: null, x: 2.5, z: -4.0, lacet: Math.PI, occupant: null, hauteur: 0.45, oeil: 1.2, decalage: 0 }
    const p = m.creerPatron({ role: 'essai', modele: 'mafia_boss', siege: s, graine: 7 })
    p.update(DT)
    p.seLever(); avance(p, 1.5)
    expect(p.assis).toBe(false)
    expect(p.position.z).toBeGreaterThanOrEqual(-4.5 + PATRONS.marche.rayonM - 1e-6)   // témoin : le recul sans moveCircle
    p.dispose()
    const a = siege('A-sud')
    const d = m.creerPatron({ role: 'dussart', modele: 'mafia_boss', siege: 'A-sud', graine: 3 })
    d.update(DT)
    d.seLever(); avance(d, 1.5)
    expect(Math.hypot(d.position.x - a.x, d.position.z - a.z)).toBeLessThan(1e-6)   // témoin : le recul sur la banquette
    d.dispose()
  })

  it('il se lève d\'abord, puis recule : rien ne bouge au sol avant la moitié du lever, ni quand il se lève à demi', () => {
    const s = siege('B-sud')
    const p = m.creerPatron({ role: 'mattei', modele: 'mafia_boss', siege: 'B-sud', graine: 3 })
    p.update(DT)
    const loin = () => Math.hypot(p.position.x - s.x, p.position.z - s.z)
    p.seLever({ demi: true }); avance(p, 1.5)
    expect(loin()).toBeLessThan(1e-6)                                      // à demi, il reste à sa place
    p.seLever()
    avance(p, 0.15)                                                         // de la moitié à debout : il part tout de suite
    expect(loin()).toBeGreaterThan(0.005)
    avance(p, 1.5)
    expect(loin()).toBeCloseTo(PATRONS.lever.reculM, 6)
    p.dispose()
    const q = m.creerPatron({ role: 'mattei', modele: 'mafia_boss', siege: 'B-sud', graine: 3 })
    q.update(DT)
    const loinQ = () => Math.hypot(q.position.x - s.x, q.position.z - s.z)
    q.seLever()
    avance(q, PATRONS.lever.dureeS * 0.4)                                   // le lever est au tiers : assis encore à moitié
    expect(loinQ()).toBeLessThan(1e-6)                                      // témoin : le corps glisse dès le départ
    avance(q, 1.5)
    expect(loinQ()).toBeCloseTo(PATRONS.lever.reculM, 6)
    q.dispose()
  })

  it('Lise suit son itinéraire du zinc à la table A sans jamais entrer dans une boîte ni s\'y frotter, puis s\'arrête', () => {
    const p = m.creerPatron({ role: 'lise', modele: 'mafia_woman_03', poste: 'lise.zinc', graine: 5, accessoire: 'tablier' })
    const r = PATRONS.marche.rayonM - 0.01, v = PATRONS.marche.vitesse
    const dans = q => BOITES.filter(b => q.x + r > b.minX && q.x - r < b.maxX && q.z + r > b.minZ && q.z - r < b.maxZ).map(b => b.id)
    const route = itineraire(ANCRES.lise.zinc, ANCRES.lise.A)
    p.marcher(route)                                                        // témoin : marcher([A]) en ligne droite
    expect(p.enMarche).toBe(true)
    // une image où elle avance de moins que son pas, loin de tout point de passage : une boîte l'a retenue (elle glisse
    // le long, moveCircle)
    const points = [ANCRES.lise.zinc, ...route]
    const pres = q => points.some(w => Math.hypot(w.x - q.x, w.z - q.z) < 1.5 * v * DT)
    const touche = [], frotte = []
    let t = 0, avant = p.position
    while (p.enMarche && t < 20) {
      p.update(DT); t += DT
      const q = p.position, b = dans(q)
      if (b.length) touche.push(b.join(','))
      if (p.enMarche && !pres(avant) && !pres(q) && Math.hypot(q.x - avant.x, q.z - avant.z) < 0.95 * v * DT) frotte.push(`(${q.x.toFixed(2)} ; ${q.z.toFixed(2)})`)
      avant = q
    }
    expect(touche).toEqual([])                                              // témoin : la ligne droite sans moveCircle
    expect(frotte).toEqual([])                                              // témoin : la ligne droite, avec moveCircle
    expect(p.bloque).toBe(false)
    expect(Math.hypot(p.position.x - ANCRES.lise.A.x, p.position.z - ANCRES.lise.A.z)).toBeLessThan(0.05)
    const d = Math.hypot(ANCRES.lise.A.x - ANCRES.lise.zinc.x, ANCRES.lise.A.z - ANCRES.lise.zinc.z)
    expect(t).toBeGreaterThan(d / PATRONS.marche.vitesse)                   // au pas, pas plus vite
    expect(t).toBeLessThan(2.5 * d / PATRONS.marche.vitesse)
    expect(p.clip).toBe('Idle')
    // son ombre de contact l'a suivie, au sol
    const o = point(p.ombre)
    expect(Math.hypot(o.x - p.position.x, o.z - p.position.z)).toBeLessThan(0.2)
    expect(o.y).toBeGreaterThan(0); expect(o.y).toBeLessThan(0.01)
    p.dispose()
  })

  it('les deux moitiés d\'un clip vont ensemble : les bras repartent au pas des jambes après un geste', () => {
    const p = m.creerPatron({ role: 'lise', modele: 'mafia_woman_03', poste: 'lise.zinc', graine: 9 })
    const moities = nom => p.mixer._actions.filter(a => a.isRunning() && a.getClip().name.startsWith(`${nom} (`))
      .map(a => [a.getClip().name, +a.time.toFixed(6)])
    const ensemble = nom => { const t = moities(nom); expect(t.length, nom).toBe(2); expect(t[0][1], nom).toBe(t[1][1]) }
    ensemble('Idle')                                                        // témoin : un instant tiré par moitié, sans calage
    p.marcher(itineraire(ANCRES.lise.zinc, ANCRES.lise.B))
    avance(p, 0.7)
    ensemble('Walk')
    p.geste('Wave'); avance(p, 1)                                           // le haut du Walk s'arrête sous le geste
    expect(moities('Walk').length).toBe(1)
    p.geste(null); avance(p, 0.5)
    ensemble('Walk')                                                        // témoin : le haut repart de 0
    p.dispose()
  })

  it('retenue par une boîte, la marche s\'arrête et le dit', () => {
    const p = m.creerPatron({ role: 'sorel', modele: 'mafia_boss', poste: { x: 0, z: -2.4, lacet: 0 }, graine: 5 })
    p.marcher([{ x: 0, z: -6 }])                                            // droit dans le mur nord
    avance(p, 5)
    expect(p.enMarche).toBe(false)
    expect(p.bloque).toBe(true)                                             // témoin : marche sans moveCircle (traverse le mur)
    expect(p.position.z).toBeGreaterThan(-4.5)
    p.dispose()
  })

  it('l\'ombre de contact reste au sol, sous qui est assis sur un tabouret comme sous qui est debout', () => {
    const p = m.creerPatron({ role: 'essai', modele: 'mafia_boss', siege: 'tabouret-1', graine: 2 })
    p.update(DT)
    const o = point(p.ombre)
    expect(o.y).toBeGreaterThan(0); expect(o.y).toBeLessThan(0.01)          // témoin : ombre à 4 mm sous le groupe, relevé de 0,33 m
    expect(p.ombre.material.transparent).toBe(true)
    expect(p.ombre.castShadow).toBe(false)
    p.dispose()
  })

  it('debout, chaque patron attablé quitte sa place et y revient : ni sa boîte ni la banquette qui le porte ne le retiennent', () => {
    const buts = { zinc: ANCRES.lise.zinc, porte: ANCRES.sorel.sortie, 'chaise ouest de D': PLACES.chaiseOuestD,
      'mange-debout est': PLACES.mangeDeboutEst }
    const marche = p => { for (let t = 0; p.enMarche && t < 30; t += DT) p.update(DT) }
    const faux = []
    for (const s of SIEGES.filter(x => x.occupant)) {
      const qui = s.occupant
      // Dussart (SOUPÇON, §3.6) vient s'accouder près de Viktor : de sa place vers celles de Viktor, du zinc et de la porte
      for (const [nom, b] of Object.entries(buts)) if (!itineraire(s, b)) faux.push(`${qui} → ${nom} : aucun itinéraire`)
      const p = m.creerPatron({ role: qui, modele: 'mafia_boss', siege: s.id, graine: 3 })
      p.seLever(); avance(p, 1.2)
      const aller = itineraire(p.position, ANCRES.lise.zinc)
      if (aller) {
        p.marcher(aller); marche(p)
        const d = Math.hypot(p.position.x - ANCRES.lise.zinc.x, p.position.z - ANCRES.lise.zinc.z)
        if (p.bloque || d > 0.05) faux.push(`${qui} vers le zinc : retenu à ${d.toFixed(2)} m`)
        p.marcher(itineraire(p.position, s)); marche(p)
        const r = Math.hypot(p.position.x - s.x, p.position.z - s.z)
        if (p.bloque || r > 0.05) faux.push(`${qui} vers sa place : retenu à ${r.toFixed(2)} m`)
      } else faux.push(`${qui} → zinc, debout : aucun itinéraire`)
      p.dispose()
    }
    expect(faux).toEqual([])   // témoins : Dussart sans chemin hors de la banquette ; au retour, chacun bute sur sa propre boîte
  })

  it('s\'asseoir : de debout au siège donné, posé à sa hauteur', () => {
    const p = m.creerPatron({ role: 'sorel', modele: 'mafia_boss', poste: { x: -3.2, z: 1.0, lacet: Math.PI / 2 }, graine: 4 })
    p.update(DT)
    p.asseoir('tabouret-4')
    avance(p, 1.5)
    expect(p.assis).toBe(true)
    expect(p.clip).toBe('Talk')
    expect(Math.abs(basDesFesses(p, siege('tabouret-4')) - 0.75)).toBeLessThanOrEqual(0.03)
    p.dispose()
  })
})

describe('le casting est tiré à graine', () => {
  let m
  beforeAll(async () => { m = await charger() }, 60000)
  // ce qui se tire au montage : la taille (characters.js, heightVar), la teinte, l'instant et la vitesse du clip
  const signature = c => c.liste.map(p => ({ role: p.role, url: p.cfg.url, echelle: +p.model.scale.x.toFixed(9),
    teintes: enfants(p.model, o => o.isSkinnedMesh).map(o => o.material.color.getHex()), temps: +p.action.time.toFixed(9),
    vitesse: +p.action.timeScale.toFixed(9), y: +p.group.position.y.toFixed(9) }))

  it('deux montages sous deux Math.random différents donnent le même casting', () => {
    const a = m.withSeed(1, () => m.creerCasting())
    const b = m.withSeed(2, () => m.creerCasting())
    const sa = signature(a), sb = signature(b)
    expect(sa).toEqual(sb)                                                  // témoin : spawnCharacter sans withSeed
    expect(new Set(sa.map(s => s.echelle)).size).toBeGreaterThan(3)         // les tailles varient d'une personne à l'autre
    expect(new Set(sa.map(s => s.temps)).size).toBe(sa.length)              // personne ne bouge en même temps
    a.dispose(); b.dispose()
  })

  it('les teintes du casting sont celles des réglages', () => {
    const c = m.creerCasting()
    for (const e of PATRONS.casting) {
      for (const o of enfants(c.patrons.get(e.role).model, x => x.isSkinnedMesh)) expect(o.material.color.getHex(), e.role).toBe(e.teinte)
    }
    c.dispose()
  })
})

describe('le modèle demandé est vérifié', () => {
  it('sans mafia_boss chargé, un patron qui le demande est une erreur, jamais un autre modèle', async () => {
    // les autres cibles sont de vrais modèles, complets : la retombée silencieuse donnerait un patron sans erreur
    const m = await charger({ echec: ['mafia_boss'], reels: [...REELS, 'gangster_man_01', 'mafia_woman_01'] })
    expect(m.characters.poolUrls('target').some(u => u.includes('mafia_boss'))).toBe(false)
    expect(() => m.creerPatron({ role: 'lenoir', modele: 'mafia_boss', siege: 'A-nord', graine: 1 }))
      .toThrow(/mafia_boss/)                                                // témoin : la retombée silencieuse de characters.js:173-175
    expect(() => m.creerPatron({ role: 'x', modele: 'inconnu', siege: 'A-nord', graine: 1 })).toThrow(/inconnu/)
  }, 60000)
})

describe('le casting tient avec le spawnCharacter du lot 3 (main), qui ignore match', () => {
  it('chacun impose son modèle par `model`, que le casting strict du lot 3 lit', async () => {
    casting3.lot3 = true
    try {
      const m = await charger()
      const c = m.creerCasting()   // témoin : { match } seul, le tirage dans le pool (« lenoir demande mafia_boss, … gangster_man_01 »)
      for (const e of PATRONS.casting) expect(c.patrons.get(e.role).cfg.url.endsWith(`/${e.modele}.glb`), e.role).toBe(true)
      c.dispose()
    } finally { casting3.lot3 = false }
  }, 60000)
})

describe('libération', () => {
  it('dispose libère ce que le patron possède, rien de partagé, et oublie le clone dans son mixer', async () => {
    const m = await charger()
    const partagees = countDisposals(gltf.charges.flatMap(g => resourcesOf(g.scene)))
    const c = m.creerCasting()
    const scene = new THREE.Scene()
    scene.add(c.group)
    avance(c, 0.2)
    const suivis = c.liste.map(p => ({ p, t: trackDisposals(p.group), uncache: vi.spyOn(p.mixer, 'uncacheRoot') }))
    c.dispose()
    for (const { p, t, uncache } of suivis) {
      expect(t.leaks(), p.role).toEqual([])
      expect(t.sharedFreed(), p.role).toEqual([])
      expect(t.freedTwice(), p.role).toEqual([])
      expect(uncache, p.role).toHaveBeenCalledWith(p.model)               // témoin : sans uncacheRoot
      expect(p.mixer._actions.length, p.role).toBe(0)
      expect(p.group.parent, p.role).toBeNull()
    }
    expect(partagees.n).toBe(0)
    expect(c.group.parent).toBeNull()
    expect(() => c.dispose()).not.toThrow()                                 // une seconde fois : rien
  }, 60000)
})
