import { describe, it, expect } from 'vitest'
import { MAIN_SRC as SRC, analyse, callsInNode } from './mainSource.js'

// Câblage de la route ?sonde=1 dans main.js (sonde de lisibilité, spec du lot 3 §1 « 3.0 » ; plan du lot 3a, tâche
// S0). main.js ne s'importe pas sous jsdom : cette garde lit le source.
// - La route n'existe qu'en développement : son bloc est dans celui de import.meta.env.DEV, que la construction retire
//   (comme ?memtest=1). Sinon, une adresse ?sonde=1 démonterait le menu du jeu livré.
// - Elle arrête la boucle du jeu (setCampaignPaused(true)) : sinon la caméra du menu, qui dérive à chaque image,
//   bougerait après la mesure et l'image capturée ne serait plus celle qui a été mesurée.
// - Elle attend les modèles (charactersLoading) avant de poser les personnages : sans eux, aucun modèle à poser.
//
// Témoin : avant la tâche S0 (commit 267ca90), la route n'existe pas (garde rouge : « route ?sonde=1 »). Plus bas,
// chaque défaut est reproduit sur le source et doit faire rougir la garde.

const est = (a, node, texte) => node && a.source.slice(node.start, node.end) === texte
const dedans = (n, bloc) => bloc && n.start >= bloc.start && n.end <= bloc.end

// Blocs if de premier niveau dont le test est exactement `texte`, et ceux, à toute profondeur, dans un nœud.
function ifs(a, racine, texte) {
  const out = []
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object') return
    if (node.type === 'IfStatement' && est(a, node.test, texte)) out.push(node)
    for (const k in node) if (k !== 'parent') walk(node[k])
  }
  walk(racine)
  return out
}

function faults(source) {
  const a = analyse(source)
  const out = []
  const dev = a.program.body.find(n => n.type === 'IfStatement' && est(a, n.test, 'import.meta.env.DEV'))
  const routes = ifs(a, a.program, "q.has('sonde')")
  if (!routes.length) return ['route ?sonde=1']
  for (const r of routes) {
    if (!dedans(r, dev)) out.push('route ?sonde=1 en développement seulement')
    const appels = callsInNode(a, r.consequent)
    const pause = appels.find(c => c.callee === 'setCampaignPaused')
    if (!pause || !/^setCampaignPaused\(\s*true\s*\)$/.test(source.slice(pause.start, pause.end))) out.push('boucle du jeu arrêtée (setCampaignPaused(true))')
    if (!/await\s+charactersLoading\b/.test(source.slice(r.consequent.start, r.consequent.end))) out.push('modèles attendus (await charactersLoading)')
  }
  return out
}

describe('route ?sonde=1 : câblage dans main.js', () => {
  it('en développement seulement, boucle du jeu arrêtée, modèles attendus', () => {
    expect(faults(SRC)).toEqual([])
  })
})

describe('témoins de la garde', () => {
  const bloc = () => {
    const a = analyse(SRC)
    const [r] = ifs(a, a.program, "q.has('sonde')")
    expect(r, 'route ?sonde=1 introuvable : témoin impossible').toBeDefined()
    return SRC.slice(r.start, r.end)
  }

  it('la route sortie du bloc de développement fait rougir la garde', () => {
    const route = bloc()
    const sorti = SRC.replace(route, '') + '\nconst q = new URLSearchParams(location.search)\n' + route + '\n'
    expect(sorti).not.toBe(SRC)
    expect(faults(sorti)).toEqual(['route ?sonde=1 en développement seulement'])
  })

  it('sans la boucle arrêtée, la garde rougit', () => {
    const route = bloc()
    const sans = SRC.replace(route, route.replace(/setCampaignPaused\(\s*true\s*\)/, 'setCampaignPaused(false)'))
    expect(sans).not.toBe(SRC)
    expect(faults(sans)).toEqual(['boucle du jeu arrêtée (setCampaignPaused(true))'])
  })

  it('sans l\'attente des modèles, la garde rougit', () => {
    const route = bloc()
    const sans = SRC.replace(route, route.replace(/await\s+charactersLoading\b/, 'charactersLoading'))
    expect(sans).not.toBe(SRC)
    expect(faults(sans)).toEqual(['modèles attendus (await charactersLoading)'])
  })
})
