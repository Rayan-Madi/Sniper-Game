import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createKit } from '../../src/briefing/kit.js'

// Les deux kits des cinématiques (spec cinématiques v2 §3.2) : celui du jeu (src/briefing/kit.js, kit.css) et celui
// des maquettes (docs/superpowers/maquettes/cinematiques/kit.js, kit.css), où l'on juge une scène avant de la porter.
// Ce fichier garde ce que les maquettes doivent montrer comme le jeu : les blocs d'outils communs, identiques au
// caractère près (G7), branchés sur le gel et « rejouer » des maquettes, et les effets atténués (?attenue=1) ; plus
// l'étiquette sous la scène, propre aux maquettes (sonde d'images).

// Chemins pris depuis ce fichier, comme tests/briefing/montage.test.js.
const MQ = join(__dirname, '../../docs/superpowers/maquettes/cinematiques')
const JEU = join(__dirname, '../../src/briefing')
const KIT_MQ = readFileSync(join(MQ, 'kit.js'), 'utf8')

// G7 (spec §3.1) : un bloc commun va de sa marque d'ouverture à sa marque de fin, comprises, et se recopie tel quel
// d'un kit à l'autre :
//   JS  : // ── commun : <nom> ──        …   // ── fin du commun : <nom> ──
//   CSS : /* ── commun : <nom> ── */     …   /* ── fin du commun : <nom> ── */
// [fichier, kit du jeu, kit des maquettes, blocs que la garde doit voir (sinon elle ne garde rien)]
const PAIRES = [
  ['kit.js', join(JEU, 'kit.js'), join(MQ, 'kit.js'), ['anim']],
  ['kit.css', join(JEU, 'kit.css'), join(MQ, 'kit.css'), ['matières', 'atténué', 'gel']],
]
const MARQUE = /^\s*(?:\/\/|\/\*) ── (commun|fin du commun) : (.+?) ──(?: \*\/)?\s*$/

// Blocs d'un fichier par nom, et ce qui cloche dans leurs marques (bloc en double, imbriqué, jamais fermé…).
function blocsCommuns(texte) {
  const lignes = texte.replace(/\r\n/g, '\n').split('\n')
  const blocs = new Map(), erreurs = []
  let ouvert = null
  lignes.forEach((ligne, i) => {
    const m = ligne.match(MARQUE)
    if (!m) return
    const [, sorte, nom] = m
    if (sorte === 'commun') {
      if (ouvert) erreurs.push(`bloc « ${nom} » ouvert dans le bloc « ${ouvert.nom} » (ligne ${i + 1})`)
      if (blocs.has(nom)) erreurs.push(`bloc « ${nom} » en double (ligne ${i + 1})`)
      ouvert = { nom, debut: i }
    } else if (!ouvert || ouvert.nom !== nom) {
      erreurs.push(`fin du bloc « ${nom} » sans son ouverture (ligne ${i + 1})`)
    } else {
      blocs.set(nom, lignes.slice(ouvert.debut, i + 1)); ouvert = null
    }
  })
  if (ouvert) erreurs.push(`bloc « ${ouvert.nom} » jamais fermé (ouvert ligne ${ouvert.debut + 1})`)
  return { blocs, erreurs }
}

// Première ligne qui diffère entre deux copies d'un bloc, pour lire l'échec sans diff.
function premierEcart(a, b) {
  const i = a.findIndex((ligne, n) => ligne !== b[n])
  const n = i === -1 ? Math.min(a.length, b.length) : i
  return `ligne ${n + 1} du bloc :\n  jeu      : ${a[n] ?? '(fin du bloc)'}\n  maquettes : ${b[n] ?? '(fin du bloc)'}`
}

describe.each(PAIRES)('G7 : blocs communs de %s identiques dans les deux kits', (fichier, cheminJeu, cheminMq, attendus) => {
  const jeu = blocsCommuns(readFileSync(cheminJeu, 'utf8')), mq = blocsCommuns(readFileSync(cheminMq, 'utf8'))

  it('marques bien formées dans les deux kits, et la garde voit les blocs attendus', () => {
    expect(jeu.erreurs, `kit du jeu (${fichier})`).toEqual([])
    expect(mq.erreurs, `kit des maquettes (${fichier})`).toEqual([])
    for (const nom of attendus) expect(jeu.blocs.has(nom), `bloc « ${nom} » absent du kit du jeu (${fichier})`).toBe(true)
  })

  it('mêmes blocs des deux côtés, identiques au caractère près', () => {
    expect([...mq.blocs.keys()].sort(), `blocs du kit des maquettes (${fichier})`).toEqual([...jeu.blocs.keys()].sort())
    for (const [nom, lignes] of jeu.blocs) {
      const copie = mq.blocs.get(nom)
      expect(copie && copie.join('\n'), `bloc « ${nom} » de ${fichier} : ${copie ? premierEcart(lignes, copie) : 'absent'}`).toBe(lignes.join('\n'))
    }
  })
})

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] }
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
beforeEach(() => vi.useFakeTimers(FAKE))
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks()
  document.body.innerHTML = ''; document.head.innerHTML = ''; history.replaceState(null, '', '/')
})

// Une maquette minimale chargée comme la page le fait (<script src="kit.js"> avant le script de la scène) : le kit lit
// l'adresse (?attenue=1, ?freeze=…) et pose son habillage. Rend le K global des maquettes.
function maquette(search = '', inner = '') {
  history.replaceState(null, '', '/' + search)
  document.body.innerHTML = `<div class="wrap"><div class="st" id="st"><div class="scene" id="scene">${inner}
    <div class="radio" id="radio"></div><div class="sub" id="sub"></div><div class="title" id="title"></div></div></div></div>`
  new Function(KIT_MQ)()
  return window.K
}
const st = () => document.getElementById('st')

// Outils communs dans le kit des maquettes : le même bloc que le jeu (G7), branché sur le gel, « rejouer » et les
// effets atténués des maquettes (tests/briefing/kit.test.js garde le détail côté jeu).
describe('kit des maquettes, K.anim et K.graine', () => {
  it('gelé entre deux images (?freeze=505), dessin reçoit l\'avancement de l\'instant du gel, puis plus rien', async () => {
    const K = maquette('?freeze=505')
    const recus = []
    K.run({ beats: [{ min: 3000 }] })
    K.anim(k => recus.push(k), 1000, { courbe: 'lineaire' })   // lancé à t = 0 : images à 16, 32… 496 ms, puis gel à 505 ms
    await vi.advanceTimersByTimeAsync(600); await flush()
    expect(K.frozen).toBe(true)
    expect(recus.at(-1)).toBeCloseTo(0.505, 3)
    const n = recus.length
    await vi.advanceTimersByTimeAsync(2000); await flush()
    expect(recus).toHaveLength(n)
  })

  // Courbe par défaut (CIN-1 de l'audit de design ; détail côté jeu dans tests/briefing/kit.test.js) : douce, k² (3 − 2k).
  it('gelé au quart de la durée (?freeze=250), dessin reçoit 0,156 par défaut (courbe douce), pas l\'avancement brut 0,25', async () => {
    const K = maquette('?freeze=250')
    const recus = []
    K.run({ beats: [{ min: 3000 }] })
    K.anim(k => recus.push(k), 1000)
    await vi.advanceTimersByTimeAsync(300); await flush()
    expect(K.frozen).toBe(true)
    expect(Math.abs(recus.at(-1) - 0.156)).toBeLessThanOrEqual(0.02)
  })

  it('« rejouer » arrête le dessin du passage précédent ; le nouveau va jusqu\'au bout', async () => {
    const K = maquette('')
    let passage = 0
    const appels = []   // [passage, instant, k]
    K.run({ loop: false, beats: [{ min: 3000, cues: [[0, K => { const n = ++passage; K.anim(k => appels.push([n, performance.now(), k]), 1000) }]] }] })
    await vi.advanceTimersByTimeAsync(300); await flush()
    const rejoue = performance.now()
    document.getElementById('k-replay').click()
    await vi.advanceTimersByTimeAsync(2000); await flush()
    expect(appels.filter(([n]) => n === 1).length).toBeGreaterThan(0)
    expect(appels.filter(([n, t]) => n === 1 && t > rejoue)).toEqual([])
    expect(appels.at(-1)).toEqual([2, expect.any(Number), 1])
  })

  it('avec ?attenue=1, attenue: \'fin\' dessine l\'état final d\'emblée ; K.graine(7) tire la suite de la ville du prologue A', () => {
    const K = maquette('?attenue=1')
    const recus = []
    K.run({ beats: [{ min: 3000 }] })
    K.anim((k, o) => recus.push([k, o]), 1000, { attenue: 'fin' })
    expect(recus).toEqual([[1, 1]])
    let seed = 7   // générateur de prologue-a.html, recopié
    const ville = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
    const g = K.graine(7)
    expect(Array.from({ length: 20 }, g)).toEqual(Array.from({ length: 20 }, ville))
  })
})

// Sonde d'images des maquettes (spec cinématiques v2 §3.2, point 5) : l'étiquette sous la scène affiche la p95 des
// durées des 120 dernières images, au rang le plus proche comme frameStats (src/gfx/stats.js), pour juger à l'œil le
// coût d'une maquette ; elle dit aussi quand les effets sont atténués.
describe('kit des maquettes, étiquette sous la scène', () => {
  it('affiche la p95 des 120 dernières images, au rang le plus proche', () => {
    let t = 0
    vi.spyOn(performance, 'now').mockImplementation(() => t)
    maquette('')   // première image à t = 0 : point de départ
    // 10 vieilles images de 200 ms, sorties de la fenêtre, puis 120 images : 100 de 10 ms, 15 de 20 ms, 5 de 40 ms
    // (p95 = 20 ; moyenne 12,5, médiane 10, maximum 40 ; sur les 130, la p95 serait 200)
    for (const d of [...Array(10).fill(200), ...Array(100).fill(10), ...Array(15).fill(20), ...Array(5).fill(40)]) {
      t += d
      vi.advanceTimersToNextFrame()
    }
    expect(document.getElementById('k-lbl').textContent).toMatch(/· p95 20\.0 ms/)
  })

  // Une capture gelée se fait en temps virtuel (Chrome sans interface) : presque aucune image n'y est calculée, et une
  // p95 de plusieurs secondes y tromperait celui qui lit la capture.
  it('au gel (?freeze=), l\'étiquette ne donne pas de p95', () => {
    let t = 0
    vi.spyOn(performance, 'now').mockImplementation(() => t)
    maquette('?freeze=99999')
    for (let i = 0; i < 10; i++) { t += 16; vi.advanceTimersToNextFrame() }
    expect(document.getElementById('k-lbl').textContent).not.toMatch(/p95/)
  })

  it('dit « atténué » avec ?attenue=1 (sans le paramètre, non : garde-fou)', () => {
    maquette('')
    vi.advanceTimersToNextFrame()
    expect(document.getElementById('k-lbl').textContent).not.toMatch(/atténué/)
    maquette('?attenue=1')
    vi.advanceTimersToNextFrame()
    expect(document.getElementById('k-lbl').textContent).toMatch(/· atténué$/)
  })
})

describe('kit des maquettes, ?attenue=1 : les effets atténués du jeu, visibles avant le portage', () => {
  it('pose k-reduced sur #st avant le script de la scène (sans le paramètre, ou avec attenue=0, non : garde-fou)', () => {
    maquette('')
    expect(st().classList.contains('k-reduced')).toBe(false)
    maquette('?attenue=0')
    expect(st().classList.contains('k-reduced')).toBe(false)
    maquette('?attenue=1')
    expect(st().classList.contains('k-reduced')).toBe(true)
  })

  it('K.shake ne secoue pas la scène (sans l\'option, elle est secouée : garde-fou)', () => {
    maquette('').shake()
    expect(st().classList.contains('shake')).toBe(true)
    maquette('?attenue=1').shake()
    expect(st().classList.contains('shake')).toBe(false)
  })

  it('aucun glitch d\'ambiance, au lancement ni après « rejouer » (comptés sur 20 s ; sans l\'option, si : garde-fou)', async () => {
    const glitchs = async search => {
      const K = maquette(search)
      const glitch = vi.spyOn(K.snd, 'glitch')
      K.run({ beats: [{ min: 30000 }] })
      await vi.advanceTimersByTimeAsync(10000); await flush()
      document.getElementById('k-replay').click()
      await vi.advanceTimersByTimeAsync(10000); await flush()
      return glitch.mock.calls.length
    }
    expect(await glitchs('')).toBeGreaterThan(0)
    expect(await glitchs('?attenue=1')).toBe(0)
  })

  // Puissance lue sur l'effet lui-même, comme dans tests/briefing/kit.test.js : déplacement du filtre = hasard × 70 × puissance.
  it('un glitch de la scène joue à un tiers de sa puissance (0,9 devient 0,3), son gardé', async () => {
    const effet = async search => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const K = maquette(search)
      const son = vi.spyOn(K.snd, 'glitch')
      K.glitch(1000, 0.9)
      await vi.advanceTimersByTimeAsync(45); await flush()
      Math.random.mockRestore()
      return [+document.getElementById('k-gld').getAttribute('scale'), son.mock.calls[0]]
    }
    expect(await effet('')).toEqual([0.5 * 70 * 0.9, [1000, 0.9]].map((v, i) => i ? v : expect.closeTo(v, 1)))
    expect(await effet('?attenue=1')).toEqual([0.5 * 70 * 0.3, [1000, 0.9]].map((v, i) => i ? v : expect.closeTo(v, 1)))
  })

  // Onde de l'écoute (#wave de m1 et m6), menée par K.wave : pendant la ligne, une hauteur tirée par barre toutes les
  // 90 ms ; en effets atténués, la pose fixe du jeu (spec cinématiques v2 §3.7), à plat après la ligne dans les deux cas.
  it('l\'onde de l\'écoute garde la pose fixe du jeu tant que la ligne parle (sans l\'option, elle s\'agite : garde-fou)', async () => {
    const ECOUTE = '<div class="trans" id="trans"></div><div class="wave" id="wave"></div>'
    const LIGNE = { who: 'PHONE', say: '« Une ligne assez longue pour durer trois secondes. »' }
    const onde = () => [...document.getElementById('wave').children].map(b => b.style.height).join(' ')
    const lire = async demarrer => {
      demarrer()
      const pendant = []
      for (let i = 0; i < 8; i++) { await vi.advanceTimersByTimeAsync(250); pendant.push(onde()) }
      await vi.advanceTimersByTimeAsync(4000); await flush()
      return { poses: new Set(pendant), apres: onde() }
    }
    const aPlat = Array(56).fill('6%').join(' ')
    // le jeu d'abord : les parasites au repos d'une maquette déjà lancée chercheraient sa barre de contrôle
    let kitDuJeu = null
    const jeu = await lire(() => {
      document.body.innerHTML = `<div id="root"><div class="st" id="st"><div class="scene" id="scene">${ECOUTE}</div></div></div>`
      kitDuJeu = createKit({ root: document.getElementById('root'), reducedMotion: true })
      kitDuJeu.run({ beats: [LIGNE] })
    })
    kitDuJeu.destroy()
    expect(jeu.poses.size).toBe(1)
    expect([...jeu.poses][0]).not.toBe(aPlat)
    expect(jeu.apres).toBe(aPlat)
    const normale = await lire(() => maquette('', ECOUTE).run({ loop: false, beats: [LIGNE] }))
    expect(normale.poses.size).toBeGreaterThan(5)
    expect(normale.apres).toBe(aPlat)
    const attenuee = await lire(() => maquette('?attenue=1', ECOUTE).run({ loop: false, beats: [LIGNE] }))
    expect([...attenuee.poses]).toEqual([...jeu.poses])
    expect(attenuee.apres).toBe(aPlat)
  })

  it('jamais d\'image noire, même sur un glitch de pleine puissance (K.lost) ; sans l\'option, si : garde-fou', async () => {
    const imagesNoires = async search => {
      vi.spyOn(Math, 'random').mockReturnValue(0)   // le hasard le plus défavorable : image noire à chaque pas
      const K = maquette(search)
      const bf = document.getElementById('k-bf')
      let on = 0
      new MutationObserver(() => { if (bf.classList.contains('on')) on++ }).observe(bf, { attributes: true })
      K.lost(400)
      await vi.advanceTimersByTimeAsync(700); await flush()
      Math.random.mockRestore()
      return on
    }
    expect(await imagesNoires('')).toBeGreaterThan(0)
    expect(await imagesNoires('?attenue=1')).toBe(0)
  })

  // Habillage réglé par la feuille des maquettes, comme celle du jeu (kit.test.js, « feuille du kit »).
  describe('feuille des maquettes', () => {
    beforeEach(() => {
      const css = document.createElement('style')
      css.textContent = readFileSync(join(MQ, 'kit.css'), 'utf8')
      document.head.appendChild(css)
    })

    it('le carton SIGNAL PERDU s\'affiche sans clignoter (sans l\'option, il clignote : garde-fou)', () => {
      const carton = search => {
        const K = maquette(search)
        K.lost(1300)
        const lost = document.getElementById('k-lost')
        return [getComputedStyle(lost).opacity, getComputedStyle(lost).animation]
      }
      const [opacite, animation] = carton('')
      expect(opacite).toBe('1')
      expect(animation).toMatch(/k-blink/)
      const [opaciteAttenuee, animationAttenuee] = carton('?attenue=1')
      expect(opaciteAttenuee).toBe('1')
      expect(animationAttenuee).not.toMatch(/k-blink/)
    })

    it('le grain d\'un glitch ne monte que d\'un tiers de sa hausse (0,09 au repos, 0,32 sans l\'option)', () => {
      const grain = search => {
        const K = maquette(search)
        const g = st().querySelector('.grain')
        const repos = +getComputedStyle(g).opacity
        K.glitch(1000, 0.9)
        return [repos, +getComputedStyle(g).opacity]
      }
      expect(grain('')).toEqual([0.09, 0.32])
      const [repos, pendant] = grain('?attenue=1')
      expect(repos).toBe(0.09)
      expect(pendant).toBeCloseTo(0.09 + (0.32 - 0.09) / 3, 2)
    })
  })
})
