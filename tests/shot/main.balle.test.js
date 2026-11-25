import { describe, it, expect } from 'vitest'
import { MAIN_SRC as SRC, analyse, callsIn } from '../gfx/mainSource.js'

// Câblage de la balle réelle et du télémètre dans main.js (spec du lot 3, §2 c ; plan du lot 3a, tâche A4 ; contrat
// du lot 4, tâche K0). main.js ne s'importe pas sous jsdom : cette garde lit son source. Les pièces ont leurs tests de
// comportement : la trajectoire (ballistics.test.js), le vol et ce que la balle touche (balle.test.js, segment.test.js),
// le dernier tir mortel (tirMortel.test.js), le télémètre (telemetre.test.js, scope.telemetre.test.js), le sillage
// (trail.test.js). Ici :
// - plus de délai fixe : la balle est lancée au coup (lancerBalle) avec la vitesse de la Vélocité (getStats().v0) et
//   le réglage de la mission (zero), sur l'horloge de la mission, après la capture du rayon du réticule et avant le
//   recul ; un seul tir tant qu'elle vole ; elle garde la vue de la lunette au coup et l'abscisse du convoi ;
// - à chaque image, la balle avance APRÈS les PNJ et le convoi, une fois le temps de la mission avancé : l'ordre
//   « PNJ, puis segments de la balle » du contrat avec le lot 4, que le rejeu de la kill-cam suppose ;
// - chaque segment est cherché par impactSurSegment contre les PNJ, le décor solide de la mission (carte, jeeps,
//   cadenas) et les vitres de la carte ;
// - à l'arrivée, le dernier tir mortel est enregistré (tirMortel, sa fin et son support) AVANT la programmation des
//   sons de l'impact ; le sillage est recalé sur l'instant de l'impact ;
// - le sillage part au coup sur la trajectoire, jusqu'à l'impact prévu (predireImpact) ;
// - le réglage de la lunette est posé au montage de la mission (setZero), le télémètre relevé lunette tenue (après le
//   cadrage de la caméra) et remis à zéro lunette fermée ; chaque mission repart sans balle ni dernier tir mortel ;
// - chaque cible porte son indice dans casting.cibles (cibleId) ; le convoi garde l'entrée de sa route (depart).
//
// Témoin : sur le main.js d'avant la tâche (commit 97336ed), la garde relève 34 défauts (vus rouges). Plus bas, chaque
// défaut est reproduit sur le source d'aujourd'hui et doit faire rougir la garde.

const IMPORTS = [
  ['lancerBalle', './shot/balle.js'], ['avancerBalle', './shot/balle.js'], ['predireImpact', './shot/balle.js'],
  ['impactSurSegment', './shot/occlusion.js'], ['tirMortel', './shot/tirMortel.js'], ['createTelemetre', './shot/telemetre.js'],
  ['setZero', './scope.js'], ['setTelemetre', './scope.js'], ['abscisseConvoi', './campaign/convoy.js'],
  ['supportDuTir', './campaign/convoy.js'], ['vitres', './maps/index.js'],
]

function defauts(source) {
  const a = analyse(source)
  const out = []
  const fn = nom => a.fns.get(nom)
  const texteFn = nom => (fn(nom) ? source.slice(fn(nom).start, fn(nom).end) : '')
  const appels = nom => callsIn(a, nom) || []
  const appel = (nom, callee) => appels(nom).find(c => c.callee === callee)
  const texte = c => (c ? source.slice(c.start, c.end) : '')
  // Position, dans le source, d'un motif cherché dans le texte d'une fonction (-1 si absent)
  const ou = (nom, re) => { const m = re.exec(texteFn(nom)); return m ? fn(nom).start + m.index : -1 }

  for (const [nom, de] of IMPORTS) if (a.imports.get(nom)?.from !== de) out.push(`${nom} n'est pas importé de ${de}`)
  for (const mort of ['bulletDelay', 'pendingShotRay', 'bulletInFlight']) {
    if (new RegExp(`\\b${mort}\\b`).test(source)) out.push(`${mort} est encore là (délai fixe d'avant la tâche)`)
  }

  // Le coup : la balle lancée après la capture du rayon, avant le recul, avec la vitesse et le réglage ; un seul tir
  // tant qu'elle vole ; la vue de la lunette et l'abscisse du convoi ; le sillage sur la trajectoire.
  const shoot = fn('shoot')
  const garde = shoot && shoot.body.body.find(n => n.type === 'IfStatement' && n.consequent.type === 'ReturnStatement')
  if (!garde || !/(^|[|\s(])balle\b/.test(source.slice(garde.test.start, garde.test.end))) out.push('shoot tire alors qu\'une balle vole encore')
  const lancer = appel('shoot', 'lancerBalle')
  const capture = appels('shoot').find(c => c.callee === 'rayonDuReticule' || /\.setFromCamera$/.test(c.callee))
  const kick = appel('shoot', 'recoil.kick')
  if (!lancer) out.push('shoot ne lance pas la balle (lancerBalle)')
  else {
    const t = texte(lancer)
    if (!/v0:\s*(stats|getStats\(\))\.v0\b/.test(t)) out.push(`la balle ne part pas à la vitesse de la Vélocité (getStats().v0) : ${t}`)
    if (!/zero:\s*currentMission\.zero\b/.test(t)) out.push(`la balle n'est pas réglée sur la distance de la mission (currentMission.zero) : ${t}`)
    if (!/tTir:\s*missionClock\b/.test(t)) out.push(`la balle n'est pas lancée sur l'horloge de la mission : ${t}`)
    if (!capture || capture.start > lancer.start) out.push('la balle est lancée avant la capture du rayon du réticule')
    if (!kick || kick.start < lancer.start) out.push('le recul part avant la balle')
  }
  const vue = /balle\.vue\s*=\s*\{([^}]*)\}/.exec(texteFn('shoot'))
  if (!vue || !['lacet', 'tangage', 'zoom', 'fov'].every(k => new RegExp(`\\b${k}\\s*:`).test(vue[1]))) out.push('le coup ne garde pas la vue de la lunette (balle.vue : lacet, tangage, zoom, fov)')
  else if (kick && ou('shoot', /balle\.vue\s*=/) > kick.start) out.push('la vue de la lunette est prise après le recul')
  if (!/balle\.sTir\s*=[^\n]*abscisseConvoi\(convoyCar\)/.test(texteFn('shoot'))) out.push('le coup ne garde pas l\'abscisse du convoi (balle.sTir)')
  const sillage = texte(appel('shoot', 'spawnTrail'))
  if (!/^spawnTrail\([^,]+,\s*balle\.traj\s*,\s*predireImpact\(balle,\s*toucherSegment\)\)$/.test(sillage)) out.push(`le sillage ne part pas sur la trajectoire jusqu'à l'impact prévu : ${sillage}`)

  // Chaque image : la balle avance après les PNJ et le convoi, une fois le temps de la mission avancé.
  const avance = appel('loop', 'avancerBalle')
  if (!avance) out.push('la boucle ne fait pas avancer la balle (avancerBalle)')
  else {
    if (texte(avance) !== 'avancerBalle(balle, missionClock, toucherSegment)') out.push(`la balle n'avance pas jusqu'au temps de la mission, contre toucherSegment : ${texte(avance)}`)
    const pnj = appel('loop', 'npc.update'), convoi = appel('loop', 'stepConvoy'), horloge = ou('loop', /missionClock\s*\+=\s*dt/)
    if (!pnj || pnj.start > avance.start) out.push('la balle avance avant les PNJ (l\'ordre « PNJ, puis segments de la balle »)')
    if (!convoi || convoi.start > avance.start) out.push('la balle avance avant le convoi')
    if (horloge < 0 || horloge > avance.start) out.push('la balle avance avant le temps de la mission')
    if (!/(\w+)\s*=\s*avancerBalle\([^)]*\)[\s\S]{0,40}if\s*\(\1\)\s*resolveBullet\(\1\)/.test(texteFn('loop'))) out.push('l\'arrivée de la balle ne passe pas à resolveBullet')
  }
  const cherche = texte(appel('toucherSegment', 'impactSurSegment'))
  for (const [quoi, re] of [['les PNJ', /\bnpcs\b/], ['le décor de la mission', /missionSolids\(\)/], ['le cadenas', /missionBoxes\(\)/], ['les vitres de la carte', /vitres\(\)/]]) {
    if (!re.test(cherche)) out.push(`toucherSegment ne cherche pas ${quoi} : ${cherche || 'impactSurSegment absent'}`)
  }

  // L'arrivée : le dernier tir mortel avant les sons ; le sillage recalé sur l'instant de l'impact.
  const mortel = appel('resolveBullet', 'tirMortel'), plan = appel('resolveBullet', 'planShotSounds'), joue = appel('resolveBullet', 'playShotSounds')
  if (!mortel) out.push('l\'arrivée n\'enregistre pas le dernier tir mortel (tirMortel)')
  else {
    if (!/dernierTirMortel\s*=\s*tirMortel\(/.test(texteFn('resolveBullet'))) out.push('le dernier tir mortel n\'est pas gardé (dernierTirMortel)')
    if (!plan || !joue || mortel.start > plan.start || mortel.start > joue.start) out.push('le dernier tir mortel (derniere) est calculé après la programmation des sons')
    const t = texte(mortel)
    for (const [quoi, re] of [['la fin de la mission', /fin:\s*currentMission\.fin\b/], ['les cibles', /cibles:\s*targets\b/], ['le support du convoi', /support:\s*supportDuTir\(convoyCar,/]]) {
      if (!re.test(t)) out.push(`le dernier tir mortel ne reçoit pas ${quoi} : ${t}`)
    }
  }
  if (!/^retargetTrail\([\w.]+,\s*(\w+)\.t\s*-\s*[\w.]+\.tTir\)$/.test(texte(appel('resolveBullet', 'retargetTrail')))) out.push(`le sillage n'est pas recalé sur l'instant de l'impact : ${texte(appel('resolveBullet', 'retargetTrail'))}`)

  // Montage, départ, télémètre.
  if (!/setZero\((m|currentMission)\.zero\)/.test(texteFn('mountLevel'))) out.push('le montage ne pose pas le réglage de la mission (setZero)')
  if (!/\.cibleId\s*=\s*i\b/.test(texteFn('mountLevel'))) out.push('les cibles ne portent pas leur indice dans casting.cibles (cibleId)')
  if (!/convoyCar\s*=\s*\{[^}]*\bdepart:\s*route\.depart\b/.test(texteFn('mountLevel'))) out.push('le convoi ne garde pas l\'entrée de sa route (depart)')
  const depart = texteFn('startLevel')
  for (const [quoi, re] of [['sans balle', /\bballe\s*=\s*null\b/], ['sans dernier tir mortel', /\bdernierTirMortel\s*=\s*null\b/], ['télémètre à zéro', /telemetre\.reset\(\)/]]) {
    if (!re.test(depart)) out.push(`la mission ne repart pas ${quoi}`)
  }
  const cadrage = appel('loop', 'aimMissionCamera'), releve = appel('loop', 'telemetre.update'), affiche = appel('loop', 'setTelemetre')
  if (!releve || !affiche) out.push('la boucle ne relève pas le télémètre (telemetre.update, setTelemetre)')
  else {
    if (!cadrage || releve.start < cadrage.start) out.push('le télémètre est relevé avant le cadrage de la caméra')
    if (!/isVisible\(\)[\s\S]{0,120}telemetre\.update\([\s\S]{0,80}else\s+telemetre\.reset\(\)/.test(texteFn('loop'))) out.push('le télémètre ne suit pas la lunette (relevé lunette tenue, remis à zéro fermée)')
  }
  if (!/rayonDuReticule\(\)/.test(texteFn('mesurerDistance')) || !/TELEMETRE\.porteeM/.test(texteFn('mesurerDistance'))) out.push('le télémètre ne mesure pas sur le rayon du réticule, jusqu\'à sa portée (mesurerDistance)')
  return out
}

describe('main.js : la balle réelle, le dernier tir mortel et le télémètre', () => {
  it('lancée au coup, avancée après les PNJ, enregistrée avant les sons ; réglage posé, télémètre relevé', () => {
    expect(defauts(SRC)).toEqual([])
  })
})

describe('témoins de la garde', () => {
  const muter = (avant, apres) => {
    expect(SRC.split(avant), `« ${avant.slice(0, 60)} » absent du source, ou plusieurs fois : témoin impossible`).toHaveLength(2)
    return SRC.replace(avant, apres)
  }
  const relevé = (source, motif) => expect(defauts(source).join('\n')).toMatch(motif)

  it.each([
    ['un import manquant', "import { tirMortel } from './shot/tirMortel.js'", "import { tirMortel } from './shot/score.js'", /tirMortel n'est pas importé/],
    ['le délai fixe revenu', 'let balle = null', 'let balle = null\nlet bulletDelay = 0', /bulletDelay est encore là/],
    ['un second tir pendant le vol', '!isScopeReady() || balle ||', '!isScopeReady() ||', /tire alors qu'une balle vole/],
    ['la vitesse en dur', 'v0: stats.v0', 'v0: 800', /vitesse de la Vélocité/],
    ['le réglage oublié', 'zero: currentMission.zero', 'zero: null', /réglée sur la distance de la mission/],
    ['le temps du mur', 'tTir: missionClock', 'tTir: performance.now() / 1000', /horloge de la mission/],
    ['la vue oubliée', 'balle.vue = {', 'balle.vu = {', /vue de la lunette/],
    ['l\'abscisse du convoi oubliée', 'balle.sTir = convoyCar', 'balle.sansTir = convoyCar', /abscisse du convoi/],
    ['un sillage droit vers le point prévu', 'spawnTrail(camera.localToWorld(MUZZLE.clone()), balle.traj, predireImpact(balle, toucherSegment))',
      'spawnTrail(camera.localToWorld(MUZZLE.clone()), balle.traj, BALLE.volMaxS)', /sillage ne part pas sur la trajectoire/],
    ['des segments sans vitres', 'vitres: vitres()', 'vitres: []', /vitres de la carte/],
    ['des segments sans le cadenas', 'boites: missionBoxes()', 'boites: []', /le cadenas/],
    ['le dernier tir mortel sans sa fin', 'fin: currentMission.fin', 'fin: { calmeS: 0 }', /la fin de la mission/],
    ['le sillage recalé au bout de l\'image', 'retargetTrail(b.sillage, arrivee.t - b.tTir)', 'retargetTrail(b.sillage, missionClock - b.tTir)', /recalé sur l'instant de l'impact/],
    ['le réglage pas posé', 'setZero(m.zero)', 'setZero(null)', /pose pas le réglage/],
    ['les cibles sans indice', 'npc.cibleId = i', 'npc.cible = i', /cibleId/],
    ['le convoi sans son entrée', 'depart: route.depart, ', '', /entrée de sa route/],
    ['une mission qui garde la balle d\'avant', 'balle = null; lastImpact = null', 'lastImpact = null', /sans balle/],
    ['le télémètre jamais remis à zéro', 'else telemetre.reset()', 'else setTelemetre(null)', /suit pas la lunette/],
    ['le télémètre sur l\'axe de la caméra', 'ray: rayonDuReticule()', 'ray: new THREE.Ray(camera.position, camera.getWorldDirection(new THREE.Vector3()))', /rayon du réticule/],
  ])('%s : relevé', (_, avant, apres, motif) => {
    relevé(muter(avant, apres), motif)
  })

  // L'ordre « PNJ, puis segments de la balle » (contrat du lot 4, K0) : la balle remontée avant la mise à jour des PNJ,
  // puis avant le pas du convoi, puis avant l'horloge de la mission.
  it('la balle qui avance avant les PNJ, avant le convoi ou avant le temps de la mission : relevé', () => {
    const a = analyse(SRC)
    const loop = a.fns.get('loop')
    const corps = SRC.slice(loop.start, loop.end)
    const bloc = /\n(\s*)if \(balle\) \{\n\s*const arrivee = avancerBalle\(balle, missionClock, toucherSegment\)\n\s*if \(arrivee\) resolveBullet\(arrivee\)\n\s*\}\n/.exec(corps)
    expect(bloc, 'bloc de la balle introuvable dans loop : témoin impossible').toBeTruthy()
    const sans = corps.replace(bloc[0], '\n')
    for (const [ancre, motif] of [
      ['for (const npc of npcs) npc.update(dt)', /avant les PNJ/],
      ['if (convoyCar && stepConvoy(', /avant le convoi/],
      ['missionClock += dt', /avant le temps de la mission/],
    ]) {
      expect(sans.split(ancre), `« ${ancre} » dans loop : témoin impossible`).toHaveLength(2)
      const remonte = sans.replace(ancre, bloc[0].trim() + '\n' + bloc[1] + ancre)
      relevé(SRC.replace(corps, remonte), motif)
    }
  })

  // Les sons de l'impact programmés avant le dernier tir mortel : le lot 4 ne pourrait plus couper le son réel de la
  // dernière cible d'une condition d'une ligne.
  it('les sons programmés avant le dernier tir mortel : relevé', () => {
    const a = analyse(SRC)
    const rb = a.fns.get('resolveBullet')
    const corps = SRC.slice(rb.start, rb.end)
    const sons = /\n\s*const sons = planShotSounds\([^\n]*\)\n\s*playShotSounds\(sons\)\n/.exec(corps)
    const mortel = /\n\s*if \(role === 'target'\) \{\n[\s\S]*?\n\s*\}\n/.exec(corps)
    expect(sons && mortel, 'sons ou enregistrement introuvables dans resolveBullet : témoin impossible').toBeTruthy()
    const inverse = corps.replace(sons[0], '\n').replace(mortel[0], sons[0] + mortel[0].slice(1))
    relevé(SRC.replace(corps, inverse), /calculé après la programmation des sons/)
  })
})
