# Cinématiques — Plan 2 : le prologue en motion design et le nettoyage de l'ancienne 3D

> **Pour les agents :** sous-compétence requise : superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans. Les étapes utilisent des cases (`- [ ]`).

**But :** remplacer l'intro 3D du jeu par les deux cinématiques du prologue en motion design (A « l'offre », B « le rappel »), jouées une fois par campagne, puis supprimer l'ancien code de cinématique 3D devenu mort.

**Architecture :** deux nouvelles maquettes (`prologue-a.html`, `prologue-b.html`) sont dérivées de la maquette validée `prologue.html`, qui reste intacte comme archive. Le convertisseur du Plan 1 les transforme en scènes du jeu. `main.js` enchaîne A puis B, puis la mission 1, par l'enveloppeur `cinematic()`. Un drapeau sauvegardé `prologueSeen` règle le « une fois par campagne ». Ensuite, `cinematic3d.js`, `cutscene.js` et la musique de cinématique d'`audio.js` partent.

**Pile :** Three.js 0.185, Vite 8 (`base: './'`), Vitest 5 + jsdom, Chrome sans interface pour les captures. Son 100 % procédural.

**Spec :** `docs/superpowers/specs/2026-10-02-cinematiques-design.md` (§4, §6.3, §6.8, §10 étapes 3 et 5). Plan précédent : `docs/superpowers/plans/2026-10-02-cinematiques-plan1-briefings.md`. Rapports d'analyse : `.superpowers/sdd/2026-10-02-cinematiques-plan2-prologue/understand-*.md`.

## Contraintes globales

- `docs/superpowers/maquettes/cinematiques/prologue.html` **ne se modifie pas** (référence validée). Les scènes générées (`src/briefing/scenes/*.js`) **ne s'éditent jamais à la main** : on retouche la maquette, puis `node scripts/port-maquette.mjs`.
- Règle de cohérence (spec §2) : Viktor tire depuis un poste éloigné et en hauteur ; Anton n'est jamais vu et ne dit jamais « tu entres ». Corps toujours hors champ.
- Voix : bips synthétiques + sous-titres tapés (aucune voix enregistrée, aucune synthèse vocale).
- Budget de poids ajouté au téléchargement : moins de 1,5 Mo au total (spec §8). Marge restante avant ce plan : environ 207 Ko.
- Pendant une cinématique, aucun rendu WebGL (`gamePhase = 'briefing'`).
- `src/pvpIntro.js` reste inchangé (spec §3).
- Commits : messages en français dans le style du dépôt, terminés par la ligne exacte `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Les implémenteurs ne poussent pas.
- Windows : Chrome sans interface exige un chemin **absolu** pour `--screenshot=`.

## Carte des fichiers

| Fichier | Rôle | Tâche |
|---|---|---|
| `docs/superpowers/maquettes/cinematiques/prologue-a.html` (créé) | Maquette A : carton « 21 FÉVR. », l'offre, le refus, carton « 14 MARS · 21:47 », noir | 1 |
| `docs/superpowers/maquettes/cinematiques/prologue-b.html` (créé) | Maquette B : message vocal, rappel, Anton, journal d'appels, tableau de chasse, titre | 2 |
| `docs/superpowers/maquettes/cinematiques/README.md` | Mentionner A, B et le statut d'archive de `prologue.html` | 1 |
| `src/upgrades.js`, `tests/upgrades.test.js` | Drapeau sauvegardé `prologueSeen` | 3 |
| `scripts/port-maquette.mjs` | `SCENES` exporté (+ prologue-a/b), `generateScene(id, repo)` exporté | 4 |
| `src/briefing/scenes/prologue-a.js`, `prologue-b.js` (générés) | Scènes du jeu | 4 |
| `src/briefing/index.js` | Registre : deux chargeurs de plus | 4 |
| `scripts/shots.mjs` | Page de maquette tirée de `SCENES` | 4 |
| `tests/scripts/port-maquette.test.js`, `tests/briefing/scenes.test.js`, `tests/briefing/ids.test.js` | Fraîcheur des scènes, couverture, ids créés à l'exécution | 4 |
| `src/main.js` | `playPrologue()`, fin de la phase `'cinematic'`, aide de dev `__mem()` | 5 |
| `src/cinematic3d.js`, `src/cutscene.js` (supprimés), `src/audio.js`, `src/maps.js` | Nettoyage | 6 |

Ordre : 1, 2 et 3 sont indépendantes. 4 dépend de 1 et 2. 5 dépend de 3 et 4. 6 dépend de 5. La tâche 0 (mesure de référence) et la tâche 7 (vérification) sont menées par le contrôleur.

---

### Tâche 0 (contrôleur) : mesure de référence avant tout changement

- [ ] Lancer le serveur de dev (`.claude/launch.json`, configuration `sniper-dev`).
- [ ] Dans le navigateur intégré, sur `http://localhost:5173/` : `localStorage.clear()`, recharger. Dans la console : `const { renderer, scene } = await import('/src/scene.js')`, puis relever `renderer.info.memory` (géométries, textures), `renderer.info.programs.length`, le nombre d'objets (`scene.traverse`) et `performance.memory.usedJSHeapSize` aux moments suivants : M0 (menu, 3 s), après l'intro 3D passée et le briefing M1 passé, en mission 1 (3 s après le HUD), puis en missions 2 à 6 par les touches 2 à 6 depuis le menu (briefings passés).
- [ ] Mesurer le bundle principal : `npx vite build --outDir <scratchpad>/dist-avant` et noter la taille de `assets/index-*.js` (et gzip).
- [ ] Consigner les chiffres dans le journal du plan.

---

### Tâche 1 : maquette `prologue-a.html` (l'offre, le refus, le 14 mars)

**Fichiers :**
- Créer : `docs/superpowers/maquettes/cinematiques/prologue-a.html`
- Modifier : `docs/superpowers/maquettes/cinematiques/README.md`

**Interfaces :**
- Produit : une maquette au gabarit standard (`<link href="kit.css">`, `<script src="kit.js">`, `<div class="st pro" id="st">` contenant `#scene`), lisible par `portMaquette`. Ids lus par le script : `sCard`, `cd`, `cl`, `cs`, `sWin`, `citySvg`, `bok`, `rig`, `fingers`, `ph1`, `ph1c`, `ph1n`, `ph1i`, `ph1t`, `sub`.

Contenu voulu (≈ 21 s) : carton daté « 21 FÉVR. · 23:12 / L'OFFRE », l'appel du recruteur (« Un tir, cent mille »), Viktor raccroche (« Je ne tue plus pour de l'argent »), puis le carton « 14 MARS · 21:47 / LE SILENCE » avec « Trois semaines plus tard, je suis rentré plus tôt que prévu. », un dernier battement de cœur et le noir. C'est là que s'insérera l'enquête jouable (plan suivant).

- [ ] **Étape 1 : copier la maquette de référence**

```bash
cp docs/superpowers/maquettes/cinematiques/prologue.html docs/superpowers/maquettes/cinematiques/prologue-a.html
```

- [ ] **Étape 2 : élaguer le `<head>`**

Dans `prologue-a.html` :
- `<title>Prologue A — L'offre</title>` ;
- premier commentaire du `<style>` : `/* PROLOGUE A — « L'offre ». Plans subjectifs (POV de Viktor) en 2,5D : nuit bleue, souvenir ambré. */` ;
- supprimer la règle `.pro .hh.walk { … }` et `@keyframes pro-walk { … }` ;
- supprimer les règles `.pro .mob.ant …` (3 règles) et `@keyframes pro-avj` ;
- supprimer tout le bloc `/* journal d'appels */` (de `.pro .p-log` à `@keyframes pro-ink` inclus) ;
- supprimer les sections entières `/* ── POV 2 : le couloir … */`, `/* ── POV 3 : le sol … */`, `/* ── POV 4 : la table … */`, `/* ── POV 5 : le tableau de chasse ── */`, `/* ── radio … */` et `/* ── carton-titre ── */` (chacune jusqu'au commentaire de section suivant ; garder `/* ── sous-titres … */`).

- [ ] **Étape 3 : élaguer le `<body>`**

- dans le `<svg>` de symboles : supprimer le `<symbol id="pro-point">` et son commentaire (main gantée : sert au tableau seulement) ;
- supprimer les blocs `<!-- POV : le couloir -->`, `<!-- POV : le sol de l'appartement -->`, `<!-- POV : la table, le rapport, le téléphone -->` et `<!-- POV : le tableau de chasse -->` (chaque `div.shot` entier) ;
- supprimer `<div class="radio" id="radio">…</div>` et `<div class="title" id="title">…</div>` ;
- garder `#sCard`, `#sWin`, `#rig`, `#sub`.

- [ ] **Étape 4 : remplacer tout le `<script>` en ligne par :**

```html
<script>
  // ── fabrication : ville sous la pluie, bokeh, téléphone, doigts ──
  const $ = id => document.getElementById(id)
  const NS = 'http://www.w3.org/2000/svg'
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

  // ⟨recopier ICI À L'IDENTIQUE la fonction `;(function city() { … })()` de prologue.html (P:697-722) :
  //  même graine, même ordre de tirages, pour que la ville soit la même que dans la maquette B⟩

  const HS = '<svg viewBox="0 0 24 24"><use href="#pro-hs"/></svg>'
  const ICO = [ /* ⟨recopier à l'identique le tableau ICO de prologue.html (3 pictos)⟩ */ ]
  const AV = '<svg viewBox="0 0 80 80"><path d="M40 18 C32 18 27 24 27 32 C27 39 30 44 34 46 L33 50 C22 52 14 58 12 68 L11 80 H69 L68 68 C66 58 58 52 47 50 L46 46 C50 44 53 39 53 32 C53 24 48 18 40 18 Z" fill="#2a3242"/></svg>'
  const phone = (id, clock) => `<div class="scr">
      <div class="p-sb"><span id="${id}c">${clock}</span><span class="p-ic"><i></i><i></i><i></i><i></i><b></b></span></div>
      <div class="p-st"><span class="s1">APPEL EN COURS</span></div>
      <div class="p-av">${AV}<em>?</em></div>
      <div class="p-nm" id="${id}n">NUMÉRO MASQUÉ</div>
      <div class="p-in" id="${id}i">INCONNU</div>
      <div class="p-tm" id="${id}t">00:04</div>
      <div class="p-end">APPEL TERMINÉ</div>
      <div class="p-row">${ICO.map(s => `<i>${s}</i>`).join('')}</div>
      <div class="p-btn hang">${HS}</div>
    </div><div class="notch"></div>`
  $('ph1').innerHTML = phone('ph1', '23:12')

  // ⟨recopier à l'identique le bloc « doigts repliés sur le bord gauche du téléphone » de prologue.html⟩

  // ── outils de mise en scène ──
  const G = (ms, p) => K => K.glitch(ms, p)
  const H = K => K.snd.heart()
  const hearts = (from, to, every) => { const a = []; for (let t = from; t <= to; t += every) a.push([t, H]); return a }
  const mmss = s => '00:' + String(s).padStart(2, '0')
  const clock = (K, id, from, n, guard) => { for (let i = 0; i < n; i++) K.at(i * 1000, () => { if (!guard || !$(guard).classList.contains('end')) $(id).textContent = mmss(from + i) }) }
  const rain = K => { K.snd.noise(6, .045, 3800, 'highpass', 0, .5); K.snd.noise(4, .03, 900, 'bandpass', .4, .6) }

  K.run({
    music: 'somber',
    stateClasses: ['press', 'end'],
    reset: K => { $('ph1n').textContent = 'NUMÉRO MASQUÉ'; $('ph1i').textContent = 'INCONNU'; $('ph1c').textContent = '23:12'; $('ph1t').textContent = '00:04' },
    beats: [
      // 1 — carton daté : le soir de l'offre
      { label: 'le 21 février', min: 2600, cues: [
          [100, K => K.crt()], [350, K => K.on('sCard')],
          [650, K => K.type('cd', '21 FÉVR. · 23:12', 1050, true)],
          [1800, K => K.on('cl')], [2000, K => K.type('cs', 'L\'OFFRE', 400, true)], [2450, G(160, .5)]] },
      // 2 — POV : le téléphone en main, la fenêtre sous la pluie
      { label: 'l\'offre', who: 'PHONE', name: 'NUMÉRO MASQUÉ', pre: 1300, post: 300,
        say: 'On sait ce que vous valez, Viktor. Un tir, cent mille. Personne ne saura.',
        cues: [
          [0, K => { K.glitch(260, .7); K.on('sCard', 'out'); K.on('sWin'); rain(K) }],
          [250, K => { K.on('rig'); K.snd.paper(); clock(K, 'ph1t', 4, 9, 'ph1') }],
          [2600, G(120, .45)], [4900, G(90, .4)]] },
      // 3 — le refus : le pouce raccroche
      { label: 'le refus', who: 'VIKTOR', post: 600, say: 'J\'ai raccroché. Je ne tue plus pour de l\'argent.',
        cues: [
          [250, K => K.on('rig', 'press')],
          [520, K => { K.on('ph1', 'end'); K.snd.tone(480, 'sine', .18, .12); K.snd.tone(480, 'sine', .18, .12, .25) }],
          [900, K => K.off('rig', 'press')], [3300, K => K.off('rig')]] },
      // 4 — trois semaines plus tard : le soir où il rentre (l'enquête jouable s'insérera juste après)
      { label: 'le 14 mars', who: 'VIKTOR', pre: 1900, post: 700, say: 'Trois semaines plus tard, je suis rentré plus tôt que prévu.',
        cues: [
          [0, K => { K.$('sub').textContent = ''; K.glitch(520, 1); K.shake(); K.on('sWin', 'out'); K.off('sCard', 'out'); K.off('cl'); K.$('cd').textContent = ''; K.$('cs').textContent = '' }],
          [200, K => K.type('cd', '14 MARS · 21:47', 650, true)], [950, K => K.on('cl')], [1050, K => K.type('cs', 'LE SILENCE', 400, true)],
          ...hearts(2000, 6200, 950)] },
      // 5 — le noir
      { label: 'le noir', min: 1600, cues: [
          [0, K => { K.$('sub').textContent = ''; H(K) }], [500, G(260, .8)], [800, K => K.black()]] },
    ],
  })
</script>
```

Les trois passages ⟨…⟩ se recopient **mot pour mot** depuis `prologue.html` (ce sont du code déjà validé ; ne rien y changer).

- [ ] **Étape 5 : vérifier que la maquette se joue sans erreur (à sec, dans jsdom)**

Créer le fichier temporaire `tests/tmp-maquette.test.js` (il ne sera **pas** commité) :

```js
import { it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { portMaquette } from '../scripts/port-maquette.mjs'
import { createKit } from '../src/briefing/kit.js'

for (const name of ['prologue-a']) {
  it(`la maquette ${name} se joue jusqu'au bout sans erreur`, async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] })
    const src = portMaquette(readFileSync(`docs/superpowers/maquettes/cinematiques/${name}.html`, 'utf8'), { name })
    const mod = await import(/* @vite-ignore */ 'data:text/javascript;base64,' + Buffer.from(src).toString('base64'))
    document.body.innerHTML = `<div id="root"><div class="${mod.stClass}" id="st">${mod.html}</div></div>`
    const K = createKit({ root: document.getElementById('root') })
    let fin = null
    K.finished.then(() => { fin = performance.now() })
    mod.start(K, {})
    await vi.advanceTimersByTimeAsync(120000)
    expect(K.errors).toEqual([])
    expect(fin).not.toBeNull()
    console.log(name, 'durée', fin, 'ms')
    K.destroy(); vi.useRealTimers()
  })
}
```

Run : `npx vitest run tests/tmp-maquette.test.js`
Attendu : PASS, durée affichée ≈ 21 300 ms.

- [ ] **Étape 6 : regarder la maquette (captures sans serveur)**

Pour chaque instant `T` de 1500, 6000, 10500, 15500 et 20500 ms :

```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --hide-scrollbars --window-size=1280,720 --virtual-time-budget=$((T+6000)) --screenshot="C:/Users/Rayan/dev/Sniper-Game/shots/maquette-prologue-a-$T.png" "file:///C:/Users/Rayan/dev/Sniper-Game/docs/superpowers/maquettes/cinematiques/prologue-a.html?freeze=$T"
```

Ouvrir chaque image et vérifier : 1500 = carton « 21 FÉVR. · 23:12 » ; 6000 = téléphone en main devant la fenêtre sous la pluie, sous-titre du recruteur ; 10500 = « APPEL TERMINÉ » ; 15500 = carton « 14 MARS · 21:47 / LE SILENCE » ; 20500 = noir. Aucun titre « ERR: » (le kit de maquette l'affiche quand un id manque). `shots/` est ignoré par git.

- [ ] **Étape 7 : README des maquettes**

Dans `docs/superpowers/maquettes/cinematiques/README.md`, remplacer la phrase « puis ouvrir `http://localhost:5193/briefing-m3.html` (ou `prologue.html`, `epilogue.html`). » par :

```markdown
puis ouvrir `http://localhost:5193/briefing-m3.html` (ou `prologue-a.html`, `prologue-b.html`, `epilogue.html`).

Le prologue du jeu est en deux pièces : `prologue-a.html` (l'offre, le refus, le soir du 14 mars) et
`prologue-b.html` (le message vocal, le rappel, le tableau de chasse). L'enquête jouable s'insère entre les
deux. `prologue.html` est l'ancienne version longue validée, gardée comme référence : elle n'est pas convertie.
```

- [ ] **Étape 8 : supprimer le test temporaire et commiter**

```bash
rm tests/tmp-maquette.test.js
git add docs/superpowers/maquettes/cinematiques/prologue-a.html docs/superpowers/maquettes/cinematiques/README.md
git commit -m "docs(maquettes): prologue A — l'offre, le refus, le soir du 14 mars"
```

---

### Tâche 2 : maquette `prologue-b.html` (le message, le rappel, le tableau de chasse)

**Fichiers :**
- Créer : `docs/superpowers/maquettes/cinematiques/prologue-b.html`

**Interfaces :**
- Produit : une maquette au gabarit standard. Ids lus par le script : `sWin`, `citySvg`, `bok`, `rig`, `fingers`, `ph1`, `ph1c`, `ph1n`, `ph1i`, `ph1t`, `vmbar`, `radio`, `lg3`, `lgt`, `sBoard`, `bdolly`, `bhand`, `fMk`, `fFr`, `fVo`, `fVe`, `fHa`, `fRo`, `fKe`, `fQ`, `s1`…`s8`, `mt1`, `mt2`, `mt3`, `mt4a/b/c`, `mt5`, `mt6`, `ret`, `sub`, `title`.

Contenu voulu (≈ 53 s), dans l'ordre :
1. **Le message** — POV, la ville éteinte sous la pluie, le téléphone en main affiche la messagerie : « 06 39 98 41 07 · AUJ. 18:52 », une forme d'onde qui se lit (piste ambrée qui avance), et le bouton vert « RAPPELER ». Le message joue (PHONE) : « Viktor, sors ta famille de là. Maintenant. »
   Anton appelle d'un **numéro jetable affiché en clair** (on ne peut pas rappeler un numéro masqué) ; le recruteur du 21 février, lui, reste « NUMÉRO MASQUÉ ». Le numéro `06 39 98 41 07` est pris dans la tranche que l'ARCEP réserve aux œuvres de fiction (06 39 98 xx xx).
2. **Le rappel** — le pouce appuie sur « RAPPELER », l'écran passe en appel sortant (« APPEL… », ondes autour de l'avatar, « APPEL SORTANT »), deux tonalités de retour d'appel, puis ça décroche (« EN COURS · CHIFFRÉ », la musique passe à `dread`, la minuterie démarre).
3. **Anton** : « Tu as eu mon message. Trop tard, je sais. » puis « Tu ne me connais pas. Et tu ne verras jamais mon visage. » (l'avatar « ? » se met à grésiller en rouge sur « visage »).
4. La suite de la maquette validée (anciens temps 10 à 17) : « Appelle-moi Anton… » (le nom s'écrit), le journal d'appels — qui montre maintenant l'appel manqué de **MAISON à 19:04** et le **message de 18:52** au-dessus du refus du 21 février —, le tableau de chasse épinglé fiche par fiche, la vengeance, « SIGNAL PERDU », le titre « PROLOGUE / SNIPER ».

- [ ] **Étape 1 : copier la maquette de référence**

```bash
cp docs/superpowers/maquettes/cinematiques/prologue.html docs/superpowers/maquettes/cinematiques/prologue-b.html
```

- [ ] **Étape 2 : élaguer et compléter le `<head>`**

- `<title>Prologue B — Le rappel</title>` ; premier commentaire du `<style>` : `/* PROLOGUE B — « Le rappel ». POV de Viktor : la messagerie, le rappel, Anton, le tableau de chasse. */` ;
- supprimer `.pro .hh.walk` et `@keyframes pro-walk` ;
- supprimer toute la section `/* ── cartons datés ── */` ;
- supprimer les règles `.pro .mob.end …` (4 règles) ;
- supprimer les sections entières `/* ── POV 2 : le couloir … */`, `/* ── POV 3 : le sol … */` et `/* ── POV 4 : la table … */` ;
- **à la place** de la section « POV 4 », insérer exactement :

```css
  /* ── la main gantée du tableau (ombre et cadrage du SVG) ── */
  .pro .bhand svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(.8cqw 1.2cqw 1cqw rgba(0,0,0,.55)); }

  /* ── le rappel : messagerie, appel sortant, décroché ── */
  .pro .p-st .s2, .pro .p-st .s3 { display: none; }
  .pro .mob.dial .p-st .s1, .pro .mob.ans .p-st .s1 { display: none; }
  .pro .mob.dial .p-st .s3 { display: inline; color: #8fd19e; }
  .pro .mob.ans .p-st .s2 { display: inline; }
  .pro .mob.dial .p-tm, .pro .mob.dial .p-row { opacity: 0; }
  .pro .mob.dial .p-av s { animation: pro-ringc 1.2s ease-out infinite; }
  .pro .mob.dial .p-av s + s { animation-delay: .6s; }
  @keyframes pro-ringc { 0% { opacity: .9; transform: scale(1) } 100% { opacity: 0; transform: scale(1.7) } }
  /* messagerie : remplace l'écran d'appel tant que .vm est posé */
  .pro .p-vm, .pro .p-btn.cb, .pro .p-cbl { opacity: 0; transition: opacity .25s; }
  .pro .mob.vm .p-vm, .pro .mob.vm .p-btn.cb, .pro .mob.vm .p-cbl { opacity: 1; }
  .pro .mob.vm .p-st, .pro .mob.vm .p-av, .pro .mob.vm .p-nm, .pro .mob.vm .p-in, .pro .mob.vm .p-tm, .pro .mob.vm .p-row, .pro .mob.vm .p-btn.hang { opacity: 0; }
  .pro .p-vm { position: absolute; left: 1.4cqw; right: 1.4cqw; top: 4.4cqw; }
  .pro .p-vm h6 { margin: 0 0 1.6cqw; font-size: 1.15cqw; font-weight: normal; letter-spacing: .3em; color: rgba(215,220,207,.55); }
  .pro .p-vm b { display: block; font-size: 1.7cqw; letter-spacing: .06em; color: var(--wh); }
  .pro .p-vm small { display: block; margin-top: .4cqw; font-size: 1.15cqw; letter-spacing: .12em; color: #ff7a7a; }
  .pro .vw { position: relative; height: 5.6cqw; margin-top: 3cqw; }
  .pro .vb { position: absolute; inset: 0; display: flex; align-items: center; justify-content: space-between; }
  .pro .vb i { width: .28cqw; border-radius: .14cqw; background: rgba(215,220,207,.28); }
  .pro .vp { position: absolute; inset: 0; clip-path: inset(0 100% 0 0); }
  .pro .vp.play { clip-path: inset(0 0 0 0); transition: clip-path 3s linear; }
  .pro .vp .vb i { background: var(--amb); box-shadow: 0 0 .5cqw rgba(242,179,107,.55); }
  .pro .vt { display: flex; justify-content: space-between; margin-top: .6cqw; font-size: 1.05cqw; color: rgba(215,220,207,.5); }
  .pro .p-btn.cb { left: 50%; margin-left: -2.2cqw; background: #34c759; }
  .pro .p-cbl { position: absolute; left: 0; right: 0; top: 36.2cqw; text-align: center; font-size: 1.05cqw; letter-spacing: .25em; padding-left: .25em; color: #8fd19e; }
```

- garder : jetons `.pro`, `.shot`, `.hh`, `svg text`, la fenêtre (`#sWin`, `.later`, `.red`), la main et le téléphone, `.mob.ant`, le journal, le tableau, la radio, les sous-titres, le carton-titre.

- [ ] **Étape 3 : élaguer le `<body>` et changer une coupure du tableau**

- supprimer le bloc `<!-- carton daté -->` (`#sCard`) et les blocs `<!-- POV : le couloir -->`, `<!-- POV : le sol de l'appartement -->`, `<!-- POV : la table, le rapport, le téléphone -->` (chaque `div.shot` entier) ;
- garder les symboles (dont `pro-point`), `#sWin`, `#sBoard`, `#rig`, `#radio`, `#sub`, `#title` ;
- dans `#radio`, le libellé `<span class="lb">CANAL INCONNU · NUMÉRO MASQUÉ</span>` devient `<span class="lb">CANAL INCONNU · NUMÉRO JETABLE</span>` ;
- dans `#sBoard`, la coupure « DOUBLE HOMICIDE : L'AFFAIRE CLASSÉE / 14 AVRIL 2026 » serait un anachronisme (B se passe le soir du 14 mars). La remplacer par une coupure sur le réseau de Markov :

```html
<div class="clip" style="left:61cqw;top:29.5cqw;width:15cqw;transform:rotate(2deg)"><i class="pin y"></i><h4>MARCHÉ DE NUIT : DES FILLES DISPARUES</h4><div class="txt" style="height:2.6cqw"></div><div class="ft">AUCUNE PISTE</div></div>
```

- [ ] **Étape 4 : remplacer tout le `<script>` en ligne par :**

```html
<script>
  // ── fabrication : ville sous la pluie, bokeh, téléphone, doigts ──
  const $ = id => document.getElementById(id)
  const NS = 'http://www.w3.org/2000/svg'
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

  // ⟨recopier ICI À L'IDENTIQUE la fonction `;(function city() { … })()` de prologue.html⟩

  const HS = '<svg viewBox="0 0 24 24"><use href="#pro-hs"/></svg>'
  const HC = '<svg viewBox="0 0 24 24"><use href="#pro-call"/></svg>'
  const ICO = [ /* ⟨recopier à l'identique le tableau ICO de prologue.html⟩ */ ]
  const AV = '<svg viewBox="0 0 80 80"><path d="M40 18 C32 18 27 24 27 32 C27 39 30 44 34 46 L33 50 C22 52 14 58 12 68 L11 80 H69 L68 68 C66 58 58 52 47 50 L46 46 C50 44 53 39 53 32 C53 24 48 18 40 18 Z" fill="#2a3242"/></svg>'
  // le téléphone en main : messagerie (.vm), appel sortant (.dial), décroché (.ans), Anton (.ant), journal (.log)
  const phone = (id, clock) => `<div class="scr">
      <div class="p-sb"><span id="${id}c">${clock}</span><span class="p-ic"><i></i><i></i><i></i><i></i><b></b></span></div>
      <div class="p-st"><span class="s1">APPEL EN COURS</span><span class="s2">EN COURS · CHIFFRÉ</span><span class="s3">APPEL…</span></div>
      <div class="p-av">${AV}<em>?</em><s></s><s></s></div>
      <div class="p-nm" id="${id}n">06 39 98 41 07</div>
      <div class="p-in" id="${id}i">NUMÉRO INCONNU</div>
      <div class="p-tm" id="${id}t">00:00</div>
      <div class="p-row">${ICO.map(s => `<i>${s}</i>`).join('')}</div>
      <div class="p-btn hang">${HS}</div>
      <div class="p-vm"><h6>MESSAGERIE</h6><b>06 39 98 41 07</b><small>AUJ. 18:52 · 0:04</small>
        <div class="vw"><div class="vb"></div><div class="vp" id="vmbar"><div class="vb"></div></div></div>
        <div class="vt"><span>0:00</span><span>0:04</span></div></div>
      <div class="p-btn cb">${HC}</div><div class="p-cbl">RAPPELER</div>
      <div class="p-log"><h5>RÉCENTS</h5>
        <div class="lr"><b>« ANTON »</b><small><span class="gd">●</span> AUJ. 22:41 · SORTANT</small></div>
        <div class="lr ms"><b>MAISON</b><small>AUJ. 19:04 · MANQUÉ</small></div>
        <div class="lr ms"><b>06 39 98 41 07</b><small>AUJ. 18:52 · MANQUÉ · MESSAGE</small></div>
        <div class="lr" id="lg3"><b>NUMÉRO MASQUÉ</b><small>21 FÉVR. · 23:12 · 0:10</small><i class="tag" id="lgt">REFUSÉ</i></div>
      </div>
    </div><div class="notch"></div>`
  $('ph1').innerHTML = phone('ph1', '22:41')
  // forme d'onde du message : les mêmes 34 barres pour la piste grise et la piste lue (tirées après la ville)
  const bars = Array.from({ length: 34 }, () => (18 + rnd() * 82).toFixed(0))
  $('ph1').querySelectorAll('.vb').forEach(v => { v.innerHTML = bars.map(h => `<i style="height:${h}%"></i>`).join('') })

  // ⟨recopier à l'identique le bloc « doigts repliés sur le bord gauche du téléphone » de prologue.html⟩

  // ── outils de mise en scène ──
  const G = (ms, p) => K => K.glitch(ms, p)
  const H = K => K.snd.heart()
  const mmss = s => '00:' + String(s).padStart(2, '0')
  const clock = (K, id, from, n) => { for (let i = 0; i < n; i++) K.at(i * 1000, () => { $(id).textContent = mmss(from + i) }) }
  const rain = K => { K.snd.noise(6, .045, 3800, 'highpass', 0, .5); K.snd.noise(4, .03, 900, 'bandpass', .4, .6) }
  // tonalité de retour d'appel (ça sonne chez Anton)
  const ring = K => { K.snd.tone(440, 'sine', 1.1, .05); K.snd.tone(480, 'sine', 1.1, .04) }
  const hand = $('bhand')
  const aim = (x, y) => { hand.style.setProperty('--hx', x + 'cqw'); hand.style.setProperty('--hy', y + 'cqw') }
  // ⟨recopier à l'identique la fonction `pin` de prologue.html (épingler une fiche)⟩

  K.run({
    music: 'somber',
    stateClasses: ['press', 'vm', 'dial', 'ans', 'ant', 'log', 'play', 'red', 'later', 'named', 'in', 'set', 'q', 'go'],
    reset: K => { $('ph1n').textContent = '06 39 98 41 07'; $('ph1i').textContent = 'NUMÉRO INCONNU'; $('ph1c').textContent = '22:41'; $('ph1t').textContent = '00:00'; aim(14.5, 30.6) },
    beats: [
      // 1 — le message vocal de 18:52, écouté trop tard
      { label: 'le message', who: 'PHONE', name: 'MESSAGE · 18:52', pre: 1700, post: 900,
        say: 'Viktor, sors ta famille de là. Maintenant.',
        cues: [
          [0, K => { K.crt(); K.on('sWin'); K.on('sWin', 'later'); K.on('ph1', 'vm'); rain(K) }],
          [300, K => { K.on('rig'); K.snd.paper() }],
          [1300, K => K.snd.beep(1046)],
          [1700, K => K.on('vmbar', 'play')],
          [4300, H], [5000, G(200, .6)], [5200, H]] },
      // 2 — le rappel : le pouce sur « RAPPELER », ça sonne, ça décroche
      { label: 'le rappel', min: 4600, cues: [
          [0, K => { K.$('sub').textContent = '' }],
          [250, K => K.on('rig', 'press')],
          [520, K => { K.off('ph1', 'vm'); K.on('ph1', 'dial'); K.$('ph1i').textContent = 'APPEL SORTANT'; K.snd.beep(900) }],
          [800, K => K.off('rig', 'press')],
          [1100, ring], [2900, ring],
          [4300, K => { K.off('ph1', 'dial'); K.on('ph1', 'ans'); K.$('ph1i').textContent = 'NUMÉRO INCONNU'; K.music('dread'); K.snd.beep(1320); clock(K, 'ph1t', 0, 30); K.glitch(160, .5) }]] },
      // 3 — Anton décroche
      { label: 'trop tard', pre: 400, post: 350, say: 'Tu as eu mon message. Trop tard, je sais.',
        cues: [[2400, H]] },
      // 4 — la règle d'Anton : jamais vu
      { label: 'jamais vu', post: 300, say: 'Tu ne me connais pas. Et tu ne verras jamais mon visage.',
        cues: [[1600, K => { K.on('ph1', 'ant'); K.glitch(220, .7) }], [3400, H]] },
      // 5 — « Appelle-moi Anton »
      { label: 'Anton', pre: 500, post: 300, say: 'Appelle-moi Anton. Je vends des infos… et je sais qui t\'a fait ça.',
        cues: [
          [0, K => K.glitch(320, .85)],
          [1100, K => { K.type('ph1n', '« ANTON »', 520, true); K.on('radio', 'named'); K.glitch(160, .6) }],
          [2000, K => K.type('ph1i', 'IDENTITÉ INCONNUE', 650, true)],
          [3900, K => { H(K); K.glitch(200, .7) }]] },
      // 6 — le journal d'appels : la maison à 19:04, le message de 18:52, le refus du 21 février
      { label: 'on ne dit pas non', post: 350, say: 'On t\'a offert du travail. Tu as dit non. Chez eux, on ne dit pas non.',
        cues: [
          [150, K => { K.on('ph1', 'log'); K.snd.paper() }],
          [900, K => { K.on('lg3'); K.snd.beep(900) }],
          [2000, K => { K.on('lgt'); K.snd.stamp() }],
          [3300, K => { K.on('sWin', 'red'); K.glitch(320, .85); H(K) }]] },
      // ⟨7 à 12 — recopier À L'IDENTIQUE les six derniers temps de prologue.html, de « 12 — le tableau de chasse »
      //  à « 17 — carton-titre » inclus, en renumérotant seulement les commentaires (7 à 12)⟩
    ],
  })
</script>
```

- [ ] **Étape 5 : vérifier à sec**

Recréer `tests/tmp-maquette.test.js` (code de la tâche 1, étape 5) avec `for (const name of ['prologue-b'])`.
Run : `npx vitest run tests/tmp-maquette.test.js`
Attendu : PASS, durée ≈ 53 200 ms.

- [ ] **Étape 6 : regarder la maquette**

Même commande qu'à la tâche 1 (étape 6) avec `prologue-b` et les instants 2500, 7000, 11500, 16000, 19500, 25000, 33000, 47000 et 51000. Vérifier :
- 2500 : messagerie lisible (« MESSAGERIE », « 06 39 98 41 07 », « AUJ. 18:52 · 0:04 »), forme d'onde avec la piste ambrée en cours, bouton vert « RAPPELER », sous-titre « MESSAGE · 18:52 » ;
- 7000 : « APPEL… » en vert, « APPEL SORTANT », ondes autour de l'avatar ;
- 11500 : « EN COURS · CHIFFRÉ », minuterie, radio « CANAL INCONNU · NUMÉRO JETABLE », sous-titre d'Anton ;
- 16000 : avatar « ? » rouge ;
- 19500 : « « ANTON » » s'écrit ;
- 25000 : journal : 4 lignes lisibles, MAISON et le message en rouge, la ligne du refus surlignée ;
- 33000 : tableau, fiches épinglées ; 47000 : travelling sur « ? » ; 51000 : « PROLOGUE / SNIPER ».
Aucun titre « ERR: ». Corriger la mise en page si un élément déborde ou se chevauche, puis recapturer.

- [ ] **Étape 7 : supprimer le test temporaire et commiter**

```bash
rm tests/tmp-maquette.test.js
git add docs/superpowers/maquettes/cinematiques/prologue-b.html
git commit -m "docs(maquettes): prologue B — le message, le rappel, le tableau de chasse"
```

---

### Tâche 3 : le prologue vu, dans la sauvegarde

**Fichiers :**
- Modifier : `src/upgrades.js`
- Test : `tests/upgrades.test.js`

**Interfaces :**
- Produit : `state.prologueSeen: boolean` (faux par défaut), `export function markPrologueSeen(): void`. `resetCampaignFlags()` (donc aussi `resetProgress()`) le remet à faux. Sauvegardé sous la clé `prologueSeen` de `sniper-save`.

- [ ] **Étape 1 : écrire les tests qui échouent** — ajouter dans le `describe` de `tests/upgrades.test.js` :

```js
  it('le prologue n\'est pas vu au départ, se sauvegarde, et une nouvelle campagne le remet à zéro', async () => {
    expect(U.state.prologueSeen).toBe(false)
    U.markPrologueSeen(); U.saveProgress()
    const M = await reload()
    expect(M.state.prologueSeen).toBe(true)
    M.resetCampaignFlags()
    expect(M.state.prologueSeen).toBe(false)
  })

  it('une ancienne sauvegarde sans le champ ne compte pas le prologue comme vu', async () => {
    localStorage.setItem('sniper-save', JSON.stringify({ currentLevel: 1, briefingSeen: [true, false, false, false, false, false] }))
    const M = await reload()
    expect(M.state.prologueSeen).toBe(false)
  })

  it('effacer la sauvegarde remet aussi le prologue à « non vu »', () => {
    U.markPrologueSeen()
    U.resetProgress()
    expect(U.state.prologueSeen).toBe(false)
  })
```

- [ ] **Étape 2 : vérifier l'échec** — `npx vitest run tests/upgrades.test.js` → FAIL (`U.markPrologueSeen is not a function`, `prologueSeen` indéfini).

- [ ] **Étape 3 : implémenter** dans `src/upgrades.js` :
  - dans `state`, après `briefingSeen` : `prologueSeen: false,             // prologue (l'offre, le rappel, le tableau) déjà vu dans cette campagne` ;
  - après `markBriefingSeen` : `export function markPrologueSeen() { state.prologueSeen = true }` ;
  - `resetCampaignFlags` devient : `export function resetCampaignFlags() { state.freedVictims = false; state.briefingSeen = NO_BRIEFING_SEEN(); state.prologueSeen = false }` ;
  - dans `saveProgress`, après `briefingSeen: state.briefingSeen,` : `prologueSeen: state.prologueSeen,` ;
  - dans `loadProgress`, après la ligne `state.briefingSeen = …` : `state.prologueSeen = !!d.prologueSeen`.

- [ ] **Étape 4 : vérifier** — `npx vitest run tests/upgrades.test.js` → PASS ; `npx vitest run` → tout vert.

- [ ] **Étape 5 : commiter**

```bash
git add src/upgrades.js tests/upgrades.test.js
git commit -m "feat(progression): le prologue vu est gardé dans la sauvegarde"
```

---

### Tâche 4 : les scènes prologue-a et prologue-b dans le jeu

**Fichiers :**
- Modifier : `scripts/port-maquette.mjs`, `src/briefing/index.js`, `scripts/shots.mjs`, `tests/scripts/port-maquette.test.js`, `tests/briefing/scenes.test.js`, `tests/briefing/ids.test.js`
- Créer (généré) : `src/briefing/scenes/prologue-a.js`, `src/briefing/scenes/prologue-b.js`

**Interfaces :**
- Consomme : les maquettes des tâches 1 et 2.
- Produit : `export const SCENES` (id de scène → nom de maquette sans `.html`, avec `'prologue-a'` et `'prologue-b'`), `export function generateScene(id, repo): string` dans `scripts/port-maquette.mjs` ; `playCinematic('prologue-a' | 'prologue-b', …)` disponible.

- [ ] **Étape 1 : tests qui échouent**

Dans `tests/scripts/port-maquette.test.js`, changer l'import en tête et ajouter à la fin :

```js
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { portMaquette, SCENES, generateScene } from '../../scripts/port-maquette.mjs'
```

```js
describe('scènes générées', () => {
  it('connaît les deux pièces du prologue', () => {
    expect(SCENES['prologue-a']).toBe('prologue-a')
    expect(SCENES['prologue-b']).toBe('prologue-b')
  })

  it('chaque scène du dépôt est à jour avec sa maquette (sinon : node scripts/port-maquette.mjs)', () => {
    const lf = s => s.replace(/\r\n/g, '\n')
    for (const id of Object.keys(SCENES)) {
      const fichier = join(process.cwd(), 'src', 'briefing', 'scenes', id + '.js')
      expect(lf(readFileSync(fichier, 'utf8')), `scène « ${id} » périmée ou absente`).toBe(lf(generateScene(id, process.cwd())))
    }
  })
})
```

Remplacer `tests/briefing/scenes.test.js` par :

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playCinematic } from '../../src/briefing/index.js'
import { SCENES } from '../../scripts/port-maquette.mjs'

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
beforeEach(() => { vi.useFakeTimers(FAKE); document.body.innerHTML = '<div id="briefing-root" hidden></div>' })
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; document.head.innerHTML = '' })

// Chaque scène jouée jusqu'au bout ; l'épilogue dans ses deux variantes (choix du port, spec §9).
const CAS = [
  ['m1', {}], ['m2', {}], ['m3', {}], ['m4', {}], ['m5', {}], ['m6', {}],
  ['epilogue', { port: 'libres' }], ['epilogue', { port: 'enfermes' }],
  ['prologue-a', {}], ['prologue-b', {}],
]

it('joue toutes les scènes connues du convertisseur', () => {
  expect([...new Set(CAS.map(([id]) => id))].sort()).toEqual(Object.keys(SCENES).sort())
})

describe.each(CAS)('scène %s %o', (id, params) => {
  it('se joue jusqu\'au bout sans erreur et se démonte proprement', async () => {
    const onDone = vi.fn()
    const handle = await playCinematic(id, { onDone, params })
    await vi.advanceTimersByTimeAsync(120000); await flush()
    expect(handle.kit.errors).toEqual([])
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
```

Dans `tests/briefing/ids.test.js` :
- ajouter l'import `import { playCinematic, registerScene } from '../../src/briefing/index.js'` ;
- remplacer `idsDuJeu` par une lecture **récursive** de `src/` qui exclut `src/briefing` (le moteur des cinématiques, déjà décrit par `IDS_INJECTES`) — le futur `src/prologue/` sera ainsi couvert :

```js
function fichiersJs(dossier) {
  const out = []
  for (const f of readdirSync(join(RACINE, dossier), { withFileTypes: true })) {
    const chemin = dossier + '/' + f.name
    if (f.isDirectory()) { if (chemin !== 'src/briefing') out.push(...fichiersJs(chemin)) }
    else if (f.name.endsWith('.js')) out.push(chemin)
  }
  return out
}

function idsDuJeu() {
  const table = new Map()
  idsDuTexte(lire('index.html'), 'index.html', table)
  for (const f of fichiersJs('src')) idsDuTexte(lire(f), f, table)
  return table
}
```

- remplacer `idsDesScenes` pour relever **aussi les ids créés par le script de la scène** (les gabarits JS du prologue créent `ph1c`, `lg3`, `lgt`… que la lecture du `html` ne voit pas) :

```js
async function idsDesScenes() {
  const modules = import.meta.glob('../../src/briefing/scenes/*.js')
  const table = new Map()
  for (const [chemin, charger] of Object.entries(modules)) {
    const fichier = 'src/briefing/scenes/' + chemin.split('/').pop()
    const { html } = await charger()
    for (const m of html.matchAll(/\bid="([^"]+)"/g)) ajouter(table, m[1], fichier)
    // ids posés par le script au démarrage : on monte la scène, on relève le DOM, on la démonte
    registerScene('ids:' + fichier, charger)
    const root = document.createElement('div'); document.body.appendChild(root)
    const handle = await playCinematic('ids:' + fichier, { root })
    for (const el of root.querySelectorAll('[id]')) ajouter(table, el.id, fichier)
    handle.cancel(); root.remove()
  }
  return table
}
```

- dans le premier test, ajouter `'lgt'` à la liste des ids de scène attendus (il n'existe qu'à l'exécution, dans le journal de prologue-b) :

```js
    for (const id of ['scene', 'radio', 'sub', 'title', 'trans', 'wave', 'lgt']) expect(scenes.has(id), `id de scène « ${id} » non détecté`).toBe(true)
```

- [ ] **Étape 2 : vérifier l'échec** — `npx vitest run tests/scripts tests/briefing` → FAIL (`SCENES`/`generateScene` non exportés, `prologue-a` inconnu, `lgt` non détecté).

- [ ] **Étape 3 : le convertisseur** — dans `scripts/port-maquette.mjs`, remplacer la constante `SCENES` et toute la CLI (de `const SCENES = …` jusqu'à la fin) par :

```js
// id de scène du jeu → maquette (sans .html) dans docs/superpowers/maquettes/cinematiques/
export const SCENES = {
  m1: 'briefing-m1', m2: 'briefing-m2', m3: 'briefing-m3', m4: 'briefing-m4', m5: 'briefing-m5', m6: 'briefing-m6',
  epilogue: 'epilogue', 'prologue-a': 'prologue-a', 'prologue-b': 'prologue-b',
}

// Source du module de scène `id`, telle que la CLI l'écrit (repo = racine du dépôt).
export function generateScene(id, repo) {
  const file = SCENES[id]
  if (!file) throw new Error(`scène inconnue : ${id}`)
  const html = readFileSync(join(repo, 'docs', 'superpowers', 'maquettes', 'cinematiques', file + '.html'), 'utf8')
  const imgDir = join(repo, 'public', 'briefing', 'img')
  const imgExt = {}
  for (const m of html.matchAll(/img\/([a-z0-9_-]+)\.png/g)) imgExt[m[1]] = existsSync(join(imgDir, m[1] + '.jpg')) ? 'jpg' : 'png'
  return portMaquette(html, { name: file, imgExt })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
  const out = join(repo, 'src', 'briefing', 'scenes')
  mkdirSync(out, { recursive: true })
  for (const id of Object.keys(SCENES)) {
    writeFileSync(join(out, id + '.js'), generateScene(id, repo))
    console.log('scène générée :', id)
  }
}
```

- [ ] **Étape 4 : régénérer et vérifier que les scènes existantes n'ont pas bougé**

```bash
node scripts/port-maquette.mjs
git status --short src/briefing/scenes
```

Attendu : seuls `prologue-a.js` et `prologue-b.js` apparaissent (nouveaux). Si m1…m6 ou l'épilogue changent, s'arrêter et le signaler.

- [ ] **Étape 5 : le registre** — dans `src/briefing/index.js`, à la fin de l'objet `SCENES` (après `epilogue: …`) :

```js
  'prologue-a': () => import('./scenes/prologue-a.js'),
  'prologue-b': () => import('./scenes/prologue-b.js'),
```

- [ ] **Étape 6 : les captures de maquette** — dans `scripts/shots.mjs`, ajouter l'import `import { SCENES } from './port-maquette.mjs'` et remplacer la ligne `const page = …` par :

```js
if (MAQ && !SCENES[id]) { console.error(`Scène inconnue : ${id} (ids : ${Object.keys(SCENES).join(', ')})`); process.exit(1) }
const page = MAQ ? SCENES[id] + '.html' : ''
```

- [ ] **Étape 7 : vérifier** — `npx vitest run` → tout vert (au moins 75 tests). `npx vite build` → OK, avec deux chunks `prologue-a-*.js` et `prologue-b-*.js` dans `dist/assets/`. Noter leur taille.

- [ ] **Étape 8 : commiter**

```bash
git add scripts/port-maquette.mjs scripts/shots.mjs src/briefing/index.js src/briefing/scenes/prologue-a.js src/briefing/scenes/prologue-b.js tests/scripts/port-maquette.test.js tests/briefing/scenes.test.js tests/briefing/ids.test.js
git commit -m "feat(cinematiques): les deux pièces du prologue converties en scènes du jeu"
```

---

### Tâche 5 : le prologue remplace l'intro 3D

**Fichiers :**
- Modifier : `src/main.js`

**Interfaces :**
- Consomme : `markPrologueSeen`, `state.prologueSeen` (tâche 3) ; `playCinematic('prologue-a' | 'prologue-b')` (tâche 4) ; l'enveloppeur `cinematic(id, opts)`, `cinematicAudio()`, `launchLevel(n)` existants.
- Produit : plus aucune référence à `cinematic3d.js` dans `main.js` ; la valeur `'cinematic'` de `gamePhase` n'existe plus ; en dev, `window.__mem()`.

`main.js` charge Three.js et tout le DOM : pas de test unitaire. La vérification se fait au navigateur (tâche 7) ; ici, `npx vitest run` et `npx vite build` doivent passer.

- [ ] **Étape 1 : imports** — supprimer la ligne `import { startIntroCinematic, updateCinematic, isCinematicActive } from './cinematic3d.js'`. Dans l'import de `./upgrades.js`, ajouter `markPrologueSeen`.

- [ ] **Étape 2 : le bouton COMMENCER** — remplacer tout le bloc qui va de `let introShown = false` jusqu'à la fin du gestionnaire `document.getElementById('btn-start').onclick = () => { … }` par :

```js
// Prologue, une fois par campagne : A (l'offre, le 14 mars) → [plan suivant : l'enquête] → B (le rappel, le
// tableau de chasse) → mission 1, avec son briefing s'il n'a pas été vu. Chaque pièce se passe à part.
function playPrologue() {
  menuEl.style.display = 'none'
  hudEl.style.display = 'none'
  gamePhase = 'briefing'          // cinématique en motion design : pas de rendu WebGL
  clock.getDelta()
  cinematic('prologue-a', {
    audio: cinematicAudio(),      // appelé dans le clic : l'AudioContext reprend sur ce geste
    onDone: () => cinematic('prologue-b', {
      audio: cinematicAudio(),
      onDone: () => { markPrologueSeen(); saveProgress(); launchLevel(upgradeState.currentLevel) },
    }),
  })
}

document.getElementById('btn-start').onclick = () => {
  if (upgradeState.currentLevel === 1 && !upgradeState.prologueSeen) playPrologue()
  else launchLevel(upgradeState.currentLevel)
}
```

- [ ] **Étape 3 : raccourci 1-6** — dans la condition du raccourci, supprimer ` && gamePhase !== 'cinematic'`.

- [ ] **Étape 4 : la boucle** — dans `loop()`, supprimer le bloc entier :

```js
  if (gamePhase === 'cinematic') {
    updateCinematic(dt)
    renderer.render(scene, camera)
    drawScope()
    return
  }
```

- [ ] **Étape 5 : commentaires** — remplacer `// La cinématique 3D d'intro se joue après le clic sur COMMENCER (voir btn-start).` par `// Le prologue se joue après le clic sur COMMENCER, une fois par campagne (voir playPrologue).`

- [ ] **Étape 6 : aide de dev pour la mémoire** — dans le bloc `if (import.meta.env.DEV) {`, juste après la ligne `const q = new URLSearchParams(location.search)`, ajouter :

```js
  // Mémoire GPU / JS de la partie (contrôle du nettoyage, spec §6.8) : __mem() dans la console
  window.__mem = () => {
    let objets = 0; scene.traverse(() => objets++)
    const i = renderer.info
    return { geometries: i.memory.geometries, textures: i.memory.textures, programmes: i.programs ? i.programs.length : 0,
      appels: i.render.calls, triangles: i.render.triangles, objets,
      tasJSMo: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null }
  }
```

- [ ] **Étape 7 : vérifier** — `grep -n "cinematic3d\|introShown\|updateCinematic\|isCinematicActive\|'cinematic'" src/main.js` → aucune ligne. `npx vitest run` → vert. `npx vite build` → OK.

- [ ] **Étape 8 : commiter**

```bash
git add src/main.js
git commit -m "feat(cinematiques): le prologue en motion design remplace l'intro 3D"
```

---

### Tâche 6 : nettoyage de l'ancienne cinématique 3D

**Fichiers :**
- Supprimer : `src/cinematic3d.js`, `src/cutscene.js`
- Modifier : `src/audio.js`, `src/maps.js`

**Interfaces :**
- Consomme : tâche 5 (plus aucun import de `cinematic3d.js`).
- Produit : `audio.js` sans `startCinematicMusic`, `stopCinematicMusic`, `startPhoneVoice`, `stopPhoneVoice` ; tous les autres exports inchangés.

- [ ] **Étape 1 : vérifier qu'il n'y a plus d'appelant**

```bash
grep -rn "cinematic3d\|cutscene\|startCinematicMusic\|stopCinematicMusic\|startPhoneVoice\|stopPhoneVoice" src index.html electron server scripts tests
```

Attendu : seulement les définitions dans `src/cinematic3d.js`, `src/cutscene.js`, `src/audio.js`, et le commentaire de `src/pvpIntro.js` (à laisser : `pvpIntro.js` ne se modifie pas). Tout autre appelant : s'arrêter et le signaler.

- [ ] **Étape 2 : supprimer les fichiers morts**

```bash
git rm src/cinematic3d.js src/cutscene.js
```

- [ ] **Étape 3 : `src/audio.js`** — supprimer en entier les sections `// ─── Musique de cinématique (procédurale) ───` (variables `musicGain`, `musicTimer`, `ensureMusicGain`, `PROGRESSIONS`, `padNote`, `startCinematicMusic`, `stopCinematicMusic`) et `// ─── VOIX AU TÉLÉPHONE (procédurale) ───` (`phoneTimer`, `phoneGain`, `phoneCrackle`, `phoneSyllable`, `startPhoneVoice`, `stopPhoneVoice`), c'est-à-dire tout ce qui se trouve entre la fin de la section précédente et le commentaire `// ─── Ambiance de mission`. Puis, dans `startMissionAmbience`, supprimer la ligne `ensureMusicGain()` (elle ne servait à rien : `ambGain` se branche sur `master`).

- [ ] **Étape 4 : commentaires et documentation périmés** (sans toucher au code) :
  - `src/maps.js` : le commentaire de `clearMap` parle des cinématiques → `// Vide la scène de la carte courante (utilisé par la carte PvP).` ; le commentaire de `makeJeep` (« partagée : gameplay convoi + cinématiques ») → « (convoi de la mission 5) » ;
  - `README.md` (racine) : les mentions de « cinématiques 3D » (vers les lignes 6 et 33) décrivent maintenant des cinématiques en motion design « dossier du fixeur » (briefings, prologue, épilogue) ;
  - l'option `opts.match` de `spawnCharacter` (`src/characters.js`) n'a plus d'utilisateur : la laisser (inoffensive).

- [ ] **Étape 5 : vérifier**

```bash
grep -rnE "cinematic3d|cutscene|startCinematicMusic|PhoneVoice|ensureMusicGain|musicGain|'cinematic'" src index.html
npx vitest run
npx vite build
```

Attendu : le grep ne renvoie que le commentaire de `src/pvpIntro.js` ; tests verts ; build OK.

**Ce grep est obligatoire** : un appel restant à `ensureMusicGain()` ne casse **pas** le build (Vite le prend pour une globale) mais lève une `ReferenceError` dans `startMissionAmbience` au lancement de **chaque** mission, qui resterait alors bloquée sans rendu. Aucun test ne l'attraperait. Noter la taille du bundle principal `dist/assets/index-*.js` (avant ce plan : ≈ 760 kB, attendu ≈ 747 kB).

- [ ] **Étape 6 : commiter**

```bash
git add -A src/audio.js src/maps.js README.md
git commit -m "refactor: suppression de l'ancienne cinématique 3D et de sa musique"
```

---

### Tâche 7 (contrôleur) : vérification

- [ ] Captures jeu contre maquette (`node scripts/shots.mjs prologue-a …` et `MAQUETTE=1 node scripts/shots.mjs prologue-a …`, idem `prologue-b`) aux instants des tâches 1 et 2 ; comparer paire par paire.
- [ ] Parcours dans le navigateur intégré, sauvegarde vide : COMMENCER → A → B → briefing M1 → mission 1. Puis : passer A (Échap) mène à B ; passer B mène au briefing M1 ; `prologueSeen` vrai dans `sniper-save` ; recharger, COMMENCER au niveau 1 → pas de prologue ; RECOMMENCER L'HISTOIRE → le prologue revient ; REPRENDRE au niveau ≥ 2 → pas de prologue ; touches 1-6 bloquées pendant le prologue ; volume 0 → muet.
- [ ] Lancer au moins deux missions jusqu'au jeu (HUD, PNJ, tir) après la tâche 6 : `startMissionAmbience` doit tourner sans erreur dans la console.
- [ ] Mémoire : même relevé qu'à la tâche 0, avec `__mem()` ; comparer et consigner.
- [ ] Poids : chunks du prologue et bundle principal, comparés à la tâche 0 ; budget total < 1,5 Mo.
- [ ] Revue finale de la branche (modèle le plus capable), vague de correction si besoin, puis fusion dans `main` et push (accord de Rayan : « fusionne dans le main », « push sur github dès que c'est bon »).
