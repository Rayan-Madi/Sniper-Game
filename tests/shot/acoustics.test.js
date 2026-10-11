import { describe, it, expect, vi, afterEach } from 'vitest'

// Écho de chaque carte (spec du lot 2, §3.5 ; plan, tâche T6) : une réponse impulsionnelle générée au montage de la
// carte, bruit à décroissance exponentielle et à graine, selon l'acoustique de la carte : rue (réflexions serrées),
// place, port (long, métallique), base (champ ouvert, court), colline (très ouvert), interieur (M6, court et sourd).
// Réglages : ACOUSTIQUES (src/shot/tuning.js). Ces tests mesurent la réponse elle-même : longueur, silence avant la
// première réflexion, temps de réverbération (méthode de Schroeder), queue éteinte, brillance, résonance.
//
// Témoin : avant la tâche T6 (commit ea35614), aucune carte n'a d'écho : pas de réponse impulsionnelle (réponse vide).
// Sans src/shot/acoustics.js, les tests tournent sur cette règle (reponseAvant) et échouent sur elle (vus rouges).

const ACOU_JS = '../../src/shot/acoustics.js'   // chemin dans une variable : Vite refuserait le fichier si le module manque
const mod = await import(/* @vite-ignore */ ACOU_JS).catch(() => null)
const { ACOUSTIQUES } = await import('../../src/shot/tuning.js')
const reponseAvant = () => ({ length: 0, canaux: [] })
const impulseResponse = mod?.impulseResponse ?? reponseAvant

const SR = 48000
const NOMS = ['rue', 'place', 'port', 'base', 'colline', 'interieur']
const vide = new Float32Array(0)
const canal = (ir, i = 0) => (ir && ir.canaux && ir.canaux[i]) || vide

afterEach(() => vi.restoreAllMocks())

// Premier échantillon non nul (le début de l'écho), -1 s'il n'y en a pas.
const debutDe = d => d.findIndex(v => v !== 0)

// Temps de réverbération mesuré (s) : courbe de décroissance de Schroeder (énergie restante après chaque instant),
// pente entre -5 et -35 dB extrapolée à 60 dB. NaN sans écho.
function tr60Mesure(d, sr = SR) {
  const debut = debutDe(d)
  if (debut < 0) return NaN
  const edc = new Float64Array(d.length)
  let s = 0
  for (let i = d.length - 1; i >= 0; i--) { s += d[i] * d[i]; edc[i] = s }
  const db = i => 10 * Math.log10(edc[i] / edc[debut])
  let i5 = debut; while (i5 < d.length && db(i5) > -5) i5++
  let i35 = i5; while (i35 < d.length && db(i35) > -35) i35++
  return ((i35 - i5) / sr) * 2
}

const energie = (d, a, b) => { let e = 0; for (let i = Math.max(0, a); i < Math.min(d.length, b); i++) e += d[i] * d[i]; return e }

// Passages par zéro par seconde sur les 100 ms qui suivent le début : plus bas, son plus sourd.
function passagesParZero(d, sr = SR) {
  const a = debutDe(d)
  if (a < 0) return NaN
  const b = Math.min(d.length, a + Math.round(0.1 * sr))
  let n = 0
  for (let i = a + 1; i < b; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) n++
  return n / ((b - a) / sr)
}

// Résonance : autocorrélation normalisée la plus forte entre 1 et 10 ms de décalage, sur la queue (50 à 300 ms après
// le début). Un écho très court qui se répète (sonorité métallique) y fait un pic ; un bruit seul reste près de 0.
function resonanceMesuree(d, sr = SR) {
  const a = debutDe(d)
  if (a < 0) return NaN
  const x = d.subarray(a + Math.round(0.05 * sr), a + Math.round(0.3 * sr))
  const e0 = energie(x, 0, x.length)
  let best = 0
  for (let k = Math.round(0.001 * sr); k <= Math.round(0.01 * sr); k++) {
    let s = 0
    for (let i = k; i < x.length; i++) s += x[i] * x[i - k]
    best = Math.max(best, s / e0)
  }
  return best
}

// Corrélation entre les deux canaux sur la queue : près de 0, un écho large ; 1, le même son des deux côtés.
function correlation(g, d) {
  let sgd = 0, sgg = 0, sdd = 0
  for (let i = 0; i < Math.min(g.length, d.length); i++) { sgd += g[i] * d[i]; sgg += g[i] * g[i]; sdd += d[i] * d[i] }
  return sgd / Math.sqrt(sgg * sdd)
}

const IR = Object.fromEntries(NOMS.map(n => [n, impulseResponse(n, SR, 7)]))

describe("réponse impulsionnelle de chaque acoustique", () => {
  for (const nom of NOMS) {
    const p = ACOUSTIQUES[nom]
    describe(nom, () => {
      it(`stéréo, de la longueur réglée (${p.dureeS} s)`, () => {
        const ir = IR[nom]
        expect(ir.canaux.length).toBe(2)
        expect(ir.length).toBe(Math.round(p.dureeS * SR))
        for (const c of ir.canaux) expect(c.length).toBe(ir.length)
      })

      it(`silence jusqu'à la première réflexion (${p.predelaiS * 1000} ms), puis l'écho`, () => {
        const d = canal(IR[nom])
        const debut = Math.round(p.predelaiS * SR)
        expect(debutDe(d)).toBeGreaterThanOrEqual(debut)
        expect(debutDe(d)).toBeLessThanOrEqual(debut + Math.round(0.002 * SR))
      })

      it(`décroît de 60 dB en ${p.tr60S} s (±20 %), sur les deux canaux`, () => {
        for (const i of [0, 1]) {
          const r = tr60Mesure(canal(IR[nom], i)) / p.tr60S
          expect(r).toBeGreaterThan(0.8)
          expect(r).toBeLessThan(1.2)
        }
      })

      it("la queue s'éteint avant la fin de la réponse (pas de coupure audible) : 20 dernières ms à -50 dB au moins", () => {
        const d = canal(IR[nom])
        const a = debutDe(d), n = Math.round(0.02 * SR)
        const db = 10 * Math.log10(energie(d, d.length - n, d.length) / energie(d, a, a + n))
        expect(db).toBeLessThan(-50)
      })

      it('deux canaux différents (un écho large, pas le même son des deux côtés)', () => {
        const [g, d] = [canal(IR[nom], 0), canal(IR[nom], 1)]
        expect(g.length).toBeGreaterThan(0)
        expect(Math.abs(correlation(g, d))).toBeLessThan(0.2)
      })
    })
  }
})

describe('le caractère de chaque carte (spec du lot 2, §3.5)', () => {
  const tr = Object.fromEntries(NOMS.map(n => [n, tr60Mesure(canal(IR[n]))]))

  it('interieur (M6) est le plus court, base (champ ouvert) est court : moins de 0,8 s ; les autres traînent au moins 1 s', () => {
    for (const n of NOMS) if (n !== 'interieur') expect(tr.interieur).toBeLessThan(tr[n])
    for (const n of ['interieur', 'base']) expect(tr[n]).toBeLessThan(0.8)
    for (const n of ['rue', 'place', 'port', 'colline']) expect(tr[n]).toBeGreaterThanOrEqual(1)
  })

  it('port est le plus long', () => {
    for (const n of NOMS) if (n !== 'port') expect(tr.port).toBeGreaterThan(tr[n])
  })

  it('interieur est le plus sourd (le moins de passages par zéro)', () => {
    const z = Object.fromEntries(NOMS.map(n => [n, passagesParZero(canal(IR[n]))]))
    for (const n of NOMS) if (n !== 'interieur') expect(z.interieur).toBeLessThan(z[n])
  })

  it('port sonne métallique (un retour très court qui se répète), aucune autre carte', () => {
    expect(resonanceMesuree(canal(IR.port))).toBeGreaterThan(0.3)
    for (const n of NOMS) if (n !== 'port') expect(resonanceMesuree(canal(IR[n]))).toBeLessThan(0.15)
  })

  it('colline est très ouverte : ses premiers retours arrivent le plus tard (au moins 0,1 s), ceux de la rue serrés (moins de 10 ms)', () => {
    const d = Object.fromEntries(NOMS.map(n => [n, debutDe(canal(IR[n])) / SR]))
    expect(d.colline).toBeGreaterThanOrEqual(0.1)
    for (const n of NOMS) if (n !== 'colline') expect(d.colline).toBeGreaterThan(d[n])
    expect(d.rue).toBeGreaterThanOrEqual(0)
    expect(d.rue).toBeLessThan(0.01)
  })
})

describe('à graine', () => {
  it('même graine, même réponse ; autre graine, autre réponse', () => {
    const a = canal(impulseResponse('port', SR, 3)), b = canal(impulseResponse('port', SR, 3)), c = canal(impulseResponse('port', SR, 4))
    expect(a.length).toBeGreaterThan(0)
    expect(b).toEqual(a)
    expect(c).not.toEqual(a)
  })

  it('sans graine donnée, chaque acoustique garde la sienne : la même carte sonne pareil à chaque montage', () => {
    const a = canal(impulseResponse('rue', SR)), b = canal(impulseResponse('rue', SR))
    expect(a.length).toBeGreaterThan(0)
    expect(b).toEqual(a)
  })

  it("n'emploie pas Math.random (le hasard du jeu, à graine dans les captures, n'est pas déplacé)", () => {
    const spy = vi.spyOn(Math, 'random')
    const ir = impulseResponse('place', SR)
    expect(canal(ir).length).toBeGreaterThan(0)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('sans acoustique connue', () => {
  it("pas d'écho (menu, PvP) : null", () => {
    expect(impulseResponse('inconnue', SR)).toBeNull()
    expect(impulseResponse(undefined, SR)).toBeNull()
  })
})
