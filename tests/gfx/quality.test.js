import { describe, it, expect } from 'vitest'
import { PRESETS, presetFor, npcCastsShadow, createResolutionController } from '../../src/gfx/quality.js'

// Réglages graphiques (spec du lot 1 §4.3, tâche L4). Jusqu'ici le rendu était figé au maximum : densité de pixels
// jusqu'à 2, ombre 2048², ombre de chaque personnage, aucune résolution dynamique.

describe('préréglages : table du §4.3', () => {
  it('quatre préréglages, Auto en premier', () => {
    expect(PRESETS).toEqual(['auto', 'bas', 'moyen', 'haut'])
  })

  const TABLE = [
    // nom, dpr, densité, ombre, type, ombre des personnages, résolution dynamique
    ['bas', 1, 0.75, 1024, 'pcf', 'aucun', false],
    ['bas', 2, 0.75, 1024, 'pcf', 'aucun', false],
    ['moyen', 1, 1, 2048, 'pcf', 'cibles-gardes', false],
    ['moyen', 2, 1.25, 2048, 'pcf', 'cibles-gardes', false],
    ['haut', 1, 1, 2048, 'pcfsoft', 'tous', false],
    ['haut', 2, 2, 2048, 'pcfsoft', 'tous', false],
    ['auto', 1, 1, 2048, 'pcf', 'cibles-gardes', true],
    ['auto', 2, 1.25, 2048, 'pcf', 'cibles-gardes', true],
  ]
  for (const [name, dpr, pixelRatio, shadowSize, shadowType, npcShadows, dynamic] of TABLE) {
    it(`${name}, densité d'écran ${dpr}`, () => {
      expect(presetFor(name, dpr)).toEqual({ pixelRatio, shadowSize, shadowType, npcShadows, dynamic })
    })
  }

  it('écran de densité inférieure à 1 : Bas descend avec lui, Moyen et Haut le suivent', () => {
    expect(presetFor('bas', 0.5).pixelRatio).toBeCloseTo(0.375)
    expect(presetFor('moyen', 0.5).pixelRatio).toBe(0.5)
    expect(presetFor('haut', 0.5).pixelRatio).toBe(0.5)
  })

  it('nom inconnu ou absent (sauvegarde abîmée) : Auto ; densité absente ou invalide : 1', () => {
    expect(presetFor('ultra', 1)).toEqual(presetFor('auto', 1))
    expect(presetFor(undefined, 1)).toEqual(presetFor('auto', 1))
    expect(presetFor('haut', undefined).pixelRatio).toBe(1)
    expect(presetFor('haut', NaN).pixelRatio).toBe(1)
    expect(presetFor('haut', 0).pixelRatio).toBe(1)
  })
})

describe('ombre des personnages selon leur rôle', () => {
  it('Haut : tous ; Bas : aucun', () => {
    for (const role of ['cible', 'garde', 'civil']) {
      expect(npcCastsShadow('tous', role)).toBe(true)
      expect(npcCastsShadow('aucun', role)).toBe(false)
    }
  })
  it('Moyen et Auto : cibles et gardes, pas les civils', () => {
    expect(npcCastsShadow('cibles-gardes', 'cible')).toBe(true)
    expect(npcCastsShadow('cibles-gardes', 'garde')).toBe(true)
    expect(npcCastsShadow('cibles-gardes', 'civil')).toBe(false)
  })
})

// ─── Résolution dynamique ─────────────────────────────────────────────────────────────────────────────────────────
// Séquences de durées d'image synthétiques : l'horloge avance de la durée de chaque image.
function feed(ctrl, durations, t0 = 0) {
  let t = t0
  const out = []
  for (const ms of durations) { t += ms; out.push({ t, ms, scale: ctrl.push(ms, t) }) }
  return out
}
const steady = (ms, seconds) => Array(Math.round(seconds * 1000 / ms)).fill(ms)
// Changements d'échelle d'une séquence : { t, from, to }.
function changes(trace, start = 1) {
  const out = []
  let prev = start
  for (const s of trace) {
    if (s.scale !== prev) { out.push({ t: s.t, from: prev, to: s.scale }); prev = s.scale }
  }
  return out
}
// Retournements : une baisse suivie d'une hausse, ou l'inverse.
const reversals = ch => ch.slice(1).filter((c, i) => Math.sign(c.to - c.from) !== Math.sign(ch[i].to - ch[i].from)).length
const auto = () => createResolutionController({ min: 0.7, max: 1 })

describe('résolution dynamique (Auto)', () => {
  it('part de 1 et n\'y touche pas entre les deux seuils (16 ms tenues 20 s)', () => {
    const trace = feed(auto(), steady(16, 20))
    expect(changes(trace)).toEqual([])
  })

  it('baisse par pas de 0,05 quand la p95 sur 2 s dépasse 22 ms, jamais sous 0,7', () => {
    const trace = feed(auto(), steady(30, 30))
    const ch = changes(trace)
    expect(ch.length).toBe(6)                                  // 1 → 0,7
    for (const c of ch) expect(c.from - c.to).toBeCloseTo(0.05, 10)
    expect(trace.at(-1).scale).toBeCloseTo(0.7, 10)
    expect(Math.min(...trace.map(s => s.scale))).toBeGreaterThanOrEqual(0.7 - 1e-9)
  })

  it('la première baisse attend 2 s de mesure et ne tarde pas au-delà', () => {
    const ch = changes(feed(auto(), steady(30, 5)))
    expect(ch[0].t).toBeGreaterThanOrEqual(2000)
    expect(ch[0].t).toBeLessThanOrEqual(2100)
  })

  it('au plus un changement par seconde, même à 5 images par seconde', () => {
    const ch = changes(feed(auto(), steady(200, 20)))
    expect(ch.length).toBeGreaterThan(1)
    for (let i = 1; i < ch.length; i++) expect(ch[i].t - ch[i - 1].t).toBeGreaterThanOrEqual(1000)
  })

  it('quelques images lentes isolées (moins de 5 % sur 2 s) ne font pas baisser', () => {
    const seq = []
    for (let k = 0; k < 10; k++) seq.push(...steady(16, 2), 120)   // une image de 120 ms toutes les 2 s
    expect(changes(feed(auto(), seq))).toEqual([])
  })

  it('une image de plus d\'une seconde (onglet masqué, pause) ne compte pas comme une image lente', () => {
    const seq = [...steady(16, 3), 5000, ...steady(16, 3)]
    expect(changes(feed(auto(), seq))).toEqual([])
  })

  it('mesure interrompue (pause du jeu : plus nourri pendant 10 s) : une image lente à la reprise ne fait pas baisser', () => {
    const ctrl = auto()
    const before = feed(ctrl, steady(16, 3))
    const after = feed(ctrl, [30, ...steady(16, 3)], before.at(-1).t + 10000)
    expect(changes([...before, ...after])).toEqual([])
  })

  it('remonte sous 14 ms tenus 4 s, par pas de 0,05, jamais au-dessus de 1', () => {
    const ctrl = auto()
    const slow = feed(ctrl, steady(30, 20))
    expect(slow.at(-1).scale).toBeCloseTo(0.7, 10)
    const tFast = slow.at(-1).t
    const fast = feed(ctrl, steady(10, 40), tFast)
    const ch = changes(fast, 0.7)
    expect(ch[0].to).toBeGreaterThan(0.7)
    expect(ch[0].t - tFast).toBeGreaterThanOrEqual(4000)       // 4 s sous 14 ms avant de remonter
    expect(ch[0].t - tFast).toBeLessThanOrEqual(6100)          // fenêtre de 2 s vidée des images lentes, puis 4 s
    for (const c of ch) expect(c.to - c.from).toBeCloseTo(0.05, 10)
    expect(fast.at(-1).scale).toBeCloseTo(1, 10)
    expect(Math.max(...fast.map(s => s.scale))).toBeLessThanOrEqual(1 + 1e-9)
    for (let i = 1; i < ch.length; i++) expect(ch[i].t - ch[i - 1].t).toBeGreaterThanOrEqual(1000)
  })

  it('ne remonte pas si la p95 repasse au-dessus de 14 ms avant les 4 s', () => {
    const ctrl = auto()
    const slow = feed(ctrl, steady(30, 20))
    const seq = []
    for (let k = 0; k < 8; k++) seq.push(...steady(10, 3), ...steady(18, 2))   // 3 s rapides, 2 s entre les seuils
    expect(changes(feed(ctrl, seq, slow.at(-1).t), 0.7)).toEqual([])
  })

  it('aucune oscillation sur une séquence alternée image par image (10 ms, 30 ms)', () => {
    const seq = []
    for (let k = 0; k < 1500; k++) seq.push(k % 2 ? 30 : 10)
    const ch = changes(feed(auto(), seq))
    expect(reversals(ch)).toBe(0)
  })

  it('aucune oscillation sur des phases alternées (3 s lentes, 3 s rapides, 60 s)', () => {
    // 3 s rapides vident la fenêtre de 2 s des images lentes, sans tenir les 4 s qui font remonter.
    const seq = []
    for (let k = 0; k < 10; k++) seq.push(...steady(30, 3), ...steady(10, 3))
    const ch = changes(feed(auto(), seq))
    expect(ch.length).toBeGreaterThan(0)
    expect(reversals(ch)).toBe(0)
  })

  it('charge proportionnelle aux pixels : se pose sans osciller', () => {
    // Durée d'image proportionnelle au nombre de pixels (échelle²) : 30 ms à 1, 21,7 ms à 0,85 (sous le seuil de baisse).
    const ctrl = auto()
    let t = 0, scale = 1
    const trace = []
    for (let k = 0; k < 4000; k++) {
      const ms = 30 * scale * scale
      t += ms
      scale = ctrl.push(ms, t)
      trace.push({ t, scale })
    }
    const ch = changes(trace)
    expect(reversals(ch)).toBe(0)
    expect(trace.at(-1).scale).toBeCloseTo(0.85, 10)
  })
})
