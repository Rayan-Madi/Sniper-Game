import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { statsImages, statsAnimations, sonde, synthese, ajouterMesure, lireOptions, urlCine, cleDuCas, avecDelai, avertissementRendu, BUDGET_MS } from '../../scripts/cine-perf.mjs'
import { frameStats } from '../../src/gfx/stats.js'

// Coût de rendu des cinématiques (spec cinématiques v2 §3.6, tâche C3) : partie pure de scripts/cine-perf.mjs (durées
// d'image et animations relevées par la sonde, annexe), plus la sonde injectée dans la page, menée ici par une fausse
// fenêtre. La mesure elle-même (Chrome sans interface) se vérifie en vrai : README des annexes, « Cinématiques v2 ».

describe('statsImages', () => {
  it('p95 au rang le plus proche, pas la moyenne : une image très lente sur vingt', () => {
    // moyenne 15,32 ms ; triées, la 19e (⌈0,95 × 20⌉) vaut 5,6
    const durees = [...Array(9).fill(5.6), 200, ...Array(10).fill(5.6)]
    expect(statsImages(durees)).toMatchObject({ images: 20, p50: 5.6, p95: 5.6, max: 200 })
  })

  it('dix images lentes sur cent font passer la p95 au-dessus de la moyenne (6,15 ms)', () => {
    const durees = Array.from({ length: 100 }, (_, i) => (i % 10 === 3 ? 11.1 : 5.6))
    expect(statsImages(durees)).toMatchObject({ p50: 5.6, p95: 11.1, max: 11.1 })
  })

  it('mêmes p50 et p95 que frameStats (panneau du jeu, sonde des maquettes)', () => {
    const listes = [[40, 10, 30, 20], Array.from({ length: 100 }, (_, i) => 100 - i), [...Array(113).fill(16), ...Array(7).fill(50)], [5.5, 11.1, 461.1, 5.6, 22.3, 16.6, 177.8]]
    for (const l of listes) {
      const { p50, p95 } = frameStats(l)
      expect(statsImages(l)).toMatchObject({ p50, p95 })
    }
  })

  it('instant de l\'image la plus longue : la fin de cette image, comptée depuis le montage de la scène', () => {
    expect(statsImages([5.6, 5.5, 177.8, 5.6]).maxA).toBeCloseTo(188.9, 6)
  })

  it('images lentes : au-delà de BUDGET_MS (22 ms), 22 tout juste ne l\'est pas', () => {
    expect(statsImages([5.6, 22, 22.1, 33.3, 5.5]).lentes).toBe(2)
  })

  it('seuil des images lentes : celui du panneau de performances (BUDGET_MS de src/gfx/stats.js)', () => {
    const source = readFileSync(join(__dirname, '../../src/gfx/stats.js'), 'utf8')
    expect(BUDGET_MS).toBe(+source.match(/const BUDGET_MS = (\d+(?:\.\d+)?)/)[1])
  })

  it('liste vide : tout à zéro, sans instant', () => {
    expect(statsImages([])).toEqual({ images: 0, p50: 0, p95: 0, max: 0, maxA: null, lentes: 0 })
  })

  it('ne modifie pas la liste reçue', () => {
    const durees = [33.3, 5.6, 11.1]
    statsImages(durees)
    expect(durees).toEqual([33.3, 5.6, 11.1])
  })
})

describe('statsAnimations', () => {
  it('maximum des animations en cours (ni le dernier relevé ni la moyenne), à l\'instant du premier maximum', () => {
    const releves = [
      { t: 0, enCours: 8, total: 8 }, { t: 250, enCours: 35, total: 38 }, { t: 500, enCours: 12, total: 13 },
      { t: 750, enCours: 35, total: 36 }, { t: 1000, enCours: 9, total: 40 },
    ]
    expect(statsAnimations(releves)).toEqual({ animationsMax: 35, animationsMaxA: 250, animationsTotalMax: 40, releves: 5 })
  })

  it('aucun relevé : zéro, sans instant', () => {
    expect(statsAnimations([])).toEqual({ animationsMax: 0, animationsMaxA: null, animationsTotalMax: 0, releves: 0 })
  })
})

// Fausse fenêtre : les rappels de requestAnimationFrame partent quand le test pose une image (horodatage en ms), #st
// existe tant que la scène est montée, getAnimations rend la liste choisie par le test.
function fausseFenetre() {
  const rappels = []
  let montee = false, animations = []
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    performance: { now: () => 0 },
    requestAnimationFrame: f => { rappels.push(f) },
    document: {
      visibilityState: 'visible',
      getElementById: id => (id === 'st' && montee ? {} : null),
      getAnimations: () => animations,
    },
  }
  return {
    win, rappels,
    image: ts => rappels.splice(0).forEach(f => f(ts)),
    monter: v => { montee = v },
    animer: a => { animations = a },
  }
}

describe('sonde (injectée dans la page avant ses scripts)', () => {
  it('ne compte que les images de la scène montée et s\'arrête à son démontage', () => {
    const f = fausseFenetre()
    sonde(f.win)
    f.image(0); f.image(5.6); f.image(11.1)   // page chargée, scène pas encore montée
    f.monter(true)
    f.image(16.7); f.image(22.2); f.image(33.3); f.image(38.9)
    f.monter(false)
    f.image(44.4)
    const p = f.win.__cinePerf
    expect(p.debut).toBe(16.7)
    expect(p.fin).toBe(44.4)
    expect(p.images.map(v => +v.toFixed(1))).toEqual([5.5, 11.1, 5.6])
    expect(f.rappels).toHaveLength(0)   // plus aucune image demandée après la fin
    expect(p).toMatchObject({ ecran: '1280×720×1', visibilite: 'visible' })
  })

  it('relève les animations en cours toutes les 250 ms au moins, depuis le montage', () => {
    const f = fausseFenetre()
    sonde(f.win)
    f.animer([{ playState: 'running' }, { playState: 'running' }, { playState: 'paused' }, { playState: 'finished' }])
    f.image(900)
    f.monter(true)
    for (const ts of [1000, 1100, 1200, 1250, 1300, 1499, 1500]) f.image(ts)
    expect(f.win.__cinePerf.releves).toEqual([
      { t: 0, enCours: 2, total: 4 }, { t: 250, enCours: 2, total: 4 }, { t: 500, enCours: 2, total: 4 },
    ])
  })
})

describe('synthese', () => {
  it('durée de la scène, images par seconde, durées d\'image et animations, arrondies', () => {
    const brut = {
      debut: 1000, fin: 2005.4,
      images: [...Array(150).fill(5.56), 177.84, ...Array(10).fill(11.11)],
      releves: [{ t: 0, enCours: 8, total: 9 }, { t: 251, enCours: 13, total: 14 }, { t: 502, enCours: 9, total: 10 }],
    }
    expect(synthese(brut)).toEqual({
      dureeMs: 1005, images: 161, ips: 160.1, p50: 5.6, p95: 11.1, max: 177.8, maxA: 1012, lentes: 1,
      animationsMax: 13, animationsMaxA: 251, animationsTotalMax: 14, releves: 3,
    })
  })
})

describe('ajouterMesure (annexe)', () => {
  it('ajoute la mesure sans retirer les précédentes, numérotée par cas et par ralenti', () => {
    const a1 = ajouterMesure(null, { cas: 'm1', ralenti: 1, p95: 5.6 })
    const a2 = ajouterMesure(a1, { cas: 'm1', ralenti: 4, p95: 11.1 })
    const a3 = ajouterMesure(a2, { cas: 'm1', ralenti: 1, p95: 5.7 })
    const a4 = ajouterMesure(a3, { cas: 'epilogue?port=libres', ralenti: 1, p95: 5.6 })
    expect(a4.mesures.map(m => [m.cas, m.ralenti, m.passe, m.p95])).toEqual([
      ['m1', 1, 1, 5.6], ['m1', 4, 1, 11.1], ['m1', 1, 2, 5.7], ['epilogue?port=libres', 1, 1, 5.6],
    ])
    expect(a1.mesures).toHaveLength(1)   // l'annexe reçue n'est pas modifiée
  })
})

describe('lireOptions', () => {
  it('<id> seul : processeur à sa vitesse, sans paramètre ni annexe', () => {
    expect(lireOptions(['m1'])).toEqual({ id: 'm1', ralenti: 1, params: {}, annexe: null })
  })

  it('ralenti, paramètres de la scène et annexe', () => {
    expect(lireOptions(['epilogue', '--ralenti=4', '--params=port=libres&attenue=1', '--annexe=2026-10-28-cine-v1.json']))
      .toEqual({ id: 'epilogue', ralenti: 4, params: { port: 'libres', attenue: '1' }, annexe: '2026-10-28-cine-v1.json' })
  })

  it('refuse ce qui fausserait la mesure en silence, en le nommant', () => {
    expect(() => lireOptions(['m1', '--ralentir=4'])).toThrow(/--ralentir/)
    expect(() => lireOptions([])).toThrow(/scène/)
    expect(() => lireOptions(['m7'])).toThrow(/m7/)
    expect(() => lireOptions(['m1', 'm2'])).toThrow(/m2/)
    for (const r of ['0', '0.5', 'x', '']) expect(() => lireOptions(['m1', `--ralenti=${r}`])).toThrow(/ralenti/)
    expect(() => lireOptions(['m1', '--params=freeze=5000'])).toThrow(/freeze/)
    expect(() => lireOptions(['m1', '--params=cine=m2'])).toThrow(/cine/)
    for (const a of ['../x.json', 'sous/x.json', 'x.txt']) expect(() => lireOptions(['m1', `--annexe=${a}`])).toThrow(/annexe/)
  })
})

// Garde-fou des attentes de la mesure (fin de la scène, mesure entière) : une page qui ne répond plus ne bloque jamais
// le script, et une attente tenue ne laisse aucun minuteur derrière elle (il retiendrait le processus des minutes).
describe('avecDelai', () => {
  afterEach(() => { vi.useRealTimers() })

  it('rend la valeur de la promesse tenue à temps, sans minuteur restant', async () => {
    vi.useFakeTimers()
    await expect(avecDelai(Promise.resolve('fini'), 5 * 60000, 'trop long')).resolves.toBe('fini')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('échoue avec son message au bout du délai si la promesse ne se tient pas', async () => {
    vi.useFakeTimers()
    const attente = avecDelai(new Promise(() => {}), 1000, 'scène toujours montée')
    const verdict = expect(attente).rejects.toThrow('scène toujours montée')
    await vi.advanceTimersByTimeAsync(1000)
    await verdict
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('adresse et nom du cas', () => {
  it('?cine=<id> suivi des paramètres de la scène', () => {
    expect(urlCine('http://localhost:5186/', 'epilogue', { port: 'libres' })).toBe('http://localhost:5186/?cine=epilogue&port=libres')
    expect(urlCine('http://localhost:5186/', 'prologue-a', {})).toBe('http://localhost:5186/?cine=prologue-a')
  })

  it('nom du cas : la scène, et ses paramètres comme dans tests/briefing/montage.test.js', () => {
    expect(cleDuCas('epilogue', { port: 'enfermes' })).toBe('epilogue?port=enfermes')
    expect(cleDuCas('m3', {})).toBe('m3')
  })
})

// La carte graphique est demandée (drapeaux de memtest --gpu), mais Chrome se replie en silence sur un rendu logiciel
// quand elle n'est pas disponible : la mesure le signale, sauf si le rendu logiciel est demandé (SWIFTSHADER=1).
describe('avertissementRendu (mesure faite hors de la carte graphique)', () => {
  const CARTE = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 (0x00002206) Direct3D11 vs_5_0 ps_5_0, D3D11)'   // annexe de la v1
  const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'
  const WARP = 'ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)'

  it('carte graphique et composition sur la carte (rendu des 40 mesures de la v1) : rien à signaler', () => {
    expect(avertissementRendu({ moteur: CARTE, composition: 'enabled', logiciel: false })).toBeNull()
  })

  it('WebGL en rendu logiciel (SwiftShader, repli de Chrome ; WARP, celui de Windows) : signalé, moteur nommé', () => {
    for (const moteur of [SWIFTSHADER, WARP]) {
      expect(avertissementRendu({ moteur, composition: 'enabled', logiciel: false })).toEqual(expect.stringContaining(moteur))
    }
  })

  it('composition hors de la carte graphique, ou inconnue : signalée, état nommé', () => {
    for (const composition of ['disabled_software', 'unavailable_software', 'inconnue']) {
      expect(avertissementRendu({ moteur: CARTE, composition, logiciel: false })).toEqual(expect.stringContaining(`composition ${composition}`))
    }
    expect(avertissementRendu({ moteur: SWIFTSHADER, composition: 'disabled_software', logiciel: false }))
      .toEqual(expect.stringMatching(/SwiftShader driver.*composition disabled_software|composition disabled_software.*SwiftShader driver/))
  })

  it('rendu logiciel demandé (SWIFTSHADER=1) : rien à signaler', () => {
    expect(avertissementRendu({ moteur: SWIFTSHADER, composition: 'disabled_software', logiciel: true })).toBeNull()
  })
})
