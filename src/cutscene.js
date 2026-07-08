const LORE = {
  1: [
    "Je m'appelle Viktor. Treize ans dans l'armée. Aujourd'hui... nettoyeur.",
    "Première cible : Markov. Il rabat les filles et les gosses vers un réseau.",
    "Un réseau dont personne n'ose prononcer le nom. Moi, si.",
    "Il fait son marché tranquillement, là, en bas. Il ne sentira rien.",
    "Une seule règle : ne pas se faire repérer. Le reste, c'est de la mécanique."
  ],
  2: [
    "Markov travaillait pour eux. Les frères Sanctechair.",
    "Deux bouchers. Au sens propre. Ils découpent les corps des innocents...",
    "...et revendent ce qu'il en reste au plus offrant. De la viande humaine.",
    "Ce soir ils font la fête sur cette place. Ils se croient intouchables.",
    "Je vais leur apprendre ce qu'est la patience. Et le silence."
  ],
  3: [
    "Le port. C'est ici que la 'marchandise' transite dans des conteneurs.",
    "Mes cibles surveillent un arrivage. Elles bougent sans cesse, nerveuses.",
    "Quelqu'un les a prévenues qu'un fantôme rôdait. Tant mieux.",
    "Qu'ils aient peur. La peur les rend lents.",
    "Inspire. Expire. Attends le creux entre deux battements."
  ],
  4: [
    "Le réseau a un protecteur. Un colonel. Il loue ses hommes et sa base.",
    "Trois officiers corrompus, toujours entourés, en plein jour cette fois.",
    "Pas d'ombre où me cacher. Juste la distance et mon souffle.",
    "J'ai observé leurs rondes pendant deux jours depuis cette colline.",
    "Il y a toujours une fenêtre de tir. Il suffit de la mériter."
  ],
  5: [
    "Le colonel a senti le vent tourner. Il fuit en voiture vers la frontière.",
    "Il est seul à l'arrière, les registres sur les genoux. Une seule cible.",
    "Mais sa voiture roule vite. Il faut anticiper, viser devant.",
    "Une route. Un seul passage. Si je manque, il disparaît à jamais.",
    "Calcule la vitesse. Respire. Cueille-le en plein mouvement."
  ],
  6: [
    "Le dernier. Le commanditaire. Celui qui signait les commandes.",
    "Il se cache dans cette fête, noyé au milieu d'une foule d'invités.",
    "Une erreur et c'est un innocent qui tombe. Je ne suis pas comme eux.",
    "Je dois l'identifier. Le marqueur. Et seulement lui.",
    "Ensuite... peut-être que je pourrai enfin dormir."
  ],
}

let skipCallback = null

export function playCutscene(level, onDone) {
  // Cycle sur les 6 chapitres de lore (niveau 7 = lore 1, etc.)
  const loreIdx = ((level - 1) % 6) + 1
  const lines = LORE[loreIdx] || LORE[1]
  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:200;
    background:rgba(0,0,0,0.92);
    display:flex;flex-direction:column;
    align-items:center;justify-content:center;
    gap:0;
    font-family:'Courier New',monospace;
    color:#c8f0c8;
  `

  const skip = document.createElement('div')
  skip.textContent = 'APPUYER POUR PASSER'
  skip.style.cssText = `
    position:absolute;bottom:30px;right:40px;
    font-size:11px;color:rgba(200,240,200,0.3);
    letter-spacing:0.12em;cursor:pointer;
  `

  const textBox = document.createElement('div')
  textBox.style.cssText = `
    max-width:560px;text-align:left;padding:0 2rem;
  `

  const levelTag = document.createElement('div')
  levelTag.textContent = `— MISSION ${level} —`
  levelTag.style.cssText = `
    font-size:11px;color:rgba(200,240,200,0.35);
    letter-spacing:0.2em;margin-bottom:2.5rem;
    text-align:center;width:100%;
  `

  overlay.appendChild(levelTag)
  overlay.appendChild(textBox)
  overlay.appendChild(skip)
  document.body.appendChild(overlay)

  let lineIdx = 0
  let charIdx = 0
  let currentEl = null
  let done = false

  function finish() {
    if (done) return
    done = true
    document.body.removeChild(overlay)
    onDone()
  }

  overlay.addEventListener('click', finish)
  skip.addEventListener('click', finish)

  function nextLine() {
    if (lineIdx >= lines.length) {
      setTimeout(finish, 1200)
      return
    }
    currentEl = document.createElement('p')
    currentEl.style.cssText = `
      font-size:16px;line-height:1.9;
      color:rgba(200,240,200,0.88);
      min-height:1.9em;
      border-left:2px solid rgba(78,255,78,0.25);
      padding-left:18px;
      margin-bottom:14px;
    `
    textBox.appendChild(currentEl)
    charIdx = 0
    typeLine()
  }

  function typeLine() {
    if (done) return
    const line = lines[lineIdx]
    if (charIdx <= line.length) {
      currentEl.textContent = line.slice(0, charIdx)
      charIdx++
      setTimeout(typeLine, 38)
    } else {
      lineIdx++
      setTimeout(nextLine, 900)
    }
  }

  nextLine()
}

// ─── Cinématique d'intro (au lancement du jeu) ──────────────────────
const INTRO_LINES = [
  "On m'a tout pris. Ma femme. Ma fille. Mon nom.",
  "Un réseau d'hommes en costume qui transforment les innocents en marchandise.",
  "La police les protège. Les juges détournent le regard.",
  "Alors je suis devenu leur cauchemar. Une balle à la fois.",
  "Je suis Viktor. Et ce soir, la chasse commence.",
]

export function playIntro(onDone) {
  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:250;
    background:#000;
    display:flex;flex-direction:column;
    align-items:center;justify-content:center;
    font-family:'Courier New',monospace;color:#c8f0c8;
    opacity:0;transition:opacity 1.2s;
  `

  // Titre qui apparaît
  const title = document.createElement('div')
  title.textContent = 'SNIPER'
  title.style.cssText = `
    font-size:64px;letter-spacing:0.5em;
    text-shadow:0 0 40px #4eff4e;
    margin-bottom:8px;opacity:0;transition:opacity 2s;
  `
  const sub = document.createElement('div')
  sub.textContent = 'Une histoire de vengeance'
  sub.style.cssText = `
    font-size:13px;letter-spacing:0.3em;color:rgba(200,240,200,0.4);
    margin-bottom:48px;opacity:0;transition:opacity 2s 0.6s;
  `

  const textBox = document.createElement('div')
  textBox.style.cssText = `max-width:620px;text-align:center;padding:0 2rem;min-height:120px;`

  const skip = document.createElement('div')
  skip.textContent = 'APPUYER POUR PASSER'
  skip.style.cssText = `
    position:absolute;bottom:30px;right:40px;font-size:11px;
    color:rgba(200,240,200,0.3);letter-spacing:0.12em;cursor:pointer;
  `

  overlay.appendChild(title)
  overlay.appendChild(sub)
  overlay.appendChild(textBox)
  overlay.appendChild(skip)
  document.body.appendChild(overlay)

  // Fade in
  requestAnimationFrame(() => {
    overlay.style.opacity = '1'
    title.style.opacity = '1'
    sub.style.opacity = '1'
  })

  let lineIdx = 0, charIdx = 0, currentEl = null, done = false

  function finish() {
    if (done) return
    done = true
    overlay.style.opacity = '0'
    setTimeout(() => { if (overlay.parentNode) document.body.removeChild(overlay); onDone() }, 1000)
  }
  overlay.addEventListener('click', finish)
  skip.addEventListener('click', finish)

  function nextLine() {
    if (done) return
    if (lineIdx >= INTRO_LINES.length) { setTimeout(finish, 1800); return }
    currentEl = document.createElement('p')
    currentEl.style.cssText = `
      font-size:17px;line-height:1.9;color:rgba(200,240,200,0.9);
      min-height:1.9em;margin-bottom:10px;
    `
    textBox.appendChild(currentEl)
    charIdx = 0
    typeLine()
  }
  function typeLine() {
    if (done) return
    const line = INTRO_LINES[lineIdx]
    if (charIdx <= line.length) {
      currentEl.textContent = line.slice(0, charIdx)
      charIdx++
      setTimeout(typeLine, 42)
    } else {
      // fait disparaître la ligne précédente pour garder l'écran épuré
      const prev = currentEl
      lineIdx++
      setTimeout(() => {
        if (prev && prev.parentNode && lineIdx < INTRO_LINES.length) prev.style.opacity = '0.25'
        nextLine()
      }, 1100)
    }
  }

  // Démarre le texte après l'apparition du titre
  setTimeout(nextLine, 2600)
}
