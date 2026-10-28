import { describe, it, expect } from 'vitest'
import { MAIN_SRC as SRC, analyse, callsIn, callsInNode } from './mainSource.js'

// Câblage du profil de caméra dans main.js (spec du lot 3, §2 b ; plan du lot 3a, tâche A3). main.js ne s'importe pas
// sous jsdom : cette garde lit son source. Les pièces ont leurs tests : applyCameraProfile et resetCameraProfile dans
// cameraProfile.test.js ; le menu (démarrage, showMenu, QUITTER du PvP) et le départ d'une manche PvP, qui reviennent
// d'eux-mêmes au profil hors mission, dans cameraProfile.horsMission.test.js.
// - mountLevel applique le profil de SA mission (m.profil) après avoir construit sa carte : la carte règle ses lumières
//   (setLighting, qui remet le soleil à sa place par défaut) et ne pose plus de brume, le profil vient ensuite ;
// - la fin de l'enquête, achevée (run.next) ou abandonnée (abortInvestigation), passe par une seule fonction,
//   stopInvestigation, qui arrête l'enquête (elle rend la caméra telle qu'elle l'a trouvée) PUIS remet le profil hors
//   mission ; plus rien d'autre n'arrête l'enquête ;
// - la sonde de lisibilité (?sonde=1), sur la carte d'une mission, part du profil de cette mission (sa brume, dont la
//   sonde garde la couleur) avant de poser le sien.
//
// Témoin : sur le source d'avant la tâche (commit 69ab74a), la garde relève neuf défauts : les deux imports, mountLevel
// sans profil, pas de stopInvestigation, abortInvestigation et investigate (run.next) qui n'y passent pas et arrêtent
// l'enquête eux-mêmes (run.handle.stop) sans remise à zéro, la sonde sans le profil de la mission (vue rouge). Plus
// bas, chaque défaut est reproduit sur le source d'aujourd'hui et doit faire rougir la garde.

const PROFIL = './gfx/cameraProfile.js'
const DE_LA_MISSION = /^applyCameraProfile\(\s*camera\s*,\s*scene\s*,\s*sun\s*,\s*(m|currentMission)\.profil\s*\)$/
const DE_SA_CARTE = /^applyCameraProfile\(\s*camera\s*,\s*scene\s*,\s*sun\s*,\s*missionFor\(\s*n\s*\)\.profil\s*\)$/
const REMISE = /^resetCameraProfile\(\s*camera\s*,\s*scene\s*,\s*sun\s*\)$/

const est = (a, node, texte) => node && a.source.slice(node.start, node.end) === texte

// Le bloc de la route ?sonde=1 (if (q.has('sonde')) { … }), à toute profondeur.
function routeSonde(a) {
  let out = null
  const walk = node => {
    if (out || !node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    if (node.type === 'IfStatement' && est(a, node.test, "q.has('sonde')")) { out = node; return }
    for (const k in node) if (k !== 'parent') walk(node[k])
  }
  walk(a.program)
  return out
}

function defauts(source) {
  const a = analyse(source)
  const texte = c => source.slice(c.start, c.end)
  const out = []
  for (const nom of ['applyCameraProfile', 'resetCameraProfile']) {
    if (a.imports.get(nom)?.from !== PROFIL) out.push(`${nom} n'est pas importé de ${PROFIL}`)
  }

  // Montage : le profil de sa mission, après sa carte.
  const montage = callsIn(a, 'mountLevel') || []
  const carte = montage.findIndex(c => c.callee.startsWith('MAP_BUILDERS['))
  const profil = montage.findIndex(c => c.callee === 'applyCameraProfile')
  if (profil < 0) out.push('mountLevel n\'applique pas le profil de sa mission (applyCameraProfile)')
  else {
    if (!DE_LA_MISSION.test(texte(montage[profil]))) out.push(`mountLevel applique autre chose que le profil de sa mission : ${texte(montage[profil])}`)
    if (carte < 0 || profil < carte) out.push('mountLevel applique le profil avant de construire sa carte')
  }

  // Fin de l'enquête : une seule fonction l'arrête, puis remet le profil hors mission.
  const fin = callsIn(a, 'stopInvestigation')
  if (!fin) out.push('pas de stopInvestigation : rien ne remet le profil à la fin de l\'enquête')
  else {
    const arret = fin.findIndex(c => c.callee === 'run.handle.stop')
    const remise = fin.findIndex(c => c.callee === 'resetCameraProfile')
    if (arret < 0) out.push('stopInvestigation n\'arrête pas l\'enquête (run.handle.stop)')
    if (remise < 0) out.push('stopInvestigation ne remet pas le profil hors mission (resetCameraProfile)')
    else {
      if (!REMISE.test(texte(fin[remise]))) out.push(`stopInvestigation remet autre chose que le profil du jeu : ${texte(fin[remise])}`)
      if (arret >= 0 && remise < arret) out.push('stopInvestigation remet le profil avant d\'arrêter l\'enquête, qui rendrait ensuite la caméra qu\'elle a trouvée')
    }
  }
  for (const fn of ['abortInvestigation', 'investigate']) {
    if (!(callsIn(a, fn) || []).some(c => c.callee === 'stopInvestigation')) out.push(`${fn} n'arrête pas l'enquête par stopInvestigation`)
  }
  // Ailleurs que dans stopInvestigation, plus rien n'arrête l'enquête en cours (run.handle.stop, enquete.handle.stop…).
  for (const [nom, fn] of a.fns) {
    if (nom === 'stopInvestigation') continue
    for (const c of callsInNode(a, fn.body)) {
      if (/\.handle\.stop$/.test(c.callee)) out.push(`${nom} arrête l'enquête sans remettre le profil (${c.callee})`)
    }
  }

  // Sonde de lisibilité : sur la carte d'une mission, le profil de cette mission.
  const sonde = routeSonde(a)
  if (!sonde) out.push('route ?sonde=1 introuvable')
  else {
    const appels = callsInNode(a, sonde.consequent)
    const carteSonde = appels.findIndex(c => c.callee.startsWith('MAP_BUILDERS['))
    const profilSonde = appels.findIndex(c => c.callee === 'applyCameraProfile' && DE_SA_CARTE.test(texte(c)))
    if (profilSonde < 0) out.push('la sonde ne part pas du profil de la mission de sa carte (applyCameraProfile(…, missionFor(n).profil))')
    else if (carteSonde < 0 || profilSonde < carteSonde) out.push('la sonde applique le profil de la mission avant de construire sa carte')
  }
  return out
}

describe('main.js : le profil de caméra appliqué au montage, remis à zéro à la fin de l\'enquête', () => {
  it('mountLevel, la fin de l\'enquête et la sonde de lisibilité', () => {
    expect(defauts(SRC)).toEqual([])
  })
})

describe('témoins de la garde', () => {
  const muter = next => { expect(next).not.toBe(SRC); return next }
  const appel = (fn, callee) => {
    const c = (callsIn(analyse(SRC), fn) || []).find(x => x.callee === callee)
    expect(c, `${fn} n'appelle déjà plus ${callee}() : témoin impossible`).toBeDefined()
    return c
  }
  const remplace = (c, par) => muter(SRC.slice(0, c.start) + par + SRC.slice(c.end))

  it('mountLevel sans le profil de sa mission : rouge', () => {
    expect(defauts(remplace(appel('mountLevel', 'applyCameraProfile'), 'void 0')))
      .toEqual(['mountLevel n\'applique pas le profil de sa mission (applyCameraProfile)'])
  })

  it('mountLevel qui applique le profil de M1 quelle que soit la mission : rouge', () => {
    const d = defauts(remplace(appel('mountLevel', 'applyCameraProfile'), 'applyCameraProfile(camera, scene, sun, missionFor(1).profil)'))
    expect(d).toEqual(['mountLevel applique autre chose que le profil de sa mission : applyCameraProfile(camera, scene, sun, missionFor(1).profil)'])
  })

  it('mountLevel qui applique le profil avant de construire sa carte (setLighting remettrait le soleil par défaut) : rouge', () => {
    const c = appel('mountLevel', 'applyCameraProfile')
    const carte = (callsIn(analyse(SRC), 'mountLevel') || []).find(x => x.callee.startsWith('MAP_BUILDERS['))
    expect(carte, 'mountLevel ne construit déjà plus sa carte : témoin impossible').toBeDefined()
    const sans = SRC.slice(0, c.start) + 'void 0' + SRC.slice(c.end)
    // Le même appel, remis en tête de mountLevel.
    const fn = analyse(sans).fns.get('mountLevel')
    const next = muter(sans.slice(0, fn.body.start + 1) + '\n  ' + SRC.slice(c.start, c.end) + sans.slice(fn.body.start + 1))
    expect(defauts(next)).toEqual(['mountLevel applique le profil avant de construire sa carte'])
  })

  it('stopInvestigation sans remise à zéro : rouge', () => {
    expect(defauts(remplace(appel('stopInvestigation', 'resetCameraProfile'), 'void 0')))
      .toEqual(['stopInvestigation ne remet pas le profil hors mission (resetCameraProfile)'])
  })

  it('stopInvestigation qui remet le profil avant d\'arrêter l\'enquête : rouge', () => {
    const a = analyse(SRC)
    const fn = a.fns.get('stopInvestigation')
    expect(fn, 'stopInvestigation introuvable : témoin impossible').toBeDefined()
    const c = appel('stopInvestigation', 'resetCameraProfile')
    const sans = SRC.slice(0, c.start) + 'void 0' + SRC.slice(c.end)
    const next = muter(sans.slice(0, fn.body.start + 1) + '\n  resetCameraProfile(camera, scene, sun)' + sans.slice(fn.body.start + 1))
    expect(defauts(next)).toEqual(['stopInvestigation remet le profil avant d\'arrêter l\'enquête, qui rendrait ensuite la caméra qu\'elle a trouvée'])
  })

  it('abortInvestigation qui arrête l\'enquête elle-même, sans stopInvestigation : rouge', () => {
    const d = defauts(remplace(appel('abortInvestigation', 'stopInvestigation'), 'run.handle && run.handle.stop()'))
    expect(d).toEqual([
      'abortInvestigation n\'arrête pas l\'enquête par stopInvestigation',
      'abortInvestigation arrête l\'enquête sans remettre le profil (run.handle.stop)',
    ])
  })

  it('la fin d\'une enquête achevée (run.next) sans stopInvestigation : rouge', () => {
    expect(defauts(remplace(appel('investigate', 'stopInvestigation'), 'void 0')))
      .toEqual(['investigate n\'arrête pas l\'enquête par stopInvestigation'])
  })

  it('la sonde sans le profil de la mission de sa carte : rouge', () => {
    const a = analyse(SRC)
    const c = callsInNode(a, routeSonde(a).consequent).find(x => x.callee === 'applyCameraProfile')
    expect(c, 'la sonde n\'applique déjà plus de profil : témoin impossible').toBeDefined()
    expect(defauts(remplace(c, 'void 0')))
      .toEqual(['la sonde ne part pas du profil de la mission de sa carte (applyCameraProfile(…, missionFor(n).profil))'])
  })

  for (const nom of ['applyCameraProfile', 'resetCameraProfile']) {
    it(`${nom} remplacé par une copie locale : rouge`, () => {
      const s = analyse(SRC).imports.get(nom)?.node
      expect(s, `${nom} n'est déjà plus importé : témoin impossible`).toBeDefined()
      const next = muter(SRC.slice(0, s.start) + `${nom} as ${nom}Importe` + SRC.slice(s.end) + `\nfunction ${nom}() {}\n`)
      expect(defauts(next)).toEqual([`${nom} n'est pas importé de ${PROFIL}`])
    })
  }
})
