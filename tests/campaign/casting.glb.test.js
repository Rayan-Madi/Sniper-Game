// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MISSIONS } from '../../src/campaign/missions/index.js'

// Les maillages que cite teinteMaillage dans les missions (le polo de Marc et celui du commanditaire : Ch01_Shirt, de
// gangster_man_02) gardent leur nom une fois le vrai modèle chargé par GLTFLoader : spawnCharacter (src/characters.js,
// tâche A6 du lot 3) les cherche par ce nom, sur l'objet animé lui-même. GLTFLoader réserve le nom du nœud avant celui
// de son maillage (qui prendrait sinon « Ch01_Shirt_1 ») et le donne à l'objet du nœud, ici le maillage animé.
// Sous Node, les textures ne se chargent pas (sans bruit) : la géométrie et les noms suffisent ; GLTFLoader lit URL
// sur `self`, que Node n'a pas.
//
// Témoin : sur les données d'avant la tâche (commit 201da61), aucune mission ne cite de maillage (vu rouge).

const DIR = resolve(__dirname, '../../public/models')
const cites = MISSIONS.flatMap(m => m.casting.cibles.filter(c => c.teinteMaillage)
  .flatMap(c => Object.keys(c.teinteMaillage).map(nom => ({ mission: m.numero, modele: c.modele, nom }))))

async function charger(modele) {
  const buf = readFileSync(resolve(DIR, `${modele}.glb`))
  return new Promise((ok, ko) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', ok, ko))
}

let modeles
beforeAll(async () => {
  vi.stubGlobal('self', globalThis)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  modeles = Object.fromEntries(await Promise.all([...new Set(cites.map(c => c.modele))].map(async m => [m, (await charger(m)).scene])))
})
afterAll(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('teinteMaillage : le maillage cité, sous ce nom, dans le modèle chargé', () => {
  it('au moins un maillage cité (le polo de Marc)', () => {
    expect(cites.map(c => `M${c.mission} ${c.modele} ${c.nom}`)).toContain('M2 gangster_man_02 Ch01_Shirt')
  })

  it('chacun est un maillage animé du modèle chargé, et le seul de ce nom', () => {
    for (const c of cites) {
      const trouves = []
      modeles[c.modele].traverse(o => { if (o.name === c.nom) trouves.push(o) })
      expect(trouves.map(o => o.type), `M${c.mission} : ${c.modele} ${c.nom}`).toEqual(['SkinnedMesh'])
    }
  })
})
