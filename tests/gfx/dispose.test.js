import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { markShared, isShared, disposeObject } from '../../src/gfx/dispose.js'
import { createFakeRenderer, trackDisposals } from './fakeRenderer.js'

// Libération par parcours (spec du lot 1 §4.2) : tout ce que l'arbre possède émet 'dispose' une fois, rien de ce qui
// est marqué partagé (userData.shared) n'en émet, et un second appel ne fait rien de plus.

const texture = () => new THREE.DataTexture(new Uint8Array(4), 1, 1)

// Petit SkinnedMesh : deux os, un attribut de peau, sa texture d'os créée comme au premier rendu.
function skinned() {
  const geo = new THREE.BoxGeometry(1, 2, 1)
  const n = geo.attributes.position.count
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).fill(0.25), 4))
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial())
  const root = new THREE.Bone(), child = new THREE.Bone()
  root.add(child); child.position.y = 1
  mesh.add(root)
  mesh.bind(new THREE.Skeleton([root, child]))
  mesh.skeleton.computeBoneTexture()
  return mesh
}

// Arbre synthétique : groupe, maillages, matériau avec map et normalMap, matériau en tableau, ressources partagées
// (géométrie, matériau, texture), SkinnedMesh avec squelette, lumière avec carte d'ombre.
function synthetic() {
  const root = new THREE.Group()
  const owned = new THREE.MeshStandardMaterial({ map: texture(), normalMap: texture() })
  const a = new THREE.Mesh(new THREE.BoxGeometry(), owned)
  const b = new THREE.Mesh(new THREE.SphereGeometry(), owned)            // même matériau : libéré une seule fois
  const sub = new THREE.Group()
  sub.add(new THREE.Mesh(new THREE.PlaneGeometry(), [new THREE.MeshBasicMaterial(), new THREE.MeshLambertMaterial()]))
  const sharedMesh = markShared(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: texture() })))
  const sharedTex = markShared(texture())
  const usesSharedTex = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: sharedTex }))
  const light = new THREE.DirectionalLight()
  light.castShadow = true
  light.shadow.map = new THREE.WebGLRenderTarget(4, 4)
  root.add(a, b, sub, sharedMesh, usesSharedTex, skinned(), light)
  const parent = new THREE.Scene()
  parent.add(root)
  return { root, parent, sharedMesh, sharedTex }
}

describe('markShared et isShared', () => {
  it('markShared pose la marque sur toutes les géométries, matériaux et textures d\'un arbre', () => {
    const tex = texture()
    const mat = new THREE.MeshStandardMaterial({ map: tex })
    const geo = new THREE.BoxGeometry()
    const root = new THREE.Group().add(new THREE.Mesh(geo, [mat, new THREE.MeshBasicMaterial()]))
    expect(markShared(root)).toBe(root)
    expect([geo, mat, tex].map(isShared)).toEqual([true, true, true])
    expect(root.children[0].material.every(isShared)).toBe(true)
  })

  it('markShared accepte aussi une ressource seule (géométrie, matériau et ses textures, texture)', () => {
    const tex = texture()
    const mat = markShared(new THREE.MeshBasicMaterial({ map: tex }))
    const geo = markShared(new THREE.BoxGeometry())
    expect([isShared(mat), isShared(tex), isShared(geo)]).toEqual([true, true, true])
  })

  it('isShared : faux sans marque et pour une valeur absente', () => {
    expect(isShared(new THREE.BoxGeometry())).toBe(false)
    expect(isShared(null)).toBe(false)
    expect(isShared(undefined)).toBe(false)
  })
})

describe('disposeObject', () => {
  it('retire l\'arbre de son parent', () => {
    const { root, parent } = synthetic()
    disposeObject(root)
    expect(root.parent).toBe(null)
    expect(parent.children).toHaveLength(0)
  })

  it('chaque ressource possédée émet dispose une fois, aucune ressource partagée n\'en émet', () => {
    const { root } = synthetic()
    const t = trackDisposals(root)
    expect(t.owned()).toBeGreaterThan(10)
    expect(t.shared()).toBe(4)   // géométrie, matériau et texture du maillage partagé, texture partagée
    disposeObject(root)
    expect(t.leaks()).toEqual([])
    expect(t.sharedFreed()).toEqual([])
    expect(t.freedTwice()).toEqual([])
  })

  it('le squelette d\'un SkinnedMesh libère sa texture d\'os', () => {
    const mesh = skinned()
    const bone = mesh.skeleton.boneTexture
    let n = 0
    bone.addEventListener('dispose', () => n++)
    const res = disposeObject(mesh)
    expect(n).toBe(1)
    expect(res.skeletons).toBe(1)
  })

  it('la carte d\'ombre d\'une lumière est libérée', () => {
    const light = new THREE.PointLight()
    light.shadow.map = new THREE.WebGLRenderTarget(4, 4)
    let n = 0
    light.shadow.map.addEventListener('dispose', () => n++)
    disposeObject(new THREE.Group().add(light))
    expect(n).toBe(1)
  })

  it('renvoie ce qu\'il a libéré : géométries, matériaux, textures, squelettes', () => {
    const { root } = synthetic()
    // 5 géométries possédées (boîte, sphère, plan, boîte au matériau partagé, celle du SkinnedMesh) ; 5 matériaux
    // (le matériau commun une fois, les deux du tableau, celui qui porte la texture partagée, celui du SkinnedMesh) ;
    // 2 textures (map et normalMap du matériau commun) ; 1 squelette
    expect(disposeObject(root)).toEqual({ geometries: 5, materials: 5, textures: 2, skeletons: 1 })
  })

  it('idempotent : deux appels de suite n\'émettent rien de plus et le second ne libère rien', () => {
    const { root } = synthetic()
    const t = trackDisposals(root)
    disposeObject(root)
    const freed = t.freed()
    expect(disposeObject(root)).toEqual({ geometries: 0, materials: 0, textures: 0, skeletons: 0 })
    expect(t.freed()).toBe(freed)
    expect(t.freedTwice()).toEqual([])
  })

  it('une ressource commune à deux arbres libérés l\'un après l\'autre n\'émet dispose qu\'une fois', () => {
    const geo = new THREE.BoxGeometry(), mat = new THREE.MeshBasicMaterial()
    const a = new THREE.Mesh(geo, mat), b = a.clone()   // clone : même géométrie, même matériau (lampadaires des cartes)
    let n = 0
    geo.addEventListener('dispose', () => n++)
    mat.addEventListener('dispose', () => n++)
    disposeObject(a); disposeObject(b)
    expect(n).toBe(2)
  })

  it('sans arbre : rien à libérer', () => {
    expect(disposeObject(null)).toEqual({ geometries: 0, materials: 0, textures: 0, skeletons: 0 })
  })
})

describe('faux renderer comptable', () => {
  it('compte une géométrie neuve au rendu, la décompte au dispose, la recompte si elle est redessinée', () => {
    const scene = new THREE.Scene()
    const geo = new THREE.BoxGeometry()
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture() }))
    scene.add(mesh, new THREE.Mesh(geo, new THREE.MeshBasicMaterial()))
    const r = createFakeRenderer()
    r.render(scene); r.render(scene)
    expect(r.info()).toEqual({ geometries: 1, textures: 1 })
    geo.dispose()
    expect(r.info()).toEqual({ geometries: 0, textures: 1 })
    r.render(scene)
    expect(r.info().geometries).toBe(1)
  })

  it('un SkinnedMesh crée sa texture d\'os au premier rendu, Skeleton.dispose la décompte', () => {
    const scene = new THREE.Scene()
    const mesh = skinned()
    mesh.skeleton.boneTexture.dispose(); mesh.skeleton.boneTexture = null
    scene.add(mesh)
    const r = createFakeRenderer()
    r.render(scene)
    expect(r.info()).toEqual({ geometries: 1, textures: 1 })
    mesh.skeleton.dispose()
    expect(r.info().textures).toBe(0)
  })

  it('un objet retiré de la scène sans dispose reste compté (la fuite que le lot 1 corrige)', () => {
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    scene.add(mesh)
    const r = createFakeRenderer()
    r.render(scene)
    scene.remove(mesh)
    r.render(scene)
    expect(r.info().geometries).toBe(1)
  })
})
