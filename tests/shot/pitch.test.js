import { describe, it, expect, vi } from 'vitest'
import * as aim from '../../src/aim.js'
import { MAIN_SRC, analyse } from '../gfx/mainSource.js'

// maps.js pose ses objets dans la scène du jeu : une vraie THREE.Scene ici, sans rendu ni lumières.
vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})
import { MAP_BUILDERS } from '../../src/maps.js'

// Plongée de la lunette (spec du lot 2, §3.2 ; plan, tâche T2) : tangage borné à [-1,35 ; 0,5] rad au lieu de
// [-1,1 ; 0,5]. Avant, depuis le toit de M2 (22,5 m de haut, 8 m en retrait de la place), une bande d'environ 3 m de
// la place restait hors d'atteinte.
//
// La borne mesurée est celle que main.js applique vraiment : l'expression qui borne `pitch` dans l'écouteur mousemove,
// lue dans le source et évaluée telle quelle (main.js ne s'importe pas sous jsdom). Avant le lot 2, c'était
// Math.max(-1.1, Math.min(0.5, pitch)).

const NAMES = ['M1 marché', 'M2 parking', 'M3 port', 'M4 base', 'M5 convoi', 'M6 fête']

// Borne du tangage de main.js : la dernière affectation `pitch = …` de l'écouteur document.addEventListener('mousemove').
function borneDeMain() {
  const a = analyse(MAIN_SRC)
  const texte = n => a.source.slice(n.start, n.end)
  let ecouteur = null
  for (const n of a.program.body) {
    const e = n.type === 'ExpressionStatement' && n.expression
    if (e && e.type === 'CallExpression' && texte(e.callee) === 'document.addEventListener' && e.arguments[0]?.value === 'mousemove') ecouteur = e.arguments[1]
  }
  if (!ecouteur) throw new Error('écouteur mousemove introuvable dans main.js')
  let expr = null
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object') return
    if (node.type === 'AssignmentExpression' && node.operator === '=' && node.left.type === 'Identifier' && node.left.name === 'pitch') expr = texte(node.right)
    for (const k in node) if (k !== 'parent') walk(node[k])
  }
  walk(ecouteur.body)
  if (!expr) throw new Error('aucune borne du tangage dans l\'écouteur mousemove')
  // Les noms importés d'aim.js (clampPitch…) sont fournis par le module lui-même.
  const noms = Object.keys(aim)
  return { expr, borne: new Function('pitch', ...noms, `return (${expr})`), noms }
}

// Tangage nécessaire pour viser (x, y, z) depuis le poste (Euler YXZ : asin de la composante verticale).
const tangage = (de, x, y, z) => Math.asin((y - de[1]) / Math.hypot(x - de[0], y - de[1], z - de[2]))

// Points de la zone d'apparition (grille de 0,5 m, bords compris), aux pieds et à la tête (1,7 m).
function pointsDeZone(info) {
  const b = info.spawnBounds, sol = info.groundY ?? 0, pts = []
  for (let x = b.minX; x <= b.maxX + 1e-9; x += 0.5) for (let z = b.minZ; z <= b.maxZ + 1e-9; z += 0.5) {
    pts.push([x, sol, z], [x, sol + 1.7, z])
  }
  return pts
}

// Points de la zone qu'une borne laisse hors d'atteinte : le tangage voulu n'est pas celui que la borne laisse prendre.
function horsDAtteinte(info, borne) {
  return pointsDeZone(info).filter(([x, y, z]) => {
    const p = tangage(info.cameraPos, x, y, z)
    return Math.abs(borne(p) - p) > 1e-9
  })
}

describe('plongée de la lunette', () => {
  const { expr, borne: fnBorne, noms } = borneDeMain()
  const borne = p => fnBorne(p, ...noms.map(n => aim[n]))

  it(`main.js borne le tangage à [-1,35 ; 0,5] rad (expression lue : ${expr})`, () => {
    expect(borne(-1.34)).toBeCloseTo(-1.34, 12)
    expect(borne(-1.35)).toBeCloseTo(-1.35, 12)
    expect(borne(-1.6)).toBeCloseTo(-1.35, 12)
    expect(borne(0.49)).toBeCloseTo(0.49, 12)
    expect(borne(0.8)).toBeCloseTo(0.5, 12)
    expect(borne(0)).toBe(0)
  })

  MAP_BUILDERS.forEach((build, i) => {
    it(`${NAMES[i]} : toute la zone d'apparition est atteignable, pieds et tête`, () => {
      const info = build()
      const hors = horsDAtteinte(info, borne)
      expect(hors.length, `points hors d'atteinte, par exemple ${JSON.stringify(hors.slice(0, 3))}`).toBe(0)
    })
  })

  it('témoin : l\'ancienne borne (-1,1) laisse en M2 une bande d\'environ 3 m de la place hors d\'atteinte', () => {
    const info = MAP_BUILDERS[1]()
    const hors = horsDAtteinte(info, p => Math.max(-1.1, Math.min(0.5, p)))
    expect(hors.length).toBeGreaterThan(0)
    const zs = hors.filter(p => p[1] === (info.groundY ?? 0)).map(p => p[2])
    const bande = Math.max(...zs) - Math.min(...zs)
    expect(bande).toBeGreaterThan(2.5)
    expect(bande).toBeLessThan(4)
  })

  it('clampPitch (src/aim.js) : bornes exportées, celles de la spec', () => {
    expect(aim.PITCH_MIN).toBe(-1.35)
    expect(aim.PITCH_MAX).toBe(0.5)
    expect(aim.clampPitch(-2)).toBe(-1.35)
    expect(aim.clampPitch(1)).toBe(0.5)
    expect(aim.clampPitch(-0.3)).toBe(-0.3)
  })
})
