import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import * as TM from '../../src/shot/tirMortel.js'
import { lancerBalle, avancerBalle } from '../../src/shot/balle.js'
import { impactSurSegment } from '../../src/shot/occlusion.js'
import * as convoi from '../../src/campaign/convoy.js'
import { MISSIONS } from '../../src/campaign/missions/index.js'

// Le dernier tir mortel (spec du lot 3, §2 c ; contrat du lot 4, tâche K0) : enregistré à chaque mort d'une cible
// nommée, il garde tout ce que le rejeu de la kill-cam lit sans rouvrir la balistique : la trajectoire (origine,
// visée, vitesse, pesanteur, réglage), les instants du coup et de l'impact sur l'horloge de la mission (l'impact
// interpolé dans son segment), le point, la cible (son identifiant, sa référence, la zone et sa normale), la vue de la
// lunette au coup, les vitres traversées, le support (la jeep du convoi), et si c'est la dernière cible vivante avec la
// fin de la mission (immédiate, ou différée après un calme).
//
// Témoins (tirMortel et supportDuTir sont neufs : par mutation, vus rouges à la tâche A4) : derniere vrai à chaque mort
// (2 rouges), fin toujours immédiate (1 rouge), support jamais rendu (1 rouge), abscisse du convoi sans son sens de
// marche (1 rouge), un enregistrement qui garde les vecteurs de la balle au lieu de leurs copies (1 rouge).

const v = (x, y, z) => new THREE.Vector3(x, y, z)
const OEIL = v(0, 12, 30)

// Cible de la forme qu'attend npcHit, debout en (x, 0, z), avec son identifiant de mission (cibleId).
function cible(cibleId, x, z) {
  const pos = v(x, 0, z)
  return {
    cibleId, alive: true, isTarget: true, pos,
    getBounds: () => ({ center: pos.clone().add(v(0, 1, 0)), size: v(0.8, 2, 0.8) }),
    hitZones: () => [{ part: 'torse', a: pos.clone().add(v(0, 0.9, 0)), b: pos.clone().add(v(0, 1.4, 0)), r: 0.15 },
      { part: 'tete', a: pos.clone().add(v(0, 1.62, 0)), b: pos.clone().add(v(0, 1.62, 0)), r: 0.1 }],
  }
}
// Vitre (verre, pas solide) de 20 × 20 m, plantée en travers de la ligne, sa face vers le tireur en z.
function vitre(z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 0.01), new THREE.MeshLambertMaterial())
  m.position.set(0, 6, z - 0.005)
  m.userData.surface = 'verre'
  m.updateMatrixWorld(true)
  return m
}
const VUE = { lacet: 0.1, tangage: -0.37, zoom: 4, fov: 15 }

// Un tir au torse de `c`, mené comme main.js : la balle lancée à tTir avec la vue de la lunette, puis des images de
// 1/60 s jusqu'à l'impact. → { balle, arrivee }
function tirSur(c, { tTir = 7.5, vitres = [], npcs = [c], zero = 31 } = {}) {
  const dir = c.pos.clone().add(v(0, 1.15, 0)).sub(OEIL).normalize()
  const balle = lancerBalle({ origine: OEIL, dir, v0: 800, g: 9.81, zero, tTir })
  balle.vue = { ...VUE }
  for (let i = 1; i < 60; i++) {
    const arrivee = avancerBalle(balle, tTir + i / 60, seg => impactSurSegment({ ...seg, npcs, vitres }))
    if (arrivee) return { balle, arrivee }
  }
  throw new Error('la balle n\'est pas arrivée')
}

describe('le dernier tir mortel : ce que le rejeu du lot 4 lit, pris au coup et à l\'impact', () => {
  it('trajectoire, instants, point, cible, zone, normale, vue de la lunette, vitres traversées', () => {
    const c = cible(1, 0.5, 0)
    const { balle, arrivee } = tirSur(c, { vitres: [vitre(20)] })
    const r = TM.tirMortel({ balle, arrivee, cible: c, cibles: [c], fin: { calmeS: 0 } })
    expect(r.origine.distanceTo(OEIL)).toBe(0)
    expect(r.dir.distanceTo(balle.traj.dir)).toBe(0)
    expect(r).toMatchObject({ v0: 800, g: 9.81, zero: 31, tTir: 7.5, tImpact: arrivee.t, cibleId: 1, zone: 'torse', support: null })
    expect(r.cible).toBe(c)
    expect(r.tImpact - r.tTir).toBeCloseTo(OEIL.distanceTo(arrivee.impact.point) / 800, 4)
    expect(r.point.distanceTo(arrivee.impact.point)).toBe(0)
    expect(r.normale.distanceTo(arrivee.impact.normal)).toBe(0)
    expect(r.vue).toEqual(VUE)
    expect(r.traversees).toHaveLength(1)
    expect(r.traversees[0]).toMatchObject({ surface: 'verre' })
    expect(r.traversees[0].t).toBeGreaterThan(r.tTir)
    expect(r.traversees[0].t).toBeLessThan(r.tImpact)
    // les champs du contrat, tous là (spec du lot 3, §2 c)
    expect(Object.keys(r).sort()).toEqual(['cible', 'cibleId', 'derniere', 'dir', 'fin', 'g', 'normale', 'origine', 'point',
      'support', 'tImpact', 'tTir', 'traversees', 'v0', 'vue', 'zero', 'zone'].sort())
  })

  it('copie ses vecteurs : ce qui bouge ensuite (la balle, la vue, les vitres) ne le change pas', () => {
    const c = cible(0, 0, 0)
    const { balle, arrivee } = tirSur(c, { vitres: [vitre(15)] })
    const r = TM.tirMortel({ balle, arrivee, cible: c, cibles: [c], fin: { calmeS: 0 } })
    const avant = JSON.stringify({ o: r.origine, d: r.dir, p: r.point, n: r.normale, v: r.vue, t: r.traversees })
    balle.traj.origine.set(9, 9, 9); balle.traj.dir.set(1, 0, 0); balle.vue.zoom = 12
    arrivee.impact.point.set(9, 9, 9); arrivee.impact.normal.set(1, 0, 0)
    arrivee.traversees[0].point.set(9, 9, 9); arrivee.traversees[0].normale.set(0, 1, 0)
    expect(JSON.stringify({ o: r.origine, d: r.dir, p: r.point, n: r.normale, v: r.vue, t: r.traversees })).toBe(avant)
  })
})

describe('derniere : vrai sur la dernière cible vivante seulement (le lot 4 coupe le son réel de celle-là)', () => {
  it('deux cibles : la première abattue, faux ; la seconde, vrai', () => {
    const a = cible(0, -1, 0), b = cible(1, 1, 0)
    const premier = tirSur(a, { npcs: [a, b] })
    expect(TM.tirMortel({ ...premier, cible: a, cibles: [a, b], fin: { calmeS: 0 } }).derniere).toBe(false)
    a.alive = false   // killTarget, après l'enregistrement
    const second = tirSur(b, { npcs: [a, b] })
    expect(TM.tirMortel({ ...second, cible: b, cibles: [a, b], fin: { calmeS: 0 } }).derniere).toBe(true)
  })

  it('trois officiers (M4) : seule la mort du troisième est la dernière, dans n\'importe quel ordre', () => {
    for (const ordre of [[0, 1, 2], [2, 0, 1], [1, 2, 0]]) {
      const cs = [cible(0, -2, 0), cible(1, 0, 0), cible(2, 2, 0)]
      const vus = ordre.map(i => {
        const r = TM.tirMortel({ ...tirSur(cs[i], { npcs: cs.filter(x => x.alive) }), cible: cs[i], cibles: cs, fin: { calmeS: 0 } })
        cs[i].alive = false
        return r.derniere
      })
      expect(vus, `ordre ${ordre}`).toEqual([false, false, true])
    }
  })
})

describe('fin : immédiate, ou différée après un calme (fin { calmeS } de la mission)', () => {
  it('les six missions d\'aujourd\'hui finissent tout de suite (calme de 0 s)', () => {
    const c = cible(0, 0, 0)
    const tir = tirSur(c)
    for (const m of MISSIONS) expect(TM.tirMortel({ ...tir, cible: c, cibles: [c], fin: m.fin }).fin, `M${m.numero}`).toBe('immediate')
  })

  it('un calme après la dernière cible (12 s en M3, sous-lot 3c) : différée', () => {
    const c = cible(0, 0, 0)
    expect(TM.tirMortel({ ...tirSur(c), cible: c, cibles: [c], fin: { calmeS: 12 } }).fin).toBe('differee')
  })
})

describe('support : la cible à bord du convoi (M5)', () => {
  // Le convoi tel que mountLevel le monte : la jeep du colonel (chauffeur, colonel) et une escorte, sur la route de la
  // carte, entrée à x = depart.
  function monter(dir = 1) {
    const npc = () => ({ alive: true, mesh: new THREE.Object3D() })
    const chauffeur = npc(), colonel = npc(), escorte = npc()
    const milieu = { mesh: new THREE.Object3D(), offsetX: 0, riders: [{ npc: chauffeur, dx: 0.6, dy: 0.62, dz: 0.55 }, { npc: colonel, dx: -1.4, dy: 0.82, dz: 0 }] }
    const tete = { mesh: new THREE.Object3D(), offsetX: 16, riders: [{ npc: escorte, dx: 0.6, dy: 0.62, dz: 0.55 }] }
    return { c: { baseX: dir > 0 ? -55 : 55, depart: dir > 0 ? -55 : 55, z: -4, groundY: 0.2, dir, speed: 8.5, vehicles: [tete, milieu] }, milieu, colonel, escorte }
  }

  it('abscisse du convoi : la route parcourue depuis son entrée, dans son sens de marche', () => {
    for (const dir of [1, -1]) {
      const { c } = monter(dir)
      for (let i = 0; i < 60; i++) convoi.stepConvoy(c, 1 / 60, null)
      expect(convoi.abscisseConvoi(c), `sens ${dir}`).toBeCloseTo(8.5, 9)
    }
  })

  it('le colonel touché dans sa jeep : la jeep, l\'abscisse du convoi au coup et à l\'impact', () => {
    const { c, milieu, colonel } = monter()
    for (let i = 0; i < 30; i++) convoi.stepConvoy(c, 1 / 60, colonel)
    const sTir = convoi.abscisseConvoi(c)
    for (let i = 0; i < 3; i++) convoi.stepConvoy(c, 1 / 60, colonel)   // le vol de la balle : trois images
    const s = convoi.supportDuTir(c, colonel, sTir)
    expect(s).toMatchObject({ type: 'convoi', vehicule: milieu, sTir })
    expect(s.sImpact - s.sTir).toBeCloseTo(8.5 * 3 / 60, 9)
  })

  it('un PNJ qui n\'est pas à bord, ou pas de convoi : aucun support', () => {
    const { c } = monter()
    expect(convoi.supportDuTir(c, { alive: true }, 0)).toBeNull()
    expect(convoi.supportDuTir(null, { alive: true }, 0)).toBeNull()
  })

  it('le support passe tel quel au dernier tir mortel', () => {
    const t = cible(0, 0, 0)
    const support = { type: 'convoi', vehicule: { mesh: null }, sTir: 1, sImpact: 1.2 }
    expect(TM.tirMortel({ ...tirSur(t), cible: t, cibles: [t], fin: { calmeS: 0 }, support }).support).toBe(support)
  })
})
