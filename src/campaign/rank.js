// Rapport de fin de mission : précision et rang.

// Précision en pour cent, arrondie ; 100 si aucun tir.
export function precisionOf({ shots, hits }) {
  return shots > 0 ? Math.round((hits / shots) * 100) : 100
}

// FANTÔME : précision parfaite et aucune alerte. PROFESSIONNEL : au moins 60 % et au plus une alerte. Sinon BRUTAL.
export function rankFor({ shots, hits, alerts }) {
  const precision = precisionOf({ shots, hits })
  if (precision === 100 && alerts === 0) return { label: '★ FANTÔME ★', color: '#9fe8ff' }
  if (precision >= 60 && alerts <= 1) return { label: 'PROFESSIONNEL', color: '#4eff4e' }
  return { label: 'BRUTAL', color: '#ff8844' }
}

// Ce que la balle a touché ('target', 'lock', 'guard', 'civilian' ou 'miss') compte-t-il comme touche ?
// Le cadenas du port compte : libérer les victimes ne doit pas interdire le rang FANTÔME. Un garde n'est pas un
// contrat et un civil fait échouer la mission : ni l'un ni l'autre ne compte.
export function isHit(kind) {
  return kind === 'target' || kind === 'lock'
}
