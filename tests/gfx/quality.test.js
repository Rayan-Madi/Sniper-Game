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

  it('au plus un changement par seconde, même avec une fenêtre de mesure plus courte', () => {
    // La fenêtre de 2 s qui suit un changement espace déjà les changements ; minIntervalMs garde la règle d'une seconde
    // quand la fenêtre est plus courte.
    const ch = changes(feed(createResolutionController({ min: 0.7, max: 1, windowMs: 500 }), steady(30, 10)))
    expect(ch.length).toBeGreaterThan(1)
    for (let i = 1; i < ch.length; i++) expect(ch[i].t - ch[i - 1].t).toBeGreaterThanOrEqual(1000)
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

// ─── Résolution dynamique sur un écran synchronisé ────────────────────────────────────────────────────────────────
// main.js nourrit le contrôleur de l'écart entre les horodatages que requestAnimationFrame passe à deux images
// successives (main.quality.test.js). Sur un écran synchronisé, une image prête à temps part à la synchro suivante :
// l'écart vaut la période de l'écran (16,7 ms à 60 Hz) quel que soit le coût de l'image, et une image en retard attend
// la synchro d'après (33,3 ms). Le seuil de 14 ms n'y est jamais atteint (relecture de L4).
const HZ60 = 1000 / 60
// Hasard à graine (mulberry32) pour la gigue.
function prng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = a
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
// Écran synchronisé : chaque image coûte cost(échelle) ms et part à la première synchro qui suit ; l'instant mesuré
// arrive avec un retard de 0 à jitterMs sur la synchro (gigue : celle de performance.now() lu dans le rappel ;
// l'horodatage de requestAnimationFrame n'en a guère), donc l'écart mesuré en garde la différence.
function vsyncRun(ctrl, cost, seconds, { periodMs = HZ60, jitterMs = 0, seed = 1, t0 = 0, scale0 = 1 } = {}) {
  const rnd = prng(seed)
  const out = []
  let vsync = t0, t = t0, scale = scale0
  while (vsync - t0 < seconds * 1000) {
    vsync += Math.max(1, Math.ceil(cost(scale) / periodMs - 1e-9)) * periodMs
    const now = vsync + rnd() * jitterMs
    const ms = now - t
    t = now
    scale = ctrl.push(ms, t)
    out.push({ t, ms, scale })
  }
  return out
}

// À-coups passagers sur un écran à 60 Hz : une image coûte 9 ms (à la cadence de l'écran, avec de la marge) ; toutes
// les periodS secondes, un à-coup de `frames` images à frameMs (par défaut 12 à 40 ms : explosion, kill-cam), pendant
// totalS secondes, avec une gigue d'appel de jitterMs au plus (0,8 ms par défaut). phaseS : secondes calmes avant le
// premier à-coup (la phase des à-coups par rapport aux remontées) ; seed : tirage de la gigue. Rend la trace, l'échelle
// à la fin de chaque cycle (juste avant l'à-coup suivant) et, pour chaque à-coup, le temps mis à revenir à 1 depuis son
// début (Infinity s'il n'y revient pas dans son cycle).
function burstsRun(periodS, totalS, { frames = 12, frameMs = 40, jitterMs = 0.8, phaseS = 0, seed = 0 } = {}) {
  const ctrl = auto()
  const trace = []
  const endOfCycle = []
  const backToOne = []
  let t = 0
  if (phaseS > 0) {
    const before = vsyncRun(ctrl, () => 9, phaseS, { jitterMs, seed: 1000 + seed })
    trace.push(...before)
    t = before.at(-1).t
  }
  for (let cycle = 0; cycle < Math.round(totalS / periodS); cycle++) {
    const start = t
    for (let k = 0; k < frames; k++) { t += frameMs; trace.push({ t, scale: ctrl.push(frameMs, t) }) }
    const calm = vsyncRun(ctrl, () => 9, periodS - frames * frameMs / 1000,
      { jitterMs, seed: seed * 100 + cycle + 1, t0: t, scale0: trace.at(-1).scale })
    trace.push(...calm)
    t = calm.at(-1).t
    endOfCycle.push(calm.at(-1).scale)
    const cycleTrace = trace.filter(s => s.t > start)
    const firstDrop = cycleTrace.findIndex(s => s.scale < 1)
    const back = firstDrop < 0 ? null : cycleTrace.slice(firstDrop).find(s => s.scale === 1)
    backToOne.push(firstDrop < 0 ? 0 : back ? back.t - start : Infinity)
  }
  return { trace, endOfCycle, backToOne }
}

describe('résolution dynamique sur un écran synchronisé à 60 Hz', () => {
  it('après chaque à-coup passager, l\'échelle revient à 1', () => {
    // Un à-coup toutes les 30 s pendant 2 min.
    const { trace, endOfCycle } = burstsRun(30, 120)
    expect(Math.min(...trace.map(s => s.scale))).toBeGreaterThanOrEqual(0.9 - 1e-9)   // un à-coup coûte deux pas au plus
    expect(endOfCycle).toEqual([1, 1, 1, 1])
  })

  // Relecture de L4 (spec §8) : une baisse qui suivait une remontée de moins de 2 s plus l'attente comptait comme un
  // essai manqué, même pour un à-coup passager, et l'attente ne redescendait plus de la mission. Un à-coup toutes les
  // 15 ou 20 s tombait donc juste après la remontée à 1 : attente doublée à chaque fois, et l'échelle finissait bloquée
  // à 0,7 (à 77 s pour 15 s, à 100 s pour 20 s). Un essai ne compte comme manqué que si la fenêtre qui provoque la
  // baisse a une médiane hors cadence ; celle d'un à-coup passager reste à la cadence.
  for (const periodS of [20, 15]) {
    it(`à-coup toutes les ${periodS} s pendant 2 min : retour à 1 moins de 15 s après chacun`, () => {
      const { trace, endOfCycle, backToOne } = burstsRun(periodS, 120)
      expect(Math.min(...trace.map(s => s.scale))).toBeGreaterThanOrEqual(0.9 - 1e-9)
      expect(endOfCycle).toEqual(Array(120 / periodS).fill(1))
      for (const ms of backToOne) expect(ms).toBeLessThan(15000)
    })
  }

  // Limite connue (spec §4.3 et §8) : les retours à 1 supposent une gigue d'appel faible. Jusqu'à 1,5 ms, l'écart
  // mesuré entre deux images d'une période calme reste sous le seuil de remontée (cadence × 1,1, 18,3 ms) : aucune de
  // ses images ne compte comme hors cadence, et la fenêtre d'un à-coup n'a d'images hors cadence que dans un ou deux de
  // ses quarts.
  for (const periodS of [20, 15]) {
    it(`gigue d'appel de 1,5 ms, à-coup toutes les ${periodS} s pendant 2 min : l'échelle finit à 1 (20 phases)`, () => {
      const ends = []
      for (let k = 0; k < 20; k++) {
        ends.push(burstsRun(periodS, 120, { jitterMs: 1.5, phaseS: k * periodS / 20, seed: k + 1 }).endOfCycle.at(-1))
      }
      expect(ends).toEqual(Array(20).fill(1))
    })
  }

  it('gigue d\'appel uniforme de 2 ms : l\'échelle remonte encore jusqu\'à 1', () => {
    // L'écart mesuré entre deux appels va de 14,7 à 18,7 ms autour de la période (16,7 ms) ; sa p95, vers 18 ms, reste
    // sous le seuil de remontée (cadence × 1,1 = 18,3 ms), de peu. 10 s lourdes (une synchro sur deux : l'échelle
    // baisse), puis 90 s légères.
    const ctrl = auto()
    const heavy = vsyncRun(ctrl, () => 30, 10, { jitterMs: 2 })
    const low = heavy.at(-1).scale
    expect(low).toBeLessThan(1)
    const light = vsyncRun(ctrl, () => 9, 90, { jitterMs: 2, seed: 7, t0: heavy.at(-1).t, scale0: low })
    const ch = changes(light, low)
    // (la fenêtre garde encore des images lourdes au début : un dernier pas de baisse peut tomber)
    const firstUp = ch.findIndex(c => c.to > c.from)
    expect(firstUp).toBeGreaterThanOrEqual(0)
    expect(ch.slice(firstUp).every(c => c.to > c.from)).toBe(true)
    expect(light.at(-1).scale).toBe(1)
  })

  it('qui ne tient pas la cadence à 1 : les essais de remontée s\'espacent', () => {
    // Coût proportionnel aux pixels : 17,5 ms à 1 (chaque image manque sa synchro : 33,3 ms), 15,8 ms à 0,95 (à la
    // cadence). Sans essayer, rien ne dit que 1 ne tient pas : le contrôleur essaie, puis attend deux fois plus
    // longtemps avant chaque nouvel essai, 64 s au plus.
    const trace = vsyncRun(auto(), s => 17.5 * s * s, 300)
    const ch = changes(trace)
    for (const c of ch) expect(Math.min(c.from, c.to)).toBeCloseTo(0.95, 10)   // seulement entre 0,95 et 1
    const ups = ch.filter(c => c.to > c.from).map(c => c.t)
    expect(ups.length).toBeGreaterThanOrEqual(3)          // il réessaie
    expect(ups.length).toBeLessThanOrEqual(8)             // de moins en moins souvent
    const gaps = ups.slice(1).map((u, i) => u - ups[i])
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThanOrEqual(gaps[i - 1] - 50)
    expect(gaps.at(-1)).toBeGreaterThanOrEqual(60000)
    // Chaque essai manque toute sa fenêtre (33,3 ms, médiane hors cadence) : il compte, essais à la seconde près
    // (spec §4.3), inchangés par la règle des à-coups passagers et par celle des images étalées.
    expect(ups.map(u => Math.round(u / 1000))).toEqual([8, 20, 40, 76, 144, 212, 280])
  })

  it('écran à 120 Hz tenu à 60 images par seconde : une synchro sur deux n\'est pas la cadence, pas de remontée', () => {
    // 3 s légères (8,3 ms, la cadence), 10 s lourdes (33,3 ms : l'échelle baisse), puis 30 s à 16,7 ms : au-dessus du
    // seuil de 14 ms, et pas à la cadence de cet écran. La cadence est la plus petite médiane vue, pas la médiane du
    // moment (sinon toute suite régulière sous 19,2 ms ferait remonter).
    const ctrl = auto()
    const p = 1000 / 120
    const light = vsyncRun(ctrl, () => 5, 3, { periodMs: p })
    const heavy = vsyncRun(ctrl, () => 30, 10, { periodMs: p, t0: light.at(-1).t })
    const before = heavy.at(-1).scale
    expect(before).toBeLessThan(1)
    const mid = vsyncRun(ctrl, () => 12, 30, { periodMs: p, t0: heavy.at(-1).t })
    // (la fenêtre garde encore des images lourdes au début : un dernier pas de baisse peut tomber)
    expect(changes(mid, before).filter(c => c.to > c.from)).toEqual([])
  })

  it('une image à 30 images par seconde n\'est pas à la cadence : pas de remontée', () => {
    // Coût de 20 ms à toute échelle (le processeur, pas les pixels) : une synchro sur deux, 33,3 ms, l'échelle descend
    // jusqu'à 0,7 et y reste.
    const ch = changes(vsyncRun(auto(), () => 20, 60))
    expect(ch.every(c => c.to < c.from)).toBe(true)
    expect(ch.at(-1).to).toBeCloseTo(0.7, 10)
  })
})

// ─── Essai manqué : images hors cadence étalées (spec §8, relecture de la correction de L4) ──────────────────────────
// Un essai de remontée dont une partie seulement des images manque la synchro (médiane à la cadence) ne comptait pas
// comme manqué : une machine juste à la limite à l'échelle 1, la cible même d'Auto, réessayait toutes les 8 s avec 2 s
// de saccades à chaque fois. Règle retenue le 9 octobre 2026 : l'essai est aussi manqué si la fenêtre qui fait
// retomber l'échelle a au moins une image hors cadence dans chacun de ses quatre quarts (500 ms), ce qu'un à-coup de
// moins d'une seconde ne peut pas faire, quel que soit le coût de ses images.

// Machine dont une part `part` des images manque la synchro à l'échelle 1 : coût tiré uniformément entre 15 ms et la
// borne qui donne cette part au-dessus de la période (17,5 ms pour un tiers), proportionnel aux pixels. À 0,95, chaque
// image tient la synchro jusqu'à une part de 50 %.
function edgeMachine(part, seed) {
  const rnd = prng(seed * 7919)
  const top = (HZ60 - 15 * part) / (1 - part)
  return s => (15 + (top - 15) * rnd()) * s * s
}
const trialsOf = trace => changes(trace).filter(c => c.to > c.from).map(c => c.t)
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length

describe('essai manqué : images hors cadence étalées sur toute la fenêtre', () => {
  it('machine juste à la limite à l\'échelle 1 (un tiers des images hors synchro) : 7 essais en 5 min, pas 37', () => {
    const traces = []
    for (let seed = 1; seed <= 8; seed++) traces.push(vsyncRun(auto(), edgeMachine(1 / 3, seed), 300))
    const trials = traces.map(trialsOf)
    // 37 essais par tirage avant la règle (un toutes les 8 s), 7 avec : à 8, 20, 40, 76, 144, 212 et 280 s.
    for (const ups of trials) expect(ups.length).toBeLessThanOrEqual(8)
    // Environ 1 150 images à 33,3 ms (synchro manquée) en 5 min avant la règle, environ 240 avec (moyenne des tirages).
    expect(mean(traces.map(trace => trace.filter(s => s.ms > 25).length))).toBeLessThan(300)
    for (const trace of traces) {
      for (const c of changes(trace)) expect(Math.min(c.from, c.to)).toBeCloseTo(0.95, 10)   // entre 0,95 et 1
    }
    for (const ups of trials) {
      const gaps = ups.slice(1).map((u, i) => u - ups[i])
      for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThanOrEqual(gaps[i - 1] - 50)   // s'espacent
      expect(gaps.at(-1)).toBeGreaterThanOrEqual(60000)
    }
  })

  // La part des images hors cadence (au moins 20 ou 25 % de la fenêtre, proposition de la relecture) ne règle pas ces
  // machines : 34, 37 et 28 essais en moyenne pour 5, 10 et 15 % avec un seuil de 20 % (spec §4.3).
  for (const part of [0.05, 0.10, 0.15]) {
    it(`machine dont ${Math.round(part * 100)} % des images manquent la synchro à 1 : essais espacés aussi`, () => {
      const counts = []
      for (let seed = 1; seed <= 8; seed++) counts.push(trialsOf(vsyncRun(auto(), edgeMachine(part, seed), 300)).length)
      expect(mean(counts)).toBeLessThanOrEqual(11)   // de 33 à 37 avant la règle
      for (const n of counts) expect(n).toBeLessThanOrEqual(14)
    })
  }

  // Un à-coup de moins d'une seconde n'a d'images hors cadence que dans trois quarts au plus : retour à 1 à chaque
  // fois, quelle que soit sa phase. Avec la part des images (seuil de 20 %), un tel à-coup tombé dans les 2 s qui
  // suivent une remontée compterait comme un essai manqué, et l'échelle finirait à 0,75 après 2 min.
  for (const [frames, frameMs] of [[24, 40], [16, 60]]) {
    it(`à-coup d'une seconde (${frames} images à ${frameMs} ms) toutes les 15 s, 2 min : retour à 1 (20 phases)`, () => {
      for (let k = 0; k < 20; k++) {
        const { trace, endOfCycle } = burstsRun(15, 120, { frames, frameMs, phaseS: k * 15 / 20, seed: k + 1 })
        expect(endOfCycle, `phase ${k}`).toEqual(Array(8).fill(1))
        expect(Math.min(...trace.map(s => s.scale))).toBeGreaterThanOrEqual(0.9 - 1e-9)
      }
    })
  }
})
