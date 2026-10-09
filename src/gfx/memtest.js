// ─── Mesure mémoire scriptée (route de développement ?memtest=1, spec du lot 1 §4.1 et §6) ───────────────────────
// Partie pure de la route (main.js, dans Chrome) : la liste des étapes, le hasard à graine qui rend deux montages
// d'une même mission identiques, le relevé des compteurs du renderer et le déroulé. Sans requestAnimationFrame : il
// ne tourne pas dans un onglet masqué ni sans interface. Les seuils sont dans scripts/memtest.mjs (Node).

// menu → première image de M1 → M1 à M6 → menu → 10 montages de M6 → menu → 5 arènes PvP hors réseau → menu
// premiere-image (spec du lot 1 §4.6) : la mission montée comme pendant son briefing, puis la durée de sa première
// image. À froid, juste après le menu de départ, comme la première mission d'une session : aucun de ses shaders n'est
// encore compilé. Elle tire le hasard de M1 : l'étape M1 qui suit dessine les mêmes modèles, ses compteurs ne changent pas.
export function memtestSteps({ missions = 6, repeats = 10, arenas = 5, premiere = 1 } = {}) {
  const steps = [{ etape: 'menu', type: 'menu' }, { etape: 'premiere-image', type: 'premiere', n: premiere }]
  for (let n = 1; n <= missions; n++) steps.push({ etape: 'M' + n, type: 'mission', n })
  steps.push({ etape: 'menu-campagne', type: 'menu' })
  for (let k = 1; k <= repeats; k++) steps.push({ etape: `M${missions}-${k}`, type: 'mission', n: missions })
  steps.push({ etape: `menu-m${missions}`, type: 'menu' })
  for (let i = 1; i <= arenas; i++) steps.push({ etape: 'pvp-' + i, type: 'pvp', i })
  steps.push({ etape: 'menu-final', type: 'menu', apresPvp: true })
  return steps
}

// Générateur à graine (mulberry32, comme pvp.js) : PNJ, modèles et teintes tirés pareil à chaque montage.
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

// Exécute fn avec Math.random remplacé par un générateur à graine, puis le rend, même si fn échoue.
export function withSeed(seed, fn) {
  const orig = Math.random
  Math.random = mulberry32(seed >>> 0)
  try { return fn() } finally { Math.random = orig }
}

// Une graine par mission (tous les montages de M6 tirent la même foule), une pour les arènes, une pour le menu.
export function seedOf(step) {
  if (step.type === 'mission' || step.type === 'premiere') return 1000 + step.n
  if (step.type === 'pvp') return 4242
  return 7
}

// Compteurs du renderer (three r185 : renderer.info) et tas JS de Chrome (performance.memory), null ailleurs. models :
// géométries et textures des modèles chargés (characters.js, modelResources), publiées avec le relevé : le critère
// « partie complète » les ajoute au menu de départ (spec du lot 1, §6 reformulé le 9 octobre 2026, §8).
export function measure(info, memory, models) {
  return {
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programmes: info.programs ? info.programs.length : 0,
    appels: info.render.calls,
    triangles: info.render.triangles,
    tasMo: memory ? Math.round(memory.usedJSHeapSize / 1e6) : null,
    ...(models ? { geometriesModeles: models.geometries, texturesModeles: models.textures } : {}),
  }
}

// Déroulé : pour chaque étape, act (monter), render (quelques images), snapshot (relevé), puis report(entrées, état)
// avec état 'en-cours', 'fini' ou 'erreur'. Une étape qui échoue arrête tout : son entrée porte le message d'erreur.
// Un objet renvoyé par act ou render (durées et comptes de l'étape premiere-image) est ajouté à l'entrée, après le relevé.
// pause : rend la main au navigateur entre deux étapes (le DOM du <pre> s'affiche au fil de l'eau).
const fields = x => x && typeof x === 'object' && !Array.isArray(x) ? x : {}

export async function runMemtest({ steps, act, render, snapshot, report, pause = () => new Promise(r => setTimeout(r, 0)) }) {
  const entries = []
  for (const step of steps) {
    try {
      const mounted = await act(step)
      const rendered = render(step)
      entries.push({ etape: step.etape, ...snapshot(), ...fields(mounted), ...fields(rendered) })
    } catch (e) {
      entries.push({ etape: step.etape, erreur: String(e && e.message || e) })
      report(entries, 'erreur')
      return entries
    }
    report(entries, 'en-cours')
    await pause()
  }
  report(entries, 'fini')
  return entries
}
