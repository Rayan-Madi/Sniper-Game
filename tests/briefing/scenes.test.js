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

// « NUMÉRO MASQUÉ » est la signature du recruteur (spec des cinématiques, écarts du plan 2) : l'offre du
// prologue A, sa trace dans le journal d'appels du prologue B (refus du 21 février), et la source de
// l'écoute de M6. Anton, lui, appelle toujours depuis son numéro jetable, affiché en clair.
const SOURCES = import.meta.glob('../../src/briefing/scenes/*.js', { query: '?raw', import: 'default', eager: true })
const NUMERO_JETABLE = '06 39 98 41 07'

it('« NUMÉRO MASQUÉ » n\'apparaît que dans les prologues (le recruteur) et dans l\'écoute de M6', () => {
  const avec = Object.entries(SOURCES)
    .filter(([, source]) => source.includes('NUMÉRO MASQUÉ'))
    .map(([chemin]) => chemin.split('/').pop().replace(/\.js$/, ''))
    .sort()
  expect(avec).toEqual(['m6', 'prologue-a', 'prologue-b'])
})

describe.each(['libres', 'enfermes'])('épilogue, variante %s', port => {
  it('le dernier appel d\'Anton sonne depuis son numéro jetable, puis « ANTON » est tapé', async () => {
    const handle = await playCinematic('epilogue', { params: { port } })
    const root = document.getElementById('briefing-root')
    const ecrans = []   // états successifs de l'écran d'appel : « numéro | ligne d'information »
    let masque = false
    for (let t = 0; t < 120000; t += 100) {
      await vi.advanceTimersByTimeAsync(100)
      const phn = root.querySelector('#phn'), phi = root.querySelector('#phi')
      if (!phn) break   // scène terminée et démontée
      if (root.textContent.includes('NUMÉRO MASQUÉ')) masque = true
      const ecran = phn.textContent + ' | ' + phi.textContent
      if (ecran !== ' | ' && ecran !== ecrans.at(-1)) ecrans.push(ecran)
    }
    expect(handle.kit.errors).toEqual([])
    expect(masque).toBe(false)
    expect(ecrans[0]).toBe(NUMERO_JETABLE + ' | NUMÉRO INCONNU')
    expect(ecrans).toContain('« ANTON » | IDENTITÉ INCONNUE')
  })
})

describe('M5 : le compteur « vendus au réseau » suit les silhouettes allumées', () => {
  const allumees = root => root.querySelectorAll('#men .sold').length

  // Lecture normale : instant (ms depuis le lancement) où s'allume chaque silhouette vendue.
  async function instantsDAllumage() {
    const handle = await playCinematic('m5', {})
    const root = document.getElementById('briefing-root'), t0 = performance.now(), instants = []
    const obs = new MutationObserver(() => { while (instants.length < allumees(root)) instants.push(performance.now() - t0) })
    obs.observe(root, { subtree: true, attributes: true, attributeFilter: ['class'] })
    await vi.advanceTimersByTimeAsync(30000); await flush()
    obs.disconnect(); handle.cancel()
    return instants
  }

  it('en capture gelée juste après la 1re, la 9e et la dernière silhouette', async () => {
    const instants = await instantsDAllumage()
    expect(instants).toHaveLength(12)
    for (const n of [1, 9, 12]) {
      const freeze = instants[n - 1] + 1
      const handle = await playCinematic('m5', { freeze })
      const root = document.getElementById('briefing-root')
      await vi.advanceTimersByTimeAsync(freeze + 500); await flush()
      expect(handle.kit.frozen).toBe(true)
      expect(allumees(root)).toBe(n)
      expect(root.querySelector('#soldn').textContent).toBe(String(n))
      handle.cancel()
    }
  })
})
