import { describe, it, expect } from 'vitest'
import { portMaquette } from '../../scripts/port-maquette.mjs'

const FIXTURE = `<!DOCTYPE html><html><head><link rel="stylesheet" href="kit.css">
<style>.m9 .x { color: red; background: url(img/fond.png) }</style></head>
<body><div class="wrap"><div class="st m9" id="st"><div class="bg"></div><div class="scene" id="scene"><img src="img/portrait-a.png" alt=""></div></div></div>
<script src="kit.js"></script>
<script>const port = new URLSearchParams(location.search).get('port'); K.run({ beats: [{ say: port || 'rien' }] })</script>
</body></html>`

// Importe la source générée via une URL data: (le module n'a aucun import). Un fichier temporaire hors du
// dépôt n'est pas chargeable par le lanceur de modules de Vitest 5 sous Windows (« Cannot find module »).
async function importSource(src) {
  return import(/* @vite-ignore */ 'data:text/javascript;base64,' + Buffer.from(src).toString('base64'))
}

describe('portMaquette', () => {
  it('extrait la classe de scène, le CSS et le HTML de #st', async () => {
    const mod = await importSource(portMaquette(FIXTURE, { name: 'm9' }))
    expect(mod.stClass).toBe('st m9')
    expect(mod.css).toContain('.m9 .x')
    expect(mod.html).toContain('id="scene"')
    expect(mod.html).not.toContain('class="wrap"')
  })

  it('réécrit les images vers briefing/img avec l\'extension choisie', async () => {
    const mod = await importSource(portMaquette(FIXTURE, { name: 'm9', imgExt: { 'portrait-a': 'jpg' } }))
    expect(mod.html).toContain('src="briefing/img/portrait-a.jpg"')
    expect(mod.css).toContain('url(briefing/img/fond.png)')
  })

  it('start() exécute le script avec le K fourni et ctx.search à la place de location', async () => {
    const mod = await importSource(portMaquette(FIXTURE, { name: 'm9' }))
    const calls = []
    mod.start({ run: cfg => calls.push(cfg) }, { search: '?port=libres' })
    mod.start({ run: cfg => calls.push(cfg) }, {})
    expect(calls.map(c => c.beats[0].say)).toEqual(['libres', 'rien'])
  })

  it('fait passer les minuteurs de la scène par K.at (annulables au démontage)', async () => {
    const html = FIXTURE.replace('K.run(', 'setTimeout(() => {}, 30); requestAnimationFrame(() => {}); K.run(')
    const mod = await importSource(portMaquette(html, { name: 'm9' }))
    const ats = []
    mod.start({ run: () => {}, at: (ms, fn) => ats.push(ms) }, {})
    expect(ats).toEqual([30, 16])
  })

  it('refuse une maquette sans #st', () => {
    expect(() => portMaquette('<html><body></body></html>', { name: 'vide' })).toThrow(/#st/)
  })
})
