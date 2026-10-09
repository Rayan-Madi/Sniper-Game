import { describe, it, expect, vi, beforeEach } from 'vitest'

// Avancement et fin du chargement des modèles (spec du lot 1 §4.4) : charactersReady (promesse), charactersProgress
// (0 à 1, par octets reçus si les réponses donnent leur taille, sinon par fichiers) et charactersSettled (synchrone :
// main.js et pvp.js partent tout de suite quand les modèles sont prêts). Faux GLTFLoader piloté fichier par fichier :
// progrès annoncé comme le FileLoader de three (ProgressEvent : lengthComputable, loaded, total), puis réussite ou échec.
const loader = vi.hoisted(() => ({ pending: new Map() }))
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const THREE = await import('three')
  return {
    GLTFLoader: class {
      loadAsync(url, onProgress) {
        return new Promise((resolve, reject) => {
          loader.pending.set(url, {
            progress: (loaded, total) => onProgress && onProgress({ lengthComputable: total > 0, loaded, total }),
            ok: () => { loader.pending.delete(url); resolve({ scene: new THREE.Group(), animations: [] }) },
            fail: () => { loader.pending.delete(url); reject(new Error('404 ' + url)) },
          })
        })
      }
    },
  }
})

let C, urls
const flush = () => new Promise(r => setTimeout(r, 0))
const file = i => loader.pending.get(urls[i])

beforeEach(async () => {
  loader.pending = new Map()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.resetModules()
  C = await import('../src/characters.js')
  urls = Object.values(C.MODELS).flatMap(cfg => cfg.variants ? cfg.variants.map(v => v.url) : [cfg.url])
})

describe('chargement des modèles : fin et avancement', () => {
  it('rien en cours (aucun chargement lancé) : prêt, avancement à 1', async () => {
    expect(C.charactersSettled()).toBe(true)
    expect(C.charactersProgress()).toBe(1)
    await expect(C.charactersReady()).resolves.toBeUndefined()
  })

  it('charactersReady se tient quand chaque modèle est chargé ou en échec, pas avant', async () => {
    C.preloadCharacters()
    let ready = false
    C.charactersReady().then(() => { ready = true })
    expect(C.charactersSettled()).toBe(false)
    expect(loader.pending.size).toBe(urls.length)
    for (let i = 0; i < urls.length - 1; i++) (i === 2 ? file(i).fail() : file(i).ok())
    await flush()
    expect(ready).toBe(false)
    expect(C.charactersSettled()).toBe(false)
    expect(C.hasModel('civilian')).toBe(false)   // le dernier modèle des civils manque encore
    file(urls.length - 1).ok()
    await flush()
    expect(ready).toBe(true)
    expect(C.charactersSettled()).toBe(true)
    expect(C.charactersProgress()).toBe(1)
    for (const type of Object.keys(C.MODELS)) expect(C.hasModel(type), type).toBe(true)
  })

  it('avancement par octets reçus quand chaque réponse donne sa taille', async () => {
    C.preloadCharacters()
    expect(C.charactersProgress()).toBe(0)
    urls.forEach((u, i) => file(i).progress(0, 1000 * (i + 1)))
    const total = urls.reduce((s, u, i) => s + 1000 * (i + 1), 0)
    file(0).progress(500, 1000)
    file(3).progress(2000, 4000)
    expect(C.charactersProgress()).toBeCloseTo(2500 / total, 9)
    file(0).ok()                       // fichier fini : toute sa taille compte
    file(3).progress(4000, 4000)
    await flush()
    expect(C.charactersProgress()).toBeCloseTo(5000 / total, 9)
  })

  it('avancement par fichiers quand une réponse ne donne pas sa taille ; un échec compte comme fini', async () => {
    C.preloadCharacters()
    file(0).ok()
    file(1).fail()
    file(2).progress(300, 0)           // taille inconnue : compte pour 0 jusqu'à la fin
    await flush()
    expect(C.charactersProgress()).toBeCloseTo(2 / urls.length, 9)
  })
})
