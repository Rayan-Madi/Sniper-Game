// ─── Préparation d'une mission pendant son briefing (spec du lot 1 §4.6) ──────────────────────────────────────────
// Avant ce lot, la mission se montait à la fin du briefing (carte, PNJ, cadenas, convoi), et sa première image
// compilait tous ses shaders : un à-coup entre la cinématique et le jeu. launchLevel (main.js) la monte désormais
// pendant la cinématique, le rendu WebGL étant arrêté en phase 'briefing' (rien n'apparaît dessous), puis compile ses
// shaders ; startLevel reprend ce montage. Sans briefing (réessai, briefing déjà vu), rien ne change : startLevel monte.
// prepare est le montage de main.js (prepareLevel).
//
// schedule(fn) : quand monter (main.js : afterPaint, une fois l'écran noir de la cinématique affiché ; par défaut dans
// l'appel). settled() : vrai si les modèles sont chargés ; ready() : promesse de leur chargement (characters.js).
// Modèles prêts : montage au moment donné par schedule. Sinon, montage à leur arrivée, briefing en cours ou départ en
// attente des modèles (enterLevel) : jamais avec des PNJ procéduraux. isCurrent() faux : lancement abandonné (mission
// relancée, rendu interrompu), rien n'est monté.
// take(), au départ de la mission : vrai si la mission est montée, une seule fois. Faux sinon (modèles arrivés trop
// tard, montage en échec ou pas encore tenté, lancement caduc) : le départ monte la mission lui-même, comme avant ce
// lot, et plus rien n'est monté ensuite sous la mission en cours. Un montage en échec est signalé à onError, jamais
// renvoyé au lancement.
// begun : promesse tenue une fois le montage tenté, ou renvoyé à l'arrivée des modèles. La cinématique l'attend pour
// démarrer (playCinematic, option ready) : le montage, qui bloque le fil principal, se fait sur l'écran noir, pas
// pendant son animation. Elle n'attend jamais les modèles.
export function prepareDuringBriefing({ settled, ready, prepare, isCurrent = () => true, onError = () => {}, schedule = fn => fn() }) {
  let state = 'attente'   // 'attente', 'prete', 'prise' par le départ, 'abandon', 'echec'
  const run = () => {
    if (state !== 'attente') return
    if (!isCurrent()) { state = 'abandon'; return }
    try {
      prepare()
      state = 'prete'
    } catch (e) {
      state = 'echec'
      onError(e)
    }
  }
  const begun = new Promise(resolve => {
    schedule(() => {
      if (settled()) run()
      else Promise.resolve().then(ready).then(run, () => { if (state === 'attente') state = 'abandon' })
      resolve()
    })
  })
  return {
    begun,
    take() {
      if (state === 'prete') { state = 'prise'; return true }
      if (state === 'attente') state = 'abandon'
      return false
    },
  }
}

// Appelle fn une fois l'image en cours peinte : requestAnimationFrame précède la peinture, la tâche qu'il programme la
// suit. Onglet masqué (requestAnimationFrame suspendu) : au plus tard au bout de fallbackMs. Une seule fois.
export function afterPaint(fn, { raf = cb => requestAnimationFrame(cb), fallbackMs = 100 } = {}) {
  let done = false
  const go = () => { if (!done) { done = true; fn() } }
  raf(() => setTimeout(go, 0))
  setTimeout(go, fallbackMs)
}
