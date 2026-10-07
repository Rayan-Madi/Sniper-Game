// ─── Performances : calcul (pur) et panneau discret en bas à gauche ──────────────────────────────────────────────
// frameStats est pur et testé ; le panneau ne lit renderer.info et n'écrit dans la page qu'une fois affiché, et au
// plus 4 fois par seconde. Affiché par ?stats=1 (main.js), dans toutes les phases sauf l'enquête (qui garde son
// propre compteur, au même endroit).

// Durées d'image (ms) → images par seconde (1000 / moyenne), p50 et p95 au rang le plus proche : la valeur réellement
// observée au rang ⌈p × n⌉ de la liste triée, jamais interpolée. Tableau vide : tout à zéro.
export function frameStats(samplesMs) {
  const n = samplesMs ? samplesMs.length : 0
  if (!n) return { fps: 0, p50: 0, p95: 0 }
  let sum = 0
  for (const v of samplesMs) sum += v
  const mean = sum / n
  const sorted = Array.from(samplesMs).sort((a, b) => a - b)
  const rank = p => sorted[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))]
  return { fps: mean > 0 ? 1000 / mean : 0, p50: rank(0.5), p95: rank(0.95) }
}

// ─── Panneau ─────────────────────────────────────────────────────────────────────────────────────────────────────
const WINDOW = 120        // images retenues pour p50 et p95
const REFRESH_MS = 250    // au plus 4 rafraîchissements par seconde
const BUDGET_MS = 22      // p95 au-delà : signalée (seuil de baisse de la résolution dynamique, spec du lot 1 §4.3)

const triangles = n => n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e4 ? `${Math.round(n / 1e3)} k` : String(n)

// Une ligne en bas à gauche, sous la boîte STRESS du HUD (style #perf-stats dans index.html). Rien n'est créé ni lu
// tant que le panneau n'est pas affiché. update(dtMs) : durée de l'image qui vient de s'écouler.
export function createStatsPanel({ renderer, parent = document.body }) {
  let el = null
  const v = {}   // champs à valeur : fps, ms, appels, tri, geo, tex, prog, tas
  let tasEl = null
  let visible = false
  const samples = []
  let acc = 0

  function build() {
    el = document.createElement('div')
    el.id = 'perf-stats'
    const dim = text => { const s = document.createElement('span'); s.className = 'perf-dim'; s.textContent = text; return s }
    const field = (key, unit, sep = true) => {
      const wrap = document.createElement('span')
      if (sep) wrap.appendChild(dim(' · '))
      v[key] = document.createElement('span')
      wrap.append(v[key], dim(' ' + unit))
      el.appendChild(wrap)
      return wrap
    }
    field('fps', 'i/s', false); field('ms', 'ms'); field('appels', 'appels'); field('tri', 'tri')
    field('geo', 'géo'); field('tex', 'tex'); field('prog', 'prog')
    tasEl = field('tas', 'Mo')
    tasEl.insertBefore(dim('tas '), v.tas)
    parent.appendChild(el)
  }

  function refresh() {
    let sum = 0, k = samples.length
    while (k > 0 && sum < 1000) sum += samples[--k]      // dernière seconde : images par seconde
    const { fps } = frameStats(samples.slice(k))
    const { p50, p95 } = frameStats(samples)
    const i = renderer.info
    v.fps.textContent = Math.round(fps)
    v.ms.textContent = `${p50.toFixed(1)}/${p95.toFixed(1)}`
    if (p95 > BUDGET_MS) v.ms.dataset.lent = ''
    else delete v.ms.dataset.lent
    v.appels.textContent = i.render.calls
    v.tri.textContent = triangles(i.render.triangles)
    v.geo.textContent = i.memory.geometries
    v.tex.textContent = i.memory.textures
    v.prog.textContent = i.programs ? i.programs.length : 0
    const mem = typeof performance !== 'undefined' && performance.memory
    tasEl.style.display = mem ? '' : 'none'
    if (mem) v.tas.textContent = Math.round(mem.usedJSHeapSize / 1e6)
  }

  return {
    get visible() { return visible },
    show() {
      if (!el) build()
      el.style.display = ''
      visible = true
      samples.length = 0; acc = 0
    },
    hide() {
      visible = false
      if (el) el.style.display = 'none'
    },
    update(dtMs) {
      if (!visible) return
      samples.push(dtMs)
      if (samples.length > WINDOW) samples.shift()
      acc += dtMs
      if (acc < REFRESH_MS) return
      acc %= REFRESH_MS
      refresh()
    },
  }
}
