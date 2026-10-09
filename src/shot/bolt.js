// Culasse (spec du lot 2, §3.3) : après un coup, on ne peut plus tirer pendant la course de la culasse (1,2 s, moins
// avec la Vélocité : getStats().boltS), qu'on entend s'ouvrir puis se refermer. Module pur (ni DOM ni three) : main.js
// lui donne le temps de la mission (en secondes, avancé de dt à chaque image : la pause l'arrête, le ralenti le
// ralentit), les tests l'importent directement.
import { CULASSE } from './tuning.js'

// Les pas de 1/fps cumulés n'arrivent pas toujours pile sur la fin de la course (1,1999999999) : prête à la première
// image qui la passe.
const EPS = 1e-9

export function createBolt(t = CULASSE) {
  let firedAt = -Infinity, duree = t.dureeS[0]
  let cues = []          // sons à venir de la course en cours : { son, at } (temps de la mission), dans l'ordre
  return {
    // Coup de feu à l'instant now ; duree : la course de la culasse (getStats().boltS). Les sons gardent leur place
    // dans la course (ouverture à 0,35 / 1,2 de la course, fermeture à 0,9 / 1,2), qu'elle dure 1,2 s ou moins.
    fire(now, d = t.dureeS[0]) {
      firedAt = now; duree = d
      const k = d / t.dureeS[0]
      cues = [{ son: 'ouverture', at: now + t.ouvertureS * k }, { son: 'fermeture', at: now + t.fermetureS * k }]
    },
    // On peut tirer (jamais tirée, ou la course est finie).
    ready(now) { return now - firedAt >= duree - EPS },
    // Avancement de la course, de 0 (le coup) à 1 (prête) : la jauge sous le réticule.
    progress(now) { return Math.max(0, Math.min(1, (now - firedAt) / duree)) },
    // Sons dont l'instant est passé à now et pas encore rendus, dans l'ordre ('ouverture', 'fermeture') : chacun une
    // seule fois par coup.
    cues(now) {
      const due = cues.filter(c => c.at <= now + EPS)
      cues = cues.filter(c => c.at > now + EPS)
      return due.map(c => c.son)
    },
    // Montage d'une mission : prête, aucun son en attente.
    reset() { firedAt = -Infinity; duree = t.dureeS[0]; cues = [] },
  }
}
