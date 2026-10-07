// Gardes de phase de la mission (mode histoire). m = { phase }

// La réussite (fin de la kill-cam) n'est enregistrée que si la mission est encore en cours : jamais après un
// échec tombé pendant le ralenti, jamais deux fois. 'paused' reste accepté tant que la pause est possible pendant
// la kill-cam, sinon la mission resterait bloquée ; A3 interdira cette pause et resserrera la garde.
export function canClear(m) {
  return m.phase === 'playing' || m.phase === 'paused'
}
