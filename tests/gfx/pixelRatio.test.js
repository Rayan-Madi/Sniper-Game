import { describe, it, expect } from 'vitest'
import { onPixelRatioChange } from '../../src/gfx/pixelRatio.js'

// Densité d'écran qui change (zoom du navigateur, fenêtre passée sur un écran d'une autre densité ; relecture de T2,
// spec du lot 2 §3.2). Une fenêtre passée sur un autre écran peut garder sa taille en pixels CSS, sans resize :
// onPixelRatioChange suit donc la media query de la densité courante, reposée après chaque changement.
//
// Fausse fenêtre : chaque requête « (resolution: Xdppx) » correspond quand devicePixelRatio vaut X, et prévient ses
// écouteurs « change » quand cette correspondance bascule, comme un navigateur (les écouteurs « once » une seule fois).
function fausseFenetre(dpr) {
  const requetes = []
  const win = {
    devicePixelRatio: dpr,
    matchMedia(media) {
      const m = /^\(resolution: ([\d.e+-]+)dppx\)$/.exec(media)
      if (!m) throw new Error(`requête inattendue : ${media}`)
      const x = Number(m[1])
      const mql = {
        media, ecouteurs: [],
        get matches() { return win.devicePixelRatio === x },
        addEventListener(type, cb, opts) { this.ecouteurs.push({ type, cb, once: !!opts?.once }) },
        removeEventListener(type, cb) { this.ecouteurs = this.ecouteurs.filter(e => e.type !== type || e.cb !== cb) },
      }
      mql.avant = mql.matches
      requetes.push(mql)
      return mql
    },
    // L'écran change de densité : les requêtes dont la correspondance bascule préviennent leurs écouteurs.
    changer(d) {
      win.devicePixelRatio = d
      for (const mql of [...requetes]) {
        if (mql.matches === mql.avant) continue
        mql.avant = mql.matches
        for (const e of [...mql.ecouteurs]) {
          if (e.type !== 'change') continue
          if (e.once) mql.removeEventListener('change', e.cb)
          e.cb({ matches: mql.matches, media: mql.media })
        }
      }
    },
    ecouteursActifs: () => requetes.reduce((n, q) => n + q.ecouteurs.filter(e => e.type === 'change').length, 0),
  }
  return win
}

describe('onPixelRatioChange', () => {
  it('prévient à chaque changement de densité, avec la nouvelle densité', () => {
    const win = fausseFenetre(1)
    const vus = []
    onPixelRatioChange(win, d => vus.push(d))
    win.changer(2)
    win.changer(1.25)
    win.changer(1)
    expect(vus).toEqual([2, 1.25, 1])
  })

  it('rien quand la densité ne change pas', () => {
    const win = fausseFenetre(1.5)
    const vus = []
    onPixelRatioChange(win, d => vus.push(d))
    win.changer(1.5)
    expect(vus).toEqual([])
  })

  it('un seul écouteur actif à la fois, même après dix changements (pas d\'accumulation)', () => {
    const win = fausseFenetre(1)
    let n = 0
    onPixelRatioChange(win, () => { n++ })
    for (let i = 0; i < 10; i++) win.changer(i % 2 ? 1 : 2)
    expect(n).toBe(10)
    expect(win.ecouteursActifs()).toBe(1)
  })

  it('sans matchMedia (jsdom, ancien moteur) : ne fait rien, sans erreur', () => {
    expect(() => onPixelRatioChange({ devicePixelRatio: 1 }, () => {})).not.toThrow()
  })
})
