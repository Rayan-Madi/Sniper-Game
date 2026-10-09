// Lunette animée (spec du lot 2, §3.2) : ouverture et fermeture en un temps donné, zoom lissé vers la valeur choisie à
// la molette. Module pur (ni DOM ni three) : scope.js l'anime à chaque image, les tests l'importent directement.
//
// openness : 0 (fermée) à 1 (ouverte), proportionnelle au temps écoulé ; l'adoucissement de l'image (vignette, champ
// de vision) se fait à l'affichage (scopeFov dans src/aim.js, drawScope dans src/scope.js).
// zoom : le zoom effectif, qui rejoint la cible par une exponentielle de constante tau, choisie pour en parcourir 95 %
// en t.zoomMs : 1 - exp(-zoomMs / tau) = 0,95, soit tau = zoomMs / ln 20. L'exponentielle est exacte pour tout pas de
// temps : le zoom ne dépend que du temps écoulé, pas du nombre d'images.
import { LUNETTE } from './tuning.js'

// En deçà, le zoom effectif se pose sur la cible (l'exponentielle ne l'atteint jamais tout à fait) : invisible à l'écran.
const POSE = 1e-3

export function createScopeAnim(t = LUNETTE) {
  const tau = t.zoomMs / 1000 / Math.log(20)
  let openness = 0, opening = false, target = 4, zoom = 4
  return {
    // Clic droit enfoncé : la lunette s'ouvre (depuis où elle en est, si elle se refermait).
    open() { opening = true },
    // Clic droit relâché : elle se referme en t.fermetureMs.
    close() { opening = false },
    // Fermée d'un coup (pause, échec, réussite, fin de mission).
    shut() { opening = false; openness = 0 },
    // Zoom choisi ; instant : posé tout de suite, sans lissage (montage d'une mission).
    setZoom(z, { instant = false } = {}) { target = z; if (instant) zoom = z },
    get opening() { return opening },
    get openness() { return openness },
    get target() { return target },
    get zoom() { return zoom },
    // Un pas de dt secondes ; un pas nul ou invalide ne change rien.
    update(dt) {
      if (dt > 0) {
        openness = opening
          ? Math.min(1, openness + dt * 1000 / t.ouvertureMs)
          : Math.max(0, openness - dt * 1000 / t.fermetureMs)
        // Les pas de 1/fps cumulés n'arrivent pas toujours pile sur la borne (0,9999999999) : la lunette doit être
        // ouverte à 100 % pour tirer, à la première image qui passe la durée.
        if (openness > 1 - 1e-9) openness = 1
        if (openness < 1e-9) openness = 0
        zoom = target + (zoom - target) * Math.exp(-dt / tau)
        if (Math.abs(zoom - target) < POSE) zoom = target
      }
      return { openness, zoom }
    },
  }
}
