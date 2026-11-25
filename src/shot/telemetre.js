import { TELEMETRE } from './tuning.js'

// Télémètre de la lunette (spec du lot 3, §2 c ; plan du lot 3a, tâche A4). Module pur.
//
// main.js mesure la distance au point visé (un rayon du réticule contre le décor solide, le sol et les zones des PNJ) ;
// la mesure n'est refaite que tous les TELEMETRE.periodeS, pas à chaque image : un lancer de rayon de moins par image,
// et un chiffre qui ne tremble pas avec le réticule entre deux relevés. La lunette (src/scope.js) affiche la distance
// au mètre, et le réglage de la lunette (« ZÉRO 430 m », décision 1).

// update(dt, mesurer) à chaque image lunette tenue : mesurer() rend la distance (m) ou null (rien de touché) ; la
// première image après reset (la lunette qui s'ouvre) mesure tout de suite, puis tous les periodeS. Rend la distance
// affichée, arrondie au mètre, ou null.
export function createTelemetre({ periodeS = TELEMETRE.periodeS } = {}) {
  let attente = 0, valeur = null, mesure = false
  return {
    update(dt, mesurer) {
      attente -= dt
      if (!mesure || attente <= 1e-9) {
        const d = mesurer()
        valeur = d === null || d === undefined ? null : Math.round(d)
        mesure = true
        attente += periodeS
        if (attente <= 0) attente = periodeS
      }
      return valeur
    },
    // Lunette fermée : la prochaine image tenue mesure tout de suite.
    reset() { attente = 0; valeur = null; mesure = false },
  }
}

const milliers = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

// La distance affichée : « 142 m », « 1 250 m », « --- m » sans mesure.
export function texteDistance(d) {
  return d === null || d === undefined ? '--- m' : `${milliers(d)} m`
}

// Le réglage de la lunette : « ZÉRO 430 m » ; rien sans réglage.
export function texteZero(zero) {
  return zero > 0 ? `ZÉRO ${milliers(zero)} m` : ''
}
