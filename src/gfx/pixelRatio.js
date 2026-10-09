// ─── Densité d'écran ─────────────────────────────────────────────────────────────────────────────────────────────
// Rappelle onChange(nouvelle densité) à chaque changement de win.devicePixelRatio : zoom du navigateur, fenêtre passée
// sur un écran d'une autre densité. Ce second cas ne déclenche pas toujours resize : la fenêtre peut garder sa taille
// en pixels CSS. On suit donc la media query de la densité courante, qui bascule quand elle change, et on la repose à
// chaque fois sur la nouvelle densité : un seul écouteur à la fois. Sans matchMedia (jsdom, ancien moteur), rien
// n'est suivi. Vérifié dans Chrome sans interface avec une densité émulée qui change avec la taille ; l'émulation ne
// sait pas changer la densité seule (ni resize ni media query n'y préviennent alors).
export function onPixelRatioChange(win, onChange) {
  if (typeof win.matchMedia !== 'function') return
  const suivre = () => {
    win.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`).addEventListener('change', () => {
      suivre()
      onChange(win.devicePixelRatio)
    }, { once: true })
  }
  suivre()
}
