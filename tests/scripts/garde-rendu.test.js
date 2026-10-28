import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { captureGardee, avecNouveauxEssais } from '../../scripts/garde-rendu.mjs'
import { annexeSonde } from '../../scripts/sonde.mjs'
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
// et rend sa valeur par copie (returnByValue) ; Page.captureScreenshot rend ce que la page montre. pendantLaCapture :
// ce qui arrive entre la demande de la capture et l'image.
function devtools({ pendantLaCapture } = {}) {
  const methodes = []
  return {
    methodes,
    async send(methode, params = {}) {
      methodes.push(methode)
      if (methode === 'Runtime.evaluate') {
        try {
          const v = (0, eval)(params.expression)
          return { result: { value: v === undefined ? undefined : JSON.parse(JSON.stringify(v)) } }
        } catch (e) {
          return { exceptionDetails: { text: 'Uncaught', exception: { description: String(e) } } }
        }
      }
      if (methode === 'Page.captureScreenshot') {
        if (pendantLaCapture) pendantLaCapture()
        return { data: Buffer.from(page.image()).toString('base64') }
      }
      throw new Error(`méthode DevTools inattendue : ${methode}`)
    },
  }
}

beforeEach(() => {
  origine = 0
  vi.spyOn(performance, 'timeOrigin', 'get').mockImplementation(() => origine)
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

// L'image (son texte), ou l'erreur si la capture est refusée.
const capturer = (c = devtools(), params = { format: 'png' }) => captureGardee(c, params).then(b => b.toString(), e => e)

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

describe('avecNouveauxEssais : une image refusée est reprise dans un Chrome neuf', () => {
  // Une passe sur des Chrome successifs, comme shoot dans capture-mission.mjs : chaque essai charge une page neuve,
  // perdue ou intacte selon chromes, et la capture avec la garde.
  const passe = chromes => {
    const essais = []
    const capture = async essai => {
      essais.push(essai)
      const p = chargerPage()
      if (chromes[essais.length - 1] === 'perdu') p.perdre()
      return (await captureGardee(devtools(), { format: 'jpeg' })).toString()
    }
    return { capture, essais }
  }

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

// Une capture refusée à chaque essai manque au relevé : recopié dans l'annexe versionnée, il y perdrait des mesures,
// voire le verdict d'un poste et la décision pour M4, et les anciennes images resteraient à côté d'un relevé qui ne
// les cite plus. Une passe incomplète ne touche donc pas à l'annexe.
describe('annexeSonde : une passe incomplète ne touche pas à l\'annexe', () => {
  it('passe complète : l\'annexe demandée (ANNEXE_SONDE) ; sans elle, aucune', () => {
    expect(annexeSonde('2026-10-28-sonde-lisibilite', 0)).toBe('2026-10-28-sonde-lisibilite')
    expect(annexeSonde(undefined, 0)).toBeNull()
    expect(annexeSonde('', 0)).toBeNull()
  })

  it('une capture en échec : aucune annexe', () => {
    expect(annexeSonde('2026-10-28-sonde-lisibilite', 1)).toBeNull()
    expect(annexeSonde('2026-10-28-sonde-lisibilite', 26)).toBeNull()
  })
})
