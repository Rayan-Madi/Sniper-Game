import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { MAIN_SRC, analyse, callsIn, readSource } from '../gfx/mainSource.js'

const OCCLUSION_SRC = readSource(resolve(__dirname, '../../src/shot/occlusion.js'))

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

// Depuis la tâche A4 du lot 3, la balle vole sur une trajectoire en segments : main.js passe les PNJ de la mission à
// impactSurSegment (src/shot/occlusion.js), qui cherche leurs zones par npcHit sur chaque segment (tests/shot/
// segment.test.js). Témoin de ces deux gardes réécrites : le main.js d'avant la tâche A4 (97336ed), qui cherchait les
// PNJ lui-même (firstHit), les fait rougir (vu rouge).
describe('ce que la balle touche sur un PNJ', () => {
  it('npcHit (src/shot/hitzones.js) est cherché sur chaque segment par impactSurSegment (src/shot/occlusion.js)', () => {
    expect(a.imports.get('impactSurSegment')?.from).toBe('./shot/occlusion.js')
    expect(OCCLUSION_SRC).toMatch(/import \{ npcHit \} from '\.\/hitzones\.js'/)
    expect(OCCLUSION_SRC).toMatch(/export function impactSurSegment\([\s\S]*?npcHit\(ray, npcs/)
  })

  it('toucherSegment passe les PNJ de la mission à impactSurSegment, plus par la boîte de getBounds', () => {
    expect(appels('toucherSegment')).toContain('impactSurSegment')
    expect(texteAppel('toucherSegment', 'impactSurSegment')).toMatch(/\bnpcs\b/)
    expect(appels('toucherSegment')).not.toContain('n.getBounds')
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
