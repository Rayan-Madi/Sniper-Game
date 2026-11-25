// Le dernier tir mortel (spec du lot 3, §2 c ; contrat avec le lot 4, les kill-cams, figé par la tâche K0). Module pur.
//
// main.js l'enregistre à chaque mort d'une cible nommée, à l'arrivée de la balle, avant d'en programmer les sons : le
// rejeu de la kill-cam y lit tout ce qu'il lui faut sans rouvrir la balistique, et le lot 4 coupe le son réel de la
// dernière cible par une condition d'une ligne (derniere, fin). Les vecteurs sont des copies : ni la balle, ni la vue,
// ni les vitres ne le changent ensuite. La cible, elle, est une référence au PNJ (sa pose, son mixeur).
//
// {
//   origine, dir, v0, g, zero     la trajectoire au coup (src/shot/ballistics.js) : l'œil, la visée du réticule
//                                 (unitaire), la vitesse de bouche (m/s), la pesanteur (m/s², vers -Y), le réglage de la
//                                 lunette (m, null sans réglage) ; vitesseA(t) = v0·u + g·t, pointA(t) s'en déduisent
//   tTir, tImpact                 sur l'horloge de la mission (s) ; tImpact interpolé dans le segment, pas la fin de l'image
//   point, cibleId, zone          le point d'impact, l'indice de la cible dans casting.cibles de sa mission, la zone touchée
//                                 ('tete', 'torse', 'membre')
//   cible                         le PNJ touché
//   normale                       la normale de la zone au point (src/shot/hitzones.js), null si elle manque
//   vue: { lacet, tangage, zoom, fov }   au coup, avant le recul : le regard (rad), le zoom affiché, le champ (degrés)
//   traversees: [{ t, point, normale, surface }]   les vitres traversées, chacune à son instant (horloge de la mission)
//   support                       null, ou { type: 'convoi', vehicule, sTir, sImpact } (src/campaign/convoy.js)
//   derniere                      la cible était la dernière vivante de la mission
//   fin                           'immediate' (le ralenti tout de suite) ou 'differee' (après le calme de fin.calmeS)
// }
//
// balle : celle de src/shot/balle.js, avec la vue de la lunette au coup (balle.vue) ; arrivee : son arrivée
// (avancerBalle) sur la cible ; cibles : les cibles de la mission, la touchée encore vivante ; fin : celle de la
// mission ({ calmeS }) ; support : celui du convoi, ou null.
export function tirMortel({ balle, arrivee, cible, cibles, fin, support = null }) {
  const { traj, tTir, vue } = balle
  const { impact } = arrivee
  return {
    origine: traj.origine.clone(), dir: traj.dir.clone(), v0: traj.v0, g: traj.g, zero: traj.zero,
    tTir, tImpact: arrivee.t,
    point: impact.point.clone(), cibleId: cible.cibleId ?? null, zone: impact.part,
    cible,
    normale: impact.normal ? impact.normal.clone() : null,
    vue: { ...vue },
    traversees: arrivee.traversees.map(({ t, point, normale, surface }) => ({ t, point: point.clone(), normale: normale.clone(), surface })),
    support,
    derniere: !cibles.some(c => c !== cible && c.alive),
    fin: fin && fin.calmeS > 0 ? 'differee' : 'immediate',
  }
}
