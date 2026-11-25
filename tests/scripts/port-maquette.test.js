import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { portMaquette, SCENES, generateScene } from '../../scripts/port-maquette.mjs'

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

  // Garde contre une réécriture muette : un chemin que le regex ne reconnaît pas resterait en `img/…`
  // et serait servi par le jeu à la racine (404). Mieux vaut échouer à la génération.
  it('refuse une image restée hors de briefing/ après la réécriture (html, css ou script)', () => {
    expect(() => portMaquette(FIXTURE.replace('img/portrait-a.png', 'img/Portrait-A.png'), { name: 'm9' })).toThrow(/m9.*img\/Portrait-A\.png/)
    expect(() => portMaquette(FIXTURE.replace('url(img/fond.png)', 'url(img/Fond.png)'), { name: 'm9' })).toThrow(/img\/Fond\.png/)
    const dansScript = FIXTURE.replace('K.run(', 'new Image().src = `img/Autre.png`; K.run(')
    expect(() => portMaquette(dansScript, { name: 'm9' })).toThrow(/img\/Autre\.png/)
  })

  it('ne confond pas les chemins déjà réécrits avec des oublis', () => {
    expect(() => portMaquette(FIXTURE, { name: 'm9' })).not.toThrow()
    expect(() => portMaquette(FIXTURE, { name: 'm9', imgExt: { 'portrait-a': 'jpg', fond: 'jpg' } })).not.toThrow()
  })

  it('refuse une maquette sans #st', () => {
    expect(() => portMaquette('<html><body></body></html>', { name: 'vide' })).toThrow(/#st/)
  })
})

describe('generateScene', () => {
  // Dépôt factice : la maquette de m1 cite quatre portraits et un fond ; public/briefing/img sert portrait-a en
  // .webp (il a aussi un .jpg et un .png), portrait-d en .webp (il a aussi un .png), portrait-b en .jpg,
  // portrait-c et le fond en .png seulement.
  it('sert le .webp d\'une image qui en a un, sinon le .jpg, sinon le .png ; la maquette garde ses .png', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'port-maquette-'))
    try {
      const maquettes = join(repo, 'docs', 'superpowers', 'maquettes', 'cinematiques')
      const img = join(repo, 'public', 'briefing', 'img')
      mkdirSync(maquettes, { recursive: true })
      mkdirSync(img, { recursive: true })
      const html = FIXTURE.replace('<img src="img/portrait-a.png" alt="">', ['a', 'b', 'c', 'd']
        .map(n => `<img src="img/portrait-${n}.png" alt="">`).join(''))
      writeFileSync(join(maquettes, SCENES.m1 + '.html'), html)
      for (const f of ['portrait-a.png', 'portrait-a.jpg', 'portrait-a.webp', 'portrait-b.png', 'portrait-b.jpg', 'portrait-c.png',
        'portrait-d.png', 'portrait-d.webp', 'fond.png']) {
        writeFileSync(join(img, f), '')
      }
      const mod = await importSource(generateScene('m1', repo))
      const servies = [...mod.html.matchAll(/src="briefing\/img\/([^"]+)"/g)].map(m => m[1])
      expect(servies).toEqual(['portrait-a.webp', 'portrait-b.jpg', 'portrait-c.png', 'portrait-d.webp'])
      expect(mod.css).toContain('url(briefing/img/fond.png)')
      expect(readFileSync(join(maquettes, SCENES.m1 + '.html'), 'utf8')).toBe(html)
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })
})

describe('scènes générées', () => {
  it('connaît les deux pièces du prologue', () => {
    expect(SCENES['prologue-a']).toBe('prologue-a')
    expect(SCENES['prologue-b']).toBe('prologue-b')
  })

  // Une image retirée de public/briefing/img (un portrait passé en WebP, par exemple) alors qu'une scène la cite
  // encore ne casse aucun autre test : la scène la chercherait en vain (404) pendant la cinématique.
  it('chaque image citée par une scène existe dans public/briefing/img', () => {
    const citees = [], manquantes = []
    for (const id of Object.keys(SCENES)) {
      const source = readFileSync(join(process.cwd(), 'src', 'briefing', 'scenes', id + '.js'), 'utf8')
      for (const [, nom] of source.matchAll(/briefing\/img\/([\w.-]+)/g)) {
        citees.push(nom)
        if (!existsSync(join(process.cwd(), 'public', 'briefing', 'img', nom))) manquantes.push(`${id} : ${nom}`)
      }
    }
    expect(citees.length).toBeGreaterThan(20)
    expect(manquantes).toEqual([])
  })

  it('chaque scène du dépôt est à jour avec sa maquette (sinon : node scripts/port-maquette.mjs)', () => {
    const lf = s => s.replace(/\r\n/g, '\n')
    for (const id of Object.keys(SCENES)) {
      const fichier = join(process.cwd(), 'src', 'briefing', 'scenes', id + '.js')
      expect(lf(readFileSync(fichier, 'utf8')), `scène « ${id} » périmée ou absente`).toBe(lf(generateScene(id, process.cwd())))
    }
  })
})
