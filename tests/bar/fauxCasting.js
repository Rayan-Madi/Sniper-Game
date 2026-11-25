import * as THREE from 'three'
import { PATRONS } from '../../src/bar/reglages.js'
import { SIEGES, ANCRES } from '../../src/bar/plan.js'
import { ESCORTE } from '../../src/bar/seance.js'

// Faux casting des tests de la coquille du bar (tests/bar/index.test.js) : les dix personnes de PATRONS.casting, à leur
// siège ou à leur poste, avec l'interface de creerCasting (src/bar/patrons.js) sans modèle GLB (les vrais patrons sont
// tenus par tests/bar/patrons.test.js, sous Node). Chaque personne a sa tête (personne, que lit le regard), sa capsule
// (barId = rôle), et garde ce qu'on lui demande (regarder, parler, geste, se lever, marcher, s'asseoir, présence) pour
// que les tests le lisent ; qui marche arrive au bout de son chemin à l'image suivante.

const categorieDe = role => (ESCORTE.includes(role) ? 'escorte' : role === 'fernand' || role === 'albert' ? role : 'civil')
const ancre = chemin => chemin.split('.').reduce((o, k) => o[k], ANCRES)

export function fauxCasting({ casting = PATRONS.casting } = {}) {
  const group = new THREE.Group()
  group.name = 'patrons'
  const geometrie = new THREE.CapsuleGeometry(0.22, 0.56, 4, 8)
  const materiau = new THREE.MeshBasicMaterial()
  let panne = null, disposed = false
  const liste = casting.map(e => {
    const s = e.siege ? SIEGES.find(x => x.id === e.siege) : null
    const a = e.poste ? ancre(e.poste) : null
    const pos = { x: (s || a).x, z: (s || a).z }
    let pose = s ? 'assis' : 'debout', present = !e.absent, regard = null, parle = false, geste = null, route = null
    const personne = { id: e.role, categorie: categorieDe(e.role), x: pos.x, y: s ? 1.25 : 1.65, z: pos.z,
      lacet: s ? s.lacet : (e.lacet ?? (a && a.lacet) ?? 0), present }
    const cible = new THREE.Mesh(geometrie, materiau)
    cible.visible = false
    Object.assign(cible.userData, { barId: e.role, type: 'personne' })
    group.add(cible)
    const placer = () => {
      personne.x = pos.x; personne.z = pos.z; personne.y = pose === 'assis' ? 1.25 : 1.65
      cible.position.set(pos.x, personne.y - 0.4, pos.z)
    }
    placer()
    if (!present) cible.layers.disableAll()
    const ordres = []
    const p = {
      role: e.role, cible, personne, obstacles: [], ordres,
      get position() { return { x: pos.x, z: pos.z } },
      get pose() { return route ? 'marche' : pose },
      get assis() { return pose === 'assis' },
      get enMarche() { return route !== null },
      get present() { return present },
      get regard() { return regard },
      get parle() { return parle },
      get gesteEnCours() { return geste },
      regarder(point) { regard = point || null },
      parler(oui) { parle = !!oui },
      geste(nom) { geste = nom ?? null; ordres.push(['geste', nom]) },
      seLever({ demi = false } = {}) { ordres.push(['seLever', demi]); if (!demi) pose = 'debout' },
      asseoir(ref) { const siege = SIEGES.find(x => x.id === ref) || ref; ordres.push(['asseoir', siege.id]); pos.x = siege.x; pos.z = siege.z; pose = 'assis'; placer() },
      marcher(points) {
        if (pose === 'assis') throw new Error(`faux casting : « ${e.role} » est assis, il doit se lever avant de marcher`)
        if (!points || !points.length) return
        ordres.push(['marcher', points[points.length - 1]])
        route = points
      },
      setPresent(oui) {
        present = !!oui; personne.present = present
        if (present) cible.layers.set(0); else cible.layers.disableAll()
        ordres.push(['present', present])
      },
      update() {
        if (!route) return
        const fin = route[route.length - 1]
        pos.x = fin.x; pos.z = fin.z; route = null; pose = 'debout'
        placer()
      },
      dispose() {},
    }
    return p
  })
  return {
    group,
    liste,
    patrons: new Map(liste.map(p => [p.role, p])),
    cibles: liste.map(p => p.cible),
    personnes: liste.map(p => p.personne),
    // une image qui lève : la coquille doit finir en « erreur », sans bloquer
    casser(erreur) { panne = erreur },
    update(dt) {
      if (panne) throw panne
      if (disposed) return
      for (const p of liste) p.update(dt)
    },
    stats: () => ({ personnes: liste.filter(p => p.present).length, appels: 0, triangles: 0, animes: 0, sommetsAnimes: 0 }),
    get disposed() { return disposed },
    dispose() {
      if (disposed) return
      disposed = true
      geometrie.dispose(); materiau.dispose()
      group.removeFromParent()
    },
  }
}
