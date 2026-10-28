import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { captureGardee, avecNouveauxEssais } from '../../scripts/garde-rendu.mjs'
import { annexeSonde, jobsSonde } from '../../scripts/sonde.mjs'
import { watchContextLoss } from '../../src/campaign/loading.js'

// Captures de scripts/capture-mission.mjs sur un rendu interrompu (reprise de la tâche S0 du lot 3, 28 octobre 2026).
// Une passe de la sonde, lancée pendant que la machine saturait, a perdu le contexte WebGL de deux pages
// (sonde-250m-x8-bas, sonde-430m-x12-bas) : le jeu y affichait son écran « LE RENDU A ÉTÉ INTERROMPU » (main.js,
// onRenderLost), le script l'a capturé comme une autre image, l'a écrit dans l'annexe, et la passe a fini sans erreur.
// Deux JPEG identiques, l'écran modal à la place de la scène (copie dans refs/sauvegarde/s0-interrompue).
//
// La page se lit dans la page : écran du rendu interrompu affiché, contexte WebGL du canevas du jeu (#canvas,
// scene.js) perdu, page rechargée (le jeu recharge la page quand le navigateur rend le contexte). Une image prise sur
// un tel rendu est refusée avec une erreur claire, puis refaite dans un Chrome neuf.
//
// Témoin : le code de 2f93e10, sorti du script sans rien y changer (captureGardee : la capture telle quelle ;
// avecNouveauxEssais : un seul essai ; annexeSonde : l'annexe dès qu'elle est demandée), prend l'image quelle que
// soit la page : ces tests ont été vus rouges sur lui.

const HTML = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')

// Origine de la page en cours (performance.timeOrigin) : chaque chargement en a une autre, comme dans Chrome.
let origine = 0
let page = null

// Une page du jeu telle que Chrome l'a chargée : le DOM d'index.html, le canevas du rendu (#canvas) et son contexte
// WebGL, et la réaction du jeu à la perte de ce contexte (main.js : watchContextLoss sur le canevas du renderer, puis
// onRenderLost affiche l'écran « LE RENDU A ÉTÉ INTERROMPU »). rendue : la scène est déjà dessinée (sinon la page vient
// d'être rechargée, rien n'est encore à l'écran).
function chargerPage({ rendue = true } = {}) {
  origine += 1000
  document.body.innerHTML = HTML.slice(HTML.indexOf('<body'), HTML.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '')
  const canevas = document.getElementById('canvas')
  const gl = { perdu: false, isContextLost() { return this.perdu } }
  const types = []
  canevas.getContext = type => { types.push(type); return type === 'webgl2' ? gl : null }
  watchContextLoss(canevas, { onLost: () => { document.getElementById('context-lost').hidden = false }, onRestored: () => {} })
  page = {
    gl, types,
    // Le contexte WebGL est perdu ; evenement : l'événement webglcontextlost est passé, et l'écran s'affiche.
    perdre({ evenement = true } = {}) {
      gl.perdu = true
      if (evenement) canevas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    },
    // Ce que montre la page : l'écran du rendu interrompu s'il est affiché, un canevas vide si le contexte est perdu
    // (son tampon de dessin avec lui), sinon la scène.
    image() {
      const ecran = document.getElementById('context-lost')
      if (ecran && !ecran.hidden) return 'LE RENDU A ETE INTERROMPU'
      return gl.perdu ? 'CANEVAS VIDE' : rendue ? 'SCENE' : 'PAGE VIDE'
    },
  }
  return page
}

// Client DevTools de la page en cours (le c de capture-mission.mjs) : Runtime.evaluate évalue l'expression dans la page
// et rend sa valeur par copie (returnByValue) ; Page.captureScreenshot rend ce que la page montre. pendantLaCapture(c) :
// ce qui arrive entre la demande de la capture et l'image ; s'il lève une erreur, Page.captureScreenshot échoue avec
// elle (processus graphique tombé, paramètres refusés). c.muette : la page ne répond plus, chaque Runtime.evaluate
// échoue (Chrome tombé, cible fermée).
function devtools({ pendantLaCapture } = {}) {
  const methodes = []
  const c = {
    methodes,
    muette: false,
    async send(methode, params = {}) {
      methodes.push(methode)
      if (methode === 'Runtime.evaluate') {
        if (c.muette) throw new Error('Target closed')
        try {
          const v = (0, eval)(params.expression)
          return { result: { value: v === undefined ? undefined : JSON.parse(JSON.stringify(v)) } }
        } catch (e) {
          return { exceptionDetails: { text: 'Uncaught', exception: { description: String(e) } } }
        }
      }
      if (methode === 'Page.captureScreenshot') {
        if (pendantLaCapture) pendantLaCapture(c)
        return { data: Buffer.from(page.image()).toString('base64') }
      }
      throw new Error(`méthode DevTools inattendue : ${methode}`)
    },
  }
  return c
}

// Pendant la capture, le processus graphique tombe : le contexte WebGL est perdu et Page.captureScreenshot échoue.
const tombe = p => () => { p.perdre(); throw new Error('Unable to capture screenshot') }

beforeEach(() => {
  origine = 0
  vi.spyOn(performance, 'timeOrigin', 'get').mockImplementation(() => origine)
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

// L'image (son texte), ou l'erreur si la capture est refusée.
const capturer = (c = devtools(), params = { format: 'png' }, options) => captureGardee(c, params, options).then(b => b.toString(), e => e)

describe('captureGardee : une image prise sur un rendu interrompu est refusée', () => {
  it('rendu intact : l\'image telle quelle, sans rien changer à la page', async () => {
    const p = chargerPage()
    expect(await capturer()).toBe('SCENE')
    expect(document.getElementById('context-lost').hidden).toBe(true)
    expect(p.types.every(t => t === 'webgl2')).toBe(true)   // le contexte du jeu relu, aucun autre créé
  })

  it('contexte perdu, écran « LE RENDU A ÉTÉ INTERROMPU » affiché : image refusée, erreur claire', async () => {
    chargerPage().perdre()
    const e = await capturer(devtools(), { format: 'jpeg', quality: 85 })
    expect(e, 'image de l\'écran du rendu interrompu acceptée').toBeInstanceOf(Error)
    expect(e.name).toBe('RenduInterrompu')
    expect(e.message).toMatch(/^rendu interrompu avant la capture/)
    expect(e.message).toMatch(/contexte WebGL perdu/)
    expect(e.message).toMatch(/écran « LE RENDU A ÉTÉ INTERROMPU » affiché/)
    expect(e.message).toMatch(/image refusée$/)
  })

  it('contexte perdu, écran pas encore affiché (l\'événement webglcontextlost n\'est pas encore passé) : refusée', async () => {
    chargerPage().perdre({ evenement: false })
    const e = await capturer()
    expect(e, 'image d\'un canevas vide acceptée').toBeInstanceOf(Error)
    expect(e.message).toMatch(/^rendu interrompu avant la capture \(contexte WebGL perdu\)/)
  })

  it('écran du rendu interrompu encore affiché, contexte déjà rendu (le jeu va recharger la page) : refusée', async () => {
    const p = chargerPage()
    p.perdre()
    p.gl.perdu = false
    const e = await capturer()
    expect(e, 'image de l\'écran du rendu interrompu acceptée').toBeInstanceOf(Error)
    expect(e.message).toMatch(/^rendu interrompu avant la capture \(écran « LE RENDU A ÉTÉ INTERROMPU » affiché\)/)
  })

  it('contexte perdu pendant la capture : refusée', async () => {
    const p = chargerPage()
    const e = await capturer(devtools({ pendantLaCapture: () => p.perdre() }))
    expect(e, 'image prise pendant la perte du contexte acceptée').toBeInstanceOf(Error)
    expect(e.message).toMatch(/^rendu interrompu après la capture/)
  })

  it('page rechargée pendant la capture (contexte rendu après une perte, le jeu recharge la page) : refusée', async () => {
    chargerPage()
    const e = await capturer(devtools({ pendantLaCapture: () => chargerPage({ rendue: false }) }))
    expect(e, 'image d\'une page rechargée acceptée').toBeInstanceOf(Error)
    expect(e.message).toMatch(/page rechargée pendant la capture/)
  })

  // Relecture de S0 : la sonde relève ses mesures sur la page (__sonde()), puis la capture est prise. Une page rechargée
  // entre les deux passait : avant et après la capture, la garde lisait la page neuve, intacte, où la sonde n'est
  // peut-être pas encore rendue, et l'image n'était plus celle des mesures. page : l'origine de la page où l'appelant a
  // relevé ce que l'image doit montrer (performance.timeOrigin, lue avec les mesures).
  // Témoin : captureGardee de 970b8ba, qui ignore page, prend l'image de la page neuve : vu rouge sur lui.
  it('page rechargée entre le relevé des mesures et la capture : refusée', async () => {
    chargerPage()
    const page = performance.timeOrigin    // lue avec les mesures
    chargerPage({ rendue: false })         // rechargée : intacte, rien encore à l'écran
    const e = await capturer(devtools(), { format: 'jpeg', quality: 85 }, { page })
    expect(e, 'image d\'une page rechargée depuis le relevé acceptée').toBeInstanceOf(Error)
    expect(e.name).toBe('RenduInterrompu')
    expect(e.message).toMatch(/^rendu interrompu \(page rechargée depuis le relevé des mesures/)
    expect(e.message).toMatch(/image refusée$/)
  })

  it('même page que le relevé : l\'image', async () => {
    chargerPage()
    const page = performance.timeOrigin
    expect(await capturer(devtools(), { format: 'jpeg', quality: 85 }, { page })).toBe('SCENE')
  })

  it('canevas du jeu ou écran du rendu interrompu introuvables : refusée, la garde ne se tait jamais', async () => {
    chargerPage()
    document.getElementById('canvas').remove()
    const sansCanevas = await capturer()
    expect(sansCanevas, 'image acceptée sans canevas du jeu').toBeInstanceOf(Error)
    expect(sansCanevas.message).toMatch(/canevas du jeu sans contexte WebGL/)
    chargerPage()
    document.getElementById('context-lost').remove()
    const sansEcran = await capturer()
    expect(sansEcran, 'image acceptée sans écran du rendu interrompu dans la page').toBeInstanceOf(Error)
    expect(sansEcran.message).toMatch(/écran du rendu interrompu introuvable/)
  })
})

// Relecture de S0 : une erreur de Page.captureScreenshot elle-même (processus graphique tombé pendant la capture, page
// perdue) passait telle quelle, sans nouvel essai. Le rendu est désormais relu après l'échec : perdu, rechargé ou muet,
// la capture est refusée pour rendu interrompu (RenduInterrompu), donc refaite dans un Chrome neuf ; intact, l'erreur
// passe telle quelle, comme toute erreur qui ne tient pas au rendu.
// Témoin : captureGardee de 970b8ba laisse passer l'erreur de la capture telle quelle : les trois premiers tests ont
// été vus rouges sur lui ; le dernier garde son comportement (non-régression).
describe('captureGardee : la capture elle-même échoue', () => {
  it('contexte perdu pendant la capture, qui échoue : refusée pour rendu interrompu, l\'erreur de la capture dans le message', async () => {
    const p = chargerPage()
    const e = await capturer(devtools({ pendantLaCapture: tombe(p) }))
    expect(e).toBeInstanceOf(Error)
    expect(e.name, e.message).toBe('RenduInterrompu')
    expect(e.message).toMatch(/^rendu interrompu après la capture \(contexte WebGL perdu/)
    expect(e.message).toMatch(/, capture en erreur « Unable to capture screenshot » : image refusée$/)
  })

  it('la page ne répond plus après la capture, qui échoue : refusée pour rendu interrompu', async () => {
    chargerPage()
    const e = await capturer(devtools({ pendantLaCapture: c => { c.muette = true; throw new Error('Target closed') } }))
    expect(e).toBeInstanceOf(Error)
    expect(e.name, e.message).toBe('RenduInterrompu')
    expect(e.message).toMatch(/^rendu interrompu après la capture \(état du rendu illisible\), capture en erreur « Target closed »/)
  })

  it('page rechargée pendant la capture, qui échoue : refusée pour rendu interrompu', async () => {
    chargerPage()
    const e = await capturer(devtools({ pendantLaCapture: () => { chargerPage({ rendue: false }); throw new Error('Unable to capture screenshot') } }))
    expect(e).toBeInstanceOf(Error)
    expect(e.name, e.message).toBe('RenduInterrompu')
    expect(e.message).toMatch(/page rechargée pendant la capture/)
  })

  it('rendu intact, la capture en erreur (paramètres refusés) : l\'erreur telle quelle, qui ne tient pas au rendu', async () => {
    chargerPage()
    const erreur = new Error('Invalid parameters')
    expect(await capturer(devtools({ pendantLaCapture: () => { throw erreur } }))).toBe(erreur)
  })
})

describe('avecNouveauxEssais : une image refusée est reprise dans un Chrome neuf', () => {
  // Une passe sur des Chrome successifs, comme shoot dans capture-mission.mjs : chaque essai charge une page neuve,
  // perdue, intacte, ou dont le processus graphique tombe pendant la capture (tombe), selon chromes, et la capture avec
  // la garde.
  const passe = chromes => {
    const essais = []
    const capture = async essai => {
      essais.push(essai)
      const etat = chromes[essais.length - 1]
      const p = chargerPage()
      if (etat === 'perdu') p.perdre()
      const c = devtools(etat === 'tombe' ? { pendantLaCapture: tombe(p) } : {})
      return (await captureGardee(c, { format: 'jpeg' })).toString()
    }
    return { capture, essais }
  }

  it('capture en erreur, processus graphique tombé au premier essai : refaite dans un Chrome neuf', async () => {
    const { capture, essais } = passe(['tombe', 'intact'])
    const journal = [], pauses = []
    const image = await avecNouveauxEssais(capture, {
      nom: 'sonde-430m-x20-bas.jpg', journal: m => journal.push(m), attendre: ms => { pauses.push(ms) },
    }).catch(e => e)
    expect(image, 'erreur de la capture passée sans nouvel essai').toBe('SCENE')
    expect(essais).toEqual([1, 2])
    expect(pauses).toEqual([5000])
    expect(journal).toHaveLength(1)
    expect(journal[0]).toMatch(/capture en erreur « Unable to capture screenshot » : image refusée ; nouvel essai \(2 sur 3\)/)
  })

  it('refusée au premier essai, prise au deuxième : l\'image du deuxième Chrome, après une pause et un message', async () => {
    const { capture, essais } = passe(['perdu', 'intact'])
    const journal = [], pauses = []
    const image = await avecNouveauxEssais(capture, {
      nom: 'sonde-430m-x12-bas.jpg', journal: m => journal.push(m), attendre: ms => { pauses.push(ms) },
    })
    expect(image).toBe('SCENE')
    expect(essais).toEqual([1, 2])
    expect(pauses).toEqual([5000])
    expect(journal).toHaveLength(1)
    expect(journal[0]).toMatch(/^sonde-430m-x12-bas\.jpg : rendu interrompu avant la capture/)
    expect(journal[0]).toMatch(/nouvel essai \(2 sur 3\) dans 5 s, dans un Chrome neuf$/)
  })

  it('refusée à chaque essai : trois Chrome au plus, puis une erreur claire, sans image', async () => {
    const { capture, essais } = passe(['perdu', 'perdu', 'perdu', 'intact'])
    const journal = [], pauses = []
    const r = await avecNouveauxEssais(capture, { journal: m => journal.push(m), attendre: ms => { pauses.push(ms) } })
      .catch(e => e)
    expect(r, 'image de l\'écran du rendu interrompu rendue').toBeInstanceOf(Error)
    expect(r.name).toBe('RenduInterrompu')
    expect(r.message).toMatch(/^rendu interrompu à chacun des 3 essais \(dernier : avant la capture/)
    expect(r.message).toMatch(/image refusée$/)
    expect(essais).toEqual([1, 2, 3])
    expect(pauses).toEqual([5000, 5000])
    expect(journal).toHaveLength(2)
  })

  it('une autre erreur (modèle inconnu, délai dépassé) : aucun nouvel essai', async () => {
    for (const e of [new Error('sonde : modèle inconnu : x'), new Error('délai dépassé : __mission().phase')]) {
      const essais = [], pauses = []
      const r = await avecNouveauxEssais(async n => { essais.push(n); throw e }, { journal: () => {}, attendre: ms => { pauses.push(ms) } })
        .catch(x => x)
      expect([r, essais, pauses]).toEqual([e, [1], []])
    }
  })

  it('prise du premier coup : un seul Chrome, sans pause ni message', async () => {
    const { capture, essais } = passe(['intact'])
    const journal = [], pauses = []
    expect(await avecNouveauxEssais(capture, { journal: m => journal.push(m), attendre: ms => { pauses.push(ms) } })).toBe('SCENE')
    expect([essais, pauses, journal]).toEqual([[1], [], []])
  })
})

// Une passe incomplète ne touche pas à l'annexe : recopié dans l'annexe versionnée, son relevé y perdrait des mesures,
// voire le verdict d'un poste et la décision pour M4, et les anciennes images resteraient à côté d'un relevé qui ne
// les cite plus. Incomplète : une capture refusée à chaque essai (rendu interrompu), ou une passe qui ne couvre pas
// toutes les captures de la sonde. Relecture de S0 : ANNEXE_SONDE avec la cible sonde-430m réécrivait l'annexe avec ce
// seul poste, sans le verdict des autres ni la décision pour M4. fichiers : les captures de la passe (job.fichier de
// jobsSonde, sonde-libre.jpg).
// Témoin : annexeSonde de 970b8ba (l'annexe dès qu'aucune capture n'est en échec, quelle que soit la passe) la donne à
// une passe d'un seul poste ou à sonde-libre : les deux derniers tests ont été vus rouges sur lui.
describe('annexeSonde : seule une passe complète de la sonde écrit l\'annexe', () => {
  const NOM = '2026-10-28-sonde-lisibilite'
  const toutes = jobsSonde().map(j => j.fichier)
  const duPoste = nom => jobsSonde().filter(j => j.nom === nom).map(j => j.fichier)

  it('passe complète (les 26 captures, dans n\'importe quel ordre) : l\'annexe demandée (ANNEXE_SONDE) ; sans elle, aucune', () => {
    expect(toutes).toHaveLength(26)
    expect(annexeSonde(NOM, 0, toutes)).toBe(NOM)
    expect(annexeSonde(NOM, 0, [...toutes].reverse())).toBe(NOM)   // sonde-250m sonde-155m … : chaque poste à son tour
    expect(annexeSonde(undefined, 0, toutes)).toBeNull()
    expect(annexeSonde('', 0, toutes)).toBeNull()
  })

  it('une capture en échec : aucune annexe', () => {
    expect(annexeSonde(NOM, 1, toutes)).toBeNull()
    expect(annexeSonde(NOM, 26, toutes)).toBeNull()
  })

  it('un seul poste (sonde-430m), même sans échec : aucune annexe ; de même s\'il manque une capture ou si la passe n\'est pas dite', () => {
    expect(duPoste('430m')).toHaveLength(6)
    expect(annexeSonde(NOM, 0, duPoste('430m')), 'annexe réécrite avec le seul poste de 430 m').toBeNull()
    expect(annexeSonde(NOM, 0, toutes.filter(f => f !== 'sonde-250m-x20-bas.jpg'))).toBeNull()
    expect(annexeSonde(NOM, 0, [])).toBeNull()
    expect(annexeSonde(NOM, 0)).toBeNull()
  })

  it('une capture hors de la sonde (sonde-libre) ou en double : aucune annexe', () => {
    expect(annexeSonde(NOM, 0, ['sonde-libre.jpg']), 'annexe réécrite avec une capture libre').toBeNull()
    expect(annexeSonde(NOM, 0, [...toutes, 'sonde-libre.jpg'])).toBeNull()
    expect(annexeSonde(NOM, 0, [...toutes, ...duPoste('430m')])).toBeNull()   // sonde sonde-430m
  })
})
