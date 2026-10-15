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

// Prologue B, version 2 (spec 2026-10-11-prologue-v2 §1 et §2) : le message est celui de sa femme ; Anton appelle
// (appel entrant, depuis le numéro de 18:52), dit qu'il peut aider sans en dire plus et raccroche ; puis il envoie le
// dossier, dont les fiches remplissent le mur, et deux messages tapés ; le contact s'enregistre « ANTON ».
describe('prologue B : le message de sa femme, l\'appel d\'Anton, le dossier', () => {
  // Une lecture complète, relevée toutes les 100 ms.
  async function lecture() {
    const handle = await playCinematic('prologue-b', {})
    const root = document.getElementById('briefing-root')
    const $ = sel => root.querySelector(sel)
    // au début de chaque réplique : le texte du téléphone et les fiches épinglées / toutes les fiches
    const obs = { repliques: [], auDebut: [], appel: [], ecranQuiSonne: null, vm: null, journaux: [], dossier: null, ph1Fin: null,
      radioPendantLAppel: false, radioApresRaccroche: [] }
    let tx = null
    const appelDe = ph => ['end', 'ans', 'ring', 'dial', 'vm'].find(c => ph.classList.contains(c)) || null
    const journal = () => [...root.querySelectorAll('.p-log .lr')].map(r =>
      `${r.querySelector('b').textContent} · ${r.querySelector('small').textContent.replace('●', '').trim()}${r.querySelector('.vmi') ? ' · [message]' : ''}`)
    for (let t = 0; t < 120000; t += 100) {
      await vi.advanceTimersByTimeAsync(100)
      const ph = $('#ph1')
      if (!ph) break   // scène terminée et démontée
      // répliques (sous-titres) : une nouvelle ligne = un nouvel élément .tx ; on garde son texte complet
      const spk = $('#sub .spk'), t2 = $('#sub .tx')
      if (t2 && t2 !== tx && t2.textContent) {
        tx = t2; obs.repliques.push([spk.textContent, ''])
        obs.auDebut.push({ ph1: ph.textContent, fiches: `${root.querySelectorAll('.fc.set').length} / ${root.querySelectorAll('.fc').length}` })
      }
      if (t2 && t2 === tx) obs.repliques.at(-1)[1] = t2.textContent
      // états de l'écran d'appel, dans l'ordre
      const etat = appelDe(ph)
      if (etat && etat !== obs.appel.at(-1)) obs.appel.push(etat)
      if (etat === 'ring' && !obs.ecranQuiSonne) obs.ecranQuiSonne = `${$('#ph1n').textContent} | ${$('#ph1i').textContent} | ${$('#ph1 .p-st').textContent.includes('APPEL ENTRANT')}`
      if (etat === 'vm' && !obs.vm) obs.vm = `${$('.p-vm b').textContent} | ${$('.p-vm small').textContent}`
      if (ph.classList.contains('log')) { const j = journal(); if (j.join() !== obs.journaux.at(-1)?.join()) obs.journaux.push(j) }
      // la bulle de la pièce jointe est dans le fil dès le départ, cachée : on attend qu'elle s'affiche
      if (obs.dossier === null && ph.classList.contains('sms') && getComputedStyle($('#batt')).display !== 'none') obs.dossier = root.querySelectorAll('.fc.on').length
      // l'indicateur radio (le canal ouvert) : relevé pendant que l'inconnu parle, puis après le raccrochage (écran du téléphone)
      if ($('#radio').classList.contains('on')) {
        if (spk?.textContent === 'INCONNU') obs.radioPendantLAppel = true
        if (obs.appel.includes('end')) {
          const ecran = ['end', 'log', 'sms'].filter(c => ph.classList.contains(c)).join('+') + ($('#rig').classList.contains('on') ? '' : ' (tableau)')
          if (!obs.radioApresRaccroche.includes(ecran)) obs.radioApresRaccroche.push(ecran)
        }
      }
      obs.ph1Fin = ph.textContent
    }
    expect(handle.kit.errors).toEqual([])
    return obs
  }

  it('les répliques racontent la nouvelle histoire, dans l\'ordre, et rien d\'autre', async () => {
    const { repliques } = await lecture()
    const VM = 'MESSAGERIE · MAISON · 19:04', SMS = 'MESSAGE · 06 39 98 41 07'
    expect(repliques).toEqual([
      [VM, 'Viktor, c\'est moi… Il y a des gens à la porte.'],
      [VM, 'Ils frappent. Ils ne s\'en vont pas.'],
      [VM, 'Rappelle-moi. Vite.'],
      ['INCONNU', 'Viktor. Je sais ce qu\'ils ont fait ce soir.'],
      ['INCONNU', 'Je peux t\'aider.'],
      ['INCONNU', 'Ils ont dépassé les bornes.'],
      ['VIKTOR', 'Qui êtes-vous ?'],
      ['INCONNU', 'Tu vas savoir qui.'],
      [SMS, 'Je te donne les noms. Toi, tu as le fusil.'],
      [SMS, 'Appelle-moi Anton.'],
      ['VIKTOR', 'Ils voulaient mon silence. Ils auront ma vengeance.'],
    ])
  })

  it('le téléphone : la messagerie de la maison, puis un appel ENTRANT du numéro de 18:52, décroché, raccroché ; jamais de rappel', async () => {
    const { appel, vm, ecranQuiSonne } = await lecture()
    expect(vm).toBe('MAISON | AUJ. 19:04 · 0:09')
    expect(appel).toEqual(['vm', 'ring', 'ans', 'end'])
    expect(ecranQuiSonne).toBe(NUMERO_JETABLE + ' | NUMÉRO INCONNU | true')
  })

  it('le journal des appels : l\'appel entrant de 22:41 en tête, le message sur la maison seule ; « ANTON » une fois le contact enregistré', async () => {
    const { journaux } = await lecture()
    expect(journaux[0]).toEqual([
      NUMERO_JETABLE + ' · AUJ. 22:41 · ENTRANT',
      'MAISON · AUJ. 19:04 · MANQUÉ · [message]',
      NUMERO_JETABLE + ' · AUJ. 18:52 · MANQUÉ',
      'NUMÉRO MASQUÉ · 21 FÉVR. · 23:12 · 0:10',
    ])
    expect(journaux.at(-1)).toEqual([
      '« ANTON » · AUJ. 22:41 · ENTRANT',
      'MAISON · AUJ. 19:04 · MANQUÉ · [message]',
      '« ANTON » · AUJ. 18:52 · MANQUÉ',
      'NUMÉRO MASQUÉ · 21 FÉVR. · 23:12 · 0:10',
    ])
  })

  it('le dossier arrive par message avant la première fiche ; toutes les fiches sont au mur avant « Je te donne les noms » ; le contact devient « ANTON »', async () => {
    const { repliques, auDebut, dossier, ph1Fin } = await lecture()
    const noms = repliques.findIndex(([, l]) => l === 'Je te donne les noms. Toi, tu as le fusil.')
    const anton = repliques.findIndex(([, l]) => l === 'Appelle-moi Anton.')
    expect(noms).toBeGreaterThan(-1); expect(anton).toBeGreaterThan(noms)
    expect(dossier).toBe(0)
    expect(auDebut[noms].fiches).toBe('8 / 8')
    expect(auDebut[anton].ph1).not.toContain('ANTON')
    expect(ph1Fin).toContain('« ANTON »')
  })

  it('l\'indicateur radio (canal ouvert) s\'allume pendant l\'appel et s\'éteint quand il raccroche : plus de canal sur le journal, le dossier ni les messages', async () => {
    const { radioPendantLAppel, radioApresRaccroche } = await lecture()
    expect(radioPendantLAppel).toBe(true)
    expect(radioApresRaccroche).toEqual([])
  })
})

// Effets atténués (spec du lot 1 §4.5 : aucune secousse) : l'appel entrant de la prologue B fait vibrer le téléphone.
describe('prologue B, effets atténués', () => {
  // animation du téléphone et de ses traits de vibration pendant l'appel entrant
  const pendantLAppel = async reducedMotion => {
    const handle = await playCinematic('prologue-b', { reducedMotion })
    const root = document.getElementById('briefing-root')
    let vu = null
    for (let t = 0; t < 30000 && !vu; t += 100) {
      await vi.advanceTimersByTimeAsync(100)
      const ph = root.querySelector('#ph1')
      if (ph.classList.contains('ring')) vu = [getComputedStyle(ph).animation, getComputedStyle(root.querySelector('.vib')).animation]
    }
    handle.cancel()
    return vu
  }

  it('le téléphone qui sonne ne tremble pas et ses traits ne clignotent pas (sans l\'option, si : garde-fou)', async () => {
    const [telephone, traits] = await pendantLAppel(false)
    expect(telephone).toMatch(/pro-vib/)
    expect(traits).toMatch(/k-blink/)
    const [attenue, traitsAttenues] = await pendantLAppel(true)
    expect(attenue).not.toMatch(/pro-vib/)
    expect(traitsAttenues).not.toMatch(/k-blink/)
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
