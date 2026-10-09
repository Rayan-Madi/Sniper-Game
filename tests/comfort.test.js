import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  reducedMotionActive, systemReducedMotion, shotFlash, SHOT_FLASH,
  fullscreenLabel, toggleFullscreen, bindFullscreenButton,
} from '../src/comfort.js'
import { createKit } from '../src/briefing/kit.js'

// Confort (spec du lot 1 §4.5, tâche L6).
// - Effets atténués : réglage « Auto » (suit prefers-reduced-motion du système), « Oui » ou « Non » (forcés). Actif :
//   flash du tir à 0,06 d'opacité au lieu de 0,22, aucune secousse dans les cinématiques, glitchs à un tiers
//   d'intensité et sans glitchs d'ambiance (ces deux-là dans tests/briefing/kit.test.js).
// - Plein écran : bouton de la section « Affichage » des Paramètres ; toute la page (document.documentElement), sous
//   Electron comme dans un navigateur ; son libellé dit ce qu'il va faire et suit fullscreenchange (sortie par Échap).

const alpha = el => {
  const m = /rgba\(\s*255,\s*255,\s*255,\s*([\d.]+)\s*\)/.exec(el.style.background || el.style.backgroundColor)
  return m ? +m[1] : null
}

describe('effets atténués : le réglage et le système', () => {
  it('Oui : atténués, que le système le demande ou non', () => {
    expect(reducedMotionActive('oui', false)).toBe(true)
    expect(reducedMotionActive('oui', true)).toBe(true)
  })

  it('Non : jamais atténués, même si le système le demande', () => {
    expect(reducedMotionActive('non', true)).toBe(false)
    expect(reducedMotionActive('non', false)).toBe(false)
  })

  it('Auto : suit le système', () => {
    expect(reducedMotionActive('auto', true)).toBe(true)
    expect(reducedMotionActive('auto', false)).toBe(false)
  })

  it('le système : prefers-reduced-motion: reduce lu par matchMedia', () => {
    const asked = []
    const win = matches => ({ matchMedia: q => { asked.push(q); return { matches } } })
    expect(systemReducedMotion(win(true))).toBe(true)
    expect(systemReducedMotion(win(false))).toBe(false)
    expect(asked).toEqual(['(prefers-reduced-motion: reduce)', '(prefers-reduced-motion: reduce)'])
  })

  it('le système sans matchMedia, ou qui le refuse : effets normaux, aucune erreur', () => {
    expect(systemReducedMotion({})).toBe(false)
    expect(systemReducedMotion(undefined)).toBe(false)
    expect(systemReducedMotion({ matchMedia: () => { throw new Error('refusé') } })).toBe(false)
  })
})

describe('flash du tir', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

  it('effets normaux : voile blanc à 0,22, comme avant le lot', () => {
    expect(SHOT_FLASH.normal).toBe(0.22)
    expect(alpha(shotFlash(false))).toBe(0.22)
  })

  it('effets atténués : voile blanc à 0,06', () => {
    expect(SHOT_FLASH.reduced).toBe(0.06)
    expect(alpha(shotFlash(true))).toBe(0.06)
  })

  it('le voile ne capte pas la souris, s\'efface après 40 ms et quitte la page 120 ms plus tard', () => {
    for (const reduced of [false, true]) {
      const f = shotFlash(reduced)
      expect(f.parentNode).toBe(document.body)
      expect(f.style.pointerEvents).toBe('none')
      vi.advanceTimersByTime(40)
      expect(f.style.opacity).toBe('0')
      expect(f.parentNode).toBe(document.body)
      vi.advanceTimersByTime(120)
      expect(f.parentNode).toBeNull()
    }
    expect(vi.getTimerCount()).toBe(0)
  })
})

// Critère du §6 de la spec : les trois réglages changent bien l'opacité du flash et les secousses des cinématiques.
describe('les trois réglages, de bout en bout (flash du tir et secousse du kit)', () => {
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })
  const mountScene = () => {
    document.body.innerHTML = '<div id="root"><div class="st" id="st"><div class="scene" id="scene"></div></div></div>'
    return document.getElementById('root')
  }
  const CASES = [
    ['auto', false, 0.22, 1], ['auto', true, 0.06, 0],
    ['oui', false, 0.06, 0], ['oui', true, 0.06, 0],
    ['non', false, 0.22, 1], ['non', true, 0.22, 1],
  ]
  for (const [setting, system, flash, shakes] of CASES) {
    it(`${setting}, système ${system ? 'réduit' : 'normal'} : flash à ${flash}, ${shakes} secousse`, () => {
      vi.useFakeTimers()
      const reduced = reducedMotionActive(setting, system)
      expect(alpha(shotFlash(reduced))).toBe(flash)
      const root = mountScene()
      const st = root.querySelector('#st')
      const K = createKit({ root, reducedMotion: reduced })
      let seen = 0
      const add = st.classList.add.bind(st.classList)
      st.classList.add = (...c) => { if (c.includes('shake')) seen++; return add(...c) }
      K.shake()
      expect(seen).toBe(shakes)
      expect(st.classList.contains('shake')).toBe(shakes === 1)
      K.destroy()
    })
  }
})

function fakeDocument({ full = false, refuse = false, api = true } = {}) {
  const doc = new EventTarget()
  doc.fullscreenElement = null
  doc.documentElement = {}
  doc.exitFullscreen = vi.fn(async () => { doc.fullscreenElement = null })
  doc.documentElement.requestFullscreen = vi.fn(async () => {
    if (refuse) throw new TypeError('Permissions check failed')
    doc.fullscreenElement = doc.documentElement
  })
  if (full) doc.fullscreenElement = doc.documentElement
  if (!api) { delete doc.exitFullscreen; delete doc.documentElement.requestFullscreen }
  return doc
}

describe('plein écran', () => {
  it('fenêtré : le libellé propose d\'activer, et la bascule met toute la page en plein écran', async () => {
    const doc = fakeDocument()
    expect(fullscreenLabel(doc)).toBe('ACTIVER')
    await toggleFullscreen(doc)
    expect(doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1)
    expect(doc.exitFullscreen).not.toHaveBeenCalled()
    expect(fullscreenLabel(doc)).toBe('QUITTER')
  })

  it('plein écran : le libellé propose de quitter, et la bascule en sort', async () => {
    const doc = fakeDocument({ full: true })
    expect(fullscreenLabel(doc)).toBe('QUITTER')
    await toggleFullscreen(doc)
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1)
    expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled()
    expect(fullscreenLabel(doc)).toBe('ACTIVER')
  })

  it('refus du navigateur : aucune erreur non rattrapée, le libellé ne change pas', async () => {
    const doc = fakeDocument({ refuse: true })
    await expect(toggleFullscreen(doc)).resolves.toBeUndefined()
    expect(fullscreenLabel(doc)).toBe('ACTIVER')
  })

  it('navigateur sans plein écran : rien ne casse', async () => {
    const doc = fakeDocument({ api: false })
    await expect(toggleFullscreen(doc)).resolves.toBeUndefined()
    expect(fullscreenLabel(doc)).toBe('ACTIVER')
  })

  describe('bouton des Paramètres', () => {
    let button
    beforeEach(() => { document.body.innerHTML = '<button id="fs">?</button>'; button = document.getElementById('fs') })
    afterEach(() => { document.body.innerHTML = '' })
    const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

    it('libellé posé dès le branchement, selon l\'état du moment', () => {
      bindFullscreenButton(button, fakeDocument())
      expect(button.textContent).toBe('ACTIVER')
      document.body.innerHTML = '<button id="fs2">?</button>'
      const other = document.getElementById('fs2')
      bindFullscreenButton(other, fakeDocument({ full: true }))
      expect(other.textContent).toBe('QUITTER')
    })

    it('un clic bascule, et le libellé suit le fullscreenchange qui en résulte', async () => {
      const doc = fakeDocument()
      doc.documentElement.requestFullscreen = vi.fn(async () => {
        doc.fullscreenElement = doc.documentElement
        doc.dispatchEvent(new Event('fullscreenchange'))
      })
      bindFullscreenButton(button, doc)
      button.click(); await settle()
      expect(doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1)
      expect(button.textContent).toBe('QUITTER')
    })

    it('sortie par Échap ou par le système (fullscreenchange sans clic) : le libellé revient à ACTIVER', () => {
      const doc = fakeDocument({ full: true })
      bindFullscreenButton(button, doc)
      expect(button.textContent).toBe('QUITTER')
      doc.fullscreenElement = null
      doc.dispatchEvent(new Event('fullscreenchange'))
      expect(button.textContent).toBe('ACTIVER')
    })

    it('entrée par une autre voie (fullscreenchange sans clic) : le libellé passe à QUITTER', () => {
      const doc = fakeDocument()
      bindFullscreenButton(button, doc)
      doc.fullscreenElement = doc.documentElement
      doc.dispatchEvent(new Event('fullscreenchange'))
      expect(button.textContent).toBe('QUITTER')
    })
  })
})
