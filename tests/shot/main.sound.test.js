import { describe, it, expect } from 'vitest'
import { MAIN_SRC, analyse, callsIn } from '../gfx/mainSource.js'

// Câblage du son du tir dans main.js (spec du lot 2, §3.5 ; plan, tâche T6). Les pièces ont leurs tests (soundPlan,
// acoustics, audio, maps.acoustics) ; main.js ne s'importe pas sous jsdom, cette garde lit son source :
// - l'écho de la carte est monté avec la mission (mountLevel, l'acoustique de sa carte) et libéré au démontage ;
// - à la résolution, le son de ce que la balle touche est joué selon le calendrier de planShotSounds (distance du
//   tireur au point d'impact, matière, zone) ; plus de bip d'arcade (playKill) ;
// - la nappe de la mission fait entendre la pluie de sa carte (le port), au départ comme au retour du briefing revu ;
// - un seul son d'échec, le même pour chaque cause (civil abattu, cible en fuite, convoi parti), joué une fois ;
// - développement : __son() dit l'état du son de la mission, dernierImpact (__mission()) garde le calendrier joué.
//
// Témoin : au commit ea35614, 12 de ces 15 gardes ne tiennent pas (vues rouges avant le branchement). Les trois autres
// sont des non-régressions : le civil abattu et triggerGameOver jouaient déjà le son d'échec une fois (depuis le lot 0),
// à un seul endroit gardé par canFail ; la fuite et le convoi, eux, n'en jouaient aucun (rouges).

const a = analyse(MAIN_SRC)
const texte = n => a.source.slice(n.start, n.end)
const appels = nom => (callsIn(a, nom) || []).map(c => c.callee)
const textesAppel = (nom, callee) => (callsIn(a, nom) || []).filter(x => x.callee === callee).map(c => a.source.slice(c.start, c.end))
const texteFn = nom => (a.fns.get(nom) ? texte(a.fns.get(nom)) : '')
// Bloc de développement : if (import.meta.env.DEV) { … } au niveau du module.
const dev = a.program.body.find(n => n.type === 'IfStatement' && texte(n.test) === 'import.meta.env.DEV')
const texteDev = dev ? texte(dev) : ''

describe('écho de la carte', () => {
  it('mountEcho et unmountEcho viennent de src/audio.js', () => {
    expect(a.imports.get('mountEcho')?.from).toBe('./audio.js')
    expect(a.imports.get('unmountEcho')?.from).toBe('./audio.js')
  })

  it("le montage de la mission monte l'écho de l'acoustique de sa carte, une fois la carte construite", () => {
    const c = appels('mountLevel')
    const carte = c.findIndex(x => x.startsWith('MAP_BUILDERS['))
    const echo = c.indexOf('mountEcho')
    expect(carte).toBeGreaterThan(-1)
    expect(echo, 'mountLevel appelle mountEcho').toBeGreaterThan(carte)
    expect(textesAppel('mountLevel', 'mountEcho')).toEqual(['mountEcho(currentMapInfo.acoustics)'])
  })

  it('le démontage de la mission le libère (relance, mission suivante, menu, route ?memtest=1)', () => {
    expect(appels('unmountLevel')).toContain('unmountEcho')
  })
})

describe("l'arrivée de la balle", () => {
  it('planShotSounds vient de src/shot/soundPlan.js, playShotSounds de src/audio.js', () => {
    expect(a.imports.get('planShotSounds')?.from).toBe('./shot/soundPlan.js')
    expect(a.imports.get('playShotSounds')?.from).toBe('./audio.js')
  })

  it('la résolution joue le calendrier de ce que la balle a touché, après firstHit', () => {
    const c = appels('resolveBullet')
    expect(c.indexOf('planShotSounds')).toBeGreaterThan(c.indexOf('firstHit'))
    expect(c.indexOf('playShotSounds')).toBeGreaterThan(c.indexOf('planShotSounds'))
    // le calendrier joué est celui que planShotSounds vient de rendre (directement ou par une variable)
    const [joue] = textesAppel('resolveBullet', 'playShotSounds')
    const v = /^playShotSounds\((\w+)\)$/.exec(joue || '')
    if (v) expect(texteFn('resolveBullet')).toMatch(new RegExp(`\\b${v[1]}\\s*=\\s*planShotSounds\\(`))
    else expect(joue).toMatch(/^playShotSounds\(planShotSounds\(/)
  })

  it("le calendrier part de la distance du tireur au point d'impact, de la matière et de la zone touchées", () => {
    const [plan = ''] = textesAppel('resolveBullet', 'planShotSounds')
    expect(plan).toMatch(/distance:\s*[\w.]+\.distanceTo\([\w.]*ray\.origin\)/)
    expect(plan).toMatch(/surface:\s*hit\.surface/)
    expect(plan).toMatch(/\bpart\b/)
  })

  it("plus de bip d'arcade : playKill n'est plus importé ni appelé", () => {
    expect(a.imports.has('playKill')).toBe(false)
    expect(MAIN_SRC).not.toMatch(/\bplayKill\s*\(/)
  })
})

describe('pluie du port', () => {
  it('chaque départ de la nappe (mission, retour du briefing revu) passe la pluie de la carte', () => {
    const departs = [...MAIN_SRC.matchAll(/\bstartMissionAmbience\(([^)]*)\)/g)].map(m => m[1])
    expect(departs.length).toBeGreaterThanOrEqual(2)
    for (const arg of departs) expect(arg).toMatch(/rain:\s*[!\w.]*currentMapInfo\.rain/)
  })
})

describe("sons d'échec", () => {
  // Nombre de playGameOver joués par un appel de la fonction nom de main.js, appels de ses fonctions compris
  // (minuteurs aussi : le civil abattu échoue 600 ms plus tard).
  function sonsDechec(nom, pile = new Set()) {
    if (pile.has(nom)) return 0
    pile.add(nom)
    let n = 0
    for (const c of appels(nom)) {
      if (c === 'playGameOver') n++
      else if (a.fns.has(c)) n += sonsDechec(c, pile)
    }
    pile.delete(nom)
    return n
  }

  for (const [cause, fn] of [['civil abattu', 'killCivilian'], ['échec', 'triggerGameOver'], ['cible en fuite', 'triggerFleeGameOver'], ['convoi parti', 'triggerConvoyEscaped']]) {
    it(`${cause} (${fn}) : le son d'échec, une fois`, () => {
      expect(a.fns.has(fn), `${fn} dans main.js`).toBe(true)
      expect(sonsDechec(fn)).toBe(1)
    })
  }

  it("le même son pour toutes les causes : playGameOver n'est joué qu'à un endroit, gardé par canFail", () => {
    expect([...MAIN_SRC.matchAll(/\bplayGameOver\s*\(/g)].length).toBe(1)
    const [lieu] = [...a.fns.keys()].filter(f => appels(f).includes('playGameOver'))
    const c = appels(lieu)
    expect(c.indexOf('canFail')).toBeGreaterThan(-1)
    expect(c.indexOf('canFail')).toBeLessThan(c.indexOf('playGameOver'))
  })
})

describe('développement', () => {
  it("__son() dit l'état du son de la mission (audioState de src/audio.js)", () => {
    expect(a.imports.get('audioState')?.from).toBe('./audio.js')
    expect(texteDev).toMatch(/window\.__son\s*=\s*\(\)\s*=>\s*audioState\(\)/)
  })

  it('dernierImpact garde le calendrier joué', () => {
    expect(texteFn('resolveBullet')).toMatch(/lastImpact\s*=\s*\{[^}]*\bsons\b/)
  })
})
