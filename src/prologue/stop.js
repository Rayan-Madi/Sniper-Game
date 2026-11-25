// Fin de l'enquête du prologue, vue du jeu (spec du lot 3, §2 b ; plan du lot 3a, tâche A3) : achevée (run.next) ou
// abandonnée (abortInvestigation), toute fin de l'enquête passe par ici (main.js). L'enquête se démonte et rend la
// caméra du jeu telle qu'elle l'a trouvée (stop, src/prologue/investigation.js) ; PUIS le profil de caméra repart du
// profil hors mission (resetCameraProfile, src/gfx/cameraProfile.js), quel qu'il fût à son départ : une enquête lancée
// après une mission de longue distance ne rend au jeu ni les plans, ni la brume, ni le soleil de cette mission. Dans
// l'autre ordre, l'enquête reposerait par-dessus la remise à zéro les plans qu'elle avait trouvés.
// Sorti de main.js, qui ne s'importe pas sous jsdom, pour être testé (tests/prologue/stop.test.js). N'importe pas
// l'enquête elle-même, chargée à la demande dans son propre morceau.
import { resetCameraProfile } from '../gfx/cameraProfile.js'

// run : { handle }, où handle est ce que rend startInvestigation, ou null si son module n'est pas encore arrivé ;
// camera, scene, sun : ceux du jeu (src/scene.js), des doublures dans les tests. Un démontage qui lève est journalisé :
// le profil revient quand même.
export function stopInvestigation(run, camera, scene, sun) {
  if (run.handle) { try { run.handle.stop() } catch (e) { console.error('[enquête]', e) } }
  resetCameraProfile(camera, scene, sun)
}
