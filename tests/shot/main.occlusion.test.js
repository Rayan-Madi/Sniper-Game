import { describe, it, expect } from 'vitest'
import { MAIN_SRC, analyse, callsIn, callsInNode } from '../gfx/mainSource.js'

// Câblage de l'occlusion dans main.js (spec du lot 2, §3.3 et §3.4 ; plan, tâche T5). Les pièces ont leurs tests
// (occlusion, maps.solid, impacts, trail) ; main.js ne s'importe pas sous jsdom, cette garde lit son source :
// - ce que la balle touche : les zones des PNJ (npcHit), le décor solide de la carte (solidMeshes), les jeeps du
//   convoi et le cadenas du port (solidHit), le premier sur le rayon (resolveImpact), au coup comme à la résolution ;
//   plus de plan du sol ni de point à 40 m (missImpact) ;
// - le sillage finit au point d'impact du coup, et la résolution le recale si elle trouve autre chose ;
// - un impact sur le décor laisse une marque orientée et une gerbe de sa matière, et les PNJ proches réagissent comme
//   à un tir manqué ;
// - développement : ?solides=1 teinte les solides ; __placer pose un PNJ (parcours réel de verif-mission.mjs) ;
//   __mission() dit ce que la dernière balle a touché.
//
// Témoin : au commit ac004b6, aucune de ces gardes ne tient (vu rouge avant le branchement).

const a = analyse(MAIN_SRC)
const texte = n => a.source.slice(n.start, n.end)
const appels = nom => (callsIn(a, nom) || []).map(c => c.callee)
const texteAppel = (nom, callee) => {
  const c = (callsIn(a, nom) || []).find(x => x.callee === callee)
  return c ? a.source.slice(c.start, c.end) : null
}
const texteFn = nom => (a.fns.get(nom) ? texte(a.fns.get(nom)) : '')
// Bloc de développement : if (import.meta.env.DEV) { … } au niveau du module.
const dev = a.program.body.find(n => n.type === 'IfStatement' && texte(n.test) === 'import.meta.env.DEV')
const texteDev = dev ? texte(dev) : ''

describe('ce que la balle touche', () => {
  it('solidHit et resolveImpact viennent de src/shot/occlusion.js, solidMeshes de maps.js', () => {
    expect(a.imports.get('solidHit')?.from).toBe('./shot/occlusion.js')
    expect(a.imports.get('resolveImpact')?.from).toBe('./shot/occlusion.js')
    expect(a.imports.get('solidMeshes')?.from).toBe('./maps.js')
  })

  it('firstHit cherche les PNJ, le décor et garde le premier', () => {
    const c = appels('firstHit')
    for (const f of ['npcHit', 'solidHit', 'resolveImpact']) expect(c, f).toContain(f)
    const t = texteAppel('firstHit', 'resolveImpact')
    expect(t).toMatch(/npcHits\s*:/)
    expect(t).toMatch(/decorHit\s*:/)
  })

  it('le décor de la mission : la carte, les jeeps du convoi et la boîte du cadenas', () => {
    const t = texteAppel('firstHit', 'solidHit')
    expect(t).toBeTruthy()
    // Directement ou par une fonction de main.js : on suit les appels de premier niveau dans l'appel de solidHit
    const suivi = [t, ...[...t.matchAll(/\b(\w+)\(/g)].map(m => m[1]).filter(n => n !== 'solidHit').map(texteDeclare)].join('\n')
    expect(suivi).toMatch(/solidMeshes\(\)/)
    expect(suivi).toMatch(/convoyCar[\s\S]*vehicles/)
    expect(suivi).toMatch(/moralLockBox/)
    expect(suivi).toMatch(/cadenas:\s*true/)
  })

  it('plus de plan du sol ni de point à 40 m : missImpact n\'est plus ni importé ni appelé', () => {
    expect(a.imports.has('missImpact')).toBe(false)
    expect(MAIN_SRC).not.toMatch(/\bmissImpact\s*\(/)
  })

  it('la résolution passe par firstHit (le rayon du coup, la pose et les jeeps du moment)', () => {
    expect(appels('resolveBullet')).toContain('firstHit')
  })
})

// Texte de la déclaration de premier niveau d'un nom de main.js (fonction ou constante), vide sinon.
function texteDeclare(nom) {
  if (a.fns.has(nom)) return texte(a.fns.get(nom))
  for (const n of a.program.body) {
    if (n.type !== 'VariableDeclaration') continue
    for (const d of n.declarations) if (d.id.name === nom) return texte(d)
  }
  return ''
}

describe('sillage', () => {
  it('le coup lance le sillage vers le point d\'impact du coup et le garde', () => {
    const shoot = texteFn('shoot')
    expect(shoot).toMatch(/(\w+)\s*=\s*spawnTrail\(/)
    expect(texteAppel('shoot', 'spawnTrail')).toMatch(/firstHit\([^)]*\)\.point/)
  })

  it('la résolution recale le bout du sillage sur le point résolu', () => {
    expect(a.imports.get('retargetTrail')?.from).toBe('./effects.js')
    const c = appels('resolveBullet')
    expect(c).toContain('retargetTrail')
    expect(c.indexOf('retargetTrail')).toBeGreaterThan(c.indexOf('firstHit'))
    expect(texteAppel('resolveBullet', 'retargetTrail')).toMatch(/\.point\b/)
  })

  it('chaque mission repart sans sillage en attente', () => {
    const v = texteFn('shoot').match(/(\w+)\s*=\s*spawnTrail\(/)?.[1]
    expect(v).toBeTruthy()
    expect(texteFn('startLevel')).toMatch(new RegExp(`\\b${v}\\s*=\\s*null`))
  })
})

describe('impact sur le décor', () => {
  it('une gerbe de sa matière et une marque orientée par la normale', () => {
    expect(a.imports.get('spawnSpray')?.from).toBe('./effects.js')
    expect(texteAppel('resolveBullet', 'spawnSpray')).toMatch(/\.normal\b[\s\S]*\.surface\b/)
    expect(texteAppel('resolveBullet', 'spawnBulletHole')).toMatch(/\.normal\b/)
  })

  it('les PNJ proches réagissent comme à un tir manqué (fuite, réaction, gardes), au point d\'impact', () => {
    const c = appels('resolveBullet')
    for (const f of ['fleeNearby', 'reactNearby', 'checkGuardAlert']) expect(c, f).toContain(f)
  })

  it('une marque sur une jeep la suit (rattachée à la jeep touchée)', () => {
    const t = texteAppel('resolveBullet', 'spawnBulletHole')
    expect(t.split(',').length, 'spawnBulletHole(point, normale, support)').toBeGreaterThanOrEqual(3)
  })

  it('la poussière à plat des tirs manqués (spawnDust) a disparu', () => {
    expect(a.imports.has('spawnDust')).toBe(false)
  })
})

describe('développement', () => {
  it('?solides=1 teinte les solides (setSolidTint, maps.js)', () => {
    expect(a.imports.get('setSolidTint')?.from).toBe('./maps.js')
    expect(texteDev).toMatch(/q\.has\('solides'\)[\s\S]{0,80}setSolidTint\(true\)/)
  })

  it('__placer pose un PNJ et le fige ; __mission() dit ce que la dernière balle a touché', () => {
    expect(texteDev).toMatch(/window\.__placer\s*=/)
    expect(texteDev).toMatch(/dernierImpact/)
    const calls = callsInNode(a, dev).map(c => c.callee)
    expect(calls).toContain('npc.mesh.position.set')
  })
})
