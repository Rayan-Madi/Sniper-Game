import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { readFileSync } from 'node:fs'
import { PLACES, ANCRES, SIEGES, TABLES } from '../../src/bar/plan.js'
import { CARTE, REACTIONS, OBJETS, DIALOGUES, BILAN, RENSEIGNEMENTS, PERSONNES } from '../../src/bar/textes.js'
import { COQUILLE, SOUPCON, COUVERTURE, INTERFACE, DIALOGUE, SON } from '../../src/bar/reglages.js'
import { NOMS } from '../../src/bar/renseignements.js'
import { trackDisposals } from '../gfx/fakeRenderer.js'
import { fauxAudio, branches, enCours, frequence } from './fauxAudio.js'
import { settings } from '../../src/settings.js'

// La coquille du Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.4 à §3.11, §3.13 ; plan
// docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B11) : cycle de vie et assemblage des modules du bar, sur le patron
// de l'enquête (tests/prologue/investigation.test.js : faux renderer, verrou du pointeur et minuteurs simulés). Les
// patrons sont le faux casting de tests/bar/fauxCasting.js (sans GLB ; les vrais : tests/bar/patrons.test.js, sous Node).
// Chaque test de comportement a été vu rouge sur le témoin écrit à côté de son assertion, glissé seul dans la coquille
// finie (sorties dans shots/bar/b11/temoins/, hors dépôt), puis vert.

const panne = vi.hoisted(() => ({ montage: null }))
vi.mock('../../src/bar/patrons.js', async () => {
  const { fauxCasting } = await import('./fauxCasting.js')
  return { creerCasting: () => { if (panne.montage) throw panne.montage; return fauxCasting() } }
})
const { startBar } = await import('../../src/bar/index.js')

// la feuille de style telle qu'écrite (sous Vitest, un import ?inline de CSS revient vide, comme ?raw)
const css = readFileSync('src/bar/bar.css', 'utf8')
const cssEnquete = readFileSync('src/prologue/enquete.css', 'utf8')

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
const DT = 1 / 60
let lockEl = null
beforeEach(() => {
  vi.useFakeTimers(FAKE); lockEl = null; panne.montage = null
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockEl })
  document.exitPointerLock = vi.fn(() => { lockEl = null })
})
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks()
  delete document.pointerLockElement; document.body.innerHTML = ''; document.head.innerHTML = ''
})

const fakeRenderer = () => {
  const canvas = document.createElement('canvas')
  canvas.requestPointerLock = vi.fn(() => { lockEl = canvas; document.dispatchEvent(new Event('pointerlockchange')) })
  return { domElement: canvas, render: vi.fn(), compile: vi.fn(), shadowMap: { autoUpdate: true, needsUpdate: false },
    info: { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } } }
}
const $ = sel => document.querySelector(sel)
const clic = sel => $(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }))
const touche = (code, plus = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { code, ...plus }))
const lache = code => document.dispatchEvent(new KeyboardEvent('keyup', { code }))
const souris = (bouton, type = 'mousedown') => document.dispatchEvent(new MouseEvent(type, { button: bouton }))
const perdreVerrou = () => { lockEl = null; document.dispatchEvent(new Event('pointerlockchange')) }
const images = (h, s, dt = DT) => { for (let k = Math.round(s / dt); k > 0; k--) h.update(dt) }
const jusqua = (h, cond, max = 60, dt = DT) => {
  for (let k = Math.round(max / dt); k > 0; k--) { if (cond()) return true; h.update(dt) }
  return cond()
}

// la coquille montée, la carte cliquée (verrou accordé) : la soirée commence
function partie(options = {}, plus = {}) {
  const renderer = plus.renderer || fakeRenderer(), camera = plus.camera || new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200)
  const onDone = vi.fn()
  const h = startBar({ renderer, camera, audio: plus.audio || null, onDone, options })
  if (!options.cam) clic('#bar-card')
  return { h, renderer, camera, onDone }
}
// ce qu'on vise : une capsule du décor ou d'une personne, par son barId
const capsule = (h, id) => [...h.debug.salle.cibles, ...h.debug.casting.cibles].find(c => c.userData.barId === id)
// Viktor debout en (x, z), le regard sur le centre de la capsule `id`
function viser(h, id, x, z, y = COQUILLE.oeilDebout) {
  const c = capsule(h, id)
  c.updateWorldMatrix(true, false)
  const p = c.getWorldPosition(new THREE.Vector3())
  const dx = p.x - x, dz = p.z - z, dy = p.y - y
  h.debug.aller(x, z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)))
  h.update(DT)
}
// Viktor debout en (x, z), le regard sur la tête de `qui`
function fixer(h, qui, x, z) {
  const t = h.debug.casting.patrons.get(qui).personne
  const dx = t.x - x, dz = t.z - z, dy = t.y - COQUILLE.oeilDebout
  h.debug.aller(x, z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)))
}

describe('la coquille du bar : cycle de vie', () => {
  it('démarre sur la carte et le noir ; caméra et ombres réglées, scène compilée ; stop rend tout, deux fois sans erreur', async () => {
    const renderer = fakeRenderer(), camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200)
    camera.position.set(1, 2, 3); camera.rotation.set(0.1, 0.2, 0.3)
    const pos = camera.position.clone(), quat = camera.quaternion.clone()
    const ajouts = [vi.spyOn(document, 'addEventListener'), vi.spyOn(window, 'addEventListener')]
    const retraits = [vi.spyOn(document, 'removeEventListener'), vi.spyOn(window, 'removeEventListener')]
    const h = startBar({ renderer, camera, onDone: vi.fn() })
    expect($('#bar-card').hidden).toBe(false)
    expect($('#bar-black').classList.contains('off')).toBe(false)
    expect(camera.fov).toBe(COQUILLE.camera.fov)
    expect(renderer.shadowMap.autoUpdate).toBe(false)
    expect(renderer.shadowMap.needsUpdate).toBe(true)
    expect(renderer.compile).toHaveBeenCalledWith(h.scene, camera)
    expect(h.scene.fog).toBe(h.debug.salle.brouillard)
    h.stop(); h.stop()
    expect(camera.fov).toBe(60); expect(camera.near).toBe(0.1); expect(camera.far).toBe(200)
    expect(camera.position.equals(pos)).toBe(true); expect(camera.quaternion.equals(quat)).toBe(true)
    expect(camera.rotation.order).toBe('XYZ')
    expect(renderer.shadowMap.autoUpdate).toBe(true)
    expect($('#bar-root')).toBeNull(); expect($('#bar-css')).toBeNull()
    const nets = ajouts.map((a, i) => a.mock.calls.length - retraits[i].mock.calls.length)
    expect(nets).toEqual([0, 0])                            // témoin : écouteurs laissés en place au démontage
    await vi.advanceTimersByTimeAsync(5000)
    expect(vi.getTimerCount()).toBe(0)
    expect(() => h.update(DT)).not.toThrow()
  })

  it('stop : aucun nœud audio encore branché ni son en cours ; tout ce que la scène possède est libéré, rien de partagé', () => {
    const f = fauxAudio()
    const { h } = partie({ t: 62, verre: 'cafe' }, { audio: f.audio })
    h.debug.asseoir('D-ouest')
    images(h, 8, 0.05)                                      // A1 se joue à 63 s : des voix bipent
    expect(branches(f).length).toBeGreaterThan(0)
    const suivi = trackDisposals(h.scene)
    h.stop()
    expect(branches(f)).toEqual([])                         // témoin : les voix du chœur jamais libérées
    f.avancer(1)
    expect(enCours(f)).toEqual([])
    expect(suivi.leaks()).toEqual([])
    expect(suivi.sharedFreed()).toEqual([])
    expect(h.debug.casting.disposed).toBe(true)
  })

  it('un clic sur la carte demande le verrou ; la carte disparaît, le noir se lève, la soirée commence', () => {
    const { h, renderer } = partie()
    expect(renderer.domElement.requestPointerLock).toHaveBeenCalled()
    expect($('#bar-card').hidden).toBe(true)
    expect($('#bar-black').classList.contains('off')).toBe(true)
    expect(h.debug.etat().mode).toBe('exploration')
    images(h, 1)
    expect(h.debug.etat().t).toBeCloseTo(1, 6)
    h.stop()
  })

  it('la carte de départ (§3.10) : lieu, texte, consigne, touches, CLIQUER POUR COMMENCER, PARTIR SANS ENTRER', () => {
    startBar({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone: vi.fn() })
    const carte = $('#bar-card')
    for (const texte of [CARTE.lieu, CARTE.texte, CARTE.consigne, CARTE.commencer]) expect(carte.textContent).toContain(texte)
    expect($('#bar-card-partir').textContent).toBe(CARTE.partir)
    expect(carte.querySelector('.k').textContent).toMatch(/W.*A.*S.*D.*SE DÉPLACER/)
    expect(carte.querySelector('.k').textContent).toContain('PAUSE')
  })

  it('PARTIR SANS ENTRER : « passe » et aucun renseignement, sans demander le verrou', () => {
    const renderer = fakeRenderer(), onDone = vi.fn()
    renderer.domElement.requestPointerLock = vi.fn()        // le navigateur refuse : la carte reste
    const h = startBar({ renderer, camera: new THREE.PerspectiveCamera(), onDone, options: { infos: ['heure', 'trajet'] } })
    clic('#bar-card-partir')
    expect(renderer.domElement.requestPointerLock).not.toHaveBeenCalled()   // le clic ne passe pas à la carte
    expect(onDone).not.toHaveBeenCalled()                   // le noir de fin d'abord, puis le bilan (B12)
    images(h, INTERFACE.bilan.finS + 0.05, 0.05)
    expect(onDone).toHaveBeenCalledTimes(1)
    const [r] = onDone.mock.calls[0]
    expect(r.resultat).toBe('passe')
    expect(r.renseignements).toEqual(Object.fromEntries(NOMS.map(n => [n, false])))   // témoin : le carnet tel quel
    expect(r.couverture).toEqual({ soupconMax: 0, paliers: { mefiance: false, soupcon: false }, dureeS: 0 })
    expect($('#bar-root')).toBeNull()
  })

  it('onDone une seule fois, même avec deux sorties', () => {
    const renderer = fakeRenderer(), onDone = vi.fn()
    const h = startBar({ renderer, camera: new THREE.PerspectiveCamera(), onDone })
    clic('#bar-card-partir'); clic('#bar-card-partir')
    clic('#bar-menu')                                       // la pause, cachée, n'en est pas moins un bouton
    images(h, INTERFACE.bilan.finS + 0.5, 0.05)
    h.stop(); h.update(DT)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0][0].resultat).toBe('passe')  // témoin : sans garde, la dernière sortie l'emporte (« abandon »)
  })

  it('perdre le verrou ouvre la pause ; REPRENDRE reverrouille ; refusé, « CLIQUE ENCORE POUR REPRENDRE » après 0,6 s réelles', () => {
    const { h, renderer } = partie()
    expect($('#bar-root').classList.contains('en-pause')).toBe(false)
    perdreVerrou()
    expect($('#bar-pause').hidden).toBe(false)
    expect($('#bar-root').classList.contains('en-pause')).toBe(true)   // témoin : aucune classe, les battements CSS continuent (§3.10)
    expect([...$('#bar-pause').querySelectorAll('button')].map(b => b.textContent)).toEqual(['REPRENDRE', 'SORTIR DU BAR', 'MENU PRINCIPAL'])
    const retry = $('#bar-retry')
    expect(retry.hidden).toBe(true)
    const accorde = renderer.domElement.requestPointerLock.getMockImplementation()
    renderer.domElement.requestPointerLock.mockImplementation(() => {})   // refusé (trop tôt après Échap)
    clic('#bar-reprendre')
    images(h, COQUILLE.repriseS - 0.05, 0.05)
    expect(retry.hidden).toBe(true)
    images(h, 0.1, 0.05)
    expect(retry.hidden).toBe(false)                        // témoin : compté au temps de jeu, figé en pause
    expect(retry.textContent).toBe('CLIQUE ENCORE POUR REPRENDRE')
    renderer.domElement.requestPointerLock.mockImplementation(accorde)
    clic('#bar-reprendre')
    expect($('#bar-pause').hidden).toBe(true)
    expect(retry.hidden).toBe(true)
    expect($('#bar-root').classList.contains('en-pause')).toBe(false)
    perdreVerrou()                                          // la pause suivante : l'invite repart cachée
    expect(retry.hidden).toBe(true)
    h.stop()
  })

  it('pause : MENU PRINCIPAL rend « abandon » ; SORTIR DU BAR, « sorti » sous 60 et « demasque » à 60 ou plus', () => {
    const cas = [['#bar-menu', 70, 'abandon'], ['#bar-sortir', 20, 'sorti'], ['#bar-sortir', 70, 'demasque']]
    for (const [bouton, soupcon, resultat] of cas) {
      const { h, onDone } = partie({ soupcon })
      images(h, 1)
      perdreVerrou()
      clic(bouton)
      expect($('#bar-root').classList.contains('en-pause'), bouton).toBe(false)   // témoin : finir sans retirer la classe ; la vignette du démasqué bat de nouveau
      images(h, INTERFACE.bilan.finS + 0.5, 0.05)            // le bilan (sorti) et la scène du démasqué (B12) d'abord
      expect(onDone, bouton).toHaveBeenCalledTimes(1)
      expect(onDone.mock.calls[0][0].resultat, `${bouton} à ${soupcon}`).toBe(resultat)
      document.body.innerHTML = ''
    }
  })

  it('5 s de pause ne changent ni l\'horloge, ni la frappe, ni la jauge (le temps réel passe, la boucle appelle update)', async () => {
    const { h } = partie({ t: 62, soupcon: 40 })
    const D = PLACES.chaiseOuestD
    h.debug.aller(D.x, D.z, D.lacet, 0)
    // en jeu, le temps réel et le temps de jeu passent ensemble : la boucle appelle update, les horloges tournent
    const jouer = async (cond, max) => { for (let k = Math.round(max / 0.05); k > 0 && !cond(); k--) { h.update(0.05); await vi.advanceTimersByTimeAsync(50) } }
    await jouer(() => h.debug.etat().sousTitre && h.debug.etat().sousTitre.texte.length > 3, 8)
    await jouer(() => false, 0.3)
    const avant = h.debug.etat()
    expect(avant.sousTitre.texte.length).toBeGreaterThan(3)
    expect(avant.pensee.texte.length).toBeGreaterThan(0)    // la pensée d'entrée se tape encore
    expect(avant.pensee.texte.length).toBeLessThan(OBJETS.entree.pensee.length)
    perdreVerrou()
    for (let k = 0; k < 100; k++) { h.update(0.05); await vi.advanceTimersByTimeAsync(50) }
    const apres = h.debug.etat()
    expect(apres.mode).toBe('pause')
    expect(apres.t).toBe(avant.t)
    expect(apres.S).toBe(avant.S)
    expect(apres.sousTitre).toEqual(avant.sousTitre)
    expect(apres.pensee).toEqual(avant.pensee)              // témoin : la pensée frappée par setTimeout
    clic('#bar-reprendre')
    h.update(0.1)
    expect(h.debug.etat().t).toBeCloseTo(avant.t + 0.1, 6)
    h.stop()
  })

  it('les touches tenues sont relâchées quand la fenêtre perd le focus (Alt-Tab), le maintien de E compris', () => {
    const { h } = partie()
    h.update(DT)
    touche('KeyW')
    images(h, 0.5)
    const p = { ...h.debug.controller.position }
    expect(p.z).toBeLessThan(ANCRES.depart.z - 0.5)
    window.dispatchEvent(new Event('blur'))
    images(h, 0.5)
    expect(h.debug.controller.position).toEqual(p)          // témoin : aucun écouteur de blur
    viser(h, 'porte', ANCRES.depart.x, ANCRES.depart.z)
    touche('KeyE')
    images(h, 0.5)
    window.dispatchEvent(new Event('blur'))
    images(h, 0.8)
    expect(h.debug.etat().mode).toBe('exploration')         // le maintien est perdu : il faut rappuyer
    h.stop()
  })

  it('une exception dans update rend « erreur » avec les renseignements acquis, une fois, sans bloquer', () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { h, onDone } = partie({ infos: ['heure'] })
    images(h, 0.5)
    h.debug.casting.casser(new Error('image cassée'))
    expect(() => h.update(DT)).not.toThrow()
    expect(onDone).toHaveBeenCalledTimes(1)
    const [r] = onDone.mock.calls[0]
    expect(r.resultat).toBe('erreur')
    expect(r.renseignements.heure).toBe(true)              // témoin : { resultat: 'erreur' } seul, comme l'enquête
    expect(r.couverture.dureeS).toBeCloseTo(0.5, 1)        // l'image qui a levé avait déjà fait avancer la soirée
    expect($('#bar-root')).toBeNull()
    expect(erreur).toHaveBeenCalled()
    h.update(DT); h.stop()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('une erreur au démarrage démonte tout et appelle onDone une fois, après le retour', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    panne.montage = new Error('casting impossible')
    const onDone = vi.fn()
    const h = startBar({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone })
    expect(onDone).not.toHaveBeenCalled()
    await Promise.resolve(); await Promise.resolve()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0][0].resultat).toBe('erreur')
    expect(onDone.mock.calls[0][0].renseignements).toEqual(Object.fromEntries(NOMS.map(n => [n, false])))
    expect($('#bar-root')).toBeNull()
    expect(() => { h.update(DT); h.stop() }).not.toThrow()
  })
})

describe('la coquille du bar : la soirée assemblée', () => {
  it('Espace et clic droit frappent d\'un coup une pensée, jamais une réplique écoutée : le renseignement attend la fin de sa frappe', () => {
    const D = PLACES.chaiseOuestD
    const { h } = partie({ t: 62, verre: 'cafe' })         // un café déjà servi : Lise ne vient pas (L1)
    h.debug.asseoir('D-ouest')
    lockEl = h.debug.renderer.domElement
    h.update(DT)
    const pensee = () => h.debug.etat().pensee.texte
    expect(pensee().length).toBeLessThan(OBJETS.entree.pensee.length)
    touche('Space')
    h.update(DT)
    expect(pensee()).toBe(OBJETS.entree.pensee)            // une pensée : frappée d'un coup
    const cle = () => h.debug.ecoutes.find(e => e.echange === 'A1' && e.rang === 3)
    expect(jusqua(h, () => cle() && cle().frappe.motsFrappes.length >= 2, 30)).toBe(true)
    expect(h.debug.etat().posture).toBe('assis')
    expect(h.debug.controller.position).toMatchObject({ x: D.x, z: D.z })
    const total = cle().frappe.motsFrappes.length
    touche('Space'); souris(2)
    h.update(DT)
    const mots = 'La nationale a des yeux. Sur la vieille route, il n\'y a personne.'.split(' ').length
    expect(cle().frappe.motsFrappes.length).toBeLessThan(mots)   // témoin : toutAfficher branché sur toutes les répliques
    expect(cle().frappe.motsFrappes.length).toBeLessThanOrEqual(total + 1)
    expect(h.debug.carnet.connait('trajet')).toBe(false)
    let fini = false
    for (let k = 0; k < 600 && !fini; k++) {
      expect(h.debug.carnet.connait('trajet'), `image ${k}`).toBe(cle().frappe.fini)
      h.update(DT)
      fini = cle().frappe.fini
    }
    expect(fini).toBe(true)
    expect(h.debug.carnet.connait('trajet')).toBe(true)    // à la chaise ouest de D, les mots-clés passent (§3.1)
    expect(h.debug.journal.some(e => e.type === 'appris' && e.noms.includes('trajet'))).toBe(true)
    h.stop()
  })

  it('sortir : E maintenu 1 s sur la porte ; relâché avant, rien ; le contrat du §3.11', () => {
    const { h, onDone } = partie({ infos: ['heure'] })
    images(h, 2)
    viser(h, 'porte', ANCRES.depart.x, ANCRES.depart.z)
    expect(h.debug.interact.current).toBe('porte')
    expect($('#bar-prompt').textContent).toBe('MAINTENIR E : SORTIR · RENSEIGNEMENTS 1 / 4')   // témoin : « E MAINTENIR : … » (B12 avant relecture)
    touche('KeyE'); images(h, 0.6); lache('KeyE')
    images(h, 1.5)
    expect(h.debug.etat().mode).toBe('exploration')         // témoin : la sortie à l'appui
    touche('KeyE'); images(h, COQUILLE.maintienS + 0.05)
    expect(h.debug.etat().mode).toBe('sortie')
    images(h, INTERFACE.bilan.finS + 0.1, 0.05)
    expect(onDone).toHaveBeenCalledTimes(1)
    const [r] = onDone.mock.calls[0]
    expect(r.resultat).toBe('sorti')
    expect(Object.keys(r.renseignements)).toEqual(NOMS)
    expect(r.renseignements.heure).toBe(true)
    expect(r.couverture).toEqual({ soupconMax: expect.any(Number), paliers: { mefiance: false, soupcon: false },
      dureeS: expect.closeTo(2 + DT + 0.6 + 1.5 + COQUILLE.maintienS, 1) })
  })

  it('en SOUPÇON, sortir par la porte démasque (Sorel le suit)', () => {
    const { h, onDone } = partie({ soupcon: 70 })
    viser(h, 'porte', ANCRES.depart.x, ANCRES.depart.z)
    touche('KeyE'); images(h, COQUILLE.maintienS + 0.05)
    images(h, INTERFACE.demasque.dureeS + 0.1, 0.05)
    expect(onDone.mock.calls[0][0].resultat).toBe('demasque')
    expect(h.debug.journal.some(e => e.type === 'reaction' && e.texte === REACTIONS.sortieSoupcon.texte)).toBe(true)
  })

  it('s\'asseoir : E sur une chaise libre, l\'œil à sa hauteur ; une touche de déplacement relève Viktor sans le faire marcher', () => {
    const { h, camera } = partie({ verre: 'cafe' })        // déjà servi : Lise ne vient pas prendre la commande (L1)
    const C = SIEGES.find(s => s.id === 'C-nord')
    viser(h, 'C-nord', C.x, C.z - 0.9)
    expect(h.debug.interact.current).toBe('C-nord')
    touche('KeyE'); h.update(DT)
    expect(h.debug.etat().posture).toBe('assis')
    expect(camera.position.y).toBeCloseTo(C.oeil, 6)
    expect(h.debug.controller.position).toMatchObject({ x: C.x, z: C.z })
    touche('KeyW'); images(h, 0.5)
    expect(h.debug.etat().posture).toBe('debout')           // témoin : onMoveKey non branché, Viktor reste assis
    expect(camera.position.y).toBeCloseTo(COQUILLE.oeilDebout, 6)
    expect(h.debug.controller.position).toMatchObject({ x: C.x, z: C.z })
    h.stop()
  })

  it('fixer Dussart au-delà de sa tolérance : remarqué, la jauge monte de 12, Viktor pense « Ne les fixe pas. », Lise vient (L2)', () => {
    const { h } = partie()
    images(h, 0.2)
    fixer(h, 'dussart', 1.5, 0.75)
    images(h, 1.3)
    // la remarque passée à la jauge, lue au journal (depuis B12, la vue pivote ensuite vers Lise, qui vient pour L2, et S
    // redescend déjà)
    const r = h.debug.journal.find(x => x.type === 'jauge' && x.evenement === 'remarque')
    expect(r.apres - r.avant).toBeCloseTo(SOUPCON.evenements.remarque.escorte.s, 6)   // témoin : la remarque jamais passée à la jauge
    expect(h.debug.jauge.plancher).toBe(SOUPCON.evenements.remarque.escorte.plancher)
    expect(h.debug.journal.some(x => x.type === 'remarque' && x.qui === 'dussart')).toBe(true)
    expect(jusqua(h, () => h.debug.etat().pensee && h.debug.etat().pensee.texte === REACTIONS.premiereFixation.texte, 5)).toBe(true)
    expect(jusqua(h, () => h.debug.etat().dialogue && h.debug.etat().dialogue.id === 'lise-regard', 5)).toBe(true)
    h.stop()
  })

  it('Fernand voit toujours le zinc : dans l\'arrière-cuisine, où aucun cône ne voit Viktor, surpris (+25), puis 12 par seconde à son poids', () => {
    const { h } = partie()
    h.debug.aller(-7, -2.2, Math.PI / 2, 0)                 // derrière la porte entrouverte de la cuisine
    h.update(DT)
    expect(h.debug.regards.temoins).toEqual([])
    expect(h.debug.etat().S).toBeCloseTo(SOUPCON.evenements.surprisZoneInterdite.s, 0)   // témoin : 0, personne ne le voit
    images(h, 1 - DT)
    expect(h.debug.etat().S).toBeCloseTo(25 + 12 * SOUPCON.temoins.fernand, 0)
    h.stop()
  })

  it('au premier passage au comptoir, Fernand sert (D1) : Digit1 (« & » en AZERTY) choisit « Un demi. », verre en main, −5', () => {
    const { h } = partie({ soupcon: 50 })
    images(h, 1)
    h.debug.aller(-3.2, -1.2, Math.PI / 2, 0)
    expect(jusqua(h, () => h.debug.etat().dialogue && h.debug.etat().dialogue.phase === 'choix', 10)).toBe(true)
    expect(h.debug.etat().dialogue.id).toBe('fernand')
    expect(h.debug.etat().dialogue.choix.map(c => c.texte)).toEqual(DIALOGUES.fernand.noeuds.f1.choix.map(c => c.texte))
    touche('Digit1', { key: '&' })
    expect(jusqua(h, () => h.debug.etat().verre === 'demi', 5)).toBe(true)
    const choix = h.debug.journal.find(e => e.type === 'jauge' && e.evenement === 'choix')
    expect(choix.valeur).toBe(-5)                           // témoin : les effets du choix jamais appliqués
    expect(choix.apres).toBeCloseTo(choix.avant - 5, 9)
    let verre = null
    h.scene.traverse(o => { if (o.name === 'verre-tenu') verre = o })
    expect(verre && verre.visible).toBe(true)
    h.stop()
  })

  it('pendant un dialogue, 5 s de pause ne bougent pas la minuterie de la réponse', async () => {
    const { h } = partie()
    images(h, 1)
    h.debug.aller(-3.2, -1.2, Math.PI / 2, 0)
    expect(jusqua(h, () => h.debug.etat().dialogue && h.debug.etat().dialogue.phase === 'choix', 10)).toBe(true)
    images(h, 1)
    const restant = h.debug.etat().dialogue.restant
    perdreVerrou()
    for (let k = 0; k < 100; k++) { h.update(0.05); await vi.advanceTimersByTimeAsync(50) }
    expect(h.debug.etat().dialogue.restant).toBe(restant)
    h.stop()
  })

  it('un verre servi pendant qu\'elle attend retire L1 : Lise ne vient pas prendre une commande déjà servie par Fernand', () => {
    const { h } = partie()
    images(h, 0.2)
    h.debug.aller(-1.5, 1.5, Math.PI, 0)                    // loin des tables de l'escorte et du zinc, face à la vitrine
    images(h, COQUILLE.liseCommandeS - 5.2, 0.05)          // 40 s sans verre
    expect(h.debug.etat().mode).toBe('exploration')
    h.debug.aller(-3.2, -1.2, Math.PI / 2, 0)               // au zinc : Fernand sert (D1)
    expect(jusqua(h, () => h.debug.etat().dialogue && h.debug.etat().dialogue.phase === 'choix', 5)).toBe(true)
    expect(jusqua(h, () => h.debug.etat().t > COQUILLE.liseCommandeS + 0.1, 10)).toBe(true)   // L1 attend la fin de D1
    expect(h.debug.etat().dialogue.id).toBe('fernand')
    touche('Digit1')                                        // « Un demi. »
    expect(jusqua(h, () => h.debug.etat().verre === 'demi' && h.debug.etat().dialogue.phase === 'choix', 5)).toBe(true)
    touche('Digit2')                                        // « Je cherche du travail. »
    expect(jusqua(h, () => h.debug.journal.some(e => e.type === 'finDialogue' && e.id === 'fernand'), 10)).toBe(true)
    images(h, 5)
    const ouverts = h.debug.journal.filter(e => e.type === 'dialogue').map(e => e.id)
    expect(ouverts[0]).toBe('fernand')                      // puis F3 (« Vingt-quatre. »), 20 s cumulées au zinc
    expect(ouverts.filter(id => DIALOGUES[id].interlocuteur === 'lise')).toEqual([])   // témoin : L1 resté en attente, ouvert après D1
    h.stop()
  })

  it('Albert murmure pour la première fois de 20 à 35 s après l\'entrée, jamais en même temps que « Bonsoir. »', () => {
    const { h } = partie()
    const [a, b] = COQUILLE.murmuresAlbertS
    const murmures = () => h.debug.journal.filter(e => e.type === 'replique' && e.echange === 'albert')
    images(h, a - 0.5, 0.05)
    expect(murmures()).toEqual([])                          // témoin : le compteur à 0 au montage, le premier murmure à t = 0
    expect(jusqua(h, () => murmures().length > 0, b - a + 1, 0.05)).toBe(true)
    expect(murmures()[0].t).toBeGreaterThanOrEqual(a)
    expect(murmures()[0].t).toBeLessThanOrEqual(b)
    h.stop()
  })

  it('la table d\'Albert : −2/s de plus à sa chaise ouest seulement après lui avoir parlé (§3.14, « si Viktor lui parle »)', () => {
    const D = SIEGES.find(s => s.id === 'D-ouest')
    const baisse = parle => {
      const { h } = partie({ soupcon: 40, verre: 'cafe' })
      images(h, 0.2)
      if (parle) {
        viser(h, 'albert', D.x, D.z)
        expect(h.debug.interact.current).toBe('albert')
        touche('KeyE'); h.update(DT)
        expect(h.debug.journal.some(e => e.type === 'reaction' && e.qui === 'albert')).toBe(true)
      }
      h.debug.asseoir('D-ouest')
      h.update(DT)
      const avant = h.debug.jauge.S
      images(h, 1)
      const d = avant - h.debug.jauge.S
      h.stop(); document.body.innerHTML = ''
      return d
    }
    const sans = baisse(false), avec = baisse(true)
    expect(sans).toBeGreaterThan(0)
    expect(avec - sans).toBeCloseTo(COUVERTURE.albertBaisse, 1)   // témoin : les −2/s dès qu'il s'assoit, parlé ou non
  })

  it('Lise part servir la table A avant A4 (« Je te ressers, Dussart ? »), puis revient au zinc', () => {
    const { h } = partie({ t: 110, verre: 'cafe' })
    const lise = h.debug.casting.patrons.get('lise')
    const versA = () => lise.ordres.some(([o, p]) => o === 'marcher' && p.x === ANCRES.lise.A.x && p.z === ANCRES.lise.A.z)
    images(h, 126 - COQUILLE.liseServirAvantS - 110 - 0.5, 0.05)
    expect(versA()).toBe(false)
    images(h, 1, 0.05)
    expect(versA()).toBe(true)                              // témoin : Lise ne quitte jamais le zinc avant A4
    expect(lise.position).toEqual({ x: ANCRES.lise.A.x, z: ANCRES.lise.A.z })
    expect(jusqua(h, () => h.debug.seance.statut('A4') === 'fini', 20, 0.05)).toBe(true)
    h.update(0.05)
    expect(lise.position).toEqual({ x: ANCRES.lise.zinc.x, z: ANCRES.lise.zinc.z })
    h.stop()
  })

  it('la soirée finie, Viktor sort de lui-même 6 s après « Le 7 a gagné. » : « sorti »', () => {
    const { h, onDone } = partie({ t: 418 })
    expect(jusqua(h, () => onDone.mock.calls.length > 0, 20, 0.05)).toBe(true)   // témoin : la sortie de la soirée ignorée
    expect(onDone.mock.calls[0][0].resultat).toBe('sorti')
    expect(onDone.mock.calls[0][0].couverture.dureeS).toBeGreaterThan(420 + 6)
  })
})

// Règles de la base design (audit du 24 novembre 2026, BAR-1 et BAR-7) lues dans bar.css
const regle = (texte, selecteur) => {
  const m = texte.match(new RegExp(`(^|\\})\\s*${selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm'))
  return m ? m[2] : ''
}
const prop = (decl, nom) => { const m = decl.match(new RegExp(`(^|;|\\s)${nom}\\s*:\\s*([^;]+)`)); return m ? m[2].trim() : null }
const rgba = v => {
  if (!v) return null
  let m = v.match(/^#([0-9a-f]{6})$/i)
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)).concat(1)
  m = v.match(/rgba?\(([^)]+)\)/)
  return m ? m[1].split(',').map(Number).concat(1).slice(0, 4) : null
}
const sur = (c, fond) => c.slice(0, 3).map((x, i) => x * c[3] + fond[i] * (1 - c[3]))
const lum = c => {
  const l = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]
}
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
// le contraste d'un bouton, son texte posé sur le fond de son panneau, lui-même posé sur `dessous` (noir : la carte est sur
// le noir du départ ; blanc : la pause est sur la salle, au pire un mur éclairé)
function bouton(feuille, selBouton, selPanneau, dessous) {
  const fond = sur(rgba(prop(regle(feuille, selPanneau), 'background')), dessous)
  const texte = sur(rgba(prop(regle(feuille, selBouton), 'color')), fond)
  const minH = prop(regle(feuille, selBouton), 'min-height')
  return { contraste: contraste(texte, fond), minHauteur: minH ? parseFloat(minH) : 0 }
}

describe('la coquille du bar : règles de design (base design, audit BAR-1 et BAR-7)', () => {
  it('les boutons de la carte et de la pause ont 44 px de haut au moins et un texte à 4,5:1 au moins', () => {
    for (const [sel, panneau, dessous] of [['.bar .bar-card .partir', '.bar .bar-card', [0, 0, 0]], ['.bar .bar-pause button', '.bar .bar-pause', [255, 255, 255]]]) {
      const b = bouton(css, sel, panneau, dessous)
      expect(b.minHauteur, sel).toBeGreaterThanOrEqual(44)
      expect(b.contraste, sel).toBeGreaterThanOrEqual(4.5)
    }
    // témoins : les règles de l'enquête (.skip à 3,5:1 sans hauteur, .enq-pause button sans hauteur minimale)
    const skip = bouton(cssEnquete, '.enq .enq-card .skip', '.enq .enq-card', [0, 0, 0])
    expect(skip.minHauteur).toBeLessThan(44)
    expect(skip.contraste).toBeLessThan(4.5)
    expect(bouton(cssEnquete, '.enq .enq-pause button', '.enq .enq-pause', [255, 255, 255]).minHauteur).toBeLessThan(44)
  })

  it('text-wrap: balance sur les textes fixes de la carte, jamais sur un sous-titre tapé', () => {
    expect(prop(regle(css, '.bar .bar-card .texte, .bar .bar-card .consigne'), 'text-wrap')).toBe('balance')
    for (const sel of ['.bar .bar-sub', '.bar .bar-pensee']) expect(prop(regle(css, sel), 'text-wrap'), sel).toBeNull()
    expect(css).not.toMatch(/bar-sub[^{]*\{[^}]*text-wrap\s*:\s*balance/)
  })
})

// ─── L'interface du bar (tâche B12 ; spec §3.4 à §3.11, §9 ; audit de la base design BAR-2 à BAR-7) ───
// Chaque test de comportement a été vu rouge : sur la coquille de B11 quand le comportement est neuf (jauge, anneau, arcs,
// vignette, minuterie, carnet, horloge, noms, pivot, démasqué, bilan), sinon sur le témoin écrit à côté de son assertion,
// glissé seul dans la coquille finie (sorties dans shots/bar/b12/temoins/, hors dépôt).
const attenues = fn => { const avant = settings.reducedMotion; settings.reducedMotion = 'oui'; try { return fn() } finally { settings.reducedMotion = avant } }
const yawVers = (de, vers) => Math.atan2(-(vers.x - de.x), -(vers.z - de.z))
const ecart = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
const auZinc = (h, lacet = Math.PI / 2) => {
  h.debug.aller(-3.2, -1.2, lacet, 0)
  expect(jusqua(h, () => h.debug.etat().dialogue && h.debug.etat().dialogue.phase === 'choix', 10)).toBe(true)
}
const ligneDe = sel => ({ on: $(sel).classList.contains('on'), spk: $(sel).querySelector('.spk').textContent, tx: $(sel).querySelector('.tx').textContent })

describe('l\'interface du bar : le dialogue (tâche B12, §3.8)', () => {
  it('en dialogue, Digit2 (« é » en AZERTY) choisit et ZQSD ne déplace pas', () => {
    const { h } = partie()
    images(h, 0.5)
    auZinc(h)
    const p = { ...h.debug.controller.position }
    touche('KeyW', { key: 'z' }); touche('KeyA', { key: 'q' })
    images(h, 1)
    lache('KeyW'); lache('KeyA')
    expect(h.debug.controller.position).toEqual(p)          // témoin : le contrôleur laissé libre pendant le dialogue
    touche('Digit2', { key: 'é' })
    expect(jusqua(h, () => h.debug.etat().verre === 'cafe', 5)).toBe(true)   // témoin : e.key lu (« é » ne choisit rien)
    h.stop()
  })

  it('libellés « 1 » à « 3 » avec une carte de clavier AZERTY ; la carte de départ relit ZQSD', async () => {
    const carte = new Map([['KeyW', 'z'], ['KeyA', 'q'], ['KeyS', 's'], ['KeyD', 'd'], ['KeyE', 'e'], ['Digit1', '&'], ['Digit2', 'é'], ['Digit3', '"']])
    Object.defineProperty(navigator, 'keyboard', { configurable: true, value: { getLayoutMap: () => Promise.resolve(carte) } })
    try {
      const h = startBar({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone: vi.fn() })
      await Promise.resolve(); await Promise.resolve()
      const kbd = [...$('.bar-card .k').querySelectorAll('kbd')].map(k => k.textContent)
      expect(kbd.slice(0, 4)).toEqual(['Z', 'Q', 'S', 'D'])
      expect(kbd).toContain('1'); expect(kbd).not.toContain('&')
      clic('#bar-card')
      images(h, 0.5)
      auZinc(h)
      expect([...$('#bar-dialogue .bar-choix').querySelectorAll('b')].map(b => b.textContent)).toEqual(['1', '2', '3'])   // témoin : keyName('Digit1'), « & »
      h.stop()
    } finally { delete navigator.keyboard }
  })

  it('la vue pivote vers l\'interlocuteur, jamais en effets atténués', () => {
    const tourne = attenue => {
      const run = () => {
        const { h } = partie()
        images(h, 0.5)
        auZinc(h, -Math.PI / 2)                               // dos au zinc : Fernand derrière Viktor
        images(h, 2)
        const cible = yawVers(h.debug.controller.position, h.debug.casting.patrons.get('fernand').personne)
        const r = { yaw: h.debug.controller.yaw, cible }
        h.stop(); document.body.innerHTML = ''
        return r
      }
      return attenue ? attenues(run) : run()
    }
    const libre = tourne(false), fixe = tourne(true)
    expect(ecart(libre.yaw, libre.cible)).toBeLessThan(0.1)  // rouge sur B11 : la vue ne pivote jamais
    expect(fixe.yaw).toBe(-Math.PI / 2)                       // témoin : le pivot même en effets atténués
  })

  it('la minuterie garde la couleur du texte, passe au rouge sur ses 3 dernières secondes, et fait tic à 1,5, 1 et 0,5 s', () => {
    const f = fauxAudio()
    const { h } = partie({}, { audio: f.audio })
    images(h, 0.5)
    auZinc(h)
    const tics = () => f.oscillateurs().filter(o => o.type === 'square' && frequence(o) === SON.tic.ton.hz).length
    const m = $('#bar-dialogue .bar-minuterie')
    expect(m.classList.contains('alerte')).toBe(false)
    expect(jusqua(h, () => h.debug.etat().dialogue.restant <= INTERFACE.minuterieAlerteS - 0.05, 10)).toBe(true)
    expect(m.classList.contains('alerte')).toBe(true)        // rouge sur B11 : la minuterie toujours de la même couleur
    expect(tics()).toBe(0)
    expect(jusqua(h, () => h.debug.etat().dialogue === null || h.debug.etat().dialogue.restant === null, 5)).toBe(true)
    expect(tics()).toBe(DIALOGUE.ticsS.length)               // rouge sur B11 : les tics ignorés
    h.stop()
  })

  it('aucun sous-titre de table pendant un dialogue', () => {
    const { h } = partie({ t: 62 })
    h.debug.asseoir('D-ouest')                                // sans verre : Lise vient prendre la commande (L1)
    expect(jusqua(h, () => h.debug.etat().dialogue && h.debug.etat().dialogue.id === 'lise-commande', 3)).toBe(true)
    let ecoutees = 0
    while (h.debug.etat().dialogue) {
      if (h.debug.ecoutes.some(e => !e.finie)) ecoutees++
      expect($('#bar-sub').classList.contains('on')).toBe(false)   // témoin : le sous-titre montré pendant le dialogue
      h.update(DT)
    }
    expect(ecoutees).toBeGreaterThan(30)                      // A1 se jouait pendant le dialogue
    h.stop()
  })
})

describe('l\'interface du bar : écouter (tâche B12, §3.4)', () => {
  it('sous les murmures, le sous-titre d\'écoute dit « (murmures) »', () => {
    const { h } = partie({ t: 62, verre: 'cafe' })
    h.debug.aller(-1.5, -3.5, 0, 0)                           // à 7 m de la table A, dos tourné : I = 0, mais on l'entend
    expect(jusqua(h, () => ligneDe('#bar-sub').on, 10)).toBe(true)
    expect(h.debug.etat().sousTitre.qui).toMatch(/lenoir|dussart/)
    expect(jusqua(h, () => h.debug.ecoutes.some(e => e.echange === 'A1' && e.frappe.motsFrappes.length > 2), 5)).toBe(true)
    expect(ligneDe('#bar-sub').tx).toBe('(murmures)')        // témoin : frappe.texte affiché, qui ne les dit jamais
    h.stop()
  })

  it('qui parle : le rôle, puis le nom une fois prononcé ; une flèche ‹ ou › quand la source sort du champ', () => {
    const { h } = partie({ t: 62, verre: 'cafe' })
    h.debug.asseoir('D-ouest')
    const dussart = () => h.debug.etat().sousTitre && h.debug.etat().sousTitre.qui === 'dussart'
    const c = h.debug.controller, p = c.position
    c.setPose({ x: p.x, z: p.z, yaw: yawVers(p, TABLES.A) })   // assis à D, la table A est de côté : Viktor se tourne vers elle
    expect(jusqua(h, dussart, 10, 0.05)).toBe(true)
    h.update(0.05)
    expect(ligneDe('#bar-sub').spk).toBe(PERSONNES.dussart.role)   // « LE SERGENT » : personne ne l'a nommé
    // A4 : Lise, « Je te ressers, Dussart ? », puis Dussart répond
    expect(jusqua(h, () => h.debug.seance.statut('A4') === 'cours' && dussart(), 90, 0.05)).toBe(true)
    h.update(0.05)
    expect(ligneDe('#bar-sub').spk).toBe(PERSONNES.dussart.nom)    // rouge sur B11 : toujours le rôle
    c.setPose({ x: p.x, z: p.z, yaw: yawVers(p, TABLES.A) + Math.PI / 2 })   // la table A à 90° à droite
    h.update(0.05)
    expect(ligneDe('#bar-sub').spk).toBe(`${PERSONNES.dussart.nom} ›`)
    c.setPose({ x: p.x, z: p.z, yaw: yawVers(p, TABLES.A) - Math.PI / 2 })
    h.update(0.05)
    expect(ligneDe('#bar-sub').spk).toBe(`‹ ${PERSONNES.dussart.nom}`)
    h.stop()
  })

  it('le carnet « CE QU\'IL ME FAUT » : la ligne apprise, le tampon NOTÉ un temps, le compte', () => {
    const { h } = partie({ t: 62, verre: 'cafe' })
    h.debug.asseoir('D-ouest')
    expect($('#bar-carnet .compte').textContent).toBe('0 / 4')
    expect(jusqua(h, () => h.debug.carnet.connait('trajet'), 40, 0.05)).toBe(true)
    h.update(0.05)
    const ligne = [...$('#bar-carnet').querySelectorAll('li')].find(li => li.textContent.includes(RENSEIGNEMENTS.trajet.libelle))
    expect(ligne.textContent).toContain(RENSEIGNEMENTS.trajet.valeur)
    expect(ligne.querySelector('.tampon').textContent).toBe(BILAN.tampon)   // rouge sur B11 : aucun tampon
    expect($('#bar-carnet .compte').textContent).toBe('1 / 4')
    images(h, INTERFACE.noteS + 0.1, 0.05)
    expect($('#bar-carnet .tampon')).toBeNull()
    h.stop()
  })

  it('l\'horloge « LE BIVOUAC · 18:36 » à 273 s ; son point clignote au temps de jeu, fixe en effets atténués', () => {
    const points = attenue => {
      const run = () => {
        const { h } = partie({ t: 272.9 })
        images(h, 0.2)
        expect($('#bar-heure').textContent).toBe('LE BIVOUAC · 18:36')
        const vus = new Set()
        for (let k = 0; k < 120; k++) { h.update(DT); vus.add($('#bar-heure .pt').classList.contains('off')) }
        h.stop(); document.body.innerHTML = ''
        return vus
      }
      return attenue ? attenues(run) : run()
    }
    expect([...points(false)].sort()).toEqual([false, true])  // rouge sur B11 : aucun point
    expect([...points(true)]).toEqual([false])               // témoin : le point qui clignote en atténué
  })
})

describe('l\'interface du bar : la jauge, le regard (tâche B12, §3.5, §3.6)', () => {
  it('la jauge : barre au niveau de S, graduée à 30 et 60, plancher hachuré, palier ; vignette rouge dès SOUPÇON', () => {
    const { h } = partie({ soupcon: 40 })
    images(h, 0.2)
    const j = $('#bar-jauge')
    expect(j.className).toMatch(/\bp-mefiance\b/)              // rouge sur B11 : aucune jauge
    expect(j.querySelector('.bar-palier').textContent).toBe('MÉFIANCE')
    expect(parseFloat(j.querySelector('.niveau').style.width)).toBeCloseTo(h.debug.jauge.S, 1)
    expect([...j.querySelectorAll('.bar-barre b')].map(b => b.style.left)).toEqual(['30%', '60%'])
    expect($('#bar-vignette').classList.contains('on')).toBe(false)
    fixer(h, 'dussart', 1.5, 0.75)
    images(h, 1.3)
    expect(h.debug.jauge.plancher).toBeGreaterThan(0)
    expect(parseFloat(j.querySelector('.plancher').style.width)).toBeCloseTo(h.debug.jauge.plancher, 1)
    h.debug.soupcon(70); h.update(DT)
    expect(j.className).toMatch(/\bp-soupcon\b/)
    expect(j.querySelector('.bar-palier').textContent).toBe('SOUPÇON')
    expect($('#bar-vignette').classList.contains('on')).toBe(true)
    h.stop()
  })

  it('l\'œil (BAR-5) : un SVG au trait à deux états, ouvert si quelqu\'un qui compte voit Viktor, jamais un glyphe', () => {
    const { h } = partie()
    const oeil = $('#bar-jauge svg.bar-oeil')
    expect(oeil.querySelector('.ouvert')).not.toBeNull(); expect(oeil.querySelector('.clos')).not.toBeNull()
    expect($('#bar-jauge').textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿◉◎⊙]/u)
    const etats = new Set()
    for (const [x, z] of [[1.5, 0.75], [-2.4, -3.3], [-2.0, -6.5], [-1.5, 1.5], [5, -0.45], [0, -4], [-1.6, 3.6]]) {
      h.debug.aller(x, z, 0, 0); h.update(DT)
      const vu = h.debug.regards.temoins.some(c => SOUPCON.temoins[c] > 0)
      expect($('#bar-jauge').classList.contains('vu'), `${x}, ${z}`).toBe(vu)
      etats.add(vu)
    }
    expect([...etats].sort()).toEqual([false, true])
    h.stop()
  })

  it('l\'anneau de fixation se remplit vers la tolérance de qui l\'on fixe, rougit au-delà, se vide quand on détourne les yeux', () => attenues(() => {
    const { h } = partie()
    images(h, 0.2)
    fixer(h, 'dussart', 1.5, 0.75)
    images(h, 0.6)
    const a = $('#bar-anneau')
    expect(a.classList.contains('on')).toBe(true)             // rouge sur B11 : aucun anneau
    expect(parseFloat(a.style.getPropertyValue('--p'))).toBeCloseTo(0.5, 1)   // 0,6 s sur les 1,2 s de l'escorte
    expect(a.classList.contains('rouge')).toBe(false)
    images(h, 0.7)
    expect(a.classList.contains('rouge')).toBe(true)
    h.debug.aller(1.5, 0.75, Math.PI, 0)
    images(h, 1.5)
    expect(a.classList.contains('on')).toBe(false)
    h.stop()
  }))   // en effets atténués : la vue ne pivote pas vers Lise, qui vient pour L2

  it('un arc ambré au bord, du côté d\'un homme de l\'escorte hors champ qui vient de remarquer Viktor, le temps d\'un arc', () => attenues(() => {
    const { h } = partie({ verre: 'cafe' })
    images(h, 0.2)
    fixer(h, 'dussart', 1.5, 0.75)
    images(h, 1.3)
    expect(h.debug.journal.some(e => e.type === 'remarque' && e.qui === 'dussart')).toBe(true)
    const p = { ...h.debug.controller.position }, d = h.debug.casting.patrons.get('dussart').personne
    h.debug.aller(p.x, p.z, yawVers(p, d) + Math.PI / 2, 0)  // Dussart à 90° à droite, hors champ
    h.update(DT)
    expect($('#bar-arc-d').classList.contains('on')).toBe(true)   // rouge sur B11 : aucun arc
    expect($('#bar-arc-g').classList.contains('on')).toBe(false)
    h.debug.aller(p.x, p.z, yawVers(p, d), 0)                // dans le champ : pas d'arc
    h.update(DT)
    expect($('#bar-arc-d').classList.contains('on')).toBe(false)
    h.debug.aller(p.x, p.z, yawVers(p, d) - Math.PI / 2, 0)
    h.update(DT)
    expect($('#bar-arc-g').classList.contains('on')).toBe(true)
    images(h, INTERFACE.arcS)
    expect($('#bar-arc-g').classList.contains('on')).toBe(false)
    h.stop()
  }))
})

describe('l\'interface du bar : les fins (tâche B12, §3.10, §3.11)', () => {
  it('démasqué : « Toi. Debout. » lisible pendant la scène, les tables se lèvent, COUVERTURE GRILLÉE, onDone une fois après 2,5 s de jeu', () => {
    const { h, onDone } = partie({ soupcon: 95 })
    images(h, 0.2)
    h.debug.soupcon(100)
    expect(h.debug.etat().mode).toBe('sortie')
    images(h, 1)
    expect(ligneDe('#bar-reaction')).toEqual({ on: true, spk: PERSONNES.dussart.role, tx: REACTIONS.demasque.texte })   // témoin : finir aussitôt après dire (B11)
    const P = h.debug.casting.patrons
    for (const r of ['dussart', 'lenoir', 'mattei', 'haas']) expect(P.get(r).ordres.some(([o]) => o === 'seLever'), r).toBe(true)
    for (const p of h.debug.casting.liste.filter(x => x.present)) expect(p.regard, p.role).toMatchObject({ x: expect.any(Number), z: expect.any(Number) })
    images(h, INTERFACE.demasque.dureeS - 1 - 0.2 - 0.05)
    expect($('#bar-demasque').hidden).toBe(false)
    expect($('#bar-demasque').textContent).toBe(REACTIONS.demasque.tampon)
    expect(onDone).not.toHaveBeenCalled()                     // rouge sur B11 : rendu après le noir de 0,7 s
    images(h, 0.3)
    expect(onDone).toHaveBeenCalledTimes(1)                   // témoin : un setTimeout de 2,5 s, que la boucle ne fait pas avancer
    expect(onDone.mock.calls[0][0].resultat).toBe('demasque')
    images(h, 3)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('le bilan « DOSSIER 05 » : lignes apprises tamponnées, INCONNU sinon ; le téléphone vibre, ANTON, « Alors ? », la réponse de Viktor ; onSortie avant, onDone après', () => {
    const f = fauxAudio(), onDone = vi.fn(), onSortie = vi.fn()
    const h = startBar({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), audio: f.audio, onDone, onSortie, options: { infos: ['heure', 'trajet'] } })
    clic('#bar-card')
    images(h, 1)
    viser(h, 'porte', ANCRES.depart.x, ANCRES.depart.z)
    touche('KeyE'); images(h, COQUILLE.maintienS + 0.05)
    expect(onSortie).toHaveBeenCalledTimes(1)                 // rouge sur B11 : aucun bilan
    expect(onSortie.mock.calls[0][0].resultat).toBe('sorti')
    const vibre = () => f.oscillateurs().filter(o => o.type === 'sawtooth' && frequence(o) === SON.vibration.moteurHz).length
    images(h, INTERFACE.bilan.telephoneS - 0.2, 0.05)
    expect($('#bar-bilan').hidden).toBe(false)
    expect($('#bar-bilan .onglet').textContent).toBe(BILAN.titre)
    const lignes = [...$('#bar-bilan').querySelectorAll('li')]
    expect(lignes.map(l => l.classList.contains('on'))).toEqual([true, true, true, true])
    expect(lignes.map(l => l.querySelector('.val').textContent)).toEqual([RENSEIGNEMENTS.trajet.valeur, BILAN.inconnu, BILAN.inconnu, RENSEIGNEMENTS.heure.valeur])
    expect(lignes.map(l => !!l.querySelector('.tampon'))).toEqual([true, false, false, true])
    images(h, INTERFACE.bilan.viktorS - INTERFACE.bilan.telephoneS + 0.2, 0.05)
    expect($('#bar-bilan .bar-tel .de').textContent).toBe(BILAN.telephone.de)
    expect($('#bar-bilan .bar-tel .msg').textContent.replace(/\u00a0/g, ' ')).toBe(BILAN.telephone.message)   // « ? » rattaché par une insécable
    expect(vibre()).toBe(INTERFACE.bilan.salves)
    expect(onDone).not.toHaveBeenCalled()
    images(h, INTERFACE.bilan.finS - INTERFACE.bilan.viktorS - 0.3, 0.05)
    expect($('#bar-bilan .viktor .tx').textContent).toBe(BILAN.viktor.partiel)
    images(h, 0.4, 0.05)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0][0]).toEqual(onSortie.mock.calls[0][0])
    expect(onDone.mock.calls[0][0].renseignements).toMatchObject({ heure: true, trajet: true, vehicule: false, place: false })
  })

  // relecture de B12 : une fin décidée ne change plus de sens si une image lève pendant sa scène
  it('une exception pendant la scène du démasqué rend quand même « demasque », une fois, avec l\'erreur', () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { h, onDone } = partie({ soupcon: 95, infos: ['heure'] })
    images(h, 0.2)
    h.debug.soupcon(100)
    images(h, 0.5)
    expect(onDone).not.toHaveBeenCalled()
    h.debug.casting.casser(new Error('image cassée'))
    expect(() => h.update(DT)).not.toThrow()
    expect(onDone).toHaveBeenCalledTimes(1)
    const [r] = onDone.mock.calls[0]
    expect(r.resultat).toBe('demasque')                       // témoin : « erreur », qui mènerait au convoi une partie perdue
    expect(r.error.message).toBe('image cassée')
    expect(r.renseignements.heure).toBe(true)
    expect($('#bar-root')).toBeNull()
    expect(erreur).toHaveBeenCalled()
    images(h, 3); h.stop()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('une exception pendant le bilan rend le contrat qu\'onSortie a reçu, avec l\'erreur, une fois', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onDone = vi.fn(), onSortie = vi.fn()
    const h = startBar({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone, onSortie, options: { infos: ['heure'] } })
    clic('#bar-card')
    images(h, 1)
    viser(h, 'porte', ANCRES.depart.x, ANCRES.depart.z)
    touche('KeyE'); images(h, COQUILLE.maintienS + 0.05)
    expect(onSortie).toHaveBeenCalledTimes(1)
    images(h, INTERFACE.bilan.ficheS + 0.1, 0.05)
    $('#bar-bilan .bar-tel').remove()                         // le téléphone arraché : l'image qui l'allume lève
    images(h, INTERFACE.bilan.telephoneS - INTERFACE.bilan.ficheS + 0.1, 0.05)
    expect(onDone).toHaveBeenCalledTimes(1)
    const { error, ...rendu } = onDone.mock.calls[0][0]
    expect(rendu).toEqual(onSortie.mock.calls[0][0])         // témoin : « erreur » après « sorti »
    expect(error).toBeInstanceOf(TypeError)
    images(h, 3); h.stop()
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

// ─── Règles de la base design lues dans bar.css (audit BAR-2 à BAR-7) ───
const regles = feuille => [...feuille.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map(m => ({ selecteurs: m[1].trim().split(',').map(s => s.trim().replace(/\s+/g, ' ')), decl: m[2] }))
// la déclaration `nom` de la règle qui porte le sélecteur `sel` (la dernière qui la donne)
const lire = (feuille, sel, nom) => {
  let v = null
  for (const r of regles(feuille)) if (r.selecteurs.includes(sel)) { const x = prop(r.decl, nom); if (x !== null) v = x }
  return v
}
// le contraste d'un texte sur sa plaque, elle-même posée sur `dessous` (blanc : au pire un mur éclairé par les stores)
function contrasteSur(feuille, selTexte, selPlaque, dessous = [255, 255, 255]) {
  const fond = selPlaque ? rgba(lire(feuille, selPlaque, 'background')) : [...dessous, 1]
  if (!fond) throw new Error(`pas de plaque pour ${selPlaque}`)
  const plaque = sur(fond, dessous)
  const texte = rgba(lire(feuille, selTexte, 'color'))
  if (!texte) throw new Error(`pas de couleur pour ${selTexte}`)
  return contraste(sur(texte, plaque), plaque)
}
// les sélecteurs d'une animation infinie sans jumelle .bar-reduced qui l'arrête (BAR-6)
const sansJumelle = feuille => {
  const toutes = regles(feuille)
  return toutes.filter(r => /\binfinite\b/.test(prop(r.decl, 'animation') || '')).flatMap(r => r.selecteurs)
    .filter(s => !toutes.some(t => t.selecteurs.includes(s.replace(/^\.bar /, '.bar.bar-reduced ')) && !/\binfinite\b/.test(prop(t.decl, 'animation') || 'infinite')))
}

describe('l\'interface du bar : règles de design (base design, audit BAR-2 à BAR-7)', () => {
  it('BAR-2 : tout texte posé sur la 3D a sa plaque et tient 4,5:1 même devant un mur blanc', () => {
    const paires = [
      ['.bar .bar-heure', '.bar .bar-heure'], ['.bar .bar-carnet h4', '.bar .bar-carnet'], ['.bar .bar-carnet li', '.bar .bar-carnet'],
      ['.bar .bar-carnet li.su', '.bar .bar-carnet'], ['.bar .bar-carnet .tampon', '.bar .bar-carnet .tampon'],
      ['.bar .bar-prompt', '.bar .bar-prompt'], ['.bar .bar-prompt .touche', '.bar .bar-prompt'], ['.bar .bar-aide', '.bar .bar-aide'],
      ['.bar .bar-palier', '.bar .bar-palier'], ['.bar .bar-palier', '.bar .bar-jauge.p-mefiance .bar-palier'],
      ['.bar .bar-palier', '.bar .bar-jauge.p-soupcon .bar-palier'],
      ['.bar .bar-sub', '.bar .bar-sub .tx'], ['.bar .bar-reaction', '.bar .bar-sub .tx'], ['.bar .bar-pensee', '.bar .bar-sub .tx'],
      ['.bar .bar-sub .spk', '.bar .bar-sub .spk'],
      ['.bar .bar-replique', '.bar .bar-dialogue'], ['.bar .bar-choix li', '.bar .bar-dialogue'], ['.bar .bar-choix b', '.bar .bar-dialogue'],
      ['.bar .bar-bilan .lib', '.bar .bar-bilan .fiche'], ['.bar .bar-bilan .val', '.bar .bar-bilan .fiche'],
      ['.bar .bar-bilan .inconnu .val', '.bar .bar-bilan .fiche'], ['.bar .bar-bilan .tampon', '.bar .bar-bilan .fiche'],
    ]
    for (const [t, p] of paires) expect(contrasteSur(css, t, p), `${t} sur ${p}`).toBeGreaterThanOrEqual(4.5)
    // posé sur le noir de fin : le tampon du démasqué
    expect(contrasteSur(css, '.bar .bar-demasque .tampon', null, [0, 0, 0])).toBeGreaterThanOrEqual(4.5)
    // témoin : l'heure de l'enquête, gris à 0,55 sans plaque
    expect(contrasteSur(cssEnquete, '.enq .enq-time', null)).toBeLessThan(4.5)
  })

  it('BAR-3 : l\'ambre pour ce que le joueur peut faire ; la minuterie de la couleur du texte, puis rouge', () => {
    expect(lire(css, '.bar .bar-minuterie i', 'background').toLowerCase()).toBe('#d7dccf')
    expect(lire(css, '.bar .bar-minuterie.alerte i', 'background').toLowerCase()).toBe('#e04848')
    expect(lire(css, '.bar .bar-choix li.on', 'border-left-color').toLowerCase()).toBe('#f0c040')
    expect(lire(css, '.bar .bar-anneau.rouge', 'background')).not.toMatch(/f0c040/i)
  })

  it('BAR-4 : choix en fondu de 150 ms sans glissement, surbrillance sans transition, sans cadre ni fond ; NOTÉ et le compte en 250 ms', () => {
    const anim = sel => lire(css, sel, 'animation') || ''
    const duree = a => parseFloat((a.match(/([\d.]+)s/) || [])[1])
    expect(duree(anim('.bar .bar-choix li'))).toBeLessThanOrEqual(0.15)
    const cle = anim('.bar .bar-choix li').split(/\s+/)[0]
    expect(css.match(new RegExp(`@keyframes ${cle}\\s*\\{(?:[^{}]*\\{[^}]*\\})*\\s*\\}`))[0]).not.toMatch(/transform/)
    for (const nom of ['transition', 'background', 'border', 'box-shadow']) expect(lire(css, '.bar .bar-choix li', nom), nom).toBeNull()
    expect(lire(css, '.bar .bar-choix li.on', 'transition')).toBeNull()
    for (const sel of ['.bar .bar-carnet .tampon', '.bar .bar-carnet .compte', '.bar .bar-bilan li.on .tampon', '.bar .bar-demasque .tampon']) expect(duree(anim(sel)), sel).toBeLessThanOrEqual(0.25)
    // effets atténués : sans agrandissement (§9)
    for (const sel of ['.bar.bar-reduced .bar-carnet .tampon', '.bar.bar-reduced .bar-carnet .compte', '.bar.bar-reduced .bar-bilan li.on .tampon', '.bar.bar-reduced .bar-demasque .tampon']) {
      expect(anim(sel), sel).toMatch(/^bar-fondu\b|^none$/)
    }
  })

  it('BAR-6 : toute animation répétée de bar.css a sa jumelle .bar-reduced ; le téléphone ne vibre pas, l\'écran ne tremble pas', () => {
    expect(sansJumelle(css)).toEqual([])
    expect(lire(css, '.bar.bar-reduced .bar-tel.vibre', 'animation')).toBe('none')
    expect(lire(css, '.bar.bar-reduced .bar-demasque.on', 'animation')).toBe('none')
    expect(sansJumelle(css + '\n.bar .bar-x .go { animation: enq-pulse 1.6s ease-in-out infinite; }')).toEqual(['.bar .bar-x .go'])   // témoin
  })

  it('§3.10 : en pause, tout est figé : la vignette, la jauge, l\'anneau rouge et les arcs cessent de battre (relecture de B12)', () => {
    for (const sel of ['.bar .bar-vignette.on', '.bar .bar-jauge.p-soupcon .bar-barre', '.bar .bar-anneau.rouge', '.bar .bar-arcs .arc.on']) {
      expect(lire(css, sel, 'animation'), sel).toBeTruthy()  // une animation en jeu…
      expect(lire(css, sel.replace(/^\.bar /, '.bar.en-pause '), 'animation-play-state'), sel).toBe('paused')   // témoin : aucune règle de pause
    }
  })

  it('BAR-7 : text-wrap: balance sur le bilan et les invites, jamais sur une ligne tapée', () => {
    for (const sel of ['.bar .bar-bilan li', '.bar .bar-aide', '.bar .bar-prompt']) expect(lire(css, sel, 'text-wrap'), sel).toBe('balance')
    for (const sel of ['.bar .bar-sub', '.bar .bar-pensee', '.bar .bar-reaction', '.bar .bar-bilan .viktor', '.bar .bar-tel .msg', '.bar .bar-replique']) expect(lire(css, sel, 'text-wrap'), sel).toBeNull()
  })
})
