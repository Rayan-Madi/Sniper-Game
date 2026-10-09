import { describe, it, expect } from 'vitest'
import { RECUL } from '../../src/shot/tuning.js'

// Recul (spec du lot 2, §3.3 ; plan, tâche T3) : à chaque tir, le regard monte de 2,5° (avec une dérive latérale de
// ±0,6° tirée au hasard) et revient en 0,45 s par un ressort amorti, sans rebond visible, à toute cadence d'image.
// update(dt) rend le décalage de visée en radians (tangage positif : vers le haut), que main.js ajoute au regard du
// joueur.
//
// Témoin : avant le lot 2, le tir ne bougeait pas la vue (mesuré dans Chrome sans interface au commit df6dd66 :
// tangage de la caméra inchangé 44, 150, 300 et 600 ms après le tir). Sans src/shot/recoil.js, les tests tournent sur
// ce comportement (aucunRecul) et échouent sur lui, pas sur l'absence du module.

// Chemin dans une variable : l'analyse des imports de Vite refuserait le fichier entier si le module manque.
const RECOIL_JS = '../../src/shot/recoil.js'
const recoilModule = await import(/* @vite-ignore */ RECOIL_JS).catch(() => null)
const aucunRecul = () => ({ kick() {}, reset() {}, update() { return { pitch: 0, yaw: 0 } } })
const createRecoil = recoilModule ? recoilModule.createRecoil : aucunRecul

const DEG = Math.PI / 180
const CADENCES = [30, 60, 144, 240]

// Générateur à graine dans [0, 1) : la même suite à chaque exécution.
function lcg(seed) {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

// Décalages (pitch, yaw) image par image pendant `secondes` à `fps`, après un coup ; le premier relevé est celui de la
// première image après le coup.
function suite(recoil, fps, secondes) {
  const out = []
  const dt = 1 / fps
  for (let t = dt; t <= secondes + 1e-9; t += dt) out.push({ t, ...recoil.update(dt) })
  return out
}

// Décalage au temps t (s) après le coup, en pas de 1/fps puis un reste : la cadence ne change que le découpage.
function aT(recoil, fps, t) {
  const dt = 1 / fps
  let r = { pitch: 0, yaw: 0 }, done = 0
  while (done + dt <= t + 1e-12) { r = recoil.update(dt); done += dt }
  if (t - done > 1e-12) r = recoil.update(t - done)
  return r
}

describe('le coup : le regard monte de 2,5°', () => {
  it('les valeurs de tuning.js sont celles de la spec (§3.3)', () => {
    expect(RECUL).toMatchObject({ angleDeg: 2.5, deriveDeg: 0.6, retourS: 0.45 })
  })

  it('juste après le coup, la vue est 2,5° plus haut (le réticule saute avec elle)', () => {
    const r = createRecoil(RECUL, () => 0.5)
    r.kick()
    const { pitch } = r.update(1e-4)
    expect(pitch / DEG).toBeCloseTo(2.5, 2)
  })

  it('la dérive latérale reste dans ±0,6°, des deux côtés, tirée au hasard', () => {
    const rand = lcg(7)
    const derives = []
    for (let i = 0; i < 400; i++) {
      const r = createRecoil(RECUL, rand)
      r.kick()
      derives.push(r.update(1e-6).yaw / DEG)
    }
    const max = Math.max(...derives.map(Math.abs))
    expect(max).toBeLessThanOrEqual(0.6 + 1e-6)
    expect(max).toBeGreaterThan(0.5)                       // toute la plage est atteinte
    expect(derives.filter(d => d > 0.05).length).toBeGreaterThan(100)
    expect(derives.filter(d => d < -0.05).length).toBeGreaterThan(100)
  })

  it('à graine égale, la même dérive : rejouable', () => {
    const tirs = seed => {
      const rand = lcg(seed), out = []
      const r = createRecoil(RECUL, rand)
      for (let i = 0; i < 5; i++) { r.reset(); r.kick(); out.push(r.update(1e-6).yaw) }
      return out
    }
    expect(tirs(42)).toEqual(tirs(42))
    expect(new Set(tirs(42)).size).toBe(5)
    expect(tirs(42).some(y => y !== 0)).toBe(true)
  })
})

describe('le retour : en 0,45 s, sans rebond, à toute cadence', () => {
  for (const fps of CADENCES) {
    it(`à ${fps} i/s : moins de 5 % du recul à 0,45 s, encore plus de 5 % à 0,40 s`, () => {
      const avant = createRecoil(RECUL, () => 1)
      avant.kick()
      const a = aT(avant, fps, 0.40)
      const apres = createRecoil(RECUL, () => 1)
      apres.kick()
      const b = aT(apres, fps, 0.45)
      expect(a.pitch / (2.5 * DEG), '0,40 s').toBeGreaterThan(0.05)
      expect(b.pitch / (2.5 * DEG), '0,45 s').toBeLessThanOrEqual(0.05 + 1e-9)
      expect(b.pitch, '0,45 s').toBeGreaterThanOrEqual(0)
      expect(Math.abs(b.yaw) / (0.6 * DEG), 'dérive à 0,45 s').toBeLessThanOrEqual(0.05 + 1e-9)
    })

    it(`à ${fps} i/s : aucune oscillation, le regard redescend sans passer sous la visée du joueur`, () => {
      const r = createRecoil(RECUL, () => 0)   // dérive de -0,6° : elle revient aussi sans dépasser
      r.kick()
      const s = suite(r, fps, 2)
      expect(s[0].pitch / DEG, 'première image : la vue est montée').toBeGreaterThan(2)
      expect(s[0].yaw / DEG, 'première image : dérive vers la gauche').toBeLessThan(-0.5)
      for (let i = 1; i < s.length; i++) {
        expect(s[i].pitch, `tangage à ${s[i].t.toFixed(3)} s`).toBeLessThanOrEqual(s[i - 1].pitch + 1e-15)
        expect(s[i].pitch, `tangage à ${s[i].t.toFixed(3)} s`).toBeGreaterThanOrEqual(0)
        expect(s[i].yaw, `lacet à ${s[i].t.toFixed(3)} s`).toBeGreaterThanOrEqual(s[i - 1].yaw - 1e-15)
        expect(s[i].yaw, `lacet à ${s[i].t.toFixed(3)} s`).toBeLessThanOrEqual(0)
      }
      expect(s.at(-1).pitch).toBeLessThan(1e-6 * DEG)
    })
  }

  it('le recul avance avec le temps, pas avec les images : même décalage à 0,2 s à toute cadence', () => {
    const vals = CADENCES.map(fps => {
      const r = createRecoil(RECUL, () => 0.8)
      r.kick()
      return aT(r, fps, 0.2)
    })
    expect(vals[0].pitch).toBeGreaterThan(0.05 * 2.5 * DEG)
    for (const v of vals) {
      expect(v.pitch).toBeCloseTo(vals[0].pitch, 12)
      expect(v.yaw).toBeCloseTo(vals[0].yaw, 12)
    }
  })

  it('un second coup pendant le retour s\'ajoute à ce qui reste', () => {
    const r = createRecoil(RECUL, () => 0.5)
    r.kick()
    const reste = aT(r, 60, 0.1).pitch
    r.kick()
    expect(r.update(1e-6).pitch).toBeCloseTo(reste + 2.5 * DEG, 5)
  })

  it('reset (montage d\'une mission) : plus aucun décalage', () => {
    const r = createRecoil(RECUL, () => 0.9)
    r.kick()
    expect(r.update(0.01).pitch, 'avant reset : la vue est montée').toBeGreaterThan(2 * DEG)
    r.reset()
    expect(r.update(1 / 60)).toEqual({ pitch: 0, yaw: 0 })
  })
})
