import { describe, it, expect, vi, beforeEach } from 'vitest'

// Faux GLTFLoader : le n-ième fichier demandé répond APRÈS le (n+1)-ième
// (délais décroissants), comme un réseau où les gros fichiers arrivent en
// dernier. Les URL listées dans `failing` échouent.
const loaderState = vi.hoisted(() => ({ calls: 0, failing: new Set(), requested: [] }))
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const THREE = await import('three')
  return {
    GLTFLoader: class {
      loadAsync(url) {
        loaderState.requested.push(url)
        const delay = Math.max(1, 40 - loaderState.calls++ * 4)
        return new Promise((resolve, reject) => setTimeout(() => {
          if (loaderState.failing.has(url)) reject(new Error('404 ' + url))
          else resolve({ scene: new THREE.Group(), animations: [] })
        }, delay))
      }
    },
  }
})

async function freshModule() {
  vi.resetModules()
  return import('../src/characters.js')
}

function urlsOf(cfg) {
  return cfg.variants ? cfg.variants.map(v => v.url) : [cfg.url]
}

describe('preloadCharacters', () => {
  beforeEach(() => {
    loaderState.calls = 0
    loaderState.failing = new Set()
    loaderState.requested = []
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('chaque pool suit l\'ordre de MODELS, quel que soit l\'ordre d\'arrivée des fichiers', async () => {
    const { preloadCharacters, poolUrls, MODELS } = await freshModule()
    await preloadCharacters()
    for (const [type, cfg] of Object.entries(MODELS)) {
      expect(poolUrls(type), type).toEqual(urlsOf(cfg))
    }
  })

  it('un modèle en échec est écarté sans changer l\'ordre des autres', async () => {
    const { preloadCharacters, poolUrls, MODELS } = await freshModule()
    const civ = urlsOf(MODELS.civilian)
    loaderState.failing.add(civ[1])
    await preloadCharacters()
    expect(poolUrls('civilian')).toEqual([civ[0], civ[2]])
    expect(poolUrls('target')).toEqual(urlsOf(MODELS.target))
  })
})
