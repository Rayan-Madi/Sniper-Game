import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { MAIN_SRC, analyse, callsIn } from '../gfx/mainSource.js'
import { MISSIONS, EVENEMENTS } from '../../src/campaign/missions/index.js'
import { dureeDeLigne } from '../../src/campaign/radio.js'
import { harnais } from './reglesHarnais.js'

// La radio d'Anton et les fenêtres de tir, dans le jeu (spec du lot 3, §2 g et tests 3a : « fenêtre qui expire ; radio
// sur événement » ; plan du lot 3a, tâche A8). signaler, coupEntendu, avancerRegles, echeanceDeFenetre et direALaRadio
// de main.js sont exécutés tels quels (tests/campaign/reglesHarnais.js), menés image par image :
// - un événement de la mission (le départ, le premier tir, chaque tir…) fait dire à Anton ses lignes, une à la fois, dans
//   le fil sous son nom, avec ses bips ;
// - une fenêtre ouverte au premier tir échoit : l'échec à son texte, une pénalité au score et au fil, ou un événement
//   (que la radio entend) ;
// - les événements que main.js signale sont ceux que les missions peuvent citer (EVENEMENTS), tous signalés.
//
// Témoin : ces fonctions n'existent pas avant la tâche (ne compte pas) ; mutations du main.js d'aujourd'hui, chacune vue
// rouge (journal de la tâche) : le premier tir signalé à chaque tir ; l'échéance d'échec ignorée ; la pénalité sans
// le fil ; la ligne écrite sans son nom ; la pause qui ne coupe pas la radio.

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren() })

const camera = () => { const c = new THREE.PerspectiveCamera(); c.position.set(0, 10, 10); c.updateMatrixWorld(); return c }

function jeu(o) {
  const m = { ...MISSIONS[0], ...o }
  const h = harnais({ mission: m, lieux: { sorties: {}, abris: {} }, camera: camera(), silencieux: true })
  const tir = () => { h.s.poser({ statShots: h.s.etat().statShots + 1 }); h.s.fns.coupEntendu({ silenced: true }) }
  const mener = s => { for (let i = 0; i < Math.round(s * 60); i++) h.image() }
  return { h, tir, mener }
}

describe('la radio : un événement, les lignes d\'Anton', () => {
  it('au premier tir, une fois (même pour une ligne qui pourrait être redite) ; à chaque tir, autant de fois que la ligne le permet ; une à la fois', () => {
    const { h, tir, mener } = jeu({ radio: [
      { evenement: 'premier-tir', texte: 'Il a entendu.', fois: 2 },
      { evenement: 'tir', texte: 'Encore un.', fois: 3 },
    ] })
    tir(); mener(5); tir(); mener(5)
    const lignes = [...h.killFeed.querySelectorAll('.kill-entry.radio')].map(e => e.lastChild.textContent)
    expect(lignes).toEqual(['Il a entendu.', 'Encore un.', 'Encore un.'])
    expect(h.journal.radio).toEqual([dureeDeLigne('Il a entendu.'), dureeDeLigne('Encore un.'), dureeDeLigne('Encore un.')])
  })

  it('la ligne reste dans le fil le temps de la lire (2 s après ses bips, 2,8 s au moins), puis s\'en va', () => {
    const texte = 'Une ligne assez longue pour durer plus que le fil ordinaire.'
    const { h, tir, mener } = jeu({ radio: [{ evenement: 'premier-tir', texte }] })
    tir(); mener(1 / 60)
    expect(h.killFeed.querySelectorAll('.kill-entry.radio')).toHaveLength(1)
    vi.advanceTimersByTime((dureeDeLigne(texte) + 2) * 1000 - 50)
    expect(h.killFeed.querySelectorAll('.kill-entry.radio')).toHaveLength(1)
    vi.advanceTimersByTime(100)
    expect(h.killFeed.querySelectorAll('.kill-entry.radio')).toHaveLength(0)
  })
})

// La pause, menée comme dans le jeu (relecture de A8) : pauseGame et resumeGame de main.js exécutés tels quels, la boucle
// arrêtée entre les deux (ni règles, ni horloge de la mission). Témoin : radio.js de la tâche A8 (f60fb99), où le canal
// ne se libérait que par un avancer pendant la suspension, que la boucle ne fait jamais : la suivante attendait la fin
// prévue de la ligne coupée (vu rouge).
describe('la pause : Anton se tait, la ligne en cours coupée ; à la reprise, le canal est libre', () => {
  const lignes = h => [...h.killFeed.querySelectorAll('.kill-entry.radio')].map(e => e.lastChild.textContent)

  it('pauseGame coupe la ligne et ses bips ; resumeGame : la suivante dès la première image', () => {
    const longue = 'Une ligne assez longue pour durer bien plus que la pause.'
    const { h, tir, mener } = jeu({ radio: [{ evenement: 'tir', texte: longue }, { evenement: 'tir', texte: 'La suivante.' }] })
    tir(); mener(0.5)
    expect(lignes(h)).toEqual([longue])
    h.s.fns.pauseGame()
    expect(h.s.etat().gamePhase).toBe('paused')
    expect(h.journal.radioCoupee).toBe(1)
    const t = h.s.etat().missionClock
    mener(5)
    expect(h.s.etat().missionClock).toBe(t)
    expect(lignes(h)).toEqual([longue])
    h.s.fns.resumeGame()
    expect(h.s.etat().missionClock).toBeLessThan(dureeDeLigne(longue))
    mener(1 / 60)
    expect(lignes(h)).toEqual([longue, 'La suivante.'])
    expect(h.journal.radio).toEqual([dureeDeLigne(longue), dureeDeLigne('La suivante.')])
  })
})

describe('les fenêtres de tir : ouvertes au premier tir, leur échéance', () => {
  const fenetre = echeance => [{ nom: 'f', depart: 'premier-tir', dureeS: 2, echeance }]

  it('échec : la mission échoue à son texte, 2 s après le premier tir', () => {
    const { h, tir, mener } = jeu({ fenetres: fenetre({ echec: 'Un officier a gagné un igloo.' }) })
    mener(1); tir()
    mener(1.9)
    expect(h.journal.echecs).toEqual([])
    mener(0.2)
    expect(h.journal.echecs).toEqual(['Un officier a gagné un igloo.'])
  })

  it('pénalité : le score perd ses points, le fil le dit (en rouge), une fois', () => {
    const { h, tir, mener } = jeu({ fenetres: fenetre({ penalite: 50, fil: 'Trop lent (-50 pts)' }) })
    h.s.poser({ score: 400 })
    tir(); mener(5)
    expect(h.s.etat().score).toBe(350)
    expect(h.journal.fil).toEqual(['!Trop lent (-50 pts)'])
  })

  it('événement : signalé à la mission, que la radio entend', () => {
    const { h, tir, mener } = jeu({ fenetres: fenetre({ evenement: 'alerte' }), radio: [{ evenement: 'alerte', texte: 'Il raccroche.' }] })
    tir(); mener(3)
    expect([...h.killFeed.querySelectorAll('.kill-entry.radio')].map(e => e.lastChild.textContent)).toEqual(['Il raccroche.'])
    expect(h.journal.echecs).toEqual([])
  })
})

describe('câblage', () => {
  const a = analyse(MAIN_SRC)
  const texte = n => MAIN_SRC.slice(a.fns.get(n).start, a.fns.get(n).end)
  const signales = [...MAIN_SRC.matchAll(/\bsignaler\('([^']+)'\)/g)].map(x => x[1])

  it('chaque événement que main.js signale est un de ceux que les missions peuvent citer (EVENEMENTS), et chacun est signalé', () => {
    expect([...new Set(signales)].sort()).toEqual([...EVENEMENTS].sort())
  })

  it('startLevel monte les règles de la mission (monterRegles), puis signale le départ, une fois l\'horloge remise à zéro', () => {
    expect(texte('startLevel')).toMatch(/missionClock = 0[\s\S]*monterRegles\(\)[\s\S]*signaler\('depart'\)/)
  })

  it('la boucle mène les règles après la balle ; la pause coupe la radio et ses bips, la reprise la rend', () => {
    expect(texte('loop')).toMatch(/resolveBullet\(arrivee\)[\s\S]*avancerRegles\(\)/)
    expect(callsIn(a, 'pauseGame').map(c => c.callee)).toEqual(expect.arrayContaining(['radio.suspendre', 'stopRadio']))
    expect(callsIn(a, 'resumeGame').map(c => c.callee)).toContain('radio.reprendre')
  })

  it('le démontage de la mission oublie les réactions en attente (des PNJ libérés)', () => {
    expect(callsIn(a, 'unmountLevel').map(c => c.callee)).toContain('alarme.vider')
  })
})
