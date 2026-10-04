# 🎯 SNIPER

> **Mon projet JavaScript le plus ambitieux, poussé au maximum.**
> Un jeu de tir 3D complet, développé **« from scratch » en Three.js / WebGL, sans
> aucun moteur de jeu** : rendu, animations de squelette, IA des PNJ, audio
> synthétisé, physique de balle, cinématiques en motion design et **multijoueur temps réel** —
> tout est écrit à la main. Un projet solo, pensé et codé de A à Z, pour repousser
> le plus loin possible ce qu'on peut faire avec du **JavaScript pur** dans un
> navigateur.

Développé par **Rayan Madi**. Deux modes de jeu :

- **Mode Histoire** — 6 missions : repérer et éliminer des cibles sans toucher un
  seul innocent (rue, entrepôt, port, base militaire, convoi en mouvement, et une
  fête bondée où le commanditaire se cache dans la foule).
- **Mode Multijoueur 1v1 (beta)** — « Sniper vs Contre-tueur », asymétrique :
  - Le **Sniper** est à un poste fixe, voit toute la salle, mais son **laser rouge
    est visible des deux côtés** : c'est son talon d'Achille.
  - Le **Contre-tueur** se fond dans une foule d'invités, doit ramasser **3 pièces
    d'arme** dispersées, assembler un pistolet et abattre le sniper — sans se faire
    repérer par ses mouvements.

### 💪 Ce qui rend ce projet ambitieux (100 % JavaScript)
- **Rendu 3D maison** en Three.js/WebGL, sans Unity ni Unreal — géométrie,
  éclairage, ombres et post-effets gérés à la main.
- **PNJ animés** (modèles `.glb`), machine à états de comportement, IA de fuite,
  et une **foule de plusieurs dizaines de personnages** dans laquelle se cacher.
- **Multijoueur temps réel** conçu de bout en bout : relais **WebSocket Node.js**
  écrit maison + **synchronisation de la scène par seed partagé** (les deux
  joueurs voient exactement la même fête).
- **Audio entièrement synthétisé** dans le navigateur (Web Audio API) : tirs,
  ambiance de fête, sons positionnels — aucun fichier son.
- **Cinématiques en motion design** façon « dossier du fixeur » (briefings,
  prologue, épilogue), système de stress/respiration, visée à la lunette,
  progression et améliorations… le tout en JavaScript.

> ⚠️ Le multijoueur est en **beta**. Il fonctionne via un petit relais WebSocket
> « confiance au client » (aucune logique de jeu côté serveur).

---

## 🚀 Lancer le jeu en local

Prérequis : **Node.js 18+**.

```bash
# 1) installer les dépendances (à la racine ET dans server/)
npm install
cd server && npm install && cd ..

# 2) lancer le jeu
npm run dev
```

Ouvre **http://localhost:5173**. Pour le **mode Histoire**, c'est tout.

### Activer le multijoueur

Le multijoueur a besoin du **relais WebSocket** en plus du jeu. Dans un 2ᵉ terminal :

```bash
npm run pvp-server      # démarre le relais sur le port 8787
```

Puis, dans le jeu : **MULTIJOUEUR (1V1)** → un joueur **CRÉE** une partie (code à
4 lettres), l'autre **REJOINT** avec ce code.

---

## 🌐 Jouer entre DEUX machines différentes

Le jeu se connecte automatiquement au relais **sur le même hôte que la page**
(port 8787). Tu as deux options selon que les joueurs sont sur le même réseau ou
non.

### Option A — Même réseau Wi-Fi / local (le plus simple)

1. **Machine A** (l'hôte) lance les deux serveurs :
   ```bash
   npm run dev          # exposé sur le réseau grâce à host:true
   npm run pvp-server   # dans un autre terminal
   ```
2. Trouve l'**IP locale** de la machine A :
   - Windows : `ipconfig` → « Adresse IPv4 » (ex. `192.168.1.20`)
   - macOS/Linux : `ifconfig` ou `ip a`
3. **Machine A** ouvre `http://localhost:5173`.
   **Machine B** ouvre `http://192.168.1.20:5173` (l'IP de A).
   > Le relais est trouvé tout seul : `ws://192.168.1.20:8787`.
4. L'un **CRÉE**, l'autre **REJOINT** avec le code. 🎮

> 🔥 **Pare-feu** : autorise Node.js sur le réseau privé la première fois (Windows
> affiche une demande), sinon la machine B ne joindra ni le port 5173 ni le 8787.

### Option B — Par internet (joueurs à distance)

Il faut héberger le **relais** quelque part de public. Le plus simple, gratuit :

1. Déploie le dossier `server/` sur **Render** ou **Railway** (service Node,
   commande de démarrage `node index.js`, il écoute sur `process.env.PORT`). Tu
   obtiens une URL en `wss://mon-relais.onrender.com`.
2. Héberge le jeu (ex. **Vercel/Netlify** : `npm run build` → dossier `dist/`), ou
   partage simplement ta machine.
3. Chaque joueur ouvre le jeu avec le relais en paramètre d'URL :
   ```
   https://ton-jeu.example/?relay=wss://mon-relais.onrender.com
   ```
   > `?relay=...` surcharge l'URL du relais (voir `src/net.js`).

---

## 🎮 Commandes

**Mode Histoire (sniper)**
| Action | Touche |
|---|---|
| Viser (lunette) | Clic droit maintenu |
| Tirer | Clic gauche |
| Zoom | Molette |
| Retenir son souffle | Maj |
| Pause | Échap |

**Mode PvP — Sniper**
| Action | Touche |
|---|---|
| Viser à la lunette | Clic droit maintenu |
| Tirer | Clic gauche |
| Capacités (Appel / PNJ collant / Alarme) | 1 / 2 / 3 |

**Mode PvP — Contre-tueur**
| Action | Touche |
|---|---|
| Se déplacer | Z Q S D |
| Émote (danser / se fondre) | E |
| Viser le pistolet (une fois armé) | Clic droit |
| Tirer | Clic gauche |

> Toutes les touches PvP sont **remappables** dans **Paramètres**.

---

## 🛠️ Stack

- **Three.js** (rendu WebGL, modèles `.glb` animés)
- **Vite** (dev/build)
- **ws** (relais WebSocket Node pour le PvP)
- **Electron** (build desktop optionnel : `npm run electron:dev`)

## 📁 Structure

```
src/            code du jeu (scène, niveaux, PvP, cinématiques…)
server/         relais WebSocket du multijoueur
public/models/  modèles 3D .glb
```

---

*Projet personnel de **Rayan Madi** — un jeu JavaScript poussé au maximum, en
beta. Retours bienvenus.*
