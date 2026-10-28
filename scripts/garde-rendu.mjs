// ─── Captures de scripts/capture-mission.mjs : garde du rendu interrompu ─────────────────────────────────────────
// Contexte WebGL perdu (machine saturée, pilote réinitialisé, rendu logiciel à bout de mémoire) : le jeu met la partie
// en pause derrière son écran « LE RENDU A ÉTÉ INTERROMPU » (main.js, onRenderLost), que la page montre à la place de
// la scène. Le 28 octobre 2026, une passe de la sonde de lisibilité (lot 3, tâche S0) en a capturé deux comme des
// images de la scène, écrites dans l'annexe, sans aucune erreur. Ici, l'état du rendu se lit dans la page juste avant et
// juste après chaque capture : une image prise sur un rendu interrompu est refusée (RenduInterrompu, rien n'est écrit),
// puis refaite dans un Chrome neuf (avecNouveauxEssais). Éprouvé sans Chrome : tests/scripts/garde-rendu.test.js.
// c : le client DevTools de la page (send(méthode, paramètres)).

// Essais d'une capture refusée pour rendu interrompu, en tout, et pause avant chaque nouvel essai : le Chrome refusé est
// déjà fermé, la machine souffle avant le suivant.
export const ESSAIS_RENDU = 3
export const PAUSE_ESSAI_MS = 5000

// État du rendu, lu dans la page (Runtime.evaluate), sans rien y changer :
//   ecran : l'écran du rendu interrompu (#context-lost, index.html) est affiché ; null s'il manque à la page ;
//   contextePerdu : le contexte WebGL du canevas du jeu (#canvas, celui du renderer, scene.js) est perdu ; getContext
//     rend le contexte déjà créé par three, sans en créer d'autre ; null sans canevas ni contexte ;
//   page : l'origine de la page (performance.timeOrigin), une autre après un rechargement (le jeu recharge la page
//     quand le navigateur lui rend son contexte).
// Ne dépend de rien d'autre que la page : elle y est évaluée telle quelle (ETAT_DU_RENDU).
export function etatDuRendu() {
  const ecran = document.getElementById('context-lost')
  const canevas = document.getElementById('canvas')
  const gl = canevas ? canevas.getContext('webgl2') : null
  return {
    ecran: ecran ? !ecran.hidden : null,
    contextePerdu: gl ? gl.isContextLost() : null,
    page: performance.timeOrigin,
  }
}
export const ETAT_DU_RENDU = `(${etatDuRendu})()`

// Ce qui ne va pas dans un état du rendu : liste vide si rien.
function defauts(e) {
  if (!e) return ['état du rendu illisible']
  const d = []
  if (e.contextePerdu === true) d.push('contexte WebGL perdu')
  else if (e.contextePerdu !== false) d.push('canevas du jeu sans contexte WebGL')
  if (e.ecran === true) d.push('écran « LE RENDU A ÉTÉ INTERROMPU » affiché')
  else if (e.ecran !== false) d.push('écran du rendu interrompu introuvable dans la page')
  return d
}

// Raison de refuser une capture, d'après l'état du rendu lu juste avant et juste après elle ; null si le rendu est
// resté intact, dans la même page.
export function refusDuRendu(avant, apres) {
  for (const [moment, e] of [['avant', avant], ['après', apres]]) {
    const d = defauts(e)
    if (d.length) return `${moment} la capture (${d.join(', ')})`
  }
  if (avant.page !== apres.page) {
    return '(page rechargée pendant la capture : le jeu la recharge quand le navigateur lui rend son contexte WebGL)'
  }
  return null
}

// Capture refusée pour rendu interrompu ; raison : ce que la garde a vu (refusDuRendu).
export class RenduInterrompu extends Error {
  constructor(raison) {
    super(`rendu interrompu ${raison} : image refusée`)
    this.name = 'RenduInterrompu'
    this.raison = raison
  }
}

// État du rendu de la page ; null si la page ne répond pas (en plein rechargement, Chrome tombé).
async function lireRendu(c) {
  try {
    const r = await c.send('Runtime.evaluate', { expression: ETAT_DU_RENDU, returnByValue: true })
    return r.exceptionDetails ? null : r.result.value
  } catch {
    return null
  }
}

// Capture d'écran de la page (Page.captureScreenshot, params), gardée : l'état du rendu est lu juste avant et juste
// après. Rend le tampon de l'image, que l'appelant n'écrit qu'ensuite ; RenduInterrompu si le contexte WebGL est perdu,
// si l'écran du rendu interrompu est affiché, ou si la page a été rechargée entre les deux lectures.
export async function captureGardee(c, params) {
  const avant = await lireRendu(c)
  const { data } = await c.send('Page.captureScreenshot', params)
  const apres = await lireRendu(c)
  const raison = refusDuRendu(avant, apres)
  if (raison) throw new RenduInterrompu(raison)
  return Buffer.from(data, 'base64')
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const secondes = ms => String(ms / 1000).replace('.', ',')

// Une capture et ses nouveaux essais : capture(essai) ouvre un Chrome neuf et le ferme avant de rendre (shoot, dans
// capture-mission.mjs). Refusée pour rendu interrompu, elle est refaite après une pause, essais fois en tout au plus,
// et journal le dit (nom : la capture) ; refusée à chaque essai, RenduInterrompu le dit. Toute autre erreur (modèle
// inconnu, délai dépassé) passe tout de suite : elle ne tient pas à un rendu perdu.
export async function avecNouveauxEssais(capture, { nom = 'capture', essais = ESSAIS_RENDU, pauseMs = PAUSE_ESSAI_MS,
  journal = console.log, attendre = sleep } = {}) {
  for (let essai = 1; ; essai++) {
    try {
      return await capture(essai)
    } catch (e) {
      if (!(e instanceof RenduInterrompu)) throw e
      if (essai >= essais) throw new RenduInterrompu(`à chacun des ${essais} essais (dernier : ${e.raison})`)
      journal(`${nom} : ${e.message} ; nouvel essai (${essai + 1} sur ${essais}) dans ${secondes(pauseMs)} s, dans un Chrome neuf`)
      await attendre(pauseMs)
    }
  }
}
