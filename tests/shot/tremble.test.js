import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { stepTremble, trembleRms, stepStress } from '../../src/aim.js'
import { TREMBLEMENT, APNEE, STRESS } from '../../src/shot/tuning.js'
import { MAIN_SRC, analyse, callsIn } from '../gfx/mainSource.js'

// Tremblement de la lunette réglé en angle (spec du lot 2, §3.6 ; plan, tâche T1). On le mesure comme le joueur le
// subit : par le décalage du réticule que scope.js donne en pixels (getTrembleOffset, aussi celui d'où part le rayon du
// tir dans main.js), converti en angle par le chemin du tir lui-même (pixels → coordonnées normalisées →
// Raycaster.setFromCamera, comme shoot()). Écran de 1920 × 1080.

const W = 1920, H = 1080

// Générateur congruentiel linéaire à graine : la même suite dans [0, 1) à chaque exécution.
function lcg(seed) {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

// Angles (mrad) du rayon de tir pour un décalage du réticule de (px, py) pixels, lunette au champ `fov` (degrés) :
// la conversion de shoot() (main.js) puis l'angle de la direction obtenue avec l'axe de la caméra, en x et en y.
const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000)
const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
function rayAngles(px, py, fov) {
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix() }
  ndc.set((px / W) * 2, -(py / H) * 2)
  raycaster.setFromCamera(ndc, camera)
  const d = raycaster.ray.direction
  return [1000 * Math.atan2(d.x, -d.z), 1000 * Math.atan2(d.y, -d.z)]
}

const fovAt = zoom => 60 / zoom

// Écart quadratique moyen radial (mrad) du rayon de tir, mesuré sur `secondes` de jeu après 10 s de mise en route,
// un relevé toutes les 4 images. `offset()` rend le décalage du réticule en pixels après chaque pas `step(dt)`.
function rms(step, offset, { fps, zoom, secondes = 400 }) {
  const dt = 1 / fps, debut = 10 * fps, fin = debut + secondes * fps
  let somme = 0, n = 0
  for (let i = 0; i < fin; i++) {
    step(dt)
    if (i >= debut && i % 4 === 0) {
      const { x, y } = offset()
      const [ax, ay] = rayAngles(x, y, fovAt(zoom))
      somme += ax * ax + ay * ay; n++
    }
  }
  return Math.sqrt(somme / n)
}

// scope.js neuf (et upgrades.js neuf) pour chaque mesure : l'état du tremblement ne passe pas d'une mesure à l'autre,
// et deux mesures à la même graine suivent la même suite d'à-coups.
async function mesureScope({ fps = 60, zoom = 4, stress = 0, steady = 1, stabilite = 0, graine = 7, secondes } = {}) {
  vi.resetModules()
  const U = await import('../../src/upgrades.js')
  U.state.levels.stability = stabilite
  const S = await import('../../src/scope.js')
  S.showScope(); S.setZoom(zoom); S.setStress(stress); S.setSteady(steady)
  const rand = lcg(graine)
  const spy = vi.spyOn(Math, 'random').mockImplementation(rand)
  try {
    return rms(dt => S.updateTremble(dt), () => S.getTrembleOffset(), { fps, zoom, secondes })
  } finally { spy.mockRestore() }
}

// Témoin : la loi d'avant le lot 2 (scope.js, commit d6f57e8), un tremblement réglé en pixels écran.
function mesureAncienne({ fps = 60, zoom = 4, stress = 0, graine = 7, secondes } = {}) {
  const t = { x: 0, y: 0, vx: 0, vy: 0, phase: 0 }
  const p = { intensity: 14 + stress * stress * 220, sway: 8 + stress * 30, breathRate: 1.2 + stress * 1.5 }
  const rand = lcg(graine)
  return rms(dt => stepTremble(t, p, dt, rand), () => t, { fps, zoom, secondes })
}

beforeEach(() => {
  document.body.innerHTML = '<canvas id="scope-canvas"></canvas>'
  Object.defineProperty(window, 'innerWidth', { value: W, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: H, configurable: true, writable: true })
})
afterEach(() => { vi.restoreAllMocks() })

describe('tremblement en angle', () => {
  it('les cibles de tuning.js sont celles de la spec (§3.6)', () => {
    expect([TREMBLEMENT.calme, TREMBLEMENT.stressMi, TREMBLEMENT.stressPlein]).toEqual([0.35, 1.6, 4.5])
    expect(APNEE.stabilite).toBe(0.15)
  })

  it('même écart angulaire à ×4 et à ×12 (témoin : la loi en pixels donne 3 fois moins à ×12)', async () => {
    const a4 = await mesureScope({ zoom: 4, stress: 0.5 })
    const a12 = await mesureScope({ zoom: 12, stress: 0.5 })
    expect(a12 / a4, `×12 / ×4 : ${(a12 / a4).toFixed(3)} (${a4.toFixed(3)} et ${a12.toFixed(3)} mrad)`).toBeGreaterThan(0.99)
    expect(a12 / a4, `×12 / ×4 : ${(a12 / a4).toFixed(3)}`).toBeLessThan(1.01)

    // La même mesure sur l'ancienne loi voit bien le défaut : la mesure n'est pas aveugle.
    const o4 = mesureAncienne({ zoom: 4, stress: 0.5 })
    const o12 = mesureAncienne({ zoom: 12, stress: 0.5 })
    expect(o12 / o4, `ancienne loi, ×12 / ×4 : ${(o12 / o4).toFixed(3)}`).toBeLessThan(0.4)
  })

  // Cibles du §3.6 à ±15 %, à 60 et à 144 images par seconde, aux deux bouts du zoom.
  const cibles = [[0, 0.35], [0.5, 1.6], [1, 4.5]]
  for (const [stress, cible] of cibles) {
    for (const fps of [60, 144]) {
      it(`stress ${stress} à ${fps} i/s : ${cible} mrad à ±15 %, à ×4 comme à ×12`, async () => {
        for (const zoom of [4, 12]) {
          const r = await mesureScope({ fps, zoom, stress })
          const ecart = r / cible - 1
          expect(Math.abs(ecart), `×${zoom} : ${r.toFixed(3)} mrad (${(ecart * 100).toFixed(1)} %)`).toBeLessThan(0.15)
        }
      })
    }
  }

  it('apnée : le tremblement est multiplié par 0,15 (stress 0,5, 60 et 144 i/s)', async () => {
    for (const fps of [60, 144]) {
      const r = await mesureScope({ fps, stress: 0.5, steady: APNEE.stabilite })
      const ecart = r / (1.6 * 0.15) - 1
      expect(Math.abs(ecart), `${fps} i/s : ${r.toFixed(3)} mrad (${(ecart * 100).toFixed(1)} %)`).toBeLessThan(0.15)
    }
  })

  it('Stabilité garde son effet relatif : niveau 2, tremblement × 0,6 (stress 0,5)', async () => {
    const r = await mesureScope({ stress: 0.5, stabilite: 2 })
    const ecart = r / (1.6 * 0.6) - 1
    expect(Math.abs(ecart), `${r.toFixed(3)} mrad (${(ecart * 100).toFixed(1)} %)`).toBeLessThan(0.15)
  })

  it('le réticule s\'écarte 3 fois plus à ×12 qu\'à ×4 : l\'angle vu dans la lunette est le même', async () => {
    // Décalage en pixels mesuré directement (pas par le rayon) : ce que dessine drawScope.
    async function pixels(zoom) {
      vi.resetModules()
      const S = await import('../../src/scope.js')
      S.showScope(); S.setZoom(zoom); S.setStress(0.5); S.setSteady(1)
      const spy = vi.spyOn(Math, 'random').mockImplementation(lcg(11))
      let somme = 0, n = 0
      try {
        for (let i = 0; i < 60 * 60; i++) {
          S.updateTremble(1 / 60)
          if (i >= 600) { const { x, y } = S.getTrembleOffset(); somme += x * x + y * y; n++ }
        }
      } finally { spy.mockRestore() }
      return Math.sqrt(somme / n)
    }
    const p4 = await pixels(4), p12 = await pixels(12)
    const attendu = Math.tan(Math.PI * 7.5 / 180) / Math.tan(Math.PI * 2.5 / 180)   // ≈ 3,01
    expect(p12 / p4, `pixels ×12 / ×4 : ${(p12 / p4).toFixed(3)}`).toBeGreaterThan(attendu * 0.99)
    expect(p12 / p4, `pixels ×12 / ×4 : ${(p12 / p4).toFixed(3)}`).toBeLessThan(attendu * 1.01)
  })
})

describe('écart du schéma discret (trembleRms)', () => {
  // Écart quadratique moyen radial de stepTremble simulé (2 000 s, graine fixe), pour des paramètres quelconques.
  function simule(p, fps) {
    const dt = 1 / fps, debut = 10 * fps, fin = debut + 2000 * fps
    const t = { x: 0, y: 0, vx: 0, vy: 0, phase: 0 }, rand = lcg(3)
    let somme = 0, n = 0
    for (let i = 0; i < fin; i++) {
      stepTremble(t, p, dt, rand)
      if (i >= debut) { somme += t.x * t.x + t.y * t.y; n++ }
    }
    return Math.sqrt(somme / n)
  }
  const p = { intensity: 69, sway: 23, breathRate: 1.95 }

  it('prédit l\'écart simulé à 30, 60 et 144 i/s à 3 % près (témoin : l\'approximation continue, 9 % trop haute à 60 i/s)', () => {
    for (const fps of [30, 60, 144]) {
      const sim = simule(p, fps), predit = trembleRms(p, 1 / fps)
      expect(Math.abs(predit / sim - 1), `${fps} i/s : prédit ${predit.toFixed(3)}, simulé ${sim.toFixed(3)}`).toBeLessThan(0.03)
    }
    // Équations continues équivalentes (taux d'amortissement par seconde) : la mesure distingue bien un calcul approché.
    const gv = -60 * Math.log(TREMBLEMENT.amortissement), gx = -60 * Math.log(TREMBLEMENT.rappel)
    const filtre = w => 1 / ((w * w + gv * gv) * (w * w + gx * gx))
    const continu = Math.sqrt(5 * p.intensity ** 2 / (gx * gv * (gx + gv))
      + p.sway ** 2 / 2 * (filtre(p.breathRate) + filtre(0.7 * p.breathRate)))
    expect(continu / simule(p, 60) - 1).toBeGreaterThan(0.05)
  })
})

describe('stress', () => {
  // Temps (s) pour que le stress, parti de `depuis`, atteigne `seuil` : en montant lunette ouverte, en descendant fermée.
  function duree(seuil, { fps = 60, scoped = true, rate = 1, depuis = 0 } = {}) {
    const dt = 1 / fps
    let s = depuis, t = 0
    const atteint = () => (scoped ? s >= seuil - 1e-12 : s <= seuil + 1e-12)
    while (!atteint() && t < 600) { s = stepStress(s, dt, { scoped, rate }); t += dt }
    return t
  }

  for (const fps of [60, 144]) {
    it(`lunette ouverte : moitié en 7,1 s, plein en 14,3 s, à ${fps} i/s (avant le lot 2 : plein en 2,1 s)`, () => {
      expect(duree(0.5, { fps })).toBeCloseTo(0.5 / 0.07, 1)
      expect(duree(1, { fps })).toBeCloseTo(1 / 0.07, 1)
    })
  }

  it('Sang-froid garde son effet relatif : au niveau 3 (stressRate 0,25), quatre fois plus lent', async () => {
    vi.resetModules()
    const U = await import('../../src/upgrades.js')
    U.state.levels.coldblood = 3
    const rate = U.getStats().stressRate
    expect(rate).toBe(0.25)
    expect(duree(0.5, { rate })).toBeCloseTo(0.5 / (0.07 * 0.25), 1)
    expect(duree(1, { rate })).toBeCloseTo(1 / (0.07 * 0.25), 1)
  })

  it('lunette fermée : il redescend de 0,5 par seconde, de plein à zéro en 2 s', () => {
    expect(duree(0, { scoped: false, depuis: 1 })).toBeCloseTo(2, 1)
    expect(duree(0, { scoped: false, depuis: 1, fps: 144 })).toBeCloseTo(2, 1)
  })

  it('apnée inchangée : 0,10 par seconde en plus de la montée (0,17 après 1 s d\'apnée)', () => {
    let s = 0
    for (let i = 0; i < 60; i++) s = stepStress(s, 1 / 60, { scoped: true, holding: true })
    expect(s).toBeCloseTo(0.07 + 0.10, 6)
  })

  it('reste entre 0 et 1', () => {
    expect(stepStress(0.99, 1, { scoped: true, holding: true })).toBe(1)
    expect(stepStress(0.01, 1, { scoped: false })).toBe(0)
  })

  it('les à-coups du stress sont ceux d\'avant le lot 2 (un tir : +0,12)', () => {
    expect(STRESS).toMatchObject({ parTir: 0.12, ouvertureLunette: 0.04, fermetureLunette: 0.06, tirManque: 0.15,
      cibleAbattue: 0.1, gardeTouche: 0.45 })
    expect(APNEE).toMatchObject({ dureeS: 4, rechargeS: 6, stressParS: 0.10 })
  })
})

describe('branchement dans main.js', () => {
  // main.js ne s'importe pas sous jsdom : on lit son source (tests/gfx/mainSource.js).
  const a = analyse(MAIN_SRC)
  const texte = n => a.source.slice(n.start, n.end)

  it('la boucle fait avancer le stress par stepStress (src/aim.js)', () => {
    expect(a.imports.get('stepStress')?.from).toBe('./aim.js')
    expect(callsIn(a, 'loop').some(c => c.callee === 'stepStress')).toBe(true)
  })

  it('aucun à-coup de stress écrit en dur : tous viennent de STRESS (src/shot/tuning.js)', () => {
    expect(a.imports.get('STRESS')?.from).toBe('./shot/tuning.js')
    const enDur = MAIN_SRC.split('\n').filter(l => /stress\s*[+-]\s*\d*\.\d/.test(l))
    expect(enDur).toEqual([])
  })

  it('apnée : stabilité, durée et recharge lues dans APNEE (src/shot/tuning.js)', () => {
    expect(a.imports.get('APNEE')?.from).toBe('./shot/tuning.js')
    const steady = callsIn(a, 'loop').filter(c => c.callee === 'setSteady').map(texte)
    expect(steady.length).toBeGreaterThan(0)
    for (const t of steady) expect(t, t).not.toMatch(/\d\.\d/)
    expect(steady.some(t => t.includes('APNEE.stabilite'))).toBe(true)
    const boucle = texte(a.fns.get('loop'))
    expect(boucle).toContain('APNEE.dureeS')
    expect(boucle).toContain('APNEE.rechargeS')
  })
})
