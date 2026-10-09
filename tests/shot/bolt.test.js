import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CULASSE } from '../../src/shot/tuning.js'

// Culasse (spec du lot 2, §3.3 ; plan, tâche T3) : après un coup, 1,2 s pendant lesquelles on ne peut pas tirer
// (0,9 s au niveau 4 de Vélocité), avec un son d'ouverture à 0,35 s et un de fermeture à 0,9 s. Le temps est celui de
// la mission (main.js l'avance de dt à chaque image : la pause l'arrête, le ralenti le ralentit).
//
// Témoin : avant le lot 2, un second tir partait dès que la balle du premier était résolue (getStats().bulletDelay,
// 0,45 s sans Vélocité ; mesuré dans Chrome sans interface au commit df6dd66 : deux clics à 656 ms d'écart, deux tirs).
// Sans src/shot/bolt.js, les tests tournent sur cette règle (reglesAvant) et échouent sur elle.

const BOLT_JS = '../../src/shot/bolt.js'   // chemin dans une variable : Vite refuserait le fichier si le module manque
const boltModule = await import(/* @vite-ignore */ BOLT_JS).catch(() => null)

let U
beforeEach(async () => {
  vi.resetModules()
  U = await import('../../src/upgrades.js')
})

// La règle d'avant le lot 2, vue comme une culasse : prête dès la résolution de la balle, sans son ni jauge.
function reglesAvant() {
  let firedAt = -Infinity, delai = 0
  return {
    fire(now) { firedAt = now; delai = U.getStats().bulletDelay },
    ready(now) { return now - firedAt >= delai - 1e-9 },
    progress() { return 1 },
    cues() { return [] },
    reset() { firedAt = -Infinity },
  }
}
const createBolt = boltModule ? boltModule.createBolt : reglesAvant

// Durée de la culasse pour la Vélocité en cours : getStats().boltS (absente avant le lot 2).
const dureeCulasse = () => U.getStats().boltS

// Premier instant (s), image par image à `fps`, où la culasse accepte un tir ; `cues` reçoit les sons dans l'ordre.
function premierTir(bolt, fps, cues = []) {
  const dt = 1 / fps
  let now = 0
  for (let i = 0; i < fps * 3; i++) {
    now += dt
    for (const c of bolt.cues(now)) cues.push({ c, t: now })
    if (bolt.ready(now)) return now
  }
  return Infinity
}

describe('tir refusé pendant la culasse', () => {
  it('les valeurs de tuning.js sont celles de la spec (§3.3)', () => {
    expect(CULASSE.dureeS[0]).toBe(1.2)
    expect(CULASSE.dureeS[4]).toBe(0.9)
    expect(CULASSE).toMatchObject({ ouvertureS: 0.35, fermetureS: 0.9 })
  })

  // Non-régression : on tire dès l'ouverture de la lunette, au premier coup d'une mission (même comportement avant).
  it('jamais tirée : prête', () => {
    expect(createBolt().ready(0)).toBe(true)
  })

  it('sans Vélocité : refusé à 0,5 s (la balle est résolue depuis 0,05 s) et à 1,19 s, accepté à 1,2 s', () => {
    const b = createBolt()
    b.fire(10, dureeCulasse())
    expect(b.ready(10.5), '0,5 s').toBe(false)
    expect(b.ready(11.19), '1,19 s').toBe(false)
    expect(b.ready(11.2), '1,2 s').toBe(true)
  })

  for (const fps of [60, 144]) {
    it(`à ${fps} i/s, le temps cumulé image par image : prête à la première image qui passe 1,2 s`, () => {
      const b = createBolt()
      b.fire(0, dureeCulasse())
      const t = premierTir(b, fps)
      expect(t).toBeGreaterThanOrEqual(1.2 - 1e-9)
      expect(t).toBeLessThan(1.2 + 1 / fps + 1e-9)
    })
  }

  it('Vélocité au niveau 4 : 0,9 s (refusé à 0,85 s, accepté à 0,9 s) ; une durée par niveau, de 1,2 à 0,9 s', () => {
    const attendu = [1.2, 1.125, 1.05, 0.975, 0.9]
    for (let n = 0; n <= 4; n++) {
      U.state.levels.velocity = n
      expect(dureeCulasse(), `niveau ${n}`).toBeCloseTo(attendu[n], 9)
    }
    U.state.levels.velocity = 4
    const b = createBolt()
    b.fire(0, dureeCulasse())
    expect(b.ready(0.85), '0,85 s').toBe(false)
    expect(b.ready(0.9), '0,9 s').toBe(true)
  })

  it('reset (montage d\'une mission) : prête tout de suite, aucun son en attente', () => {
    const b = createBolt()
    b.fire(5, dureeCulasse())
    expect(b.ready(5.6), 'encore en course à 0,6 s').toBe(false)
    b.reset()
    expect(b.ready(5.6)).toBe(true)
    expect(b.cues(20)).toEqual([])
  })
})

describe('jauge et sons de la culasse', () => {
  it('jauge : 0 au coup, 0,5 à mi-course, pleine à 1,2 s', () => {
    const b = createBolt()
    b.fire(2, dureeCulasse())
    expect(b.progress(2)).toBe(0)
    expect(b.progress(2.6)).toBeCloseTo(0.5, 9)
    expect(b.progress(3.2)).toBe(1)
    expect(b.progress(9)).toBe(1)
  })

  for (const fps of [60, 144]) {
    it(`à ${fps} i/s : ouverture à 0,35 s, fermeture à 0,9 s, une seule fois chacune`, () => {
      const b = createBolt()
      b.fire(0, dureeCulasse())
      const cues = []
      premierTir(b, fps, cues)
      for (let i = 0; i < fps; i++) b.cues(1.2 + i / fps).forEach(c => cues.push({ c, t: 9 }))   // plus rien après
      expect(cues.map(x => x.c)).toEqual(['ouverture', 'fermeture'])
      expect(cues[0].t).toBeGreaterThanOrEqual(0.35 - 1e-9)
      expect(cues[0].t).toBeLessThan(0.35 + 1 / fps + 1e-9)
      expect(cues[1].t).toBeGreaterThanOrEqual(0.9 - 1e-9)
      expect(cues[1].t).toBeLessThan(0.9 + 1 / fps + 1e-9)
    })
  }

  it('une image longue qui passe les deux instants les rend dans l\'ordre', () => {
    const b = createBolt()
    b.fire(0, dureeCulasse())
    expect(b.cues(1)).toEqual(['ouverture', 'fermeture'])
  })

  it('Vélocité : la culasse plus courte garde son rythme (ouverture et fermeture aux mêmes fractions de la course)', () => {
    U.state.levels.velocity = 4
    const b = createBolt()
    b.fire(0, dureeCulasse())
    expect(b.cues(0.35 * 0.9 / 1.2 - 1e-6)).toEqual([])
    expect(b.cues(0.35 * 0.9 / 1.2 + 1e-6)).toEqual(['ouverture'])
    expect(b.cues(0.9 * 0.9 / 1.2 - 1e-6)).toEqual([])
    expect(b.cues(0.9 * 0.9 / 1.2 + 1e-6)).toEqual(['fermeture'])
  })

  it('chaque coup réarme les sons', () => {
    const b = createBolt()
    b.fire(0, dureeCulasse())
    expect(b.cues(2)).toEqual(['ouverture', 'fermeture'])
    b.fire(3, dureeCulasse())
    expect(b.cues(3.5)).toEqual(['ouverture'])
    expect(b.cues(4)).toEqual(['fermeture'])
  })
})
