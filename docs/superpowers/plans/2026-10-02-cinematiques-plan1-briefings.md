# Cinématiques — Plan 1 : le kit dans le jeu, les 6 briefings et l'épilogue

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jouer dans le jeu, à la place des cinématiques 3D de mission et de fin, les 6 briefings et l'épilogue en motion design validés en maquette. Ils doivent pouvoir se passer au clavier, ne se jouer qu'au premier essai, mettre en pause le rendu 3D et respecter le volume du jeu.

**Architecture:** Le moteur des maquettes (`docs/superpowers/maquettes/cinematiques/kit.js`) devient deux modules ES : `src/briefing/kit.js` (séquenceur et habillage) et `src/briefing/sound.js` (son procédural branché sur `src/audio.js`). Un convertisseur transforme chaque maquette HTML en module de scène (`src/briefing/scenes/*.js`) sans la réécrire à la main. `playCinematic(id, …)` (`src/briefing/index.js`) monte une scène dans `#briefing-root`, au-dessus du canvas, gère « passer » et le démontage. `main.js` l'appelle à la place de `startLevelCinematic` et de `startEndingCinematic`.

**Tech Stack:** JavaScript ES modules, Vite 8, Three.js 0.185 (inchangé). Ajouts en devDependencies seulement : Vitest + jsdom. PowerShell 5.1 + System.Drawing, pour recompresser les images une fois.

**Spec:** `docs/superpowers/specs/2026-10-02-cinematiques-design.md`. Ce plan couvre les **étapes 1 et 2** de la spec (§ 10). Le prologue (étapes 3 et 4) et le nettoyage (étape 5) feront l'objet du Plan 2.

## Global Constraints

- Les textes, timings et mises en page des scènes sont **ceux des maquettes**, à l'identique. Les maquettes de `docs/superpowers/maquettes/cinematiques/` sont la source et **ne se modifient pas**.
- Aucune nouvelle dépendance d'exécution. Seuls `vitest` et `jsdom` sont ajoutés, en `devDependencies`.
- Chemins d'assets **relatifs** (`briefing/img/…`), compatibles avec `base: './'` et le build Electron. Jamais de `/…` absolu.
- Poids ajouté au téléchargement : **< 1,5 Mo** au total.
- Pendant une cinématique : **aucun rendu WebGL** (`renderer.render` n'est pas appelé).
- Passer : **Échap, Entrée, Espace ou clic**, suivi d'un fondu de sortie de 400 ms.
- Le son des cinématiques passe par le contexte audio et le nœud maître de `src/audio.js`, donc le volume du jeu s'applique.
- Pas de synthèse vocale du navigateur dans le jeu : seulement les bips synthétiques. Les fichiers de voix (§ 6.5 de la spec) sont prévus pour plus tard et hors de ce plan.
- Un commit par tâche, sur la branche `feat/cinematiques`. **Ne pas pousser** tant que Rayan ne l'a pas demandé. Chaque message de commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tout texte visible et tout commentaire de code en français.

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `package.json`, `vite.config.js` | Scripts `test`, configuration Vitest (jsdom). |
| `tests/setup.js` | Petits compléments à jsdom (`getTotalLength` sur SVG). |
| `src/briefing/kit.js` | Séquenceur de temps, habillage injecté (CRT, glitchs…), sous-titres, gel, `destroy()`. |
| `src/briefing/sound.js` | Son procédural (voix-bips, musique, bruitages) sur un contexte audio fourni. |
| `src/briefing/kit.css` | CSS du kit (repris des maquettes) + règles de `#briefing-root`. |
| `scripts/port-maquette.mjs` | Convertit une maquette HTML en module de scène. |
| `scripts/compress-briefing-img.ps1` | Recompresse en JPEG les images utilisées, vers `public/briefing/img/`. |
| `public/briefing/img/*` | Images des scènes (JPEG, plus deux PNG pixelisés). |
| `src/briefing/scenes/{m1…m6,epilogue}.js` | Modules générés (`stClass`, `css`, `html`, `start(K, ctx)`). |
| `src/briefing/index.js` | `playCinematic`, `registerScene`, `isCinematicPlaying`. |
| `scripts/shots.mjs` | Captures figées des cinématiques dans le jeu (Chrome sans interface). |
| `src/upgrades.js` | Ajout de `freedVictims`, `briefingSeen`, `markBriefingSeen`, `resetCampaignFlags`. |
| `src/audio.js` | Export de `audioContext()` et `masterNode()`. |
| `src/main.js`, `index.html` | Branchement : phase `briefing`, premier essai seulement, « Revoir le briefing », épilogue, route de dev `?cine=`. |

---

### Task 1: Le moteur du kit, testé

**Files:**
- Modify: `package.json`, `vite.config.js`, `.gitignore`
- Create: `tests/setup.js`, `src/briefing/sound.js`, `src/briefing/kit.js`, `src/briefing/kit.css`
- Test: `tests/briefing/kit.test.js`

**Interfaces:**
- Produces:
  - `estimate(text: string): number` (ms)
  - `createKit({ root: Element, audio?: { ctx: AudioContext, dest: AudioNode } | null, freeze?: number | null }): K`, où K expose : `run(cfg) → Promise<void>`, `finished: Promise<void>`, `destroy()`, `errors: string[]`, `frozen: boolean`, `$`, `at`, `on`, `off`, `type`, `glitch`, `shake`, `crt`, `lost`, `title`, `black`, `counter`, `wave`, `music`, `speak`, `snd`.
  - `cfg = { beats: Beat[], music?: 'tense'|'somber'|'dread'|'pulse', stateClasses?: string[], reset?: (K) => void }`
  - `Beat = { label?, say?, who?: 'ANTON'|'VIKTOR'|'PHONE', name?, into?, pre?, min?, post?, clear?, cues?: [ms, (K) => void][] }` (même contrat que les maquettes).
  - `createSound(audio, { at, every, stopEvery })` renvoie une palette sonore `{ crt, tick, shutter, beep, marker, stamp, slap, paper, sweep, ping, sonar, count, clock, heart, thud, rumble, alarm, glitch, lost, boom, tone, noise, voice, stopVoice, music, destroy }`.

- [ ] **Step 1 : Installer Vitest et jsdom, configurer**

Run: `npm install -D vitest jsdom`

Dans `package.json`, ajouter le script de test (garder les autres) :

```json
"test": "vitest run"
```

Remplacer `vite.config.js` par :

```js
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    host: true,   // expose sur le réseau local → une 2ᵉ machine peut rejoindre via l'IP LAN
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
  },
})
```

Créer `tests/setup.js` :

```js
// Compléments à jsdom pour les scènes de cinématique (rendu absent en test).
if (typeof SVGElement !== 'undefined' && !SVGElement.prototype.getTotalLength) {
  SVGElement.prototype.getTotalLength = () => 100
}
```

Ajouter à la fin de `.gitignore` :

```
# Captures des cinématiques (scripts/shots.mjs)
shots/
```

- [ ] **Step 2 : Écrire les tests du kit (ils échouent)**

Créer `tests/briefing/kit.test.js` :

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createKit, estimate } from '../../src/briefing/kit.js'

function mountScene(inner = '') {
  document.body.innerHTML = `<div id="root"><div class="st" id="st"><div class="scene" id="scene">${inner}
    <div class="radio" id="radio"></div><div class="sub" id="sub"></div><div class="title" id="title"></div></div></div></div>`
  return document.getElementById('root')
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
beforeEach(() => vi.useFakeTimers(FAKE))
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

describe('kit des cinématiques', () => {
  it('estime une réplique à 350 ms + 62 ms par caractère', () => {
    expect(estimate('abc')).toBe(536)
  })

  it('injecte l\'habillage et remplit la radio par défaut', () => {
    const root = mountScene()
    createKit({ root })
    for (const id of ['k-crt', 'k-bf', 'k-lost', 'k-black', 'k-glf', 'k-replay', 'k-lbl']) {
      expect(root.querySelector('#' + id)).not.toBeNull()
    }
    expect(root.querySelector('#radio').textContent).toContain('ANTON')
  })

  it('refuse une scène sans #st ni #scene', () => {
    document.body.innerHTML = '<div id="root"></div>'
    expect(() => createKit({ root: document.getElementById('root') })).toThrow(/#st/)
  })

  it('un temps parlé dure sa réplique estimée + 350 ms, puis la séquence se termine', async () => {
    const K = createKit({ root: mountScene() })
    let done = false
    K.run({ beats: [{ say: 'abc' }] }).then(() => { done = true })
    await vi.advanceTimersByTimeAsync(536 + 350 - 1); await flush()
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1); await flush()
    expect(done).toBe(true)
  })

  it('déclenche les effets à leur instant, relatif au début du temps', async () => {
    const K = createKit({ root: mountScene() })
    const seen = []
    K.run({ beats: [{ min: 1000 }, { min: 1000, cues: [[200, () => seen.push('b')]] }] })
    await vi.advanceTimersByTimeAsync(1199); await flush()
    expect(seen).toEqual([])
    await vi.advanceTimersByTimeAsync(1); await flush()
    expect(seen).toEqual(['b'])
  })

  it('affiche Anton en sous-titre et allume la radio pendant qu\'il parle', async () => {
    const root = mountScene()
    const K = createKit({ root })
    K.run({ beats: [{ say: 'Salut' }] })
    await vi.advanceTimersByTimeAsync(10); await flush()
    expect(root.querySelector('#sub .spk').textContent).toBe('ANTON')
    expect(root.querySelector('#radio').classList.contains('talk')).toBe(true)
    await vi.advanceTimersByTimeAsync(estimate('Salut')); await flush()
    expect(root.querySelector('#radio').classList.contains('talk')).toBe(false)
    expect(root.querySelector('#sub .tx').textContent).toBe('Salut')
  })

  it('tape une écoute téléphonique dans #trans quand la scène en a un', async () => {
    const root = mountScene('<div id="trans"></div><div id="wave"></div>')
    const K = createKit({ root })
    K.run({ beats: [{ who: 'PHONE', say: 'Allo' }] })
    await vi.advanceTimersByTimeAsync(estimate('Allo')); await flush()
    expect(root.querySelector('#trans').textContent).toBe('Allo')
    expect(root.querySelector('#sub').textContent).toBe('')
  })

  it('étiquette la voix intérieure de Viktor sans allumer la radio', async () => {
    const root = mountScene()
    const K = createKit({ root })
    K.run({ beats: [{ who: 'VIKTOR', say: 'Non.' }] })
    await vi.advanceTimersByTimeAsync(10); await flush()
    expect(root.querySelector('#sub .spk').classList.contains('inner')).toBe(true)
    expect(root.querySelector('#radio').classList.contains('talk')).toBe(false)
  })

  it('remet la scène à zéro au lancement : classes d\'état et champs data-reset', () => {
    const root = mountScene('<div id="a" class="on side"></div><div id="b" data-reset>vieux</div>')
    const K = createKit({ root })
    K.run({ beats: [] })
    expect(root.querySelector('#a').className).toBe('')
    expect(root.querySelector('#b').textContent).toBe('')
  })

  it('destroy() annule tous les minuteurs ; la séquence ne se termine jamais', async () => {
    const K = createKit({ root: mountScene() })
    let done = false
    K.run({ beats: [{ say: 'Une réplique assez longue' }] }).then(() => { done = true })
    await vi.advanceTimersByTimeAsync(100)
    K.destroy()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10000); await flush()
    expect(done).toBe(false)
  })

  it('en mode gel, tout s\'arrête à l\'instant demandé et la scène est marquée figée', async () => {
    const root = mountScene()
    const K = createKit({ root, freeze: 500 })
    K.run({ beats: [{ say: 'Une réplique qui dure un moment' }] })
    await vi.advanceTimersByTimeAsync(500); await flush()
    expect(K.frozen).toBe(true)
    expect(root.querySelector('#st').classList.contains('k-frozen')).toBe(true)
    const typed = root.querySelector('#sub .tx').textContent
    await vi.advanceTimersByTimeAsync(5000); await flush()
    expect(root.querySelector('#sub .tx').textContent).toBe(typed)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reste muet et sans erreur quand aucun contexte audio n\'est fourni', () => {
    const K = createKit({ root: mountScene() })
    expect(() => { K.snd.boom(); K.snd.stamp(); K.music('tense'); K.music(null) }).not.toThrow()
  })
})
```

- [ ] **Step 3 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- tests/briefing/kit.test.js`
Expected: FAIL, avec « Failed to load url ../../src/briefing/kit.js » (ou « Cannot find module »).

- [ ] **Step 4 : Écrire `src/briefing/sound.js`**

```js
// Son procédural des cinématiques — mêmes recettes que les maquettes (docs/superpowers/maquettes/cinematiques/kit.js).
// Branché sur le contexte et le nœud maître de src/audio.js : le volume du jeu s'applique.
// Sans contexte audio (tests, son indisponible), toutes les fonctions sont muettes.

const PROG = {
  tense:  [[220, 261.63, 329.63], [196, 233.08, 293.66], [174.61, 220, 261.63], [164.81, 207.65, 246.94]],
  somber: [[146.83, 174.61, 220], [130.81, 164.81, 196], [123.47, 146.83, 185], [110, 138.59, 164.81]],
  dread:  [[110, 116.54, 164.81], [103.83, 110, 155.56], [98, 103.83, 146.83], [92.5, 98, 138.59]],
}

export function createSound(audio, { at, every, stopEvery }) {
  const c = audio && audio.ctx ? audio.ctx : null
  let master = null, noiseBuf = null, dead = false
  if (c) {
    master = c.createGain(); master.gain.value = 0.75; master.connect(audio.dest)
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const ok = () => !dead && !!c && c.state === 'running'

  function tone(f, type, dur, g0, delay = 0, f1 = null) {
    if (!ok()) return
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur)
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(g0, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02)
  }
  function noise(dur, g0, freq, type = 'bandpass', delay = 0, q = 1, f1 = null) {
    if (!ok()) return
    const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = noiseBuf; s.loop = true
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q; if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur)
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(g0, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.02)
  }

  // ── voix : lit de ligne + syllabes synthétiques. radio = Anton, phone = écoute, inner = Viktor ──
  let voiceG = null, crackle = null, voiceIv = 0
  function voice(kind, babble = true) {
    stopVoice(); if (!ok()) return
    voiceG = c.createGain(); voiceG.gain.value = kind === 'radio' ? 0.5 : kind === 'inner' ? 0.4 : 0.45; voiceG.connect(master)
    if (kind !== 'inner') {
      crackle = c.createBufferSource(); crackle.buffer = noiseBuf; crackle.loop = true
      const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = kind === 'radio' ? 2400 : 1800
      const cg = c.createGain(); cg.gain.value = kind === 'radio' ? 0.03 : 0.022
      crackle.connect(cf); cf.connect(cg); cg.connect(voiceG); crackle.start()
      if (kind === 'radio') noise(0.09, 0.25, 3000, 'highpass')
    }
    if (!babble) return
    let pauseUntil = 0
    voiceIv = every(125, () => {
      const now = performance.now(); if (now < pauseUntil || !voiceG) return
      if (Math.random() < 0.12) { pauseUntil = now + 250 + Math.random() * 400; return }
      if (Math.random() > 0.8) return
      const t = c.currentTime, o = c.createOscillator(), g = c.createGain(), band = c.createBiquadFilter(), lp = c.createBiquadFilter()
      band.type = 'bandpass'; band.frequency.value = kind === 'radio' ? 1150 : kind === 'inner' ? 700 : 950; band.Q.value = kind === 'radio' ? 1.4 : 0.8
      lp.type = 'lowpass'; lp.frequency.value = kind === 'radio' ? 2200 : kind === 'inner' ? 1600 : 2600
      const f = kind === 'radio' ? 82 + Math.random() * 45 : kind === 'inner' ? 72 + Math.random() * 35 : 100 + Math.random() * 75
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f * (1 + Math.random() * 0.25), t); o.frequency.exponentialRampToValueAtTime(f * 0.85, t + 0.11)
      const dur = 0.05 + Math.random() * 0.11
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.4, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
      o.connect(band); band.connect(lp); lp.connect(g); g.connect(voiceG); o.start(t); o.stop(t + dur + 0.02)
    })
  }
  function stopVoice(radioClick = false) {
    if (voiceIv) { stopEvery(voiceIv); voiceIv = 0 }
    if (crackle) { try { crackle.stop() } catch (e) { /* déjà arrêté */ } crackle = null }
    if (voiceG) { voiceG.disconnect(); voiceG = null }
    if (radioClick) noise(0.07, 0.18, 2600, 'highpass')
  }

  // ── musiques : tense / somber (celles du jeu), dread, pulse (tense + tic d'horloge) ──
  let musicG = null, musicIv = 0, pulseIv = 0
  function music(mode) {
    if (musicIv) { stopEvery(musicIv); musicIv = 0 }
    if (pulseIv) { stopEvery(pulseIv); pulseIv = 0 }
    if (musicG) { const g = musicG; try { g.gain.setTargetAtTime(0.0001, c.currentTime, 0.4) } catch (e) { /* contexte fermé */ } at(2000, () => g.disconnect()); musicG = null }
    if (!mode || !ok()) return
    musicG = c.createGain(); musicG.gain.value = 0.0001; musicG.connect(master); musicG.gain.linearRampToValueAtTime(0.5, c.currentTime + 2)
    const chords = PROG[mode] || PROG.tense
    let bar = 0
    const pad = (f, dur, gn, type) => {
      if (!musicG) return
      const t = c.currentTime, o = c.createOscillator(), g = c.createGain()
      o.type = type; o.frequency.value = f; o.connect(g); g.connect(musicG)
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gn, t + 0.9); g.gain.linearRampToValueAtTime(0.0001, t + dur)
      o.start(t); o.stop(t + dur + 0.05)
    }
    const playBar = () => { const ch = chords[bar % 4]; ch.forEach(f => pad(f, 3.9, 0.05, 'sine')); pad(ch[0] / 2, 3.9, 0.1, 'triangle'); pad(ch[0] / 4, 3.9, 0.12, 'sine'); bar++ }
    playBar(); musicIv = every(3400, playBar)
    if (mode === 'pulse') pulseIv = every(500, () => tone(1900, 'square', 0.02, 0.03))
  }

  function destroy() {
    stopVoice(); music(null); dead = true
    if (master) { try { master.disconnect() } catch (e) { /* déjà débranché */ } }
  }

  return {
    tone, noise, voice, stopVoice, music, destroy,
    crt: () => { tone(60, 'sine', 0.35, 0.5, 0, 38); tone(7800, 'sine', 0.5, 0.025) },
    tick: () => noise(0.012, 0.05, 3500, 'highpass'),
    shutter: () => { noise(0.035, 0.45, 2500, 'highpass'); noise(0.03, 0.3, 1800, 'bandpass', 0.07); tone(2400, 'sine', 0.35, 0.03, 0.02, 4200) },
    beep: (f = 1400, d = 0) => tone(f, 'square', 0.06, 0.06, d),
    marker: () => noise(0.42, 0.1, 900, 'bandpass', 0, 2, 2600),
    stamp: () => { tone(120, 'sine', 0.35, 0.9, 0, 42); noise(0.09, 0.5, 380, 'lowpass') },
    slap: () => { noise(0.05, 0.38, 1500, 'bandpass'); noise(0.035, 0.3, 2600, 'highpass', 0.05) },
    paper: () => noise(0.22, 0.12, 2200, 'bandpass', 0, 0.8, 3800),
    sweep: () => noise(1.3, 0.06, 400, 'bandpass', 0, 1.5, 2400),
    ping: () => { tone(880, 'sine', 0.5, 0.18); tone(1320, 'sine', 0.35, 0.06, 0.02) },
    sonar: () => { tone(1100, 'sine', 0.9, 0.12, 0, 900); tone(1100, 'sine', 0.6, 0.04, 0.25, 950) },
    count: () => tone(2000, 'square', 0.025, 0.025),
    clock: () => { tone(2600, 'square', 0.015, 0.05); noise(0.02, 0.06, 4000, 'highpass') },
    heart: () => { tone(58, 'sine', 0.16, 0.8, 0, 40); tone(52, 'sine', 0.2, 0.6, 0.22, 36) },
    thud: () => { tone(80, 'sine', 0.3, 0.8, 0, 45); noise(0.12, 0.35, 300, 'lowpass') },
    rumble: (ms = 2000) => noise(ms / 1000, 0.18, 90, 'lowpass', 0, 0.7, 140),
    alarm: () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 660 : 880, 'square', 0.18, 0.05, i * 0.2) },
    glitch: (ms, p) => { noise(ms / 1000, 0.1 + 0.22 * p, 700 + Math.random() * 3200, 'bandpass', 0, 0.7); if (p > 0.6) for (let i = 0; i < 3; i++) tone(200 + Math.random() * 1800, 'square', 0.03, 0.04 * p, i * 0.05) },
    lost: () => { noise(0.45, 0.35, 2000, 'bandpass', 0, 0.4); tone(1000, 'sine', 0.4, 0.08, 0.05) },
    boom: () => { tone(55, 'sine', 2.2, 0.85, 0, 38); noise(1.6, 0.28, 180, 'lowpass'); tone(880, 'triangle', 1.6, 0.05, 0.15); tone(1318.5, 'triangle', 1.4, 0.03, 0.2) },
  }
}
```

- [ ] **Step 5 : Écrire `src/briefing/kit.js`**

```js
// Moteur des cinématiques « dossier du fixeur », porté des maquettes (docs/superpowers/maquettes/cinematiques/kit.js).
// Une cinématique est une suite de TEMPS : chaque temps peut faire parler quelqu'un (bips synthétiques
// + sous-titre tapé) et déclencher des effets à des instants relatifs à son début. Un temps dure le temps
// de sa réplique. freeze = ms : sans glitch, tout se fige à cet instant (captures de contrôle).
import { createSound } from './sound.js'

export const estimate = text => 350 + text.length * 62

const STATE_CLASSES = ['on', 'off', 'out', 'lock', 'dev', 'side', 'talk', 'shake', 'gl']
const kindOf = who => (who === 'PHONE' ? 'phone' : who === 'VIKTOR' ? 'inner' : 'radio')

const OVERLAYS = '<div class="flick"></div><div class="blackframe" id="k-bf"></div><div class="track"></div><div class="scan"></div>' +
  '<div class="vig"></div><div class="grain"></div><div class="lost" id="k-lost">▌▌ SIGNAL PERDU<small>RECONNEXION…</small></div><div class="black" id="k-black"></div>'
const GLITCH_FILTER = `<svg width="0" height="0" style="position:absolute"><filter id="k-glf" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
  <feTurbulence id="k-glt" type="fractalNoise" baseFrequency="0.00001 0.09" numOctaves="1" seed="3" result="noise"/>
  <feDisplacementMap id="k-gld" in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="B" result="disp"/>
  <feColorMatrix in="disp" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
  <feOffset id="k-glo1" in="r" dx="0" dy="0" result="r2"/>
  <feColorMatrix in="disp" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb"/>
  <feOffset id="k-glo2" in="gb" dx="0" dy="0" result="gb2"/>
  <feBlend in="r2" in2="gb2" mode="screen"/></filter></svg>`
const RADIO_DEFAULT = '<span class="dot">●</span><span>CANAL SÉCURISÉ · ANTON, FIXEUR</span><span class="eq"><i></i><i></i><i></i><i></i><i></i></span>'

export function createKit({ root, audio = null, freeze = null } = {}) {
  const K = { errors: [], frozen: false }
  const fail = msg => { K.errors.push(String(msg)); console.error('[briefing]', msg) }
  const $ = id => root.querySelector('#' + id)
  const el = x => (typeof x === 'string' ? $(x) : x)
  K.$ = $

  // ── minuteurs suivis : destroy() et le gel les annulent tous ──
  const timers = new Set(), intervals = new Set()
  let destroyed = false
  const at = (ms, fn) => {
    const h = setTimeout(() => { timers.delete(h); if (destroyed) return; try { fn() } catch (e) { fail(e && e.stack || e) } }, ms)
    timers.add(h); return h
  }
  const every = (ms, fn) => {
    const h = setInterval(() => { if (destroyed) return; try { fn() } catch (e) { fail(e && e.stack || e) } }, ms)
    intervals.add(h); return h
  }
  const stopEvery = h => { clearInterval(h); intervals.delete(h) }
  const clearAll = () => { timers.forEach(clearTimeout); timers.clear(); intervals.forEach(clearInterval); intervals.clear() }
  const wait = ms => new Promise(r => at(ms, r))
  const raf = cb => at(16, cb)   // ~60 i/s, minuteur suivi : annulé par destroy() et au gel
  K.at = at

  const S = K.snd = createSound(audio, { at, every, stopEvery })

  K.on = (x, c = 'on') => { const e = el(x); if (e) e.classList.add(c); else fail('élément introuvable : ' + x) }
  K.off = (x, c = 'on') => { const e = el(x); if (e) e.classList.remove(c) }
  K.type = (x, text, dur, tick = false) => {
    const e = el(x); if (!e) return fail('élément introuvable : ' + x)
    e.textContent = ''
    const step = dur / Math.max(1, text.length)
    ;[...text].forEach((ch, i) => at(step * i, () => { e.textContent += ch; if (tick && ch !== ' ') S.tick() }))
  }

  // ── habillage injecté ──
  const st = $('st'), scene = $('scene')
  if (!st || !scene) throw new Error('la scène doit contenir #st et #scene')
  st.classList.add('k-preload')
  raf(() => raf(() => st.classList.remove('k-preload')))
  st.insertAdjacentHTML('afterbegin', '<div class="crt" id="k-crt"></div>')
  st.insertAdjacentHTML('beforeend', OVERLAYS)
  root.insertAdjacentHTML('beforeend', GLITCH_FILTER + '<div class="kctrl" hidden><button id="k-replay"></button><span id="k-lbl"></span></div>')
  const radio = $('radio')
  if (radio && !radio.children.length) radio.innerHTML = RADIO_DEFAULT
  const wave = $('wave')
  if (wave) for (let i = 0; i < 56; i++) wave.appendChild(document.createElement('i'))

  // ── glitch : déchirure horizontale + séparation RVB + rafale de parasites ──
  const gT = $('k-glt'), gD = $('k-gld'), gO1 = $('k-glo1'), gO2 = $('k-glo2'), bf = $('k-bf')
  let glitchUntil = 0, glitchPow = 0, glitchIv = 0
  K.glitch = (ms, pow) => {
    if (freeze !== null || destroyed) return
    S.glitch(ms, pow)
    glitchUntil = Math.max(glitchUntil, performance.now() + ms); glitchPow = Math.max(glitchPow, pow)
    if (glitchIv) return
    scene.style.filter = 'url(#k-glf)'; st.classList.add('gl')
    glitchIv = every(45, () => {
      if (performance.now() > glitchUntil) {
        stopEvery(glitchIv); glitchIv = 0; glitchPow = 0
        scene.style.filter = ''; scene.style.transform = ''; st.classList.remove('gl'); bf.classList.remove('on'); gD.setAttribute('scale', 0); return
      }
      const p = glitchPow
      gT.setAttribute('seed', Math.floor(Math.random() * 999))
      gT.setAttribute('baseFrequency', `0.00001 ${(0.03 + Math.random() * 0.12).toFixed(3)}`)
      gD.setAttribute('scale', (Math.random() * 70 * p).toFixed(1))
      const dx = (2 + Math.random() * 9) * p
      gO1.setAttribute('dx', dx.toFixed(1)); gO2.setAttribute('dx', (-dx).toFixed(1))
      scene.style.transform = Math.random() < 0.35 * p ? `translate(${((Math.random() - 0.5) * 2 * p).toFixed(2)}cqw, ${((Math.random() - 0.5) * 3 * p).toFixed(2)}cqw) skewX(${((Math.random() - 0.5) * 4 * p).toFixed(1)}deg)` : ''
      bf.classList.toggle('on', p > 0.7 && Math.random() < 0.12)
    })
  }
  const idleGlitch = () => at(1100 + Math.random() * 2600, () => { K.glitch(70 + Math.random() * 110, 0.22 + Math.random() * 0.3); idleGlitch() })
  if (freeze === null) idleGlitch()

  // ── petits outils de mise en scène ──
  K.music = mode => S.music(mode)
  K.shake = () => { st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake') }
  K.crt = () => { K.on('k-crt'); S.crt() }
  K.lost = (ms = 400) => { S.lost(); K.glitch(ms + 250, 1); K.on('k-lost'); at(ms, () => K.off('k-lost')) }
  K.title = () => { K.on('title'); S.boom(); K.glitch(200, 0.7) }
  K.black = () => K.on('k-black')
  K.counter = (x, from, to, dur, suffix = '', tickEvery = 0) => {
    const e = el(x); if (!e) return fail('élément introuvable : ' + x)
    if (freeze !== null) { e.textContent = to + suffix; return }
    const s = performance.now(); let last = null
    const f = () => {
      if (K.frozen || destroyed) return
      const k = Math.min(1, (performance.now() - s) / dur), v = Math.round(from + (to - from) * k)
      e.textContent = v + suffix
      if (tickEvery && Math.floor(v / tickEvery) !== last) { last = Math.floor(v / tickEvery); S.count() }
      if (k < 1) raf(f)
    }
    f()
  }
  let waveOn = false
  K.wave = on => {
    waveOn = on
    const bars = wave ? [...wave.children] : []
    const tick = () => {
      if (!waveOn || K.frozen) { bars.forEach(b => { b.style.height = '6%' }); return }
      bars.forEach((b, i) => { const env = Math.sin((i / bars.length) * Math.PI); b.style.height = (8 + Math.random() * 88 * env) + '%' })
      at(90, tick)
    }
    tick()
  }

  // ── voix : bips synthétiques ; le temps dure l'estimation de la réplique ──
  K.speak = (text, who) => {
    const est = estimate(text), kind = kindOf(who)
    if (freeze !== null) return wait(est)
    S.voice(kind, true)
    return wait(est).then(() => S.stopVoice(kind === 'radio'))
  }

  // ── séquenceur ──
  let runId = 0, cfg = null, resolveDone
  K.finished = new Promise(r => { resolveDone = r })
  function reset() {
    K.frozen = false; st.classList.remove('k-frozen')
    S.stopVoice(); S.music(null); K.wave(false)
    const cls = [...STATE_CLASSES, ...((cfg && cfg.stateClasses) || [])]
    ;[st, ...st.querySelectorAll('*')].forEach(e => { if (e.classList) cls.forEach(c => e.classList.remove(c)) })
    st.querySelectorAll('[data-reset]').forEach(e => { if (e.dataset.reset !== 'keep') e.textContent = '' })
    for (const id of ['sub', 'trans']) { const e = $(id); if (e) e.textContent = '' }
    if (cfg && cfg.reset) cfg.reset(K)
  }
  function showLine(b) {
    const who = b.who || 'ANTON'
    const typeDur = estimate(b.say) * 0.8
    if (who === 'PHONE' && $('trans') && b.into !== 'sub') { K.type('trans', b.say, typeDur); K.wave(true); return }
    const sub = $('sub'); if (!sub) return
    const name = who === 'PHONE' ? (b.name || 'ÉCOUTE') : who
    sub.innerHTML = `<span class="spk${who === 'PHONE' ? ' phone' : who === 'VIKTOR' ? ' inner' : ''}"></span><span class="tx"></span>`
    sub.querySelector('.spk').textContent = name
    if (who === 'ANTON' && radio) radio.classList.add('on', 'talk')
    K.type(sub.querySelector('.tx'), b.say, typeDur)
  }
  function endLine(b) {
    if (radio) radio.classList.remove('talk')
    if ((b.who || 'ANTON') === 'PHONE') K.wave(false)
    if (b.clear && $('sub')) $('sub').textContent = ''
  }
  async function start() {
    const id = ++runId
    reset()
    if (freeze !== null) at(freeze, () => { K.frozen = true; st.classList.add('k-frozen'); clearAll(); S.stopVoice(); runId++ })
    if (cfg.music) S.music(cfg.music)
    for (const b of cfg.beats) {
      if (id !== runId) return
      const bs = performance.now()
      ;(b.cues || []).forEach(([ms, fn]) => at(ms, () => { if (id === runId) fn(K) }))
      if (b.say) {
        if (b.pre) { await wait(b.pre); if (id !== runId) return }
        showLine(b)
        await K.speak(b.say, b.who || 'ANTON'); if (id !== runId) return
        endLine(b)
      }
      const left = (b.min || 0) - (performance.now() - bs)
      await wait(Math.max(b.say ? (b.post ?? 350) : 0, left)); if (id !== runId) return
    }
    S.music(null)
    if (id === runId) resolveDone()
  }
  K.run = c => { cfg = c; start(); return K.finished }
  $('k-replay').addEventListener('click', () => { if (cfg) start() })

  K.destroy = () => {
    if (destroyed) return
    runId++; clearAll(); S.destroy(); destroyed = true
  }
  return K
}
```

Note pour le relecteur : `wait` pour un temps sans réplique et avec `min: 0` résout au minuteur 0. Les tests simulent explicitement `performance` (option `toFake`), car Vitest ne le fait pas par défaut et le séquenceur mesure les durées avec `performance.now()`.

- [ ] **Step 6 : Créer `src/briefing/kit.css`**

Copier `docs/superpowers/maquettes/cinematiques/kit.css` vers `src/briefing/kit.css`, puis dans la copie :
1. supprimer les 3 premières règles qui ne concernent pas la scène : `* { box-sizing… }` (garder `.st *` plus bas), `html, body { … }` et `.wrap { … }` ;
2. supprimer tout le bloc `/* ── barre de contrôle sous la scène ── */` (les règles `.kctrl…`) ;
3. ajouter à la fin :

```css
/* ── conteneur des cinématiques dans le jeu ── */
#briefing-root { position: fixed; inset: 0; z-index: 400; background: #000; display: flex; align-items: center; justify-content: center; cursor: pointer; }
#briefing-root[hidden] { display: none; }
#briefing-root .st { width: min(100vw, calc(100vh * 16 / 9)); border-radius: 0; }
#briefing-root .kctrl { display: none; }
#briefing-root .k-skip { position: absolute; right: 2.2vw; bottom: 2.2vh; font: 11px 'Courier New', monospace; letter-spacing: .14em; color: rgba(255,255,255,.35); z-index: 31; pointer-events: none; }
#briefing-root.k-leaving { opacity: 0; transition: opacity .4s; }
```

- [ ] **Step 7 : Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- tests/briefing/kit.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 8 : Commit**

```bash
git add package.json package-lock.json vite.config.js .gitignore tests/setup.js tests/briefing/kit.test.js src/briefing/kit.js src/briefing/sound.js src/briefing/kit.css
git commit -m "feat(cinematiques): moteur du kit porté en modules, testé" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Convertir les maquettes en scènes du jeu

**Files:**
- Create: `scripts/port-maquette.mjs`, `scripts/compress-briefing-img.ps1`, `public/briefing/img/*`, `src/briefing/scenes/{m1,m2,m3,m4,m5,m6,epilogue}.js`
- Test: `tests/scripts/port-maquette.test.js`

**Interfaces:**
- Consumes : rien de la tâche 1 (le module généré utilise le `K` qu'on lui passe).
- Produces : `portMaquette(html: string, { name: string, imgExt?: Record<string, 'jpg'|'png'> }): string` (source du module). Chaque module de scène exporte `stClass: string`, `css: string`, `html: string` et `start(K, ctx = { search: string })`.

- [ ] **Step 1 : Écrire les tests du convertisseur (ils échouent)**

Créer `tests/scripts/port-maquette.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { portMaquette } from '../../scripts/port-maquette.mjs'

const FIXTURE = `<!DOCTYPE html><html><head><link rel="stylesheet" href="kit.css">
<style>.m9 .x { color: red; background: url(img/fond.png) }</style></head>
<body><div class="wrap"><div class="st m9" id="st"><div class="bg"></div><div class="scene" id="scene"><img src="img/portrait-a.png" alt=""></div></div></div>
<script src="kit.js"></script>
<script>const port = new URLSearchParams(location.search).get('port'); K.run({ beats: [{ say: port || 'rien' }] })</script>
</body></html>`

async function importSource(src) {
  const dir = mkdtempSync(join(tmpdir(), 'scene-'))
  const file = join(dir, 'scene.mjs')
  writeFileSync(file, src)
  return import(pathToFileURL(file).href)
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
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- tests/scripts/port-maquette.test.js`
Expected: FAIL, car le module `../../scripts/port-maquette.mjs` est introuvable.

- [ ] **Step 3 : Écrire `scripts/port-maquette.mjs`**

```js
// Convertit une maquette de cinématique (docs/superpowers/maquettes/cinematiques/*.html) en module de scène du jeu.
// Le module exporte la classe de la scène, son CSS, le HTML de #st et start(K, ctx) qui exécute le
// script de la maquette avec le K fourni (ctx.search remplace location.search ; setTimeout et
// requestAnimationFrame passent par K.at pour être annulés au démontage).
// CLI : node scripts/port-maquette.mjs   → régénère src/briefing/scenes/*.js
import { JSDOM } from 'jsdom'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function portMaquette(html, { name, imgExt = {} }) {
  const doc = new JSDOM(html).window.document
  const st = doc.getElementById('st')
  if (!st) throw new Error(`${name} : la maquette n'a pas de #st`)
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n')
  const script = [...doc.querySelectorAll('script:not([src])')].map(s => s.textContent).join('\n')
  const fix = s => s.replace(/(["'(\s])img\/([a-z0-9_-]+)\.png/g, (m, pre, base) => `${pre}briefing/img/${base}.${imgExt[base] || 'png'}`)
  return [
    `// Généré par scripts/port-maquette.mjs depuis docs/superpowers/maquettes/cinematiques/${name}.html — ne pas modifier à la main.`,
    `export const stClass = ${JSON.stringify(st.className)}`,
    `export const css = ${JSON.stringify(fix(css))}`,
    `export const html = ${JSON.stringify(fix(st.innerHTML))}`,
    `export function start(K, ctx = {}) {`,
    `  const location = { search: ctx.search || '', href: 'http://briefing.local/' + (ctx.search || '') }`,
    `  const setTimeout = (fn, ms = 0) => K.at(ms, fn)            // minuteurs de la scène suivis par le kit :`,
    `  const requestAnimationFrame = fn => K.at(16, fn)           // annulés quand on passe ou démonte`,
    fix(script),
    `}`,
    ``,
  ].join('\n')
}

const SCENES = { m1: 'briefing-m1', m2: 'briefing-m2', m3: 'briefing-m3', m4: 'briefing-m4', m5: 'briefing-m5', m6: 'briefing-m6', epilogue: 'epilogue' }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
  const src = join(repo, 'docs', 'superpowers', 'maquettes', 'cinematiques')
  const imgDir = join(repo, 'public', 'briefing', 'img')
  const out = join(repo, 'src', 'briefing', 'scenes')
  mkdirSync(out, { recursive: true })
  for (const [id, file] of Object.entries(SCENES)) {
    const html = readFileSync(join(src, file + '.html'), 'utf8')
    const imgExt = {}
    for (const m of html.matchAll(/img\/([a-z0-9_-]+)\.png/g)) imgExt[m[1]] = existsSync(join(imgDir, m[1] + '.jpg')) ? 'jpg' : 'png'
    writeFileSync(join(out, id + '.js'), portMaquette(html, { name: file, imgExt }))
    console.log('scène générée :', id)
  }
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- tests/scripts/port-maquette.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5 : Écrire `scripts/compress-briefing-img.ps1`** (ASCII seulement : PowerShell 5.1 lit mal un .ps1 en UTF-8 sans BOM)

```powershell
# Recompresse en JPEG les images des cinematiques (fond sombre sous la transparence).
# Les vignettes pixelisees (*-lo.png) sont copiees telles quelles.
# Usage (racine du depot) : powershell -ExecutionPolicy Bypass -File scripts/compress-briefing-img.ps1
param(
  [string]$Src = "docs/superpowers/maquettes/cinematiques/img",
  [string]$Dst = "public/briefing/img",
  [int]$Quality = 80,
  [int]$MaxWidth = 360
)
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $Dst | Out-Null
$names = @(
  'portrait-gangster-man-01', 'portrait-freres-a', 'portrait-freres-b', 'portrait-passeur-cam', 'portrait-seconde-cam',
  'portrait-mafia-woman-01', 'portrait-mafia-woman-02', 'portrait-mafia-henchman',
  'portrait-crime-1', 'portrait-crime-2', 'portrait-crime-3'
)
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$Quality)
foreach ($n in $names) {
  $img = [System.Drawing.Image]::FromFile((Resolve-Path "$Src/$n.png"))
  $w = [Math]::Min($MaxWidth, $img.Width); $h = [int]($img.Height * $w / $img.Width)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(11, 14, 20))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, 0, 0, $w, $h)
  $bmp.Save((Join-Path (Resolve-Path $Dst) "$n.jpg"), $codec, $params)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  Write-Output "$n.jpg"
}
Copy-Item "$Src/portrait-passeur-cam-lo.png", "$Src/portrait-seconde-cam-lo.png" $Dst
```

- [ ] **Step 6 : Produire les images puis générer les scènes**

Run: `powershell -ExecutionPolicy Bypass -File scripts/compress-briefing-img.ps1`
Expected : 11 lignes `portrait-….jpg` et 13 fichiers dans `public/briefing/img/`.

Run: `du -ch public/briefing/img/* | tail -1`
Expected : un total **< 1,5 Mo** (on vise environ 0,6 Mo).

Run: `node scripts/port-maquette.mjs`
Expected : 7 lignes `scène générée : m1 … epilogue` et 7 fichiers dans `src/briefing/scenes/`.

Run: `grep -c "briefing/img/" src/briefing/scenes/*.js && grep -l '"img/' src/briefing/scenes/*.js`
Expected : des comptes > 0, et **aucun** fichier listé par le second grep (plus aucun chemin `img/` non réécrit).

- [ ] **Step 7 : Commit**

```bash
git add scripts/port-maquette.mjs scripts/compress-briefing-img.ps1 tests/scripts/port-maquette.test.js public/briefing/img src/briefing/scenes
git commit -m "feat(cinematiques): les 6 briefings et l'épilogue convertis en scènes du jeu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `playCinematic` — monter, passer, démonter

**Files:**
- Create: `src/briefing/index.js`
- Test: `tests/briefing/playCinematic.test.js`, `tests/briefing/scenes.test.js`

**Interfaces:**
- Consumes : `createKit` (tâche 1) et les modules de scène (tâche 2).
- Produces :
  - `playCinematic(id: string, { onDone?: () => void, params?: Record<string,string>, freeze?: number|null, audio?: {ctx, dest}|null, root?: Element }): Promise<{ stop(): void, kit: K }>`. Elle appelle `onDone` exactement une fois, à la fin naturelle ou après avoir passé.
  - `registerScene(id: string, loader: () => Promise<SceneModule>)`
  - `isCinematicPlaying(): boolean`
  - Écart assumé avec la spec : `{ variant }` devient `{ params: { port: 'libres' } }`, plus générique et transmis à la scène sous forme de `ctx.search`.

- [ ] **Step 1 : Écrire les tests (ils échouent)**

Créer `tests/briefing/playCinematic.test.js` :

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playCinematic, registerScene, isCinematicPlaying } from '../../src/briefing/index.js'

const fakeScene = {
  stClass: 'st t1',
  css: '.t1 .x { color: red }',
  html: '<div class="scene" id="scene"><div class="sub" id="sub"></div></div>',
  start(K) { K.run({ beats: [{ min: 1000 }] }) },
}
registerScene('test', async () => fakeScene)
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
beforeEach(() => { vi.useFakeTimers(FAKE); document.body.innerHTML = '<div id="briefing-root" hidden></div>' })
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; document.head.innerHTML = '' })

describe('playCinematic', () => {
  it('monte la scène, l\'affiche, puis la démonte et appelle onDone une fois à la fin', async () => {
    const onDone = vi.fn()
    await playCinematic('test', { onDone })
    const root = document.getElementById('briefing-root')
    expect(root.hidden).toBe(false)
    expect(root.querySelector('.st.t1 #scene')).not.toBeNull()
    expect(isCinematicPlaying()).toBe(true)
    await vi.advanceTimersByTimeAsync(1000); await flush()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(root.hidden).toBe(true)
    expect(root.innerHTML).toBe('')
    expect(isCinematicPlaying()).toBe(false)
    expect([...document.head.querySelectorAll('style')].some(s => s.textContent.includes('.t1 .x'))).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['Escape', 'Enter', 'Space'])('passe avec %s : fondu de 400 ms, puis onDone une seule fois', async code => {
    const onDone = vi.fn()
    await playCinematic('test', { onDone })
    document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }))
    expect(document.getElementById('briefing-root').classList.contains('k-leaving')).toBe(true)
    await vi.advanceTimersByTimeAsync(400); await flush()
    document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
    await vi.advanceTimersByTimeAsync(2000); await flush()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('passe au clic', async () => {
    const onDone = vi.fn()
    await playCinematic('test', { onDone })
    document.getElementById('briefing-root').click()
    await vi.advanceTimersByTimeAsync(400); await flush()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('la touche qui fait passer ne parvient pas aux autres écouteurs du jeu', async () => {
    const other = vi.fn()
    document.addEventListener('keydown', other)
    await playCinematic('test', {})
    // la touche part du body, comme en jeu : l'écouteur en capture sur document passe avant les autres
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }))
    expect(other).not.toHaveBeenCalled()
    document.removeEventListener('keydown', other)
  })

  it('une nouvelle cinématique annule la précédente sans appeler son onDone', async () => {
    const first = vi.fn(), second = vi.fn()
    await playCinematic('test', { onDone: first })
    await playCinematic('test', { onDone: second })
    await vi.advanceTimersByTimeAsync(1000); await flush()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('transmet params à la scène sous forme de ctx.search', async () => {
    const seen = []
    registerScene('ctx', async () => ({ ...fakeScene, start(K, ctx) { seen.push(ctx.search); K.run({ beats: [] }) } }))
    await playCinematic('ctx', { params: { port: 'libres' } })
    expect(seen).toEqual(['?port=libres'])
  })

  it('refuse une cinématique inconnue', async () => {
    await expect(playCinematic('nope', {})).rejects.toThrow(/inconnue/)
  })
})
```

Créer `tests/briefing/scenes.test.js`. C'est la lecture complète de chaque vraie scène, en temps simulé :

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playCinematic } from '../../src/briefing/index.js'

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
beforeEach(() => { vi.useFakeTimers(FAKE); document.body.innerHTML = '<div id="briefing-root" hidden></div>' })
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; document.head.innerHTML = '' })

describe.each(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'epilogue'])('scène %s', id => {
  it('se joue jusqu\'au bout sans erreur et se démonte proprement', async () => {
    const onDone = vi.fn()
    const handle = await playCinematic(id, { onDone, params: { port: 'libres' } })
    await vi.advanceTimersByTimeAsync(120000); await flush()
    expect(handle.kit.errors).toEqual([])
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- tests/briefing/playCinematic.test.js tests/briefing/scenes.test.js`
Expected: FAIL, car le module `src/briefing/index.js` est introuvable.

- [ ] **Step 3 : Écrire `src/briefing/index.js`**

```js
// Point d'entrée des cinématiques : monte une scène dans #briefing-root (au-dessus du canvas),
// la joue avec le kit, la fait passer (Échap/Entrée/Espace/clic) et la démonte proprement.
import kitCss from './kit.css?raw'
import { createKit } from './kit.js'

const SCENES = {
  m1: () => import('./scenes/m1.js'),
  m2: () => import('./scenes/m2.js'),
  m3: () => import('./scenes/m3.js'),
  m4: () => import('./scenes/m4.js'),
  m5: () => import('./scenes/m5.js'),
  m6: () => import('./scenes/m6.js'),
  epilogue: () => import('./scenes/epilogue.js'),
}
const SKIP_KEYS = new Set(['Escape', 'Enter', 'Space'])
const FADE_MS = 400
let current = null

export function registerScene(id, loader) { SCENES[id] = loader }
export function isCinematicPlaying() { return !!current }

function ensureKitStyle() {
  if (document.getElementById('k-kit-css')) return
  const s = document.createElement('style'); s.id = 'k-kit-css'; s.textContent = kitCss
  document.head.appendChild(s)
}

export async function playCinematic(id, { onDone = () => {}, params = null, freeze = null, audio = null, root = document.getElementById('briefing-root') } = {}) {
  const load = SCENES[id]
  if (!load) throw new Error('cinématique inconnue : ' + id)
  if (current) current.cancel()
  const mod = await load()

  ensureKitStyle()
  const sceneStyle = document.createElement('style'); sceneStyle.textContent = mod.css
  document.head.appendChild(sceneStyle)
  root.classList.remove('k-leaving')
  root.innerHTML = `<div class="${mod.stClass}" id="st">${mod.html}</div><div class="k-skip">ÉCHAP · ENTRÉE · ESPACE — PASSER</div>`
  root.hidden = false
  const K = createKit({ root, audio, freeze })

  let ended = false, fadeTimer = 0
  const teardown = () => {
    document.removeEventListener('keydown', onKey, true)
    root.removeEventListener('click', onClick)
    clearTimeout(fadeTimer)
    K.destroy(); sceneStyle.remove()
    root.innerHTML = ''; root.hidden = true; root.classList.remove('k-leaving')
    if (current === handle) current = null
  }
  const finish = () => { if (ended) return; ended = true; teardown(); onDone() }
  const skip = () => {
    if (ended || root.classList.contains('k-leaving')) return
    K.destroy()
    root.classList.add('k-leaving')
    fadeTimer = setTimeout(finish, FADE_MS)
  }
  const onKey = e => {
    if (!SKIP_KEYS.has(e.code)) return
    e.preventDefault(); e.stopImmediatePropagation()
    skip()
  }
  const onClick = () => skip()
  document.addEventListener('keydown', onKey, true)
  root.addEventListener('click', onClick)

  const handle = { kit: K, stop: skip, cancel: () => { if (!ended) { ended = true; teardown() } } }
  current = handle
  const search = params ? '?' + new URLSearchParams(params).toString() : ''
  mod.start(K, { search })
  K.finished.then(finish)
  return handle
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: PASS pour les 4 fichiers de test (kit, port-maquette, playCinematic, scenes). Si une scène échoue avec une erreur d'API absente de jsdom, ajouter le complément minimal dans `tests/setup.js` (comme `getTotalLength`), **jamais** dans la scène générée.

- [ ] **Step 5 : Commit**

```bash
git add src/briefing/index.js tests/briefing/playCinematic.test.js tests/briefing/scenes.test.js tests/setup.js
git commit -m "feat(cinematiques): playCinematic monte, fait passer et démonte une scène" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Mémoriser le choix du port et les briefings déjà vus

**Files:**
- Modify: `src/upgrades.js`
- Test: `tests/upgrades.test.js`

**Interfaces:**
- Produces : `state.freedVictims: boolean`, `state.briefingSeen: boolean[6]`, `markBriefingSeen(index0: number)`, `resetCampaignFlags()`. `saveProgress`, `loadProgress` et `resetProgress` les prennent en charge. **`window.__freedVictims` n'est plus utilisé par ce module.**

- [ ] **Step 1 : Écrire les tests (ils échouent)**

Créer `tests/upgrades.test.js` :

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

let U
beforeEach(async () => { localStorage.clear(); delete window.__freedVictims; vi.resetModules(); U = await import('../src/upgrades.js') })
const reload = async () => { vi.resetModules(); const M = await import('../src/upgrades.js'); M.loadProgress(); return M }

describe('progression de la campagne', () => {
  it('part d\'un port non libéré et d\'aucun briefing vu', () => {
    expect(U.state.freedVictims).toBe(false)
    expect(U.state.briefingSeen).toEqual([false, false, false, false, false, false])
  })

  it('sauvegarde et recharge le choix du port et les briefings vus', async () => {
    U.state.freedVictims = true; U.markBriefingSeen(2); U.saveProgress()
    const M = await reload()
    expect(M.state.freedVictims).toBe(true)
    expect(M.state.briefingSeen).toEqual([false, false, true, false, false, false])
  })

  it('reprend le champ « freed » des anciennes sauvegardes', async () => {
    localStorage.setItem('sniper-save', JSON.stringify({ currentLevel: 4, freed: true }))
    const M = await reload()
    expect(M.state.freedVictims).toBe(true)
    expect(M.state.briefingSeen).toEqual([false, false, false, false, false, false])
  })

  it('une nouvelle campagne remet le port et les briefings vus à zéro', () => {
    U.state.freedVictims = true; U.markBriefingSeen(0)
    U.resetCampaignFlags()
    expect(U.state.freedVictims).toBe(false)
    expect(U.state.briefingSeen).toEqual([false, false, false, false, false, false])
  })

  it('effacer la sauvegarde remet aussi ces drapeaux à zéro', () => {
    U.state.freedVictims = true; U.markBriefingSeen(5)
    U.resetProgress()
    expect(U.state.freedVictims).toBe(false)
    expect(U.state.briefingSeen[5]).toBe(false)
  })

  it('n\'utilise plus window.__freedVictims', async () => {
    U.state.freedVictims = true; U.saveProgress()
    await reload()
    expect(window.__freedVictims).toBeUndefined()
  })
})
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- tests/upgrades.test.js`
Expected: FAIL. Le premier test échoue sur `expected undefined to be false`, et `markBriefingSeen is not a function`.

- [ ] **Step 3 : Modifier `src/upgrades.js`**

Remplacer la déclaration de `state` par :

```js
const NO_BRIEFING_SEEN = () => [false, false, false, false, false, false]

export const state = {
  levels: { velocity: 0, stability: 0, coldblood: 0, zoom: 0, silencer: 0 },
  points: 0,
  totalScore: 0,
  currentLevel: 1,
  freedVictims: false,              // choix moral du port (mission 3) : victimes libérées ?
  briefingSeen: NO_BRIEFING_SEEN(), // briefing de chaque mission déjà vu → pas rejoué au réessai
}

export function markBriefingSeen(index) { state.briefingSeen[index] = true }
export function resetCampaignFlags() { state.freedVictims = false; state.briefingSeen = NO_BRIEFING_SEEN() }
```

Dans `saveProgress`, remplacer `freed: !!window.__freedVictims,` par :

```js
      freedVictims: state.freedVictims,
      briefingSeen: state.briefingSeen,
```

Dans `loadProgress`, remplacer `if (d.freed) window.__freedVictims = true` par :

```js
    state.freedVictims = !!(d.freedVictims ?? d.freed)
    state.briefingSeen = NO_BRIEFING_SEEN().map((_, i) => !!(d.briefingSeen && d.briefingSeen[i]))
```

Dans `resetProgress`, remplacer `window.__freedVictims = false` par `resetCampaignFlags()`.

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- tests/upgrades.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/upgrades.js tests/upgrades.test.js
git commit -m "feat(progression): choix du port et briefings vus dans la sauvegarde" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Brancher les cinématiques dans le jeu

`main.js` démarre le jeu (WebGL, chargement des modèles) dès son import, donc on ne peut pas le tester unitairement. Cette tâche se vérifie par le build, la route de développement `?cine=` et des captures (tâche 6). La logique testable est déjà couverte par les tâches 1 à 4.

**Files:**
- Modify: `src/audio.js` (fin du fichier), `index.html:502-507` et `index.html:431-437`, `src/main.js:5,8,9,96-115,129,150-170,172-177,268-283,302-310,705,974-978,1031-1041`
- Create: `scripts/shots.mjs`

**Interfaces:**
- Consumes : `playCinematic` (tâche 3), `markBriefingSeen`, `resetCampaignFlags`, `state.freedVictims`, `state.briefingSeen` (tâche 4).
- Produces : `audioContext()` et `masterNode()` exportés par `src/audio.js` ; la phase de jeu `'briefing'` ; la route de dev `?cine=<id>&freeze=<ms>&port=<variante>`.

- [ ] **Step 1 : Exposer le contexte audio partagé** — ajouter à la fin de `src/audio.js` :

```js
// Contexte et nœud maître partagés : les cinématiques s'y branchent pour suivre le volume du jeu.
export function audioContext() { return getCtx() }
export function masterNode() { return out() }
```

- [ ] **Step 2 : Conteneur et boutons dans `index.html`**

Juste après `<canvas id="scope-canvas" …></canvas>`, ajouter :

```html
  <div id="briefing-root" hidden></div>
```

Dans `#pause-menu`, après le bouton `btn-restart`, ajouter :

```html
    <button class="btn" id="btn-rebrief-pause">REVOIR LE BRIEFING</button>
```

Dans `#game-over`, après le bouton `btn-retry`, ajouter :

```html
    <button class="btn" id="btn-rebrief">REVOIR LE BRIEFING</button>
```

- [ ] **Step 3 : Imports dans `src/main.js`**

Ligne 5 : ajouter `markBriefingSeen, resetCampaignFlags` à l'import de `./upgrades.js`.
Ligne 8 : remplacer par `import { startIntroCinematic, updateCinematic, isCinematicActive } from './cinematic3d.js'`. L'intro 3D reste jusqu'au Plan 2.
Ligne 9 : ajouter `audioContext, masterNode` à l'import de `./audio.js`.
Après la ligne 13, ajouter :

```js
import { playCinematic } from './briefing/index.js'
```

- [ ] **Step 4 : `launchLevel` ne joue le briefing qu'au premier essai** — remplacer la fonction `launchLevel` (`main.js:268-283`) par :

```js
function cinematicAudio() {
  const ctx = audioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return { ctx, dest: masterNode() }
}

// Briefing de la mission au premier essai seulement (ou sur demande), puis le niveau.
function launchLevel(n, { forceBriefing = false } = {}) {
  menuEl.style.display = 'none'
  upgradeEl.style.display = 'none'
  gameOverEl.style.display = 'none'
  levelClearEl.style.display = 'none'
  pauseEl.style.display = 'none'
  settingsEl.style.display = 'none'
  hudEl.style.display = 'none'
  hideScope()
  releaseMouse()

  // Nettoie la scène AVANT le briefing (sinon résidus du niveau précédent)
  clearEntities()

  const idx = (n - 1) % 6
  if (!forceBriefing && upgradeState.briefingSeen[idx]) { startLevel(n); return }
  gamePhase = 'briefing'
  clock.getDelta()
  playCinematic('m' + (idx + 1), {
    audio: cinematicAudio(),
    onDone: () => { markBriefingSeen(idx); saveProgress(); clock.getDelta(); startLevel(n) },
  })
}
```

- [ ] **Step 5 : « Revoir le briefing »** — après `document.getElementById('btn-retry').onclick = …` (ligne 112), ajouter :

```js
document.getElementById('btn-rebrief').onclick   = () => launchLevel(upgradeState.currentLevel, { forceBriefing: true })
```

Après le gestionnaire de `btn-restart` (lignes 172-175), ajouter :

```js
document.getElementById('btn-rebrief-pause').onclick = () => {
  pauseEl.style.display = 'none'
  launchLevel(upgradeState.currentLevel, { forceBriefing: true })
}
```

- [ ] **Step 6 : L'épilogue à la place de la fin 3D** — remplacer le gestionnaire de `btn-see-ending` (lignes 157-170) par :

```js
document.getElementById('btn-see-ending').onclick = () => {
  levelClearEl.style.display = 'none'
  hudEl.style.display = 'none'
  clearEntities()
  gamePhase = 'briefing'
  clock.getDelta()
  playCinematic('epilogue', {
    audio: cinematicAudio(),
    params: { port: upgradeState.freedVictims ? 'libres' : 'enfermes' },
    onDone: () => {
      // Nouvelle campagne : retour à la mission 1, choix du port et briefings vus remis à zéro
      upgradeState.currentLevel = 1
      resetCampaignFlags()
      saveProgress()
      showMenu()
    },
  })
}
```

- [ ] **Step 7 : Le choix moral passe par la sauvegarde**
- Ligne 129 (journal) : remplacer `window.__freedVictims` par `upgradeState.freedVictims`.
- Ligne 705 (tir sur le cadenas) : remplacer `window.__freedVictims = true` par `upgradeState.freedVictims = true`.
- Dans `startLevel(n)`, juste après `currentLevelData = getLevel(n)`, ajouter :

```js
  if (((n - 1) % 6) + 1 === 3) upgradeState.freedVictims = false   // chaque essai du port repart d'un choix vierge
```

- [ ] **Step 8 : Pas de rendu 3D pendant un briefing, raccourci 1-6 neutralisé**
- Dans `loop()`, juste après la ligne `const dt = …`, ajouter :

```js
  if (gamePhase === 'briefing') return   // cinématique en motion design : pas de rendu WebGL
```

- Dans le raccourci de test 1-6 (ligne 975), remplacer la condition par :

```js
  if (gamePhase !== 'playing' && gamePhase !== 'paused' && gamePhase !== 'briefing' && gamePhase !== 'cinematic' && e.key >= '1' && e.key <= '6') {
```

- [ ] **Step 9 : Route de développement `?cine=`** — à la fin de `main.js`, après `loop()`, ajouter :

```js
// Développement : ?cine=m3&freeze=12000&port=libres joue (ou fige) une cinématique directement.
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search)
  if (q.has('cine')) {
    menuEl.style.display = 'none'
    gamePhase = 'briefing'
    const params = {}
    for (const [k, v] of q) if (k !== 'cine' && k !== 'freeze') params[k] = v
    playCinematic(q.get('cine'), {
      freeze: q.has('freeze') ? +q.get('freeze') : null,
      params,
      onDone: () => showMenu(),
    })
  }
}
```

- [ ] **Step 10 : Écrire `scripts/shots.mjs`**

```js
// Captures figées des cinématiques jouées dans le jeu (Chrome sans interface), pour comparer aux maquettes.
// Prérequis : npm run dev. Usage : node scripts/shots.mjs m3 9000 23000 39000
// Variables : CHROME (chemin de Chrome), BASE_URL (défaut http://localhost:5173/), PARAMS (ex. port=libres).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [id, ...instants] = process.argv.slice(2)
if (!id || !instants.length) { console.error('Usage : node scripts/shots.mjs <id> <ms> [<ms>…]'); process.exit(1) }
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
// MAQUETTE=1 : capture la maquette d'origine (npx vite docs/superpowers/maquettes/cinematiques --port 5193) au lieu du jeu
const MAQ = !!process.env.MAQUETTE
const BASE = process.env.BASE_URL || (MAQ ? 'http://localhost:5193/' : 'http://localhost:5173/')
const page = MAQ ? (id === 'epilogue' ? 'epilogue.html' : `briefing-${id}.html`) : ''
mkdirSync('shots', { recursive: true })
for (const ms of instants) {
  const out = join('shots', `${MAQ ? 'maquette-' : ''}${id}-${ms}${process.env.PARAMS ? '-' + process.env.PARAMS.replace(/[^a-z0-9]+/gi, '_') : ''}.png`)
  const profile = mkdtempSync(join(tmpdir(), 'shots-'))
  const url = MAQ
    ? `${BASE}${page}?freeze=${ms}${process.env.PARAMS ? '&' + process.env.PARAMS : ''}`
    : `${BASE}?cine=${encodeURIComponent(id)}&freeze=${ms}${process.env.PARAMS ? '&' + process.env.PARAMS : ''}`
  execFileSync(CHROME, ['--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', '--mute-audio',
    `--user-data-dir=${profile}`, '--window-size=1280,720', `--virtual-time-budget=${+ms + 8000}`, `--screenshot=${out}`, url], { stdio: 'ignore' })
  rmSync(profile, { recursive: true, force: true })
  console.log(out)
}
```

- [ ] **Step 11 : Vérifier le build et les tests**

Run: `npm test && npm run build`
Expected : tous les tests au vert, et un build sans erreur (l'avertissement de taille de chunk existant est toléré). Les modules de scène doivent sortir en chunks séparés, chargés à la demande. Le vérifier avec `ls dist/assets | grep -c js`, qui doit renvoyer plus de 1.

- [ ] **Step 12 : Commit**

```bash
git add src/audio.js src/main.js index.html scripts/shots.mjs
git commit -m "feat(cinematiques): briefings et épilogue branchés dans le jeu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Vérification dans le jeu et recette

**Files:**
- Aucun fichier de code. Les captures vont dans `shots/` (ignoré par git).

- [ ] **Step 1 : Lancer le serveur de dev** (en arrière-plan)

Run: `npm run dev`
Expected : « Local: http://localhost:5173/ ». Si le port est pris, lancer `npx vite --port 5191 --strictPort` et exporter `BASE_URL=http://localhost:5191/` pour l'étape suivante.

- [ ] **Step 2 : Capturer chaque scène aux mêmes instants que les maquettes**

```bash
node scripts/shots.mjs m1 3000 13000 23000 40500
node scripts/shots.mjs m2 9000 18000 27000 35000
node scripts/shots.mjs m3 8500 23000 29000 39000
node scripts/shots.mjs m4 9500 19000 29000 37500
node scripts/shots.mjs m5 10500 21000 31500 41000
node scripts/shots.mjs m6 11000 22000 33000 43500
node scripts/shots.mjs epilogue 6000 24000 40000
PARAMS=port=libres node scripts/shots.mjs epilogue 24000
```

Puis capturer les maquettes d'origine aux mêmes instants, pour comparer. Dans un second terminal, lancer `npx vite docs/superpowers/maquettes/cinematiques --port 5193 --strictPort`, puis relancer les mêmes commandes préfixées par `MAQUETTE=1` (par exemple `MAQUETTE=1 node scripts/shots.mjs m3 8500 23000 29000 39000`). Les fichiers sortent en `shots/maquette-<id>-<ms>.png`.

Ouvrir chaque paire de PNG (jeu et maquette) et les comparer. Ce qui est attendu :
- même composition et mêmes textes ;
- images présentes (aucune icône d'image cassée) ;
- scène en 16:9, centrée sur fond noir ;
- mention « ÉCHAP · ENTRÉE · ESPACE — PASSER » en bas à droite.

Les deux captures de l'épilogue à 24000 ms doivent différer : « destination inconnue » dans la variante par défaut, « libres » avec `port=libres`.

- [ ] **Step 3 : Contrôles dans un vrai navigateur** (`http://localhost:5173/`)
1. Touche **3** depuis le menu : le briefing M3 se joue, avec le son (bips d'Anton, musique). **Échap** le passe avec un fondu, puis la mission 3 commence.
2. Rater volontairement (tirer sur un civil), puis **RECOMMENCER** : la mission reprend **sans** briefing.
3. Sur l'écran d'échec, **REVOIR LE BRIEFING** rejoue M3, puis la mission.
4. **Échap** en jeu, puis **REVOIR LE BRIEFING** depuis la pause : même comportement.
5. **Paramètres → volume 0**, puis touche 1 : le briefing M1 est muet.
6. Pendant un briefing, appuyer sur **2** : rien ne se passe (le raccourci est neutralisé).
7. Console du navigateur : aucune erreur.

- [ ] **Step 4 : Rapport à Rayan** — envoyer :
- la planche de captures ;
- le résultat de `npm test` (nombre de tests) ;
- la liste des contrôles de l'étape 3, chacun avec son résultat ;
- la recette qu'il doit faire lui-même : parcours M1 → M6, réessai sans briefing, « Revoir le briefing », fin du jeu avec les deux variantes (en tirant ou non sur le cadenas au port), volume coupé.

Ne passer au Plan 2 (prologue) qu'après son retour.

---

## Hors de ce plan (suivi)

- **Plan 2 :**
  - prologue A et B, en convertissant `prologue.html` en deux scènes ;
  - enquête jouable (spec § 5 et § 6.7) ;
  - branchement de l'intro ;
  - suppression de `cinematic3d.js`, de `cutscene.js` et de l'audio de cinématique devenu inutile (spec § 6.8) ;
  - contrôle de la mémoire sur une partie complète.
- **Fichiers de voix** (spec § 6.5), une fois les textes figés.
- **Surimpressions de kill-cam** (spec § 6.6). `registerScene` permet déjà d'ajouter de courtes scènes. Le branchement viendra avec le prototype de kill-cam.
