import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

// Personnages écartés hors champ (spec du lot 1 §4.3) : characters.js forçait frustumCulled = false, car un maillage
// animé sort de la sphère englobante de sa pose de repos et clignotait en bord d'écran. Chaque instance reçoit
// désormais une sphère généreuse calculée une fois (centre à mi-hauteur, rayon proportionnel à la hauteur
// d'ajustement), posée sur chaque SkinnedMesh cloné, et frustumCulled = true. La sphère doit contenir le corps dans sa
// pose de repos et à chaque image des clips joués, marge comprise, y compris quand le modèle est sous une armature à
// l'échelle 0,01. La spec demandait la marche ; mesuré sur les sept vrais modèles, Dance (la foule de M6 et du PvP) et
// Death (le corps reste 8 s) vont bien plus loin, d'où la mort ici aussi : elle recule et finit couchée.

const gltf = vi.hoisted(() => ({ armature: new Set() }))
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const { fakeCharacter } = await import('./fakeGltf.js')
  return {
    GLTFLoader: class {
      async loadAsync(url) { return fakeCharacter({ armature: [...gltf.armature].some(k => url.includes(k)) }) }
    },
  }
})

const MARGIN = 0.1   // m : la boîte du corps, grossie de 10 cm de chaque côté, reste dans la sphère

let characters
beforeEach(async () => {
  vi.resetModules()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  gltf.armature = new Set(['mafia_henchman'])   // les gardes : géométrie en centimètres sous une armature à 0,01
  characters = await import('../../src/characters.js')
  await characters.preloadCharacters()
})

// Instance posée comme un PNJ : dans un groupe déplacé et tourné sur la carte.
function placed(type) {
  const ch = characters.spawnCharacter(type)
  const holder = new THREE.Group()
  holder.position.set(12, 0.35, -7)
  holder.rotation.y = 1.1
  holder.add(ch.model)
  const skinned = []
  ch.model.traverse(o => { if (o.isSkinnedMesh) skinned.push(o) })
  return { ch, holder, skinned }
}

const corners = box => [0, 1, 2, 3, 4, 5, 6, 7].map(i => new THREE.Vector3(
  i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z))

// Boîte du maillage déformé par les os (sommets réels de la pose), dans le repère du groupe du PNJ : la boîte du
// personnage, pas celle, plus large, que donnerait son tracé en biais dans les axes du monde.
function poseBox(mesh, holder) {
  const toHolder = holder.matrixWorld.clone().invert()
  const box = new THREE.Box3(), v = new THREE.Vector3()
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
    mesh.getVertexPosition(i, v)
    box.expandByPoint(v.applyMatrix4(mesh.matrixWorld).applyMatrix4(toHolder))
  }
  return box
}

// Écart le plus défavorable (m) entre la boîte de la pose, grossie de la marge, et la sphère que le renderer
// utilise (celle du maillage portée par sa matrice monde), ramenée dans le même repère : négatif si tout tient dedans.
function overflow(mesh, holder) {
  const box = poseBox(mesh, holder).expandByScalar(MARGIN)
  const sphere = mesh.boundingSphere.clone().applyMatrix4(mesh.matrixWorld)
    .applyMatrix4(holder.matrixWorld.clone().invert())
  return Math.max(...corners(box).map(c => c.distanceTo(sphere.center) - sphere.radius))
}

describe('sphère englobante des personnages', () => {
  for (const type of ['target', 'guard', 'civilian']) {
    it(`${type} : écarté hors champ, sa sphère couvre la pose de repos et chaque image de la marche et de la mort`, () => {
      const { ch, holder, skinned } = placed(type)
      expect(skinned).toHaveLength(2)
      for (const m of skinned) {
        expect(m.frustumCulled).toBe(true)
        expect(m.boundingSphere).toBeInstanceOf(THREE.Sphere)
      }

      holder.updateMatrixWorld(true)
      for (const m of skinned) expect(overflow(m, holder), `${m.name}, pose de repos`).toBeLessThan(0)
      const [body] = skinned
      const restSize = poseBox(body, holder).getSize(new THREE.Vector3()).length()

      // Marche échantillonnée (25 images), dont l'image la plus étendue du corps.
      const walk = ch.actions.Walk
      walk.play()
      const duration = walk.getClip().duration
      let widest = { t: 0, size: 0 }
      for (let i = 0; i <= 24; i++) {
        const t = i / 24 * duration
        ch.mixer.setTime(t)
        holder.updateMatrixWorld(true)
        const size = poseBox(body, holder).getSize(new THREE.Vector3()).length()
        if (size > widest.size) widest = { t, size }
        for (const m of skinned) expect(overflow(m, holder), `${m.name}, marche à ${t.toFixed(3)} s`).toBeLessThan(0)
      }
      // L'échantillonnage a bien vu les jambes écartées : l'image la plus étendue déborde la pose de repos.
      expect(widest.size).toBeGreaterThan(restSize + 0.2)

      // Mort échantillonnée (25 images) : le corps tombe en arrière et finit couché, loin de son point de départ.
      walk.stop()
      const death = ch.actions.Death
      death.setLoop(THREE.LoopOnce)
      death.clampWhenFinished = true
      death.play()
      for (let i = 0; i <= 24; i++) {
        const t = i / 24 * death.getClip().duration
        ch.mixer.setTime(t)
        holder.updateMatrixWorld(true)
        for (const m of skinned) expect(overflow(m, holder), `${m.name}, mort à ${t.toFixed(3)} s`).toBeLessThan(0)
      }
    })
  }

  it('la sphère suit l\'instance : hors du champ de la caméra, le maillage est écarté ; dans le champ, dessiné', () => {
    const { holder, skinned } = placed('civilian')
    expect(skinned.every(m => m.frustumCulled && m.boundingSphere)).toBe(true)   // sinon le renderer n'écarte rien
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200)
    camera.position.set(12, 1.6, 3)
    const frustum = new THREE.Frustum()
    const look = target => {
      camera.lookAt(target)
      camera.updateMatrixWorld(true)
      frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    }
    holder.updateMatrixWorld(true)
    look(new THREE.Vector3(12, 1, -7))       // face au personnage
    expect(skinned.every(m => frustum.intersectsObject(m))).toBe(true)
    look(new THREE.Vector3(12, 1, 20))       // dos tourné
    expect(skinned.some(m => frustum.intersectsObject(m))).toBe(false)
  })
})
