import { describe, it, expect, vi, beforeAll } from 'vitest'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Ordre des tirages du PvP, à graine fixe (spec du lot 3, §2 d et tests 3a ; plan du lot 3a, tâche A6). Les deux
// machines d'une manche tirent la foule et l'avatar du contre-tueur avec la même graine (src/pvp/index.js, withSeed) : la même
// suite de Math.random doit donner chez chacune les mêmes modèles, les mêmes tailles, les mêmes teintes et les mêmes
// places. Le casting des missions (spawnCharacter et NPC avec options, tâche A6) ne doit donc rien changer quand aucune
// option n'est passée, ni tirage de plus, ni objet three de plus (three tire au hasard l'identifiant de chaque objet,
// matériau ou squelette qu'il crée : un clone ou une copie de matériau en plus décale toute la suite).
//
// Empreinte : pour chaque personnage de la manche (les 54 de la foule, puis l'avatar), dans l'ordre de la scène, son
// modèle, la teinte de son premier maillage animé, l'échelle de son ajustement (taille tirée) et sa place. Référence
// (tests/pvp/tirages-pvp.json) enregistrée sur le code d'avant la tâche A6 (commit 201da61), avec ces faux modèles :
// sept modèles distincts par leur adresse, tous de la forme de tests/gfx/fakeGltf.js. Une suite de tirages changée sans
// le vouloir rougit ici ; changée sciemment (le multijoueur du lot 6 ajoute ses tirages sous une autre graine, mais
// place les pièces d'arme hors des meubles), la référence se régénère par REGENERER_TIRAGES_PVP=1 npx vitest run
// tests/pvp/tirages.test.js, avec une note dans le commit.
//
// Témoin : un seul tirage de plus pendant la création de la foule (le 40e appel à Math.random de la manche, rejoué
// deux fois) change l'empreinte (vu rouge, plus bas).

vi.mock('../../src/main.js', () => ({ setCampaignPaused: vi.fn() }))
vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  return {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500),
    sun: new THREE.DirectionalLight(),
    renderer: { render() {}, domElement: document.createElement('canvas') },
    setLighting() {},
  }
})
vi.mock('../../src/pvp/pvpIntro.js', () => ({
  playPvpIntro() {},
  isPvpIntroActive: () => false,
  stopPvpIntro() {},
}))
// Faux modèles : chacun porte son adresse (le clone la garde dans son userData).
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const { fakeCharacter } = await import('../gfx/fakeGltf.js')
  return {
    GLTFLoader: class {
      async loadAsync(url) {
        const g = fakeCharacter()
        g.scene.userData.url = url
        return g
      }
    },
  }
})

const REFERENCE = resolve(__dirname, 'tirages-pvp.json')
const SEEDS = [777, 4242]

let pvp, scene
beforeAll(async () => {
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
  document.body.innerHTML = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '')
  HTMLElement.prototype.requestPointerLock = function () {}
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  ;({ scene } = await import('../../src/scene.js'))
  const characters = await import('../../src/characters.js')
  await characters.preloadCharacters()
  pvp = await import('../../src/pvp/index.js')
})

const fichier = url => url.split('/').pop().replace(/\.glb$/, '')
const r = (v, n) => v.toFixed(n)

// Les personnages de la manche, dans l'ordre de la scène : un groupe dont un enfant est un clone de modèle.
function empreinte() {
  const out = []
  for (const g of scene.children) {
    const modele = g.children.find(c => c.userData && c.userData.url)
    if (!modele) continue
    let teinte = null
    modele.traverse(o => { if (teinte === null && o.isSkinnedMesh) teinte = o.material.color.getHexString() })
    out.push(`${fichier(modele.userData.url)} ${teinte} ${r(modele.scale.x, 5)} ${r(g.position.x, 3)},${r(g.position.z, 3)}`)
  }
  return out
}

// Une manche montée comme au départ (buildRoundScene, celle du jeu et de la route ?memtest=1), son empreinte, puis
// la manche retirée.
function manche(seed, role) {
  pvp.buildRoundScene(seed, role)
  const e = empreinte()
  pvp.releaseRoundScene()
  return e
}

describe('PvP : la foule et l\'avatar tirés à graine fixe, comme avant le casting des missions', () => {
  if (process.env.REGENERER_TIRAGES_PVP) {
    it('régénère la référence', () => {
      const ref = Object.fromEntries(SEEDS.map(s => [s, manche(s, 'sniper')]))
      writeFileSync(REFERENCE, JSON.stringify(ref, null, 1) + '\n')
    })
    return
  }

  it('la référence existe : 54 personnages de foule et l\'avatar par graine', () => {
    expect(existsSync(REFERENCE), 'tests/pvp/tirages-pvp.json manque').toBe(true)
    const ref = JSON.parse(readFileSync(REFERENCE, 'utf8'))
    for (const s of SEEDS) expect(ref[s], `graine ${s}`).toHaveLength(55)
    // Les sept faux modèles ont la même forme : seuls les trois du pool des civils peuvent sortir dans la foule
    const modeles = new Set(SEEDS.flatMap(s => ref[s].map(l => l.split(' ')[0])))
    expect([...modeles].sort()).toEqual(['gangster_man_02', 'mafia_woman_02', 'mafia_woman_03'])
  })

  for (const role of ['sniper', 'pnj']) {
    it(`les deux machines tirent la même manche qu'avant (rôle ${role})`, () => {
      const ref = JSON.parse(readFileSync(REFERENCE, 'utf8'))
      for (const s of SEEDS) expect(manche(s, role), `graine ${s}`).toEqual(ref[s])
    })
  }

  it('témoin : un tirage de plus pendant la foule change l\'empreinte', () => {
    const ref = JSON.parse(readFileSync(REFERENCE, 'utf8'))
    // withSeed (src/pvp/index.js) pose un générateur à graine sur Math.random, puis remet l'ancien : l'arène d'abord (1re pose,
    // puis le retour), la foule ensuite (3e pose), l'avatar enfin. Pendant la foule, son 40e tirage en consomme deux.
    const desc = Object.getOwnPropertyDescriptor(Math, 'random')
    const vrai = Math.random
    let gen = vrai, poses = 0, tiragesFoule = 0, perdu = null
    const aiguillage = () => {
      if (poses === 3 && ++tiragesFoule === 40) perdu = gen()
      return gen()
    }
    Object.defineProperty(Math, 'random', {
      configurable: true,
      get: () => aiguillage,
      set: g => { poses++; gen = g === aiguillage ? vrai : g },
    })
    try {
      expect(manche(SEEDS[0], 'sniper')).not.toEqual(ref[SEEDS[0]])
      expect(perdu, 'le tirage de plus n\'a pas eu lieu pendant la foule').not.toBeNull()
    } finally {
      Object.defineProperty(Math, 'random', desc)
    }
  })
})
