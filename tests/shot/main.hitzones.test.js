import { describe, it, expect } from 'vitest'
import { MAIN_SRC, analyse, callsIn } from '../gfx/mainSource.js'

// Câblage des zones touchées dans main.js (spec du lot 2, §3.4 ; plan, tâche T4). Les pièces ont leurs tests
// (hitzones, score) ; main.js ne s'importe pas sous jsdom, cette garde lit son source :
// - ce que la balle touche sur un PNJ vient de npcHit (préfiltre par la boîte élargie, puis zones calées sur les os),
//   au coup (bout du sillage) comme à la résolution ;
// - la zone touchée (tete, torse, membre) remplace la règle « au-dessus de 1,45 m » et fixe les points de la cible ;
// - un garde touché tombe toujours, l'alerte part sans silencieux (guardHit).
//
// Témoin : au commit 9a96760, aucune de ces gardes ne tient (vu rouge avant le branchement).

const a = analyse(MAIN_SRC)
const texte = n => a.source.slice(n.start, n.end)
const appels = nom => (callsIn(a, nom) || []).map(c => c.callee)
const texteAppel = (nom, callee) => {
  const c = (callsIn(a, nom) || []).find(x => x.callee === callee)
  return c ? a.source.slice(c.start, c.end) : null
}

describe('ce que la balle touche sur un PNJ', () => {
  it('npcHit vient de src/shot/hitzones.js', () => {
    expect(a.imports.get('npcHit')?.from).toBe('./shot/hitzones.js')
  })

  it('firstHit passe par npcHit, plus par la boîte de getBounds', () => {
    expect(appels('firstHit')).toContain('npcHit')
    expect(appels('firstHit')).not.toContain('n.getBounds')
  })

  it('la règle « tête au-dessus de 1,45 m » a disparu', () => {
    expect(texte(a.fns.get('resolveBullet'))).not.toMatch(/1\.45/)
  })

  it('la zone touchée est transmise à killTarget', () => {
    const t = texteAppel('resolveBullet', 'killTarget')
    expect(t, 'resolveBullet appelle killTarget').toBeTruthy()
    expect(t).toMatch(/\bpart\b/)
  })
})

describe('conséquences', () => {
  it('les points de la cible suivent la zone (targetScore, src/shot/score.js)', () => {
    expect(a.imports.get('targetScore')?.from).toBe('./shot/score.js')
    expect(appels('killTarget')).toContain('targetScore')
  })

  it('un garde touché tombe toujours ; l\'alerte selon le silencieux (guardHit, src/shot/score.js)', () => {
    expect(a.imports.get('guardHit')?.from).toBe('./shot/score.js')
    const c = appels('hitGuard')
    expect(c).toContain('guardHit')
    expect(c).toContain('npc.die')
    expect(c).toContain('triggerAlert')
    // npc.die n'est plus réservé aux branches du silencieux : il suit la décision de guardHit
    expect(texte(a.fns.get('hitGuard'))).not.toMatch(/stats\.(superSilenced|silenced)/)
  })
})
