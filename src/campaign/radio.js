// La radio d'Anton en mission (spec du lot 3, §2 g ; plan du lot 3a, tâche A8 ; contrat avec le lot 4). Module pur : ni
// three ni DOM ; main.js écrit la ligne dans le fil et joue ses bips (playRadio, src/audio.js).
//
// Une ligne (champ radio de la mission, src/campaign/missions/) : { evenement, texte, apresS, fois }. Un événement de la
// mission (EVENEMENTS de src/campaign/missions/index.js : le départ, le premier tir, le calme…) fait dire à Anton les
// lignes qui l'attendent, apresS secondes plus tard (0 par défaut), au plus fois fois dans la mission (une par défaut).
// Une ligne à la fois : la suivante attend que la précédente soit dite, le temps de ses bips (dureeDeLigne). Les lignes
// en attente passent dans l'ordre de leurs instants.
// suspendre() la fait taire (la pause du jeu ; la kill-cam du lot 4) : rien n'est dit, la ligne en cours est coupée et
// le canal libéré ; reprendre() la rend, et la ligne suivante passe dès qu'elle est due. Pendant la pause, la boucle ne
// mène pas les règles : la libération ne peut pas attendre un avancer (relecture de A8).

// Le temps d'une ligne (s) : la règle des cinématiques, 350 ms et 62 ms par caractère (estimate, src/briefing/kit.js,
// module de DOM que ce module pur n'importe pas ; tests/campaign/radio.test.js garde l'égalité).
export function dureeDeLigne(texte) {
  return (350 + texte.length * 62) / 1000
}

export function creerRadio(lignes = []) {
  const dites = new Map()   // ligne → fois où elle a été demandée
  const file = []           // [{ ligne, a }] : les lignes demandées, par instant croissant
  let libreA = -Infinity    // le canal se libère à cet instant (fin de la ligne en cours)
  let suspendue = false
  return {
    // L'événement de la mission, à l'instant t (horloge de la mission).
    signaler(evenement, t) {
      for (const ligne of lignes) {
        if (ligne.evenement !== evenement) continue
        const n = dites.get(ligne) || 0
        if (n >= (ligne.fois ?? 1)) continue
        dites.set(ligne, n + 1)
        const a = t + (ligne.apresS || 0)
        let i = file.length
        while (i > 0 && file[i - 1].a > a) i--
        file.splice(i, 0, { ligne, a })
      }
    },
    // Les lignes à dire maintenant (t, horloge de la mission) : [{ evenement, texte, dureeS }], une au plus quand le canal
    // est libre.
    avancer(t) {
      if (suspendue) return []
      const out = []
      while (file.length && file[0].a <= t && libreA <= t) {
        const { ligne } = file.shift()
        const dureeS = dureeDeLigne(ligne.texte)
        out.push({ evenement: ligne.evenement, texte: ligne.texte, dureeS })
        libreA = t + dureeS
      }
      return out
    },
    suspendre() { suspendue = true; libreA = -Infinity },   // la ligne en cours est coupée : le canal est libre
    reprendre() { suspendue = false },
    get suspendue() { return suspendue },
    // Les lignes demandées pas encore dites (vérifications) : [{ texte, a }].
    enAttente() { return file.map(({ ligne, a }) => ({ texte: ligne.texte, a })) },
  }
}
