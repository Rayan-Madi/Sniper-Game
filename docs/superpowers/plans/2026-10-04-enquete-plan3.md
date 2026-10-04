# Cinématiques — Plan 3 : l'enquête jouable du prologue

> **Pour les agents :** sous-compétence requise : superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans. Les étapes utilisent des cases (`- [ ]`).

**But :** entre les cinématiques `prologue-a` et `prologue-b`, le joueur fouille son appartement en vue à la première personne, examine 6 indices (fiches « dossier du fixeur »), puis trouve son téléphone et écoute le message d'Anton, ce qui lance `prologue-b`.

**Architecture :** un module `src/prologue/` chargé à la demande. Une `THREE.Scene` dédiée, rendue par le `renderer` et la `camera` partagés du jeu, contient l'appartement : géométrie procédurale fusionnée par matériau, aucun modèle ni image externe. Une machine à états pure, un contrôleur FPS, une visée par rayon et un module de son sont orchestrés par `investigation.js`, qui pose une interface DOM par-dessus le canvas. `main.js` ajoute la phase `'investigation'` et un enveloppeur qui garantit qu'on enchaîne toujours sur `prologue-b`.

**Pile :** Three.js 0.185 (`mergeGeometries` depuis `three/examples/jsm/utils/BufferGeometryUtils.js`), Vite 8, Vitest 5 + jsdom (sans WebGL), Web Audio procédural (`src/briefing/sound.js`).

**Spec :** `docs/superpowers/specs/2026-10-04-enquete-design.md` (validée par Rayan), qui complète `docs/superpowers/specs/2026-10-02-cinematiques-design.md` (§5, §6.7, §8). Rapports d'analyse vérifiés : `.superpowers/sdd/2026-10-04-enquete/understand-*.md` (lire leurs sections « Vérification adversariale »).

## Contraintes globales

- Budgets pendant l'enquête : **< 60 appels de dessin** (passes d'ombre comprises) et **< 50 000 triangles** ; **une seule** lumière avec `castShadow` (une `SpotLight`, carte 1024), `renderer.shadowMap.autoUpdate = false` pendant l'enquête avec un `needsUpdate = true` au départ, puis la valeur d'origine restaurée ; nombre de lumières fixe (les clignotements passent par l'intensité ou l'émissif).
- Aucun modèle de personnage, aucun corps visible : deux formes sous un drap, du sang au sol, le doudou.
- Aucune image ni modèle chargé depuis le réseau : textures dessinées en canvas (`THREE.CanvasTexture`).
- Les touches de déplacement viennent de `settings.pvpKeys` (codes physiques, **relus à chaque événement**, jamais copiés) ; la souris respecte `sensMultiplier()` et `invertY()` de `src/settings.js`.
- Tout est libéré à la sortie : géométries, matériaux, textures, carte d'ombre (`light.shadow.dispose()`), sons, minuteurs, écouteurs, DOM, style injecté ; la caméra partagée (fov, near, far, position, rotation, ordre) et `renderer.shadowMap.autoUpdate` sont restaurés.
- Ids DOM de l'enquête préfixés `enq-` (le test `tests/briefing/ids.test.js` lit `src/` récursivement et refuse toute collision avec les ids des scènes de cinématique).
- Les géométries fusionnées doivent être **toutes indexées** (Box, Plane, Cylinder, Sphere, Capsule, Circle, Cone le sont) : pas de polyèdres (Octahedron, Icosahedron…), non indexés, qui font échouer `mergeGeometries`.
- `src/pvpIntro.js` et les scènes générées `src/briefing/scenes/*.js` ne se modifient pas.
- Commits : messages en français dans le style du dépôt, terminés par la ligne exacte `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Les implémenteurs ne poussent pas.
- Windows : Chrome sans interface exige un chemin **absolu** pour `--screenshot=` et un `--user-data-dir` jetable.

## Repère et plan de l'appartement (mètres)

x vers la droite, z vers le joueur au départ (le joueur regarde vers −z), y vers le haut ; sol y = 0, plafond y = 2,6 ; murs de 0,12 m d'épaisseur centrés sur leur ligne.

| Pièce | Emprise | Ouvertures |
|---|---|---|
| Palier | x 5–7, z 7–8,5 | porte d'entrée sur z = 7, x 5,55–6,45 (h 2,05), gond en x 5,6 : battant **entrouvert à 30°** vers l'intérieur au départ, que `openDoor()` ouvre à **100°** en 1,6 s (au premier verrouillage, avec le grincement) ; sa collision est celle de la position ouverte |
| Entrée | x 4,5–7,5, z 4,5–7 | vers le salon : mur x = 7,5, z 5,0–6,6 (h 2,2) ; vers le couloir : mur x = 4,5, z 4,6–5,7 (h 2,2) ; porte de la cuisine **fermée** sur z = 4,5, x 5,6–6,5 |
| Salon | x 7,5–12,5, z 1–7 | grande fenêtre sur x = 12,5, z 2–6, allège 0,9, linteau 2,3 (meneaux en z 3,33 et 4,67, traverse à 1,6) |
| Couloir | x 0,5–4,5, z 4,5–5,8 | vers la chambre de la petite : mur z = 4,5, x 2,0–2,9 (h 2,05) ; porte des parents **fermée** sur z = 5,8, x 1,5–2,4 |
| Chambre de la petite | x 0,5–4,5, z 0,8–4,5 | fenêtre sur z = 0,8, x 1,4–3,2, allège 1,0, linteau 2,2 |
| Cuisine, chambre des parents | fermées | non modélisées à l'intérieur |

**Départ :** x 6,0, z 7,85, lacet 0 (regard vers −z, la porte et sa serrure en face), tangage −0,05.

---

### Tâche 1 : les données et la machine à états

**Fichiers :**
- Créer : `src/prologue/clues.js`, `src/prologue/state.js`
- Test : `tests/prologue/state.test.js`

**Interfaces :**
- Produit : `CLUES` (6 objets `{ id, n, lieu, titre, viktor, piste, citation?, acouphene? }`), `PHONE` (`{ id: 'telephone', lieu, titre, seuil: 4, verrouille, appels: [{ de, heure, note }], viktor: [string, string], piste, action }`) ; `createInvestigationState({ clues, phone, anchors, hintDelay = 40, found = [] })` → objet avec `mode` (`'exploring' | 'examining' | 'paused' | 'done'`), `count`, `total`, `phoneUnlocked`, `current`, `result`, `has(id)`, `examine(id)`, `close()`, `pause()`, `resume()`, `finish(reason)`, `tick(dt, pos)`, `hint(pos)`.
- `examine(id)` renvoie `{ type: 'clue', clue, first, count, total }`, `{ type: 'phone-locked', line }`, `{ type: 'phone', phone }` ou `null`.

- [ ] **Étape 1 : écrire les tests** — `tests/prologue/state.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { CLUES, PHONE } from '../../src/prologue/clues.js'
import { createInvestigationState } from '../../src/prologue/state.js'

describe('données de l\'enquête', () => {
  it('six indices numérotés de 1 à 6, ids uniques, une phrase de Viktor et une piste chacun', () => {
    expect(CLUES.map(c => c.n)).toEqual([1, 2, 3, 4, 5, 6])
    expect(new Set(CLUES.map(c => c.id)).size).toBe(6)
    for (const c of CLUES) { expect(c.viktor.length).toBeGreaterThan(5); expect(c.piste.length).toBeGreaterThan(3); expect(c.lieu).toMatch(/^[A-ZÀ-Ü' ]+$/) }
    expect(CLUES.find(c => c.id === 'mot').citation).toBe('Tu aurais dû dire oui.')
    expect(CLUES.find(c => c.id === 'corps').acouphene).toBe(true)
  })

  it('le téléphone s\'ouvre à 4 indices, montre deux appels manqués et deux phrases', () => {
    expect(PHONE.id).toBe('telephone')
    expect(PHONE.seuil).toBe(4)
    expect(PHONE.appels.map(a => `${a.de} · ${a.heure}`)).toEqual(['06 39 98 41 07 · 18:52', 'MAISON · 19:04'])
    expect(PHONE.viktor).toEqual(['Ce jour-là, j\'avais oublié mon téléphone.', 'Elle m\'a appelé. Il était là, en silencieux.'])
    expect(PHONE.verrouille).toBe('Pas encore… Je dois comprendre ce qui s\'est passé.')
  })
})

describe('machine à états', () => {
  it('examiner un indice ouvre sa fiche et ne le compte qu\'une fois', () => {
    const s = createInvestigationState()
    const r = s.examine('serrure')
    expect(r).toMatchObject({ type: 'clue', first: true, count: 1, total: 6 })
    expect(r.clue.id).toBe('serrure')
    expect(s.mode).toBe('examining')
    s.close()
    expect(s.mode).toBe('exploring')
    expect(s.examine('serrure')).toMatchObject({ type: 'clue', first: false, count: 1 })
    expect(s.count).toBe(1)
  })

  it('le téléphone reste verrouillé avant 4 indices, sans ouvrir de fiche', () => {
    const s = createInvestigationState()
    for (const id of ['serrure', 'lutte', 'corps']) { s.examine(id); s.close() }
    expect(s.examine('telephone')).toEqual({ type: 'phone-locked', line: PHONE.verrouille })
    expect(s.mode).toBe('exploring')
    expect(s.phoneUnlocked).toBe(false)
  })

  it('à 4 indices, le téléphone ouvre sa fiche', () => {
    const s = createInvestigationState()
    for (const id of ['serrure', 'lutte', 'corps', 'doudou']) { s.examine(id); s.close() }
    expect(s.phoneUnlocked).toBe(true)
    expect(s.examine('telephone')).toEqual({ type: 'phone', phone: PHONE })
    expect(s.mode).toBe('examining')
    expect(s.current).toBe('telephone')
  })

  it('on n\'examine rien pendant une fiche, une pause ou après la fin ; un id inconnu ne fait rien', () => {
    const s = createInvestigationState()
    expect(s.examine('inconnu')).toBeNull()
    s.examine('serrure')
    expect(s.examine('lutte')).toBeNull()
    s.close(); s.pause()
    expect(s.examine('lutte')).toBeNull()
    s.resume(); s.finish('skipped')
    expect(s.examine('lutte')).toBeNull()
  })

  it('pause et reprise reviennent au mode d\'avant (fiche ouverte comprise)', () => {
    const s = createInvestigationState()
    s.examine('photo'); s.pause()
    expect(s.mode).toBe('paused')
    s.resume()
    expect(s.mode).toBe('examining')
  })

  it('finish ne se fait qu\'une fois et garde la première raison', () => {
    const s = createInvestigationState()
    expect(s.finish('listened')).toBe(true)
    expect(s.finish('skipped')).toBe(false)
    expect(s.mode).toBe('done')
    expect(s.result).toBe('listened')
  })

  it('une piste arrive après 40 s d\'exploration sans découverte, vers l\'indice non vu le plus proche', () => {
    const anchors = { serrure: { x: 6, z: 7 }, lutte: { x: 7, z: 6 }, corps: { x: 10.6, z: 4.8 }, photo: { x: 11, z: 6.3 }, mot: { x: 9.6, z: 3 }, doudou: { x: 2.1, z: 3.3 }, telephone: { x: 4.8, z: 6.2 } }
    const s = createInvestigationState({ anchors })
    s.examine('serrure'); s.close()
    expect(s.tick(39, { x: 6, z: 6.5 })).toBeNull()
    expect(s.tick(1.5, { x: 6, z: 6.5 })).toBe(CLUES.find(c => c.id === 'lutte').piste)
    expect(s.tick(39, { x: 2, z: 4 })).toBeNull()             // le compteur repart de zéro après une piste
    expect(s.tick(2, { x: 2, z: 4 })).toBe(CLUES.find(c => c.id === 'doudou').piste)
  })

  it('sans ancres ni position, la piste suit l\'ordre des indices', () => {
    const s = createInvestigationState()
    s.examine('serrure'); s.close()
    expect(s.hint()).toBe(CLUES[1].piste)
  })

  it('la piste désigne le téléphone dès qu\'il est déverrouillé', () => {
    const s = createInvestigationState()
    for (const id of ['serrure', 'lutte', 'corps', 'mot']) { s.examine(id); s.close() }
    expect(s.hint({ x: 2, z: 3 })).toBe(PHONE.piste)
  })

  it('trouver un indice remet à zéro l\'attente de la piste ; pas de piste pendant une fiche ou une pause', () => {
    const s = createInvestigationState()
    s.tick(30)
    s.examine('lutte'); s.close()
    expect(s.tick(30)).toBeNull()
    s.examine('photo')
    expect(s.tick(100)).toBeNull()
    s.close(); s.pause()
    expect(s.tick(100)).toBeNull()
  })

  it('found pré-valide des indices (route de développement)', () => {
    const s = createInvestigationState({ found: ['serrure', 'lutte', 'corps', 'photo', 'inconnu'] })
    expect(s.count).toBe(4)
    expect(s.phoneUnlocked).toBe(true)
  })
})
```

- [ ] **Étape 2 : vérifier l'échec** — `npx vitest run tests/prologue/state.test.js` → FAIL (modules absents).

- [ ] **Étape 3 : `src/prologue/clues.js`**

```js
// Enquête du prologue — les 6 indices et le téléphone (spec docs/superpowers/specs/2026-10-04-enquete-design.md §2).
export const CLUES = [
  { id: 'serrure', n: 1, lieu: 'LE PALIER', titre: 'LA SERRURE', viktor: 'Ils n\'ont pas sonné. Ils ont fait sauter la serrure.', piste: 'La porte…' },
  { id: 'lutte', n: 2, lieu: 'L\'ENTRÉE', titre: 'LES TRACES DE LUTTE', viktor: 'Elle s\'est défendue.', piste: 'L\'entrée… tout est renversé.' },
  { id: 'corps', n: 3, lieu: 'LE SALON', titre: 'ELLES', viktor: 'Elles étaient là. Ma femme. Ma fille.', piste: 'Le salon…', acouphene: true },
  { id: 'photo', n: 4, lieu: 'LE SALON', titre: 'LA PHOTO', viktor: 'Elles n\'avaient rien fait. C\'est moi qui avais dit non.', piste: 'Près de l\'étagère…' },
  { id: 'mot', n: 5, lieu: 'LE SALON', titre: 'LE MOT', citation: 'Tu aurais dû dire oui.', viktor: 'Ils voulaient que je sache.', piste: 'La table basse…' },
  { id: 'doudou', n: 6, lieu: 'LA CHAMBRE DE LA PETITE', titre: 'LE DOUDOU', viktor: 'Elle ne dormait jamais sans lui.', piste: 'La chambre de la petite…' },
]

export const PHONE = {
  id: 'telephone', lieu: 'L\'ENTRÉE', titre: 'LE TÉLÉPHONE', seuil: 4,
  verrouille: 'Pas encore… Je dois comprendre ce qui s\'est passé.',
  appels: [
    { de: '06 39 98 41 07', heure: '18:52', note: 'MANQUÉ · 1 MESSAGE' },
    { de: 'MAISON', heure: '19:04', note: 'MANQUÉ' },
  ],
  viktor: ['Ce jour-là, j\'avais oublié mon téléphone.', 'Elle m\'a appelé. Il était là, en silencieux.'],
  piste: 'Mon téléphone… dans l\'entrée.',
  action: 'ÉCOUTER LE MESSAGE',
}
```

- [ ] **Étape 4 : `src/prologue/state.js`**

```js
// Machine à états de l'enquête, sans rendu ni DOM : ce qui est trouvé, ce qui est ouvert, la piste à murmurer.
// Modes : 'exploring' (on se déplace), 'examining' (fiche ouverte), 'paused', 'done'.
import { CLUES, PHONE } from './clues.js'

export function createInvestigationState({ clues = CLUES, phone = PHONE, anchors = {}, hintDelay = 40, found = [] } = {}) {
  const known = new Set(clues.map(c => c.id))
  const s = { mode: 'exploring', found: new Set(found.filter(id => known.has(id))), current: null, result: null, idle: 0, before: null }

  const api = {
    get mode() { return s.mode },
    get count() { return s.found.size },
    get total() { return clues.length },
    get phoneUnlocked() { return s.found.size >= phone.seuil },
    get current() { return s.current },
    get result() { return s.result },
    has: id => s.found.has(id),

    // examiner l'objet visé : ce que l'interface doit montrer, ou null si rien ne se passe
    examine(id) {
      if (s.mode !== 'exploring') return null
      if (id === phone.id) {
        if (!api.phoneUnlocked) { s.idle = 0; return { type: 'phone-locked', line: phone.verrouille } }
        s.mode = 'examining'; s.current = phone.id
        return { type: 'phone', phone }
      }
      const clue = clues.find(c => c.id === id)
      if (!clue) return null
      const first = !s.found.has(id)
      s.found.add(id); s.idle = 0
      s.mode = 'examining'; s.current = id
      return { type: 'clue', clue, first, count: s.found.size, total: clues.length }
    },
    close() { if (s.mode === 'examining') { s.mode = 'exploring'; s.current = null; s.idle = 0 } },
    pause() { if (s.mode === 'exploring' || s.mode === 'examining') { s.before = s.mode; s.mode = 'paused' } },
    resume() { if (s.mode === 'paused') { s.mode = s.before; s.before = null } },
    finish(reason) { if (s.mode === 'done') return false; s.mode = 'done'; s.result = reason; return true },

    // à chaque image : une piste quand on explore depuis hintDelay secondes sans rien trouver, sinon null
    tick(dt, pos = null) {
      if (s.mode !== 'exploring') return null
      s.idle += dt
      if (s.idle < hintDelay) return null
      s.idle = 0
      return api.hint(pos)
    },
    // le téléphone dès qu'il est déverrouillé, sinon l'indice non vu le plus proche (ou le premier dans l'ordre)
    hint(pos = null) {
      if (api.phoneUnlocked) return phone.piste
      const rest = clues.filter(c => !s.found.has(c.id))
      if (!rest.length) return phone.piste
      if (!pos) return rest[0].piste
      const d = c => { const a = anchors[c.id]; return a ? Math.hypot(a.x - pos.x, a.z - pos.z) : Infinity }
      return rest.reduce((best, c) => (d(c) < d(best) ? c : best)).piste
    },
  }
  return api
}
```

- [ ] **Étape 5 : vérifier** — `npx vitest run tests/prologue/state.test.js` → PASS.

- [ ] **Étape 6 : commiter**

```bash
git add src/prologue/clues.js src/prologue/state.js tests/prologue/state.test.js
git commit -m "feat(enquete): les indices et la machine à états" -- src/prologue/clues.js src/prologue/state.js tests/prologue/state.test.js
```

---

### Tâche 2 : le déplacement à la première personne

**Fichiers :**
- Créer : `src/prologue/fpsController.js`
- Test : `tests/prologue/fpsController.test.js`

**Interfaces :**
- Produit : `forwardOf(yaw) → { x, z }`, `rightOf(yaw) → { x, z }`, `moveCircle(pos, dx, dz, r, boxes) → { x, z }` (boîtes `{ minX, maxX, minZ, maxZ }`), et `createFpsController({ camera, colliders, start, eye = 1.65, speed = 1.6, radius = 0.28, onStep, onUnlock, target = document })` → `{ position, yaw, pitch, frozen, enable(), disable(), lock(el), setFrozen(v), setPose({ x, y?, z, yaw, pitch }), update(dt), dispose() }`.
- Convention : caméra en ordre `'YXZ'`, `camera.rotation.set(pitch, yaw, 0)` ; lacet 0 = regard vers −z ; lacet positif = tourner à gauche ; tangage négatif = regarder vers le bas.
- **Attention :** le contre-tueur du PvP a un vecteur « droite » faux (`pvp.js:625`, D va à gauche) : ne pas le recopier. Le test l'empêche.

- [ ] **Étape 1 : écrire les tests** — `tests/prologue/fpsController.test.js` :

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { forwardOf, rightOf, moveCircle, createFpsController } from '../../src/prologue/fpsController.js'
import { settings } from '../../src/settings.js'

const close = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1e-6)
let lockEl = null
beforeEach(() => {
  lockEl = null
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockEl })
  settings.pvpKeys = { forward: 'KeyW', left: 'KeyA', back: 'KeyS', right: 'KeyD', ability1: 'Digit1', ability2: 'Digit2', ability3: 'Digit3', emote: 'KeyE' }
  settings.sensitivity = 100; settings.invertY = false
})
afterEach(() => { delete document.pointerLockElement })
const key = (type, code) => document.dispatchEvent(new KeyboardEvent(type, { code }))
const mouse = (dx, dy) => { const e = new Event('mousemove'); Object.assign(e, { movementX: dx, movementY: dy }); document.dispatchEvent(e) }
const lock = v => { lockEl = v ? document.body : null; document.dispatchEvent(new Event('pointerlockchange')) }

describe('vecteurs au sol', () => {
  it('lacet 0 : avant = −z, droite = +x (D va bien à droite)', () => {
    close(forwardOf(0).x, 0); close(forwardOf(0).z, -1)
    close(rightOf(0).x, 1); close(rightOf(0).z, 0)
  })
  it('lacet π/2 (tourné à gauche) : avant = −x, droite = −z', () => {
    close(forwardOf(Math.PI / 2).x, -1); close(forwardOf(Math.PI / 2).z, 0)
    close(rightOf(Math.PI / 2).x, 0); close(rightOf(Math.PI / 2).z, -1)
  })
})

describe('collisions cercle contre boîtes', () => {
  const wall = { minX: 1, maxX: 1.2, minZ: -5, maxZ: 5 }
  it('se déplace librement sans obstacle', () => { expect(moveCircle({ x: 0, z: 0 }, 0.3, -0.2, 0.25, [])).toEqual({ x: 0.3, z: -0.2 }) })
  it('ne traverse pas un mur', () => { expect(moveCircle({ x: 0, z: 0 }, 2, 0, 0.25, [wall]).x).toBeLessThanOrEqual(1 - 0.25) })
  it('glisse le long du mur quand on le prend en biais', () => {
    const p = moveCircle({ x: 0.7, z: 0 }, 0.3, -0.5, 0.25, [wall])
    expect(p.x).toBeLessThanOrEqual(0.75); close(p.z, -0.5)
  })
})

describe('contrôleur', () => {
  const make = (extra = {}) => {
    const camera = new THREE.PerspectiveCamera()
    const c = createFpsController({ camera, colliders: [], start: { x: 0, z: 0, yaw: 0 }, ...extra })
    c.enable()
    return { c, camera }
  }

  it('place la caméra à hauteur des yeux, en ordre YXZ', () => {
    const { camera, c } = make()
    c.update(0.016)
    close(camera.position.y, 1.65)
    expect(camera.rotation.order).toBe('YXZ')
    c.dispose()
  })

  it('avance avec la touche de settings.pvpKeys, relue à chaque appui (remappage)', () => {
    const { c } = make()
    settings.pvpKeys.forward = 'KeyZ'          // remappage après création : doit être pris en compte
    key('keydown', 'KeyZ'); c.update(1)
    expect(c.position.z).toBeCloseTo(-1.6, 5)
    key('keyup', 'KeyZ'); c.update(1)
    expect(c.position.z).toBeCloseTo(-1.6, 5)
    c.dispose()
  })

  it('les flèches marchent aussi ; la droite va vers +x', () => {
    const { c } = make()
    key('keydown', 'ArrowRight'); c.update(0.5)
    expect(c.position.x).toBeCloseTo(0.8, 5)
    c.dispose()
  })

  it('la diagonale n\'est pas plus rapide', () => {
    const { c } = make()
    key('keydown', 'KeyW'); key('keydown', 'KeyD'); c.update(1)
    expect(Math.hypot(c.position.x, c.position.z)).toBeCloseTo(1.6, 5)
    c.dispose()
  })

  it('figé (fiche ouverte), on ne bouge plus et les touches tenues sont relâchées', () => {
    const { c } = make()
    key('keydown', 'KeyW'); c.setFrozen(true); c.update(1)
    expect(c.position.z).toBe(0)
    c.setFrozen(false); c.update(1)
    expect(c.position.z).toBe(0)
    c.dispose()
  })

  it('la souris ne tourne la vue que pointeur verrouillé ; sensibilité et inversion appliquées', () => {
    const { c } = make()
    mouse(100, 0)
    expect(c.yaw).toBe(0)
    lock(true); mouse(100, 50)
    close(c.yaw, -100 * 0.0022); close(c.pitch, -50 * 0.0022)
    settings.sensitivity = 200; settings.invertY = true; mouse(0, 10)
    close(c.pitch, -50 * 0.0022 + 10 * 0.0022 * 2)
    c.dispose()
  })

  it('le tangage est borné', () => {
    const { c } = make(); lock(true); mouse(0, 100000)
    expect(c.pitch).toBeGreaterThanOrEqual(-1.4)
    c.dispose()
  })

  it('perdre le verrou appelle onUnlock et relâche les touches', () => {
    const onUnlock = vi.fn()
    const { c } = make({ onUnlock })
    lock(true); key('keydown', 'KeyW'); lock(false)
    expect(onUnlock).toHaveBeenCalledTimes(1)
    c.update(1)
    expect(c.position.z).toBe(0)
    c.dispose()
  })

  it('appelle onStep tous les 0,75 m de marche', () => {
    const onStep = vi.fn()
    const { c } = make({ onStep })
    key('keydown', 'KeyW'); for (let i = 0; i < 100; i++) c.update(0.016)   // 1,6 m/s × 1,6 s ≈ 2,56 m
    expect(onStep).toHaveBeenCalledTimes(3)
    c.dispose()
  })

  it('après dispose, plus aucun écouteur ne réagit', () => {
    const onUnlock = vi.fn()
    const { c } = make({ onUnlock })
    c.dispose()
    key('keydown', 'KeyW'); c.update(1); lock(true); lock(false)
    expect(c.position.z).toBe(0)
    expect(onUnlock).not.toHaveBeenCalled()
  })

  it('les collisions s\'appliquent au déplacement', () => {
    const camera = new THREE.PerspectiveCamera()
    const c = createFpsController({ camera, colliders: [{ minX: -5, maxX: 5, minZ: -1.2, maxZ: -1 }], start: { x: 0, z: 0, yaw: 0 } })
    c.enable(); key('keydown', 'KeyW'); c.update(2)
    expect(c.position.z).toBeGreaterThanOrEqual(-1 + 0.28 - 1e-3)
    c.dispose()
  })

  it('lock() demande le verrouillage du pointeur sur l\'élément fourni (s\'il le permet)', () => {
    const { c } = make()
    const el = document.createElement('canvas'); el.requestPointerLock = vi.fn()
    c.lock(el)
    expect(el.requestPointerLock).toHaveBeenCalled()
    expect(() => c.lock(document.createElement('div'))).not.toThrow()
    c.dispose()
  })
})
```

- [ ] **Étape 2 : vérifier l'échec** — `npx vitest run tests/prologue/fpsController.test.js` → FAIL.

- [ ] **Étape 3 : `src/prologue/fpsController.js`**

```js
// Déplacement à la première personne de l'enquête : touches de settings.pvpKeys (codes physiques, relues à chaque
// événement) et flèches, souris en verrouillage du pointeur, collisions d'un cercle contre des boîtes au sol.
// Caméra en ordre 'YXZ' : lacet 0 = regard vers −z, lacet positif = à gauche, tangage négatif = vers le bas.
import { settings, sensMultiplier, invertY } from '../settings.js'

const LOOK = 0.0022            // radians par pixel de souris à sensibilité 100
const PITCH_MAX = 1.4
const STEP_EVERY = 0.75        // mètres entre deux bruits de pas

export const forwardOf = yaw => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) })
export const rightOf = yaw => ({ x: Math.cos(yaw), z: -Math.sin(yaw) })

// Avance un cercle de rayon r de (dx, dz), axe par axe, en glissant le long des boîtes. Le test se fait sur tout le
// trajet de l'axe (pas seulement l'arrivée) : un grand pas ne traverse pas un mur fin. Une boîte dans laquelle on se
// trouve déjà ne retient pas (on peut toujours en sortir).
export function moveCircle(pos, dx, dz, r, boxes) {
  let x = pos.x + dx
  if (dx) for (const b of boxes) {
    if (pos.z + r <= b.minZ || pos.z - r >= b.maxZ) continue
    if (dx > 0 && pos.x + r <= b.minX && x + r > b.minX) x = b.minX - r
    else if (dx < 0 && pos.x - r >= b.maxX && x - r < b.maxX) x = b.maxX + r
  }
  let z = pos.z + dz
  if (dz) for (const b of boxes) {
    if (x + r <= b.minX || x - r >= b.maxX) continue
    if (dz > 0 && pos.z + r <= b.minZ && z + r > b.minZ) z = b.minZ - r
    else if (dz < 0 && pos.z - r >= b.maxZ && z - r < b.maxZ) z = b.maxZ + r
  }
  return { x, z }
}

export function createFpsController({ camera, colliders = [], start = { x: 0, z: 0, yaw: 0 }, eye = 1.65, speed = 1.6, radius = 0.28,
  onStep = () => {}, onUnlock = () => {}, target = document } = {}) {
  const pos = { x: start.x, z: start.z }
  let yaw = start.yaw || 0, pitch = start.pitch || 0, y = eye, frozen = false, enabled = false, walked = 0, sinceStep = 0
  const held = new Set()
  camera.rotation.order = 'YXZ'

  const actionOf = code => {
    const k = settings.pvpKeys
    if (code === k.forward || code === 'ArrowUp') return 'f'
    if (code === k.back || code === 'ArrowDown') return 'b'
    if (code === k.left || code === 'ArrowLeft') return 'l'
    if (code === k.right || code === 'ArrowRight') return 'r'
    return null
  }
  const locked = () => !!document.pointerLockElement
  const onDown = e => { const a = actionOf(e.code); if (a && !frozen) held.add(a) }
  const onUp = e => { const a = actionOf(e.code); if (a) held.delete(a) }
  const onMove = e => {
    if (frozen || !locked()) return
    const s = LOOK * sensMultiplier()
    yaw -= (e.movementX || 0) * s
    pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch - (e.movementY || 0) * s * invertY()))
  }
  const onLock = () => { if (!locked()) { held.clear(); onUnlock() } }

  const api = {
    get position() { return pos },
    get yaw() { return yaw },
    get pitch() { return pitch },
    get frozen() { return frozen },
    enable() {
      if (enabled) return
      enabled = true
      target.addEventListener('keydown', onDown); target.addEventListener('keyup', onUp)
      target.addEventListener('mousemove', onMove); target.addEventListener('pointerlockchange', onLock)
    },
    disable() {
      if (!enabled) return
      enabled = false; held.clear()
      target.removeEventListener('keydown', onDown); target.removeEventListener('keyup', onUp)
      target.removeEventListener('mousemove', onMove); target.removeEventListener('pointerlockchange', onLock)
    },
    lock(el) { if (el && typeof el.requestPointerLock === 'function') { try { el.requestPointerLock() } catch (e) { /* refusé */ } } },
    setFrozen(v) { frozen = !!v; if (frozen) held.clear() },
    setPose(p) { pos.x = p.x; pos.z = p.z; if (p.y != null) y = p.y; if (p.yaw != null) yaw = p.yaw; if (p.pitch != null) pitch = p.pitch },
    update(dt) {
      let mx = 0, mz = 0
      if (!frozen && held.size) {
        const f = forwardOf(yaw), r = rightOf(yaw)
        const fw = (held.has('f') ? 1 : 0) - (held.has('b') ? 1 : 0), st = (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0)
        mx = f.x * fw + r.x * st; mz = f.z * fw + r.z * st
        const len = Math.hypot(mx, mz)
        if (len > 0) { mx = mx / len * speed * dt; mz = mz / len * speed * dt }
      }
      if (mx || mz) {
        const n = moveCircle(pos, mx, mz, radius, colliders)
        const d = Math.hypot(n.x - pos.x, n.z - pos.z)
        pos.x = n.x; pos.z = n.z; walked += d; sinceStep += d
        while (sinceStep >= STEP_EVERY) { sinceStep -= STEP_EVERY; onStep() }
      }
      const bob = held.size && !frozen ? Math.sin(walked * Math.PI * 2 / 1.5) * 0.025 : 0
      camera.position.set(pos.x, y + bob, pos.z)
      camera.rotation.set(pitch, yaw, 0, 'YXZ')
    },
    dispose() { api.disable() },
  }
  return api
}
```

Note : le test « figé » attend que `setFrozen(false)` ne relance pas une touche tenue avant le gel (elle a été relâchée par `setFrozen(true)` ; `onDown` ignore aussi les appuis pendant le gel).

- [ ] **Étape 4 : vérifier** — `npx vitest run tests/prologue/fpsController.test.js` → PASS. Si un test de pas ou de vitesse échoue d'un epsilon, corriger l'implémentation, pas le test.

- [ ] **Étape 5 : commiter**

```bash
git add src/prologue/fpsController.js tests/prologue/fpsController.test.js
git commit -m "feat(enquete): déplacement à la première personne et collisions" -- src/prologue/fpsController.js tests/prologue/fpsController.test.js
```

---

### Tâche 3 : l'appartement

**Fichiers :**
- Créer : `src/prologue/apartment.js`, `dev/enquete-decor.html`, `dev/enquete-decor.js`
- Modifier : `tests/setup.js` (faux contexte 2D de canvas pour jsdom)
- Test : `tests/prologue/apartment.test.js`

**Interfaces :**
- Produit : `buildApartment()` → `{ group, colliders, targets, occluders, anchors, start, lights, openDoor(), update(dt), stats(), dispose() }` :
  - `openDoor()` : lance l'ouverture animée du battant de la porte d'entrée (30° → 100° en 1,6 s, animée par `update`) ; le battant est un maillage à part (il bouge), sa collision est d'emblée celle de la position ouverte ;
  - **seuls les gros éléments ont une collision** : murs, portes fermées, battant ouvert, console, canapé, table basse, étagère, radiateur, lit, table de chevet, coffre à jouets, et les formes sous le drap. Les petits objets au sol (porte-manteau, veste, éclats, chaise renversée, cadre, mot, doudou, copeaux) n'en ont pas : ils ne doivent jamais bloquer un passage ;
  - `group` : `THREE.Group` à ajouter à la scène (contient aussi les lumières) ;
  - `colliders` : boîtes `{ minX, maxX, minZ, maxZ }` (murs, meubles, portes fermées, battant de la porte d'entrée, les corps) ;
  - `targets` : 7 `Object3D` (6 indices + téléphone), chacun avec `userData.clueId` (`serrure`, `lutte`, `corps`, `photo`, `mot`, `doudou`, `telephone`) ; leurs matériaux sont **propres à chaque cible** (clonés) et ont une propriété `emissive` (MeshLambert / MeshStandard) ;
  - `occluders` : les maillages fusionnés des murs et des portes (pour que la visée ne traverse pas) ;
  - `anchors` : `{ [clueId]: { x, z } }` ;
  - `start` : `{ x: 6.0, z: 7.85, yaw: 0, pitch: -0.05 }` ;
  - `lights` : `{ spot }` (la seule lumière avec ombre) ;
  - `update(dt)` : anime la pluie et le grésillement du plafonnier du palier ;
  - `stats()` : `{ drawables, triangles }` = nombre d'objets visibles qui coûtent un appel de dessin (Mesh, Points, Line) et somme de leurs triangles (`index.count / 3`, ou `position.count / 3` sans index ; Points : 0) ;
  - `dispose()` : libère géométries, matériaux, textures (dont `material.map`), `spot.shadow.dispose()`, vide le groupe.

- [ ] **Étape 1 : faux contexte 2D pour jsdom** — ajouter à la fin de `tests/setup.js` (jsdom n'a pas de canvas 2D ; les textures de l'appartement sont dessinées en canvas) :

```js
// Contexte 2D minimal : assez pour que les textures en canvas se dessinent « à vide » sous jsdom.
if (typeof HTMLCanvasElement !== 'undefined') {
  const noop = () => {}
  const gradient = () => ({ addColorStop: noop })
  const ctx2d = canvas => new Proxy({ canvas, measureText: () => ({ width: 10 }), createLinearGradient: gradient, createRadialGradient: gradient,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }), createPattern: () => null }, {
    get: (t, k) => (k in t ? t[k] : noop),
    set: (t, k, v) => { t[k] = v; return true },
  })
  HTMLCanvasElement.prototype.getContext = function (type) { return type === '2d' ? (this.__ctx2d ||= ctx2d(this)) : null }
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,'
}
```

- [ ] **Étape 2 : écrire les tests** — `tests/prologue/apartment.test.js` :

```js
import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { buildApartment } from '../../src/prologue/apartment.js'
import { moveCircle } from '../../src/prologue/fpsController.js'
import { CLUES, PHONE } from '../../src/prologue/clues.js'

const IDS = [...CLUES.map(c => c.id), PHONE.id]
const inside = (p, b) => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ
// marche en ligne droite par petits pas, comme le contrôleur
const walk = (apt, from, to, steps = 400) => {
  let p = { ...from }
  for (let i = 0; i < steps; i++) p = moveCircle(p, (to.x - from.x) / steps, (to.z - from.z) / steps, 0.28, apt.colliders)
  return p
}

describe('l\'appartement', () => {
  it('tient le budget : moins de 60 objets dessinés et de 50 000 triangles', () => {
    const apt = buildApartment()
    const { drawables, triangles } = apt.stats()
    expect(drawables).toBeLessThan(60)
    expect(triangles).toBeLessThan(50000)
    apt.dispose()
  })

  it('une seule lumière projette une ombre : la lampe renversée', () => {
    const apt = buildApartment()
    const casters = []; apt.group.traverse(o => { if (o.isLight && o.castShadow) casters.push(o) })
    expect(casters).toEqual([apt.lights.spot])
    expect(apt.lights.spot.isSpotLight).toBe(true)
    apt.dispose()
  })

  it('chaque indice et le téléphone ont une cible visable, une ancre, et des matériaux à eux seuls (avec émissif)', () => {
    const apt = buildApartment()
    expect(apt.targets.map(t => t.userData.clueId).sort()).toEqual([...IDS].sort())
    const owner = new Map()   // matériau → indice qui l'utilise : la surbrillance d'un indice ne doit rien allumer d'autre
    for (const t of apt.targets) {
      expect(apt.anchors[t.userData.clueId]).toBeDefined()
      t.traverse(o => {
        for (const m of [].concat(o.material || [])) {
          expect(m.emissive, t.userData.clueId).toBeDefined()
          expect(owner.get(m) ?? t.userData.clueId).toBe(t.userData.clueId)
          owner.set(m, t.userData.clueId)
        }
      })
    }
    apt.group.traverse(o => {
      let inTarget = false
      for (let p = o; p; p = p.parent) if (p.userData && p.userData.clueId) inTarget = true
      if (!inTarget) for (const m of [].concat(o.material || [])) expect(owner.has(m)).toBe(false)
    })
    apt.dispose()
  })

  it('la porte d\'entrée s\'ouvre sans erreur', () => {
    const apt = buildApartment()
    apt.openDoor()
    expect(() => { for (let i = 0; i < 30; i++) apt.update(0.1) }).not.toThrow()
    apt.dispose()
  })

  it('le départ est sur le palier et hors de toute collision', () => {
    const apt = buildApartment()
    expect(apt.start).toMatchObject({ x: 6, z: 7.85, yaw: 0 })
    for (const b of apt.colliders) expect(inside(apt.start, b)).toBe(false)
    apt.dispose()
  })

  it('on passe la porte d\'entrée, l\'arche du salon, le couloir et la porte de la chambre', () => {
    const apt = buildApartment()
    expect(walk(apt, { x: 6.0, z: 7.85 }, { x: 6.0, z: 5.8 }).z).toBeLessThan(6.0)        // porte d'entrée
    expect(walk(apt, { x: 6.0, z: 5.8 }, { x: 8.6, z: 5.8 }).x).toBeGreaterThan(8.3)       // arche du salon
    expect(walk(apt, { x: 5.2, z: 5.15 }, { x: 2.45, z: 5.15 }).x).toBeLessThan(2.7)       // couloir
    expect(walk(apt, { x: 2.45, z: 5.15 }, { x: 2.45, z: 3.6 }).z).toBeLessThan(3.9)       // chambre de la petite
    apt.dispose()
  })

  it('les murs et les portes fermées arrêtent le joueur', () => {
    const apt = buildApartment()
    expect(walk(apt, { x: 10, z: 4 }, { x: 14, z: 4 }).x).toBeLessThan(12.5)              // fenêtre du salon
    expect(walk(apt, { x: 6.05, z: 5.4 }, { x: 6.05, z: 3.0 }).z).toBeGreaterThan(4.5)     // porte de la cuisine
    expect(walk(apt, { x: 1.95, z: 5.15 }, { x: 1.95, z: 7.0 }).z).toBeLessThan(5.8)       // porte des parents
    apt.dispose()
  })

  it('les ancres des indices sont accessibles (à moins de 1,5 m d\'un point atteignable)', () => {
    const apt = buildApartment()
    const reach = { serrure: { x: 6.0, z: 7.6 }, lutte: { x: 6.4, z: 6.0 }, corps: { x: 9.6, z: 5.6 }, photo: { x: 10.6, z: 6.3 }, mot: { x: 9.5, z: 4.2 }, doudou: { x: 2.45, z: 3.9 }, telephone: { x: 5.4, z: 6.3 } }
    for (const id of IDS) {
      const a = apt.anchors[id]
      expect(Math.hypot(a.x - reach[id].x, a.z - reach[id].z), id).toBeLessThan(1.5)
      for (const b of apt.colliders) expect(inside(reach[id], b), `${id} : point d'accès dans une collision`).toBe(false)
    }
    apt.dispose()
  })

  it('dispose libère géométries, matériaux, textures et la carte d\'ombre', () => {
    const apt = buildApartment()
    const geos = new Set(), mats = new Set(), maps = new Set()
    apt.group.traverse(o => {
      if (o.geometry) geos.add(o.geometry)
      for (const m of [].concat(o.material || [])) { mats.add(m); if (m.map) maps.add(m.map) }
    })
    const spies = [...geos, ...mats, ...maps].map(x => vi.spyOn(x, 'dispose'))
    const shadow = vi.spyOn(apt.lights.spot.shadow, 'dispose')
    apt.dispose()
    for (const s of spies) expect(s).toHaveBeenCalled()
    expect(shadow).toHaveBeenCalled()
    expect(apt.group.children.length).toBe(0)
  })

  it('update anime sans erreur', () => {
    const apt = buildApartment()
    expect(() => { for (let i = 0; i < 10; i++) apt.update(0.016) }).not.toThrow()
    apt.dispose()
  })
})
```

- [ ] **Étape 3 : vérifier l'échec** — `npx vitest run tests/prologue/apartment.test.js` → FAIL.

- [ ] **Étape 4 : écrire `src/prologue/apartment.js`**

Structure imposée :

```js
// L'appartement des Kane, le soir du 14 mars (spec docs/superpowers/specs/2026-10-04-enquete-design.md §3-4).
// Géométrie procédurale FUSIONNÉE PAR MATÉRIAU (un appel de dessin par matériau), objets d'indice séparés et visables,
// lumière : nuit bleue par les fenêtres + la lampe renversée (seule ombre) + la veilleuse de la chambre.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
```

Outils à écrire (code imposé) :

```js
// Texture dessinée en canvas ; sans contexte 2D (jamais en jeu), la texture reste blanche et unie.
function canvasTexture(w, h, draw, { repeat = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d'); if (g) draw(g, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]) }
  return t
}

// Générateur pseudo-aléatoire de la maquette (même graine que la ville des cinématiques : 7)
function makeRnd(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 } }

// Rassemble des géométries par matériau, puis fusionne : un maillage par matériau.
function createBatcher() {
  const buckets = new Map()   // matériau → géométries déjà transformées
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3()
  return {
    // geo : géométrie indexée ; place : { x, y, z, rx, ry, rz, sx, sy, sz }
    add(mat, geo, place = {}) {
      const g = geo.clone()
      m4.compose(p.set(place.x || 0, place.y || 0, place.z || 0), q.setFromEuler(e.set(place.rx || 0, place.ry || 0, place.rz || 0)),
        s.set(place.sx ?? 1, place.sy ?? 1, place.sz ?? 1))
      g.applyMatrix4(m4)
      if (!buckets.has(mat)) buckets.set(mat, [])
      buckets.get(mat).push(g)
      geo.dispose()
    },
    box(mat, cx, cy, cz, w, h, d, place = {}) { this.add(mat, new THREE.BoxGeometry(w, h, d), { x: cx, y: cy, z: cz, ...place }) },
    // un maillage par matériau ; castShadow / receiveShadow selon les options du matériau (mat.userData)
    finish(parent) {
      const meshes = []
      for (const [mat, list] of buckets) {
        const merged = mergeGeometries(list, false); list.forEach(g => g.dispose())
        const mesh = new THREE.Mesh(merged, mat)
        mesh.castShadow = !!mat.userData.cast; mesh.receiveShadow = mat.userData.receive !== false
        parent.add(mesh); meshes.push(mesh)
      }
      buckets.clear()
      return meshes
    },
  }
}
```

Contenu à construire (toutes les cotes en mètres, voir « Repère et plan de l'appartement » en tête de plan) :

1. **Matériaux statiques** (`MeshLambertMaterial`, un appel de dessin chacun) — couleurs de départ, à ajuster à l'œil sur les captures :
   `parquet` (0x6a4e36, texture de lattes en canvas 256×256, répétée), `carrelage` du palier (0x3b3e44), `mur` (0x8c877d), `murEnfant` (0x9b8fa2), `plafond` (0x1a1c22), `boisSombre` (0x3a2a1e : portes, console, étagère, table basse, cadres), `boisClair` (0x9a7a58 : lit), `tissu` (0x2f3440 : canapé, rideaux), `tapis` (0x4a2a24), `tissuRose` (0x8a5a6a : couverture, tapis rond), `blanc` (0xb8b4ac : oreiller, radiateur), `livres` (0x5a4a3a), `metal` (0x6a6e76 : pied de lampe, poignées, menuiseries). Les murs et les portes forment les `occluders`. `mat.userData.cast = true` seulement pour les meubles du salon (canapé, table, étagère) ; les murs reçoivent l'ombre.
2. **Murs** : un outil `wall(x1, z1, x2, z2, openings)` qui pose des boîtes de 0,12 m d'épaisseur et 2,6 m de haut le long d'un segment horizontal ou vertical, en laissant les ouvertures (`{ from, to, bottom = 0, top }`) : morceaux pleins de part et d'autre, linteau au-dessus, allège en dessous. Chaque morceau plein ajoute aussi sa boîte à `colliders`. Murs à poser :
   - palier : x = 5 et x = 7 (z 7 → 8,5), z = 8,5 (x 5 → 7) ;
   - entrée : z = 7 (x 4,5 → 7,5) avec la porte d'entrée (x 5,55–6,45, top 2,05) ; z = 4,5 (x 4,5 → 7,5) plein (la porte de cuisine est un battant collé dessus) ; x = 7,5 (z 1 → 7) avec l'arche (z 5,0–6,6, top 2,2) ; x = 4,5 (z 4,5 → 7) avec l'ouverture du couloir (z 4,6–5,7, top 2,2) ;
   - salon : z = 1 (x 7,5 → 12,5), z = 7 (x 7,5 → 12,5), x = 12,5 (z 1 → 7) avec la fenêtre (z 2–6, bottom 0,9, top 2,3) ;
   - couloir : x = 0,5 (z 4,5 → 5,8) ; z = 5,8 (x 0,5 → 4,5) plein (porte des parents collée dessus) ; z = 4,5 (x 0,5 → 4,5) avec la porte de la chambre (x 2,0–2,9, top 2,05) ;
   - chambre de la petite : x = 0,5 (z 0,8 → 4,5), x = 4,5 (z 0,8 → 4,5), z = 0,8 (x 0,5 → 4,5) avec la fenêtre (x 1,4–3,2, bottom 1,0, top 2,2).
3. **Sols et plafonds** : boîtes fines (0,02) par pièce ; plafond à 2,6 (`plafond`) partout.
4. **Portes** : battant de la porte d'entrée (0,9 × 2,05 × 0,045, `boisSombre`) : un `Object3D` pivot au gond (5,6 ; 0 ; 6,97), le battant décalé de +0,45 en x local, `pivot.rotation.y` = 30° au départ, animé jusqu'à 100° par `openDoor()` + `update` (rotation.y = θ envoie le x local vers (cos θ, 0, −sin θ) : le battant entre dans l'entrée) ; sa boîte de collision est celle du battant à 100° (le long de x ≈ 5,45–5,6, z ≈ 6,08–6,97) ; portes fermées (cuisine sur z = 4,5 à x 5,6–6,5 ; parents sur z = 5,8 à x 1,5–2,4) : battants légèrement en saillie + poignées `metal`.
5. **Mobilier** (à placer, collisions incluses) :
   - entrée : console contre x = 4,5, centre (4,78, 0,42, 6,35), 0,42 × 0,84 × 0,9 ; un vide-poche ; un miroir sombre au mur au-dessus ;
   - salon : tapis (9,6 ; 3,4) 3,2 × 2,4 ; canapé contre z = 1 (assise centre (9,4 ; 0,23 ; 1,75) 2,2 × 0,46 × 0,85, dossier, accoudoirs ; collision x 8,15–10,65, z 1,2–2,2) ; table basse (9,5 ; 0,2 ; 3,1) 1,1 × 0,4 × 0,6 ; étagère contre z = 7, centre (11,2 ; 0,95 ; 6,82) 1,4 × 1,9 × 0,3, quelques livres ; radiateur sous la fenêtre ; rideaux sombres de part et d'autre de la fenêtre ; une chaise renversée près de l'arche, hors du passage (8,0 ; 6,65), sans collision ;
   - **la lampe sur pied renversée** : pied couché de (8,1 ; 0,03 ; 2,6) vers (8,3 ; 0,15 ; 3,95), abat-jour conique ouvert au bout, matériau émissif chaud (0xffb070) ; une `SpotLight(0xffa860)` placée dans l'abat-jour, visant les corps (10,8 ; 0,3 ; 4,8), angle ≈ 0,85, pénombre 0,6, portée 9, `castShadow`, `shadow.mapSize` 1024, `shadow.bias` −0,0006 — elle doit projeter de longues ombres du canapé et des formes sous le drap sur le mur de droite ;
   - chambre de la petite : lit (2,3 ; 0,2 ; 1,75) 0,95 × 0,4 × 1,8 avec couverture rose et oreiller ; table de chevet (3,0 ; 0,25 ; 1,1) avec une veilleuse en étoile (émissif rose) et une `PointLight(0xffb0c8, 0,6, 4)` sans ombre ; coffre à jouets (1,0 ; 0,2 ; 3,9) ; tapis rond rose (2,4 ; 2,9) ;
   - couloir : tapis de passage, un cadre au mur.
6. **Fenêtres et ville** : vitres (plans légèrement bleutés, `transparent`, opacité 0,18, sans ombre), menuiseries ; derrière chaque fenêtre un grand plan `MeshBasicMaterial` (non éclairé) portant la **ville de nuit** dessinée en canvas 1024×512 avec `makeRnd(7)` (ciel en dégradé 0x04060c → 0x2a2230, immeubles 0x141b2b / 0x0a0e18, fenêtres allumées ambre 0xf2b36b, blanc bleuté 0xcfe0ff ou rouge 0xff7a5a, voir la fonction `city()` de `docs/superpowers/maquettes/cinematiques/prologue-b.html`) : salon en x = 16 face à −x (24 × 14), chambre en z = −3 face à +z (20 × 12). La même texture sert aux deux plans.
7. **Pluie** : un seul `THREE.Points` (≈ 700 gouttes) réparti dans deux volumes, devant la ville du salon (x 12,7–15,5, y 0–4,5, z 1,5–6,5) et devant celle de la chambre (x 1–3,6, y 0–4,5, z −2,5–0,6) ; `PointsMaterial` 0xaabbdd, taille 0,03, opacité 0,55 ; `update(dt)` fait tomber les gouttes (≈ 7 m/s) et les recycle en haut.
8. **Lumières d'ambiance** (sans ombre) : `AmbientLight(0x1a2233, 0,9)` ; `DirectionalLight(0x6f86b8, 0,45)` depuis la fenêtre du salon (position (20 ; 6 ; 4), cible (8 ; 0 ; 4)) ; plafonnier du palier = plan émissif qui grésille dans `update` (émissif seulement, pas de lumière). Total : 4 lumières, fixe.
9. **Objets d'indice** (chacun : un `THREE.Group` avec `userData.clueId`, matériaux **clonés** propres à lui, ajouté à `targets`, ancre = sa position au sol) :
   - `serrure` : sur le chambranle côté gâche de la porte d'entrée (x ≈ 6,45, y ≈ 1,0, z ≈ 7,0) : éclats de bois clair arrachés (petites boîtes en biais), gâche métallique pendante, copeaux au sol devant la porte ;
   - `lutte` : dans l'entrée vers (7,0 ; 6,0) : porte-manteau couché en diagonale (cylindre fin 1,8 m + socle), veste au sol (boîte aplatie vert sombre), éclats de vase (5 à 7 petites boîtes blanc bleuté) ;
   - `corps` : deux formes sous un drap vers (10,6 ; 4,8) : adulte = `CapsuleGeometry(0.2, 1.3, 6, 12)` **écrasée en hauteur puis couchée** (`g.scale(0.55, 1, 1); g.rotateZ(Math.PI / 2)` — l'échelle est appliquée avant la rotation, voir la vérification adversariale de `understand-contenu-appartement.md`), enfant = `CapsuleGeometry(0.15, 0.75, 6, 12)` traitée pareil, à côté ; un drap crème (0xcfc8bd, `MeshLambertMaterial`) fait de ces formes + un plan au sol qui déborde ; taches de sang sur le drap ; **flaque de sang** au sol (plan avec une texture canvas de taches irrégulières rouge très sombre, `transparent`) et une traînée vers l'arche ; collision autour (x 9,7–11,6, z 4,1–5,5) ;
   - `photo` : au sol devant l'étagère (11,0 ; 0,015 ; 6,3) : cadre en bois sombre 0,32 × 0,24 et photo en texture canvas (coucher de soleil sur la mer, une mère et sa fille en silhouette, main dans la main — palette du symbole `pro-fam` des maquettes : ciel 0xf8dba8 → 0x7a3a22, mer 0x8a4a2e → 0x3a1d14) **avec le verre fêlé** (fissures blanches en étoile dessinées sur la texture), éclats de verre autour ;
   - `mot` : sur la table basse (9,6 ; 0,405 ; 3,05) : feuille 0,21 × 0,15, texture canvas papier écrit à la main « Tu aurais dû dire oui. » (encre sombre, `italic 30px Georgia`, légère inclinaison) ;
   - `doudou` : par terre dans la chambre (2,1 ; 0,07 ; 3,3) : lapin couché sur le flanc (corps et tête en sphères, deux longues oreilles en capsules), beige rosé 0xc9b8a8, fusionné en un maillage ;
   - `telephone` : sur la console (4,78 ; 0,855 ; 6,2), dalle noire 0,075 × 0,01 × 0,155 et écran sombre (émissif de base 0x0b1220 : noter cette valeur dans `material.userData.baseEmissive` pour que la surbrillance puisse la restaurer).
10. **`stats()`** et **`dispose()`** comme dans l'interface.

Le résultat doit être **beau** : c'est la scène la plus marquante du jeu. Après les tests, l'étape 6 sert à régler couleurs, intensités et placement à l'œil.

- [ ] **Étape 5 : vérifier** — `npx vitest run tests/prologue/apartment.test.js` → PASS ; `npx vitest run` → tout vert.

- [ ] **Étape 6 : page de décor et réglage à l'œil**

`dev/enquete-decor.html` (hors build : Vite ne construit que `index.html`) :

```html
<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Décor de l'enquête (dev)</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}canvas{display:block}#stats{position:fixed;left:8px;bottom:8px;font:12px monospace;color:#8fd19e}</style>
</head><body><canvas id="c"></canvas><div id="stats"></div><script type="module" src="./enquete-decor.js"></script></body></html>
```

`dev/enquete-decor.js` : crée un `WebGLRenderer` sur `#c` avec **les réglages du jeu** (`antialias`, `shadowMap.enabled`, `PCFShadowMap`, `ACESFilmicToneMapping`, exposition 1,35, `setPixelRatio(min(devicePixelRatio, 2))`), une `PerspectiveCamera(72, w/h, 0.05, 40)` en ordre `'YXZ'` placée par `?cam=x,y,z,lacet,tangage` (défaut : `start` à hauteur 1,65), une `THREE.Scene` (fond 0x05070c, `Fog(0x05070c, 6, 22)`) avec `buildApartment().group`, `shadowMap.autoUpdate = false` + `needsUpdate = true`, et une boucle `requestAnimationFrame` qui appelle `update(dt)` et rend ; avec `?stats=1`, afficher `renderer.info.render.calls` et `.triangles` dans `#stats`.

Captures (le serveur du jeu tourne sur 5173 ; pour chaque vue, `--virtual-time-budget=3000`) :

```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader --hide-scrollbars --user-data-dir="<dossier temporaire>" --window-size=1280,720 --virtual-time-budget=3000 --screenshot="C:/Users/Rayan/dev/Sniper-Game/shots/decor-depart.png" "http://localhost:5173/dev/enquete-decor.html?stats=1&cam=6,1.65,7.85,0,-0.05"
```

Vues à capturer et à regarder : `depart` (6 ; 1,65 ; 7,85 ; 0 ; −0,05), `entree` (6,2 ; 1,65 ; 6,4 ; 1,2 ; −0,25), `salon` (8,0 ; 1,65 ; 6,2 ; −0,95 ; −0,15), `corps` (9,4 ; 1,65 ; 5,8 ; −1,1 ; −0,5), `fenetre` (9,0 ; 1,65 ; 3,5 ; −1,57 ; 0), `chambre` (2,45 ; 1,65 ; 4,4 ; 0 ; −0,25), `doudou` (2,45 ; 1,65 ; 4,0 ; 0,4 ; −0,7). Critères : ambiance de nuit lisible (on distingue les volumes, rien n'est noir d'encre ni délavé), la lampe renversée découpe des ombres longues, la ville et la pluie se voient par les fenêtres, chaque indice est reconnaissable à 1–2 m, rien ne flotte ni ne traverse un mur, `appels` < 60. Ajuster couleurs, intensités et placements jusqu'à ce que ce soit vraiment réussi ; relancer les tests après chaque réglage.

- [ ] **Étape 7 : commiter**

```bash
git add src/prologue/apartment.js dev/enquete-decor.html dev/enquete-decor.js tests/setup.js tests/prologue/apartment.test.js
git commit -m "feat(enquete): l'appartement, fusionné par matériau" -- src/prologue/apartment.js dev/enquete-decor.html dev/enquete-decor.js tests/setup.js tests/prologue/apartment.test.js
```

---

### Tâche 4 : la visée

**Fichiers :**
- Créer : `src/prologue/interact.js`
- Test : `tests/prologue/interact.test.js`

**Interfaces :**
- Consomme : la convention `userData.clueId` sur les cibles (tâche 3) ; un matériau peut porter `userData.baseEmissive` (sinon 0).
- Produit : `createInteract({ camera, targets, occluders = [], range = 2.2, glow = 0x3a2410 })` → `{ update() → clueId | null, current, clear() }`.

- [ ] **Étape 1 : écrire les tests** — `tests/prologue/interact.test.js` :

```js
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createInteract } from '../../src/prologue/interact.js'

function setup({ targetZ = -1.5, wallZ = null } = {}) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 50)   // à l'origine, regard vers −z
  const group = new THREE.Group(); group.userData.clueId = 'mot'; group.position.z = targetZ
  const mat = new THREE.MeshLambertMaterial(); mat.userData.baseEmissive = 0x050505; mat.emissive.setHex(0x050505)
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat))
  scene.add(group)
  const occluders = []
  if (wallZ != null) { const w = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.1), new THREE.MeshLambertMaterial()); w.position.z = wallZ; scene.add(w); occluders.push(w) }
  scene.updateMatrixWorld(true)
  return { camera, group, mat, interact: createInteract({ camera, targets: [group], occluders }) }
}

describe('la visée', () => {
  it('repère la cible au centre de l\'écran, même par un enfant du groupe, et l\'illumine', () => {
    const { interact, mat } = setup()
    expect(interact.update()).toBe('mot')
    expect(interact.current).toBe('mot')
    expect(mat.emissive.getHex()).toBe(0x3a2410)
  })
  it('hors de portée, rien', () => { expect(setup({ targetZ: -3 }).interact.update()).toBeNull() })
  it('un mur devant la cible la cache', () => { expect(setup({ wallZ: -0.8 }).interact.update()).toBeNull() })
  it('détourner le regard éteint la surbrillance et restaure l\'émissif de base', () => {
    const { interact, camera, mat } = setup()
    interact.update()
    camera.rotation.y = Math.PI / 2; camera.updateMatrixWorld()
    expect(interact.update()).toBeNull()
    expect(mat.emissive.getHex()).toBe(0x050505)
  })
  it('clear() éteint tout', () => {
    const { interact, mat } = setup()
    interact.update(); interact.clear()
    expect(interact.current).toBeNull()
    expect(mat.emissive.getHex()).toBe(0x050505)
  })
})
```

- [ ] **Étape 2 : vérifier l'échec** — `npx vitest run tests/prologue/interact.test.js` → FAIL.

- [ ] **Étape 3 : `src/prologue/interact.js`**

```js
// Visée de l'enquête : un rayon part du centre de l'écran ; on retient le premier objet touché s'il appartient à
// une cible (userData.clueId) à portée. Les murs (occluders) arrêtent le rayon. La cible visée s'illumine.
import * as THREE from 'three'

export function createInteract({ camera, targets, occluders = [], range = 2.2, glow = 0x3a2410 }) {
  const ray = new THREE.Raycaster()
  const center = new THREE.Vector2(0, 0)
  const all = [...targets, ...occluders]
  let current = null

  const idOf = obj => { for (let o = obj; o; o = o.parent) if (o.userData && o.userData.clueId) return o.userData.clueId; return null }
  const setGlow = (id, on) => {
    const t = targets.find(x => x.userData.clueId === id)
    if (!t) return
    t.traverse(o => {
      for (const m of [].concat(o.material || [])) if (m.emissive) m.emissive.setHex(on ? glow : (m.userData.baseEmissive || 0))
    })
  }

  return {
    get current() { return current },
    update() {
      camera.updateMatrixWorld()
      ray.setFromCamera(center, camera)
      ray.near = 0; ray.far = range
      const hit = ray.intersectObjects(all, true)[0]
      const id = hit ? idOf(hit.object) : null
      if (id !== current) { if (current) setGlow(current, false); if (id) setGlow(id, true); current = id }
      return current
    },
    clear() { if (current) setGlow(current, false); current = null },
  }
}
```

- [ ] **Étape 4 : vérifier** — `npx vitest run tests/prologue/interact.test.js` → PASS.

- [ ] **Étape 5 : commiter**

```bash
git add src/prologue/interact.js tests/prologue/interact.test.js
git commit -m "feat(enquete): la visée par rayon et la surbrillance" -- src/prologue/interact.js tests/prologue/interact.test.js
```

---

### Tâche 5 : le son de l'enquête

**Fichiers :**
- Créer : `src/prologue/ambience.js`
- Test : `tests/prologue/ambience.test.js`

**Interfaces :**
- Consomme : `createSound(audio, { at, every, stopEvery })` de `src/briefing/sound.js` (tone, noise, heart, glitch, voice('inner'), stopVoice, destroy) ; `estimate(text)` de `src/briefing/kit.js`.
- Produit : `createAmbience(audio)` (audio = `{ ctx, dest }` ou `null`) → `{ start(), setProximity(p), step(), tinnitus(), glitch(ms, p), speak(text) → ms, stop() }`. Sans contexte ou contexte non « running » : tout est muet, rien ne lève.

- [ ] **Étape 1 : écrire les tests** — `tests/prologue/ambience.test.js` :

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAmbience } from '../../src/prologue/ambience.js'
import { estimate } from '../../src/briefing/kit.js'

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
beforeEach(() => vi.useFakeTimers(FAKE))
afterEach(() => vi.useRealTimers())

const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() })
const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), gain: param(), frequency: param(), Q: param(), loop: false, buffer: null })
function fakeAudio(state = 'running') {
  const ctx = { state, currentTime: 0, sampleRate: 100,
    createGain: vi.fn(node), createOscillator: vi.fn(node), createBufferSource: vi.fn(node), createBiquadFilter: vi.fn(node),
    createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(200) })) }
  return { ctx, dest: node() }
}

describe('le son de l\'enquête', () => {
  it('sans contexte audio, tout est muet et ne laisse aucun minuteur', async () => {
    const a = createAmbience(null)
    a.start(); a.setProximity(0.5); a.step(); a.tinnitus(); a.glitch(200, 0.7)
    expect(a.speak('Elle s\'est défendue.')).toBe(estimate('Elle s\'est défendue.'))
    await vi.advanceTimersByTimeAsync(5000)
    a.stop(); await vi.advanceTimersByTimeAsync(500)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('la pluie est une boucle continue branchée sur la destination du jeu', () => {
    const audio = fakeAudio()
    const a = createAmbience(audio); a.start()
    const loops = audio.ctx.createBufferSource.mock.results.map(r => r.value).filter(s => s.loop)
    expect(loops.length).toBeGreaterThanOrEqual(1)
    expect(audio.dest.connect).not.toHaveBeenCalled()   // ce sont les nœuds qui se branchent sur dest, pas l'inverse
    const gains = audio.ctx.createGain.mock.results.map(r => r.value)
    expect(gains.some(g => g.connect.mock.calls.some(([d]) => d === audio.dest))).toBe(true)
    a.stop()
  })

  it('le cœur bat plus vite près du salon', async () => {
    const count = async p => {
      const audio = fakeAudio(); const a = createAmbience(audio); a.start(); a.setProximity(p)
      const before = audio.ctx.createOscillator.mock.calls.length
      await vi.advanceTimersByTimeAsync(10000)
      const n = audio.ctx.createOscillator.mock.calls.length - before
      a.stop(); await vi.advanceTimersByTimeAsync(500)
      return n
    }
    expect(await count(1)).toBeGreaterThan(await count(0))
  })

  it('speak fait parler Viktor le temps estimé, puis se tait', async () => {
    const audio = fakeAudio(); const a = createAmbience(audio)
    const ms = a.speak('Ils voulaient que je sache.')
    expect(ms).toBe(estimate('Ils voulaient que je sache.'))
    await vi.advanceTimersByTimeAsync(ms + 50)
    const n = audio.ctx.createOscillator.mock.calls.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(audio.ctx.createOscillator.mock.calls.length).toBe(n)     // plus de syllabes après la réplique
    a.stop()
  })

  it('stop() coupe tout : nœuds débranchés après le fondu, aucun minuteur restant, idempotent', async () => {
    const audio = fakeAudio(); const a = createAmbience(audio)
    a.start(); a.speak('Elle ne dormait jamais sans lui.')
    a.stop(); a.stop()
    await vi.advanceTimersByTimeAsync(400)
    const gains = audio.ctx.createGain.mock.results.map(r => r.value).filter(g => g.connect.mock.calls.some(([d]) => d === audio.dest))
    for (const g of gains) expect(g.disconnect).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    a.start(); a.step()                                              // après l'arrêt : sans effet, sans erreur
    expect(vi.getTimerCount()).toBe(0)
  })
})
```

- [ ] **Étape 2 : vérifier l'échec** — `npx vitest run tests/prologue/ambience.test.js` → FAIL.

- [ ] **Étape 3 : `src/prologue/ambience.js`**

```js
// Son de l'enquête : pluie continue, cœur qui accélère à l'approche du salon, grincement de la porte, pas feutrés,
// acouphène, voix intérieure de Viktor. Tout passe par la destination du jeu (son volume général s'applique).
import { createSound } from '../briefing/sound.js'
import { estimate } from '../briefing/kit.js'

export function createAmbience(audio) {
  const timers = new Set(), intervals = new Set()
  let dead = false, started = false, proximity = 0
  const at = (ms, fn) => { const h = setTimeout(() => { timers.delete(h); if (!dead) fn() }, ms); timers.add(h); return h }
  const every = (ms, fn) => { const h = setInterval(() => { if (!dead) fn() }, ms); intervals.add(h); return h }
  const stopEvery = h => { clearInterval(h); intervals.delete(h) }
  const S = createSound(audio, { at, every, stopEvery })
  const c = audio && audio.ctx ? audio.ctx : null
  const live = () => !dead && !!c && c.state === 'running'

  // pluie : bruit en boucle filtré, tenu tant que l'enquête dure
  let rain = null
  function startRain() {
    if (!live() || rain) return
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true
    const band = c.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1400; band.Q.value = 0.5
    const high = c.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 380
    const g = c.createGain(); g.gain.value = 0.0001
    src.connect(band); band.connect(high); high.connect(g); g.connect(audio.dest)
    try { g.gain.linearRampToValueAtTime(0.06, c.currentTime + 2) } catch (e) { /* contexte fermé */ }
    src.start()
    rain = { src, g }
  }

  // cœur : un battement, puis le suivant d'autant plus tôt qu'on est près (1,15 s → 0,65 s)
  const heartLoop = () => { if (dead) return; S.heart(); at(1150 - 500 * proximity, heartLoop) }

  return {
    start() {
      if (dead || started) return
      started = true
      startRain()
      S.noise(1.6, 0.07, 520, 'bandpass', 0, 9, 240); S.tone(95, 'sawtooth', 1.3, 0.03, 0, 70)   // la porte grince
      at(900, heartLoop)
    },
    setProximity(p) { proximity = Math.max(0, Math.min(1, p || 0)) },
    step() { S.noise(0.07, 0.1, 420, 'lowpass'); S.tone(68, 'sine', 0.09, 0.12) },
    tinnitus() { S.tone(6900, 'sine', 4.6, 0.035); S.tone(7350, 'sine', 4, 0.018, 0.3) },
    glitch(ms = 200, p = 0.7) { S.glitch(ms, p) },
    speak(text) { const ms = estimate(text); if (!dead) { S.voice('inner', true); at(ms, () => S.stopVoice()) } return ms },
    stop() {
      if (dead) return
      S.destroy(); dead = true
      timers.forEach(clearTimeout); timers.clear(); intervals.forEach(clearInterval); intervals.clear()
      if (rain) {
        const { src, g } = rain; rain = null
        try { g.gain.setTargetAtTime(0.0001, c.currentTime, 0.08) } catch (e) { /* contexte fermé */ }
        setTimeout(() => { try { src.stop() } catch (e) { /* déjà arrêtée */ } try { g.disconnect() } catch (e) { /* déjà débranché */ } }, 300)
      }
    },
  }
}
```

- [ ] **Étape 4 : vérifier** — `npx vitest run tests/prologue/ambience.test.js` → PASS.

- [ ] **Étape 5 : commiter**

```bash
git add src/prologue/ambience.js tests/prologue/ambience.test.js
git commit -m "feat(enquete): pluie, cœur, pas et voix intérieure" -- src/prologue/ambience.js tests/prologue/ambience.test.js
```

---

### Tâche 6 : le chef d'orchestre et l'interface

**Fichiers :**
- Créer : `src/prologue/investigation.js`, `src/prologue/enquete.css`
- Test : `tests/prologue/investigation.test.js`

**Interfaces :**
- Consomme : tâches 1 à 5 (`CLUES`, `PHONE`, `createInvestigationState`, `createFpsController`, `buildApartment`, `createInteract`, `createAmbience`).
- Produit : `startInvestigation({ renderer, camera, audio = null, root = document.body, onDone, options = {} })` → `{ scene, update(dt), stop(), debug }` ; `onDone({ result: 'listened' | 'skipped' | 'error', error? })` appelé **une seule fois**, jamais pendant l'appel de `startInvestigation` (erreurs de démarrage : démontage puis `queueMicrotask(() => onDone({ result: 'error', error }))`). `options` : `indices` (nombre d'indices pré-trouvés, dans l'ordre de `CLUES`), `cam` (`{ x, y, z, yaw, pitch }` : caméra figée, pas de verrouillage, carte de départ masquée, pour les captures), `ouvrir` (id d'indice ou `'telephone'` à examiner dès le départ), `stats` (affiche appels de dessin et triangles). `debug` = `{ state, apartment, interact, controller }` (tests et route de dev).

Déroulé à implémenter :

1. **Démarrage** : `buildApartment()` ; `scene = new THREE.Scene()` (fond 0x05070c, `Fog(0x05070c, 6, 22)`), `scene.add(apartment.group)` ; sauvegarde de la caméra (`fov`, `near`, `far`, `position`, `quaternion`, `rotation.order`) et de `renderer.shadowMap.autoUpdate` ; caméra `fov 72`, `near 0.05`, `far 40`, `updateProjectionMatrix()` ; `renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true` ; précompilation `renderer.compile(scene, camera)` dans un `try` ; état (`anchors: apartment.anchors`, `found: CLUES.slice(0, options.indices).map(c => c.id)`), contrôleur (`start: apartment.start`, `colliders`, `onStep: () => amb.step()`, `onUnlock: () => pause()`), visée (`targets`, `occluders`), son.
2. **Interface** : style `enquete.css` injecté (`import css from './enquete.css?raw'`, `<style id="enq-css">`, retiré au démontage) ; racine `<div id="enq-root" class="enq">` dans `root`, avec :
   `.enq-fx` (`.enq-scan`, `.enq-vig`, `.enq-grain`) ; `#enq-count` (« INDICES <b>n</b> / 6 ») ; `#enq-time` (« <i>●</i> 14/03 · 21:47 ») ; `.enq-cross` (point central, classe `on` quand une cible est visée) ; `#enq-prompt` (« <b>E</b> — EXAMINER ») ; `#enq-sub` (sous-titres : `span.spk` « VIKTOR » + `span.tx` tapé) ; `#enq-card` (carte de départ : « 14 MARS · 21:47 », trait rouge, ligne des commandes, « CLIQUER POUR COMMENCER ») ; `#enq-fiche` (voir 4) ; `#enq-pause` (« PAUSE », boutons `#enq-resume` « REPRENDRE » et `#enq-skip` « PASSER L'ENQUÊTE ») ; `#enq-black` (noir qui s'efface en 0,9 s au départ et revient à la fin) ; `#enq-stats` si `options.stats`.
   Ligne des commandes de la carte : les libellés des touches de `settings.pvpKeys` (avancer/gauche/reculer/droite) — si `navigator.keyboard?.getLayoutMap` existe, l'utiliser (libellé réel du clavier, AZERTY compris), sinon dériver du code (`KeyW` → `W`) — puis « SOURIS — REGARDER · E — EXAMINER · ÉCHAP — PAUSE ».
3. **Contrôle** : tant que l'enquête n'a pas « commencé » (premier verrouillage, ou option `cam` qui la fait commencer d'emblée, sans carte), aucune action ni visée. Clic sur la carte (ou sur `#enq-resume`) → `controller.lock(renderer.domElement)` ; à `pointerlockchange` verrouillé : carte et pause masquées, `state.resume()` ; la première fois : `amb.start()`, `apartment.openDoor()`, fondu du noir. La citation d'un indice et la liste des appels s'affichent tout de suite ; seules les phrases de Viktor et les sous-titres se tapent. Clavier (écouteur sur `document`) : `KeyE` → action ; clic gauche (`mousedown`, bouton 0) pointeur verrouillé → action. Action : en exploration, si une cible est visée → examiner ; en fiche → fermer, ou « écouter » si c'est la fiche du téléphone.
4. **Examiner** (`state.examine(id)`) :
   - `phone-locked` : sous-titre « VIKTOR » + phrase tapée, `amb.speak(line)` ; pas de fiche.
   - `clue` : instantané (`renderer.render(scene, camera)` puis `renderer.domElement.toDataURL('image/jpeg', 0.85)`, dans un `try` ; sans image, la photo reste noire), fiche : onglet « INDICE 0n / 06 », photo + lieu en légende, titre, citation (le mot) s'il y en a, phrase de Viktor tapée en `0,8 × estimate(texte)` avec `amb.speak`, pied « <b>E</b> — FERMER » ; `controller.setFrozen(true)` ; classe `gl` 250 ms sur `.enq` + `amb.glitch()` ; `amb.tinnitus()` si `clue.acouphene` ; compteur mis à jour.
   - `phone` : fiche du téléphone : onglet « LE TÉLÉPHONE », titre « 2 APPELS MANQUÉS », la liste des appels (`.enq-calls`, un `div` par appel : `<b>de · heure</b><small>note</small>`), les deux phrases de Viktor tapées l'une après l'autre (la seconde après `estimate(première) + 400 ms`), pied « <b>E</b> — ÉCOUTER LE MESSAGE ».
   - **Fermer** : `state.close()`, `controller.setFrozen(false)`, fiche masquée. **Écouter** : `state.finish('listened')` → fin.
5. **Pause** : perte du verrou (`onUnlock`) hors fin → `state.pause()`, `controller.setFrozen(true)`, `#enq-pause` visible. `#enq-resume` → reverrouille (le retour du verrou reprend). `#enq-skip` → `state.finish('skipped')` → fin.
6. **Piste** : à chaque `update`, `const hint = state.tick(dt, controller.position)` → sous-titre « VIKTOR » + `amb.speak(hint)`.
7. **`update(dt)`** : `apartment.update(dt)` ; si `options.cam`, caméra figée via `controller.setPose` + `controller.update(0)` ; sinon, en exploration pointeur verrouillé, `controller.update(dt)` ; en exploration, `interact.update()` → croix et invite ; proximité du cœur `amb.setProximity(1 - (distance à l'ancre « corps » − 1,5) / 6)` bornée à [0, 1] ; piste ; stats si demandé (`renderer.info.render.calls` et `.triangles` de l'image précédente).
8. **Fin** (une seule fois) : noir (`#enq-black` sans `off`), `controller.setFrozen(true)`, puis après 700 ms (minuteur suivi) : `stop()` et `onDone({ result })`.
9. **`stop()`** (idempotent, ne lève jamais) : écouteurs retirés, minuteurs annulés, `controller.dispose()`, `interact.clear()`, `amb.stop()`, `apartment.dispose()`, `scene.clear()`, caméra et `renderer.shadowMap.autoUpdate` restaurés, `document.exitPointerLock()` si le pointeur est verrouillé, `#enq-root` et `#enq-css` retirés.

`src/prologue/enquete.css` (à reprendre tel quel, puis à ajuster à l'œil) :

```css
/* Enquête du prologue : interface par-dessus le rendu 3D, style « dossier du fixeur ». Tout est préfixé .enq. */
.enq { position: fixed; inset: 0; z-index: 150; pointer-events: none; font-family: 'Courier New', Courier, monospace; color: #d7dccf; }
.enq [hidden] { display: none !important; }
.enq .enq-fx { position: absolute; inset: 0; overflow: hidden; }
.enq .enq-scan { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(0,0,0,.16) 0 1px, transparent 1px 3px); }
.enq .enq-vig { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,.7) 100%); }
.enq .enq-grain { position: absolute; inset: -50%; opacity: .08; animation: enq-grain .5s steps(4) infinite;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
.enq.gl .enq-grain { opacity: .3; }
.enq.gl .enq-fx { animation: enq-shake .25s steps(3); }
@keyframes enq-grain { 0% { transform: translate(0,0) } 25% { transform: translate(-3%,2%) } 50% { transform: translate(2%,-3%) } 75% { transform: translate(-2%,-1%) } }
@keyframes enq-shake { 0%,100% { transform: none } 33% { transform: translate(-.4vw,.2vh) } 66% { transform: translate(.3vw,-.3vh) } }
@keyframes enq-blink { 50% { opacity: 0 } }

.enq .enq-count, .enq .enq-time { position: absolute; top: 2.6vh; font-size: clamp(11px, 1.05vw, 15px); letter-spacing: .3em; color: rgba(215,220,207,.7); text-shadow: 0 0 4px #000; }
.enq .enq-count { left: 2.2vw; } .enq .enq-count b { color: #e04848; font-weight: normal; }
.enq .enq-time { right: 2.2vw; color: rgba(215,220,207,.55); } .enq .enq-time i { color: #e04848; font-style: normal; animation: enq-blink 1.2s steps(2) infinite; }
.enq .enq-cross { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px; border-radius: 50%; background: rgba(241,244,234,.5); transition: background .15s, box-shadow .15s; }
.enq .enq-cross.on { background: #f0c040; box-shadow: 0 0 8px rgba(240,192,64,.85); }
.enq .enq-prompt { position: absolute; left: 0; right: 0; top: calc(50% + 2.6vh); text-align: center; font-size: clamp(11px, 1vw, 14px); letter-spacing: .3em; color: #f1f4ea; opacity: 0; transition: opacity .15s; text-shadow: 0 0 4px #000; }
.enq .enq-prompt.on { opacity: 1; } .enq .enq-prompt b { color: #f0c040; font-weight: normal; }
.enq .enq-sub { position: absolute; left: 6vw; right: 6vw; bottom: 6vh; text-align: center; font-size: clamp(14px, 1.7vw, 24px); line-height: 1.4; color: #f1f4ea; min-height: 1.4em; }
.enq .enq-sub .spk, .enq .enq-line .spk { color: #cfd6e6; letter-spacing: .25em; font-size: .72em; margin-right: .9em; }
.enq .enq-sub .tx { background: rgba(0,0,0,.55); padding: .1em .5em; }

.enq .enq-card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2.2vh; background: rgba(3,4,7,.82); pointer-events: auto; cursor: pointer; }
.enq .enq-card .d { font-size: clamp(22px, 3.2vw, 46px); letter-spacing: .22em; color: #f1f4ea; }
.enq .enq-card .l { width: 22vw; height: 2px; background: #e04848; }
.enq .enq-card .k { font-size: clamp(11px, 1vw, 14px); letter-spacing: .25em; color: rgba(215,220,207,.6); text-align: center; }
.enq .enq-card .go { font-size: clamp(12px, 1.1vw, 16px); letter-spacing: .4em; color: #f0c040; animation: enq-blink 1.1s steps(2) infinite; }

.enq .enq-fiche { position: absolute; left: 50%; top: 50%; width: min(78vw, 1000px); transform: translate(-50%,-46%); opacity: 0; transition: opacity .35s, transform .5s cubic-bezier(.2,.8,.2,1);
  display: flex; gap: 2vw; padding: 3vh 2vw 2.4vh; border: 1px solid rgba(215,220,207,.28); background: linear-gradient(180deg, rgba(16,19,27,.97), rgba(10,12,18,.97)); }
.enq .enq-fiche.on { opacity: 1; transform: translate(-50%,-50%); }
.enq .enq-tab { position: absolute; top: -3.4vh; left: -1px; font-size: clamp(11px, 1.05vw, 15px); letter-spacing: .25em; padding: .6vh 1.2vw; background: #e04848; color: #0b0c10; font-weight: bold; }
.enq .enq-photo { position: relative; flex: none; width: 34%; aspect-ratio: 4 / 3; overflow: hidden; background: #0e1320; border: .5vw solid #d9d6cc; box-shadow: 0 1vh 2.4vh rgba(0,0,0,.6); transform: rotate(-1.6deg); }
.enq .enq-photo img { width: 100%; height: 100%; object-fit: cover; opacity: 0; filter: grayscale(.85) contrast(1.5) brightness(.85) sepia(.15); }
.enq .enq-fiche.on .enq-photo img { animation: enq-dev 1s ease-out forwards; }
@keyframes enq-dev { 0% { opacity: 1; filter: grayscale(1) brightness(3.2) blur(5px) } 100% { opacity: 1; filter: grayscale(.85) contrast(1.5) brightness(.85) sepia(.15) blur(0) } }
.enq .enq-photo .lieu { position: absolute; left: .6vw; bottom: .5vh; font-size: clamp(9px, .8vw, 12px); letter-spacing: .2em; color: #e8efe0; text-shadow: 0 0 2px #000; }
.enq .enq-body { flex: 1; display: flex; flex-direction: column; gap: 1.6vh; padding-top: .6vh; min-height: 22vh; }
.enq .enq-body h3 { margin: 0; font-size: clamp(16px, 1.9vw, 28px); letter-spacing: .2em; font-weight: normal; color: #f1f4ea; }
.enq .enq-quote { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: clamp(16px, 1.8vw, 26px); color: #e8d9b8; border-left: 3px solid #e04848; padding-left: 1vw; }
.enq .enq-calls { display: flex; flex-direction: column; gap: .8vh; }
.enq .enq-calls div { display: flex; justify-content: space-between; gap: 2vw; font-size: clamp(12px, 1.2vw, 17px); padding: .7vh .9vw; border: 1px solid rgba(224,72,72,.35); background: rgba(224,72,72,.08); }
.enq .enq-calls b { color: #f1f4ea; font-weight: normal; letter-spacing: .06em; } .enq .enq-calls small { color: #ff7a7a; letter-spacing: .12em; }
.enq .enq-line { font-size: clamp(14px, 1.55vw, 22px); line-height: 1.5; color: #f1f4ea; min-height: 3em; }
.enq .enq-act { margin-top: auto; font-size: clamp(11px, 1vw, 14px); letter-spacing: .3em; color: rgba(215,220,207,.6); } .enq .enq-act b { color: #f0c040; font-weight: normal; }

.enq .enq-pause { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2.4vh; background: rgba(3,4,7,.78); pointer-events: auto; }
.enq .enq-pause h2 { margin: 0; font-weight: normal; font-size: clamp(20px, 2.6vw, 36px); letter-spacing: .5em; padding-left: .5em; color: #f1f4ea; }
.enq .enq-pause button { font: inherit; font-size: clamp(12px, 1.15vw, 16px); letter-spacing: .3em; padding: 1.4vh 2.4vw; min-width: 26vw; background: transparent; color: #d7dccf; border: 1px solid rgba(215,220,207,.4); cursor: pointer; }
.enq .enq-pause button:hover { border-color: #f0c040; color: #f0c040; }
.enq .enq-black { position: absolute; inset: 0; background: #000; opacity: 1; transition: opacity .9s; }
.enq .enq-black.off { opacity: 0; }
.enq .enq-stats { position: absolute; left: 2.2vw; bottom: 2.4vh; font-size: 11px; color: #8fd19e; }
```

- [ ] **Étape 1 : écrire les tests** — `tests/prologue/investigation.test.js` (faux renderer : jsdom n'a pas WebGL ; la scène, la visée et la logique tournent quand même) :

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { startInvestigation } from '../../src/prologue/investigation.js'

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
let lockEl = null
beforeEach(() => {
  vi.useFakeTimers(FAKE); lockEl = null
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockEl })
  document.exitPointerLock = vi.fn(() => { lockEl = null })
})
afterEach(() => { vi.useRealTimers(); delete document.pointerLockElement; document.body.innerHTML = ''; document.head.innerHTML = '' })

const fakeRenderer = () => {
  const canvas = document.createElement('canvas'); canvas.requestPointerLock = vi.fn(() => { lockEl = canvas; document.dispatchEvent(new Event('pointerlockchange')) })
  return { domElement: canvas, render: vi.fn(), compile: vi.fn(), shadowMap: { autoUpdate: true, needsUpdate: false }, info: { render: { calls: 0, triangles: 0 } } }
}
const keyE = () => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
const $ = sel => document.querySelector(sel)
// pose la caméra sur un point accessible proche d'un indice (mêmes points que tests/prologue/apartment.test.js), en
// visant le centre de son objet (lacet = atan2(−dx, −dz), convention du contrôleur)
const REACH = { mot: { x: 9.5, z: 4.2 }, telephone: { x: 5.4, z: 6.3 } }
const lookAt = (apt, id, y = 1.65) => {
  const target = new THREE.Box3().setFromObject(apt.targets.find(t => t.userData.clueId === id)).getCenter(new THREE.Vector3())
  const from = REACH[id]
  const dx = target.x - from.x, dz = target.z - from.z, dy = target.y - y
  return { x: from.x, y, z: from.z, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }
}

describe('l\'enquête', () => {
  it('démarre avec la carte, le noir, le compteur ; règle la caméra et les ombres, puis restaure tout à l\'arrêt', async () => {
    const renderer = fakeRenderer(), camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200)
    const h = startInvestigation({ renderer, camera, onDone: vi.fn() })
    expect($('#enq-card')).not.toBeNull(); expect($('#enq-black')).not.toBeNull()
    expect($('#enq-count').textContent).toMatch(/INDICES\s*0\s*\/\s*6/)
    expect(camera.fov).toBe(72); expect(renderer.shadowMap.autoUpdate).toBe(false)
    h.stop(); h.stop()
    expect(camera.fov).toBe(60); expect(camera.near).toBe(0.1); expect(camera.far).toBe(200)
    expect(renderer.shadowMap.autoUpdate).toBe(true)
    expect($('#enq-root')).toBeNull(); expect($('#enq-css')).toBeNull()
    await vi.advanceTimersByTimeAsync(500)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('un clic sur la carte demande le verrouillage du pointeur, puis la carte disparaît', () => {
    const renderer = fakeRenderer()
    const h = startInvestigation({ renderer, camera: new THREE.PerspectiveCamera(), onDone: vi.fn() })
    $('#enq-card').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(renderer.domElement.requestPointerLock).toHaveBeenCalled()
    expect($('#enq-card').hidden).toBe(true)
    h.stop()
  })

  it('viser un indice affiche l\'invite ; E ouvre sa fiche et compte l\'indice ; E la referme', () => {
    const renderer = fakeRenderer(), camera = new THREE.PerspectiveCamera()
    const probe = startInvestigation({ renderer, camera, onDone: vi.fn() })
    const cam = lookAt(probe.debug.apartment, 'mot'); probe.stop()
    const h = startInvestigation({ renderer, camera, onDone: vi.fn(), options: { cam } })
    h.update(0.016)
    expect($('#enq-prompt').classList.contains('on')).toBe(true)
    keyE()
    expect($('#enq-fiche').classList.contains('on')).toBe(true)
    expect($('#enq-fiche').textContent).toMatch(/INDICE 05 \/ 06/)
    expect($('#enq-fiche').textContent).toContain('Tu aurais dû dire oui.')
    expect($('#enq-count').textContent).toMatch(/1\s*\/\s*6/)
    keyE()
    expect($('#enq-fiche').classList.contains('on')).toBe(false)
    h.stop()
  })

  it('le téléphone reste verrouillé avant 4 indices, puis s\'ouvre et mène à la fin « listened »', async () => {
    const renderer = fakeRenderer(), camera = new THREE.PerspectiveCamera()
    const probe = startInvestigation({ renderer, camera, onDone: vi.fn() })
    const cam = lookAt(probe.debug.apartment, 'telephone'); probe.stop()
    const locked = startInvestigation({ renderer, camera, onDone: vi.fn(), options: { cam } })
    locked.update(0.016); keyE()
    expect($('#enq-fiche').classList.contains('on')).toBe(false)
    await vi.advanceTimersByTimeAsync(4000)            // le sous-titre se tape
    expect($('#enq-sub').textContent).toContain('Pas encore')
    locked.stop()
    const onDone = vi.fn()
    const h = startInvestigation({ renderer, camera, onDone, options: { cam, indices: 4 } })
    h.update(0.016); keyE()
    expect($('#enq-fiche').textContent).toContain('06 39 98 41 07')
    expect($('#enq-fiche').textContent).toContain('MAISON')
    expect($('#enq-fiche').textContent).toContain('ÉCOUTER LE MESSAGE')
    keyE()
    expect(onDone).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(800)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith({ result: 'listened' })
    expect($('#enq-root')).toBeNull()
  })

  it('perdre le pointeur ouvre la pause ; « PASSER L\'ENQUÊTE » termine en « skipped »', async () => {
    const renderer = fakeRenderer(), onDone = vi.fn()
    const h = startInvestigation({ renderer, camera: new THREE.PerspectiveCamera(), onDone })
    $('#enq-card').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    lockEl = null; document.dispatchEvent(new Event('pointerlockchange'))
    expect($('#enq-pause').hidden).toBe(false)
    $('#enq-skip').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(800)
    expect(onDone).toHaveBeenCalledWith({ result: 'skipped' })
    h.stop()
  })

  it('une erreur au démarrage démonte tout et appelle onDone une fois, après le retour', async () => {
    const onDone = vi.fn()
    const h = startInvestigation({ renderer: fakeRenderer(), camera: null, onDone })
    expect(onDone).not.toHaveBeenCalled()
    await Promise.resolve(); await Promise.resolve()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0][0].result).toBe('error')
    expect($('#enq-root')).toBeNull()
    expect(() => { h.update(0.016); h.stop() }).not.toThrow()
  })
})
```

- [ ] **Étape 2 : vérifier l'échec** — `npx vitest run tests/prologue/investigation.test.js` → FAIL.
- [ ] **Étape 3 : écrire `src/prologue/enquete.css` et `src/prologue/investigation.js`** selon le déroulé ci-dessus. Commentaires courts en français, même style que `src/briefing/index.js`.
- [ ] **Étape 4 : vérifier** — `npx vitest run` → tout vert ; `npx vite build` → OK (le module n'est encore importé par personne : vérifier seulement qu'il compile, par exemple avec un test qui l'importe, ce qui est déjà le cas).
- [ ] **Étape 5 : commiter**

```bash
git add src/prologue/investigation.js src/prologue/enquete.css tests/prologue/investigation.test.js
git commit -m "feat(enquete): le chef d'orchestre, les fiches d'indice et la pause" -- src/prologue/investigation.js src/prologue/enquete.css tests/prologue/investigation.test.js
```

---

### Tâche 7 : le branchement dans le jeu

**Fichiers :**
- Modifier : `src/main.js`

**Interfaces :**
- Consomme : `startInvestigation` (tâche 6), chargé par `import('./prologue/investigation.js')` (jamais d'import statique).
- Produit : la chaîne prologue-a → enquête → prologue-b ; la phase `'investigation'` ; la route `?enquete=1`.

`main.js` charge Three et tout le DOM : pas de test unitaire ; vérification par `npx vitest run`, `npx vite build` et au navigateur (tâche 8).

- [ ] **Étape 1 : l'enveloppeur** — juste après la fonction `cinematicAudio()`, ajouter :

```js
// ── Enquête du prologue (module chargé à la demande) ──
// Elle ne doit jamais bloquer la partie : erreur de chargement, de démarrage ou en cours d'image → on enchaîne.
let enquete = null   // { handle, next, ended }
function investigate(onNext, options = {}) {
  const run = { handle: null, ended: false, next: null }
  run.next = () => {
    if (run.ended) return
    run.ended = true
    if (enquete === run) enquete = null
    if (run.handle) { try { run.handle.stop() } catch (e) { console.error('[enquête]', e) } }
    releaseMouse()
    gamePhase = 'briefing'          // la suite est une cinématique : plus de rendu WebGL
    clock.getDelta()
    onNext()
  }
  enquete = run
  import('./prologue/investigation.js')
    .then(m => {
      if (run.ended) return
      const h = m.startInvestigation({ renderer, camera, audio: cinematicAudio(), onDone: run.next, options })
      if (run.ended) { try { h.stop() } catch (e) { /* déjà démontée */ } return }
      run.handle = h
      gamePhase = 'investigation'
      clock.getDelta()
    })
    .catch(err => { console.error('[enquête]', err); run.next() })
}
// Quitter sans enchaîner (retour au menu, mission lancée par un raccourci de test).
function abortInvestigation() {
  const run = enquete
  if (!run) return
  enquete = null; run.ended = true
  if (run.handle) { try { run.handle.stop() } catch (e) { console.error('[enquête]', e) } }
}
```

- [ ] **Étape 2 : le prologue** — dans `playPrologue()` : ajouter `instruction.style.opacity = '0'` (l'aide « CLIC DROIT — Viser » des missions ne doit pas s'afficher sur l'appartement) et remplacer le `onDone` de `prologue-a` par l'enquête :

```js
  cinematic('prologue-a', {
    audio: cinematicAudio(),      // appelé dans le clic : l'AudioContext reprend sur ce geste
    onDone: () => investigate(() => cinematic('prologue-b', {
      audio: cinematicAudio(),
      onDone: () => { markPrologueSeen(); saveProgress(); launchLevel(upgradeState.currentLevel) },
    })),
  })
```

Mettre à jour le commentaire au-dessus de `playPrologue` : « A (l'offre, le 14 mars) → l'enquête dans l'appartement → B (le message, le rappel, le tableau de chasse) → mission 1… ».

- [ ] **Étape 3 : sorties** — en tête de `showMenu()` et de `launchLevel(n, …)`, appeler `abortInvestigation()`.
- [ ] **Étape 4 : raccourci 1-6** — dans sa condition, ajouter `&& gamePhase !== 'investigation'`.
- [ ] **Étape 5 : la boucle** — dans `loop()`, juste avant `if (gamePhase === 'briefing') return`, ajouter :

```js
  if (gamePhase === 'investigation') {   // l'enquête du prologue : sa propre scène, la caméra du jeu
    const run = enquete
    if (run && run.handle) {
      try { run.handle.update(dt); renderer.render(run.handle.scene, camera) }
      catch (e) { console.error('[enquête]', e); run.next() }
    }
    return
  }
```

- [ ] **Étape 6 : route de développement** — dans le bloc `if (import.meta.env.DEV) {`, après le bloc `if (q.has('cine')) { … }`, ajouter :

```js
  // ?enquete=1&indices=4&cam=9.5,1.65,4.3,0.4,-0.6&ouvrir=mot&stats=1 : l'enquête directement (captures, réglages)
  if (q.has('enquete')) {
    menuEl.style.display = 'none'
    hudEl.style.display = 'none'
    instruction.style.opacity = '0'
    gamePhase = 'briefing'
    const cam = q.get('cam') ? q.get('cam').split(',').map(Number) : null
    investigate(() => showMenu(), {
      indices: +q.get('indices') || 0,
      cam: cam && cam.length === 5 ? { x: cam[0], y: cam[1], z: cam[2], yaw: cam[3], pitch: cam[4] } : null,
      ouvrir: q.get('ouvrir') || null,
      stats: q.has('stats'),
    })
  }
```

- [ ] **Étape 7 : vérifier** — `npx vitest run` → vert ; `npx vite build` → OK, avec un chunk `investigation-*.js` à part et un bundle principal qui ne grossit presque pas (noter les tailles) ; `grep -n "prologue/investigation" src/main.js` → seulement l'`import()` dynamique. Contrôle de fumée sans interface : capture de `http://localhost:5173/?enquete=1&cam=6,1.65,7.85,0,-0.05&stats=1` (commande de la tâche 3, `--virtual-time-budget=6000`) et de `…?enquete=1&indices=4&cam=<pose devant le téléphone>&ouvrir=telephone` ; regarder les images (appartement rendu, interface visible, fiche du téléphone lisible), et vérifier qu'aucune erreur n'apparaît (`--enable-logging=stderr --v=0` ou équivalent).
- [ ] **Étape 8 : commiter**

```bash
git add src/main.js
git commit -m "feat(enquete): l'enquête entre les deux cinématiques du prologue" -- src/main.js
```

---

### Tâche 8 (contrôleur) : vérification

- [ ] Parcours au navigateur intégré, sauvegarde vide : COMMENCER → prologue-a → carte « 14 MARS · 21:47 » → clic → déplacement (ZQSD/WASD et flèches), regard, collisions ; examiner les 6 indices (fiches, photos, voix, acouphène sur les corps), le téléphone verrouillé puis ouvert ; « ÉCOUTER LE MESSAGE » → prologue-b → briefing M1 → mission 1, sans erreur console.
- [ ] Pause : Échap → pause → REPRENDRE (reverrouille) ; Échap → PASSER L'ENQUÊTE → prologue-b. Touches 1-6 sans effet pendant l'enquête. Volume 0 → muet.
- [ ] Budgets : `renderer.info.render.calls` < 60 et `.triangles` < 50 000 en plusieurs points (route `&stats=1`) ; mémoire : géométries et textures revenues au niveau d'avant l'enquête une fois dans prologue-b (rien n'est rendu pendant B : mesurer à ce moment-là, voir `understand-fps-moteur.md`).
- [ ] Captures des vues clés (route `?enquete=1&cam=…`) et contrôle visuel de la finition.
- [ ] Revue finale de la branche (modèle le plus capable), vague de correction si besoin, puis fusion dans `main` et push (accord de Rayan).
