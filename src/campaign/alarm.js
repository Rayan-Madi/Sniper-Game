// La réaction des cibles à un coup (spec du lot 3, §2 f, approche B ; plan du lot 3a, tâche A8). Module pur : ni three
// ni DOM ; les positions sont lues dans mesh.position ({ x, y, z }), la ligne de vue vient de main.js.
//
// Réaction = min(son du départ, entendu d / SON.vitesse s après le coup, d la distance de la cible au tireur, jamais au
// silencieux ; chute d'un collègue, une cible ou un garde, tombé à moins de rayonChuteM et en vue) + stupeur. À
// l'instant brut (tBrut), la cible se fige, tournée vers ce qui l'a alertée (la stupeur) ; à t = tBrut + stupeurS, elle
// fuit vers l'issue la plus proche (fuirVersLaSortie, main.js ; src/campaign/escape.js). La stupeur et la portée de la
// chute vue sont celles de la mission (champ reaction { stupeurS, rayonChuteM }, src/campaign/missions/).
//
// Seules réagissent ainsi les cibles d'une mission qui déclare des sorties ou des abris (fuiteParSorties) : sans eux,
// la fuite immédiate autour du point d'impact et le cône d'avant le lot 3 restent la règle (main.js : fleeNearby,
// checkFledTargets). Avec eux, l'impact ne fait ni fuir ni se figer ces cibles (fleeNearby, reactNearby) : seule leur
// réaction le fait. Les civils et les gardes gardent partout la réaction d'avant le lot 3.
import { SON } from '../shot/tuning.js'
import { fuiteParSorties } from './escape.js'

// L'instant où une cible part en fuite (s, horloge de la mission), Infinity si rien ne l'alerte :
//   tTir, distanceTireurM, silencieux   le coup de feu, sa distance au tireur (m), tiré au silencieux ou non
//   chutes : [{ t, distanceM, enVue }]  les collègues tombés : l'instant, leur distance à la cible (m), vus ou non
//   rayonChuteM, stupeurS                ceux de la mission (champ reaction)
// stupeurS à 0 : l'instant brut, celui où la cible est alertée.
export function instantDeReaction({ tTir = null, distanceTireurM = 0, silencieux = false, chutes = [], rayonChuteM = 0, stupeurS = 0 }) {
  let t = silencieux || tTir === null ? Infinity : tTir + distanceTireurM / SON.vitesse
  for (const c of chutes) if (c.enVue && c.distanceM <= rayonChuteM && c.t < t) t = c.t
  return t + stupeurS
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const aPied = p => p.alive && p.isTarget && !p.onVehicle && p.state !== 'flee'

// Les réactions des cibles de la mission à un coup :
//   coup  { son: null | { t, depuis: [x, y, z] }, chutes: [{ t, pnj }] } : le départ du coup (l'instant du tir et l'œil
//         du tireur ; null au silencieux) ; les PNJ tombés (cibles ou gardes) et l'instant de leur chute
//   pnjs  les PNJ de la mission ; mission : la mission en cours
//   enVue(observateur, tombe) → booléen : la ligne de vue entre eux, contre le décor ; demandée seulement pour une chute
//         à portée (rayonChuteM), un rayon par cible et par chute
// → [{ pnj, tBrut, t, depuis }] : depuis, la source de l'alerte retenue (l'œil du tireur, ou le collègue tombé), où la
//   cible se tourne. Rien pour une mission sans sortie ni abri.
export function reagir(coup, pnjs, mission, { enVue = () => true } = {}) {
  if (!fuiteParSorties(mission)) return []
  const { stupeurS, rayonChuteM } = mission.reaction
  const out = []
  for (const pnj of pnjs) {
    if (!aPied(pnj)) continue
    const p = pnj.mesh.position
    const son = coup.son ? { tTir: coup.son.t, distanceTireurM: distance(p, { x: coup.son.depuis[0], y: coup.son.depuis[1], z: coup.son.depuis[2] }) }
      : { silencieux: true }
    const chutes = []
    for (const c of coup.chutes || []) {
      if (c.pnj === pnj || c.pnj.isCivilian) continue
      const q = c.pnj.mesh.position
      const d = distance(p, q)
      if (d > rayonChuteM) continue
      chutes.push({ t: c.t, distanceM: d, enVue: enVue(pnj, c.pnj), depuis: [q.x, q.y, q.z] })
    }
    const tBrut = instantDeReaction({ ...son, chutes, rayonChuteM })
    if (tBrut === Infinity) continue
    const vue = chutes.find(c => c.enVue && c.t === tBrut)
    out.push({ pnj, tBrut, t: tBrut + stupeurS, depuis: vue ? vue.depuis : coup.son.depuis })
  }
  return out
}

// Les réactions en attente de la mission, menées sur son horloge : planifier(reactions) les ajoute (pour une cible qui
// en a déjà une, la plus tôt l'emporte : le plus tôt du son et des chutes) ; avancer(t) rend, dans l'ordre de leurs
// instants, ce qui arrive d'ici t : { pnj, quoi: 'stupeur' | 'fuite', depuis }, la stupeur à tBrut, la fuite à t, une
// fois chacune. Une cible morte ou déjà en fuite d'ici là est oubliée. vider() : au départ de chaque mission.
export function creerAlarme() {
  const attente = new Map()   // pnj → { tBrut, t, depuis, stupefaite }
  return {
    planifier(reactions) {
      for (const r of reactions) {
        const a = attente.get(r.pnj)
        if (!a || r.t < a.t) attente.set(r.pnj, { tBrut: r.tBrut, t: r.t, depuis: r.depuis, stupefaite: !!a && a.stupefaite })
      }
    },
    avancer(t) {
      const evts = []
      for (const [pnj, a] of attente) {
        if (!pnj.alive || pnj.state === 'flee') { attente.delete(pnj); continue }
        if (!a.stupefaite && a.tBrut <= t) { a.stupefaite = true; evts.push({ a: a.tBrut, rang: 0, e: { pnj, quoi: 'stupeur', depuis: a.depuis } }) }
        if (a.t <= t) { attente.delete(pnj); evts.push({ a: a.t, rang: 1, e: { pnj, quoi: 'fuite', depuis: a.depuis } }) }
      }
      return evts.sort((x, y) => x.a - y.a || x.rang - y.rang).map(x => x.e)
    },
    enAttente() {
      return [...attente].map(([pnj, a]) => ({ pnj, tBrut: a.tBrut, t: a.t }))
    },
    vider() { attente.clear() },
  }
}
