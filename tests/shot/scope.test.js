import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fovFor, mradToPixels } from '../../src/aim.js'
import { MAIN_SRC, analyse, callsIn, callsInNode } from '../gfx/mainSource.js'

// La lunette du jeu (src/scope.js) animée (spec du lot 2, §3.2 ; plan, tâche T2), vue comme le joueur la voit : ce que
// drawScope dessine dans son canevas, le champ de vision que la caméra prend (syncFov dans main.js), le moment où le
// clic gauche tire, et le décalage du réticule d'où part la balle (getTrembleOffset). Écran de 1280 × 720.
//
// Témoins : chaque test tourne aussi sur la lunette d'avant le lot 2 (commit e671587), dont il imite les appels de
// main.js quand une fonction neuve manque (le champ de vision de syncFov, le tir permis dès isVisible(), hideScope au
// relâchement du clic droit) ; il y échoue sur le comportement, pas sur l'absence de la fonction.

const W = 1280, H = 720
let S, canvas, ctx, arcs

beforeEach(async () => {
  document.body.innerHTML = '<canvas id="scope-canvas" style="display:none"></canvas>'
  Object.defineProperty(window, 'innerWidth', { value: W, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: H, configurable: true, writable: true })
  vi.resetModules()
  canvas = document.getElementById('scope-canvas')
  ctx = canvas.getContext('2d')
  arcs = []
  ctx.arc = (x, y, r, a0, a1, ccw) => { arcs.push({ x, y, r, ccw: !!ccw }) }
  S = await import('../../src/scope.js')
})
afterEach(() => { vi.restoreAllMocks() })

// Une image du jeu : la lunette avance de dt (updateScope, appelée par la boucle de main.js), puis se dessine.
function image(dt = 1 / 60) {
  arcs = []
  S.updateScope?.(dt)
  S.drawScope()
}
const images = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) image(dt) }

// Champ de vision que main.js donne à la caméra (syncFov). Avant le lot 2 : fovFor(getZoom(), isVisible()).
const fovVu = () => (S.getScopeFov ? S.getScopeFov() : fovFor(S.getZoom(), S.isVisible()))
// Le clic gauche tire-t-il ? Avant le lot 2 : dès que la lunette est visible (mousedown, puis shoot dans main.js).
const tirPermis = () => (S.isScopeReady ? S.isScopeReady() : S.isVisible())
// Relâchement du clic droit (mouseup dans main.js). Avant le lot 2 : hideScope.
const relacher = () => (S.closeScope ?? S.hideScope)()

// Rayon du trou de la vignette noire (l'arc tracé à l'envers dans le rectangle de l'écran), et point central du réticule.
const vignette = () => arcs.find(a => a.ccw)?.r
const pointCentral = () => arcs.find(a => !a.ccw && a.r === 2.5 && Math.abs(a.x - W / 2) < 1e-6 && Math.abs(a.y - H / 2) < 1e-6)
const R_FINAL = Math.min(W, H) * 0.38 * 1.02     // vignette lunette ouverte (inchangée depuis le lot 0)
const DEMI_DIAGONALE = Math.hypot(W, H) / 2

describe('ouverture de la lunette (180 ms)', () => {
  it('première image : la vignette est encore hors de l\'écran et le réticule absent ; à 180 ms, tout est en place', () => {
    S.setZoom(4)
    S.showScope()
    image()
    expect(vignette(), 'vignette à la première image').toBeGreaterThan(DEMI_DIAGONALE * 0.85)
    expect(pointCentral(), 'réticule à la première image').toBeUndefined()
    images(10)   // 183 ms
    expect(vignette()).toBeCloseTo(R_FINAL, 6)
    expect(pointCentral()).toBeDefined()
  })

  it('la vignette se resserre d\'image en image, le réticule n\'apparaît qu\'au dernier tiers (après 120 ms)', () => {
    S.showScope()
    let avant = Infinity
    for (let i = 1; i <= 11; i++) {
      image()
      const t = i / 60
      expect(vignette(), `${(t * 1000).toFixed(0)} ms`).toBeLessThanOrEqual(avant)
      avant = vignette()
      if (t < 0.12 - 1e-9) expect(pointCentral(), `${(t * 1000).toFixed(0)} ms`).toBeUndefined()
    }
  })

  it('le champ de vision glisse de 60° vers 60 / zoom pendant l\'ouverture, au lieu de sauter', () => {
    S.setZoom(4)
    S.showScope()
    image()
    expect(fovVu(), 'première image').toBeGreaterThan(55)
    images(4)    // 83 ms
    expect(fovVu()).toBeGreaterThan(15.5)
    expect(fovVu()).toBeLessThan(55)
    images(6)    // 183 ms
    expect(fovVu()).toBeCloseTo(15, 9)
  })

  it('le clic gauche ne tire que lunette ouverte à 100 %', () => {
    S.showScope()
    image()
    expect(tirPermis(), 'première image').toBe(false)
    images(9)    // 167 ms
    expect(tirPermis(), '167 ms').toBe(false)
    image()      // 183 ms
    expect(tirPermis(), '183 ms').toBe(true)
    relacher()
    expect(tirPermis(), 'clic droit relâché').toBe(false)
  })
})

describe('fermeture de la lunette (120 ms)', () => {
  it('au relâchement, la lunette se referme en 120 ms : le champ revient vers 60° sans sauter, puis le canevas disparaît', () => {
    S.setZoom(4)
    S.showScope()
    images(12)
    relacher()
    expect(S.isVisible(), 'la visée s\'arrête tout de suite (souris, stress, apnée)').toBe(false)
    image()
    expect(canvas.style.display, 'une image après le relâchement').toBe('block')
    expect(fovVu()).toBeLessThan(55)
    images(6)    // 117 ms
    expect(canvas.style.display).toBe('block')
    image()      // 133 ms
    expect(canvas.style.display).toBe('none')
    expect(fovVu()).toBe(60)
  })

  it('hideScope ferme d\'un coup (pause, échec, réussite) : canevas masqué, 60°, plus de tir', () => {
    S.showScope()
    images(12)
    S.hideScope()
    expect(canvas.style.display).toBe('none')
    expect(fovVu()).toBe(60)
    expect(tirPermis()).toBe(false)
    image()
    expect(arcs).toEqual([])   // plus rien n'est dessiné
  })
})

describe('zoom lissé (120 ms) et réticule', () => {
  // Zoom affiché au temps t après un cran de molette de `de` vers `vers` : exponentielle qui fait 95 % en 120 ms.
  const zoomAffiche = (de, vers, t) => vers + (de - vers) * Math.exp(-t * Math.log(20) / 0.12)

  it('le champ de vision suit le zoom affiché, pas le zoom choisi à la molette', () => {
    S.setZoom(4)
    S.showScope()
    images(12)
    S.setZoom(12)
    images(4, 0.01)   // 40 ms
    expect(S.getZoom(), 'zoom choisi (HUD, molette)').toBe(12)
    expect(fovVu()).toBeCloseTo(60 / zoomAffiche(4, 12, 0.04), 6)
  })

  it('à mi-chemin du zoom, le réticule et le rayon du tir convertissent l\'angle avec le champ affiché', () => {
    // Relecture de T1 : getTrembleOffset convertissait les milliradians avec fovFor(zoom choisi).
    S.setZoom(4)
    S.setStress(0.5)
    S.showScope()
    let s = 1
    vi.spyOn(Math, 'random').mockImplementation(() => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 })
    for (let i = 0; i < 120; i++) { S.updateTremble(1 / 60); image() }   // 2 s : un écart bien établi
    S.setZoom(12)
    images(4, 0.01)   // 40 ms : le zoom affiché vaut environ 9,1
    const mrad = S.getTrembleMrad(), px = S.getTrembleOffset()
    const fov = 60 / zoomAffiche(4, 12, 0.04)
    expect(Math.abs(mrad.x) + Math.abs(mrad.y)).toBeGreaterThan(0.1)
    expect(px.x).toBeCloseTo(mradToPixels(mrad.x, fov, H), 6)
    expect(px.y).toBeCloseTo(mradToPixels(mrad.y, fov, H), 6)
  })
})

describe('canevas de la lunette', () => {
  // Écritures de canvas.width et canvas.height : elles réallouent le canevas et effacent son contexte.
  function compteEcritures() {
    const n = { width: 0, height: 0 }
    for (const k of ['width', 'height']) {
      const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, k)
      Object.defineProperty(canvas, k, { configurable: true, get() { return d.get.call(this) }, set(v) { n[k]++; d.set.call(this, v) } })
    }
    return n
  }

  it('dessiner n\'écrit plus la taille du canevas : seulement au redimensionnement', () => {
    S.resizeScope?.(W, H, 1)
    const n = compteEcritures()
    S.showScope()
    images(30)
    expect(n).toEqual({ width: 0, height: 0 })
  })

  it('canevas à la densité de pixels du renderer : 1,25 sur un écran de 1280 × 720 donne 1600 × 900, dessin en pixels CSS', () => {
    const transforms = []
    ctx.setTransform = (...m) => { transforms.push(m) }
    S.resizeScope?.(W, H, 1.25)
    S.showScope()
    images(12)
    expect([canvas.width, canvas.height]).toEqual([1600, 900])
    expect(transforms.at(-1)).toEqual([1.25, 0, 0, 1.25, 0, 0])
    expect(vignette()).toBeCloseTo(R_FINAL, 6)   // en pixels CSS : la mise à l'échelle est celle du contexte
  })

  // Relecture de T2 : au préréglage Bas, le rendu est à 0,75. Un canevas à cette densité, agrandi par le CSS, rendait
  // les traits de 0,9 px du réticule et les mil-dots plus flous qu'avant le lot 2 (canevas à la densité 1). Témoin : le
  // commit 71578af dimensionnait le canevas à 960 × 540.
  it('jamais sous la densité 1 : au préréglage Bas (rendu à 0,75), canevas de 1280 × 720, réticule aussi net qu\'avant', () => {
    const transforms = []
    ctx.setTransform = (...m) => { transforms.push(m) }
    S.resizeScope?.(W, H, 1.25)
    S.resizeScope?.(W, H, 0.75)
    S.showScope()
    images(12)
    expect([canvas.width, canvas.height]).toEqual([W, H])
    expect(transforms.at(-1)).toEqual([1, 0, 0, 1, 0, 0])
    expect(vignette()).toBeCloseTo(R_FINAL, 6)
  })

  it('redimensionner la fenêtre recentre la lunette', () => {
    S.resizeScope?.(1920, 1080, 1)
    S.showScope()
    images(12)
    expect([canvas.width, canvas.height]).toEqual([1920, 1080])
    expect(arcs.some(a => a.ccw && a.x === 960 && a.y === 540)).toBe(true)
  })

  it('même taille et même densité : rien n\'est réalloué', () => {
    S.resizeScope?.(W, H, 1.25)
    const n = compteEcritures()
    S.resizeScope?.(W, H, 1.25)
    expect(n).toEqual({ width: 0, height: 0 })
  })
})

describe('branchement dans main.js', () => {
  // main.js ne s'importe pas sous jsdom : on lit son source (tests/gfx/mainSource.js).
  const a = analyse(MAIN_SRC)
  const texte = n => a.source.slice(n.start, n.end)

  // Rappel passé à document.addEventListener(type, …) ou window.addEventListener(type, …) au premier niveau.
  function ecouteur(cible, type) {
    for (const n of a.program.body) {
      const e = n.type === 'ExpressionStatement' && n.expression
      if (!e || e.type !== 'CallExpression' || texte(e.callee) !== `${cible}.addEventListener`) continue
      if (e.arguments[0]?.value === type) return e.arguments[1]
    }
    return null
  }
  const appels = node => callsInNode(a, node).map(c => c.callee)

  it('les fonctions de la lunette animée viennent de scope.js', () => {
    for (const nom of ['updateScope', 'closeScope', 'isScopeReady', 'getScopeFov', 'getEffectiveZoom', 'resizeScope']) {
      expect(a.imports.get(nom)?.from, nom).toBe('./scope.js')
    }
  })

  it('la boucle fait avancer la lunette avant de régler la caméra', () => {
    const c = callsIn(a, 'loop').map(x => x.callee)
    expect(c).toContain('updateScope')
    expect(c.indexOf('updateScope')).toBeLessThan(c.indexOf('aimMissionCamera'))
  })

  it('la caméra prend le champ de la lunette (getScopeFov), pas celui du zoom choisi', () => {
    const c = callsIn(a, 'syncFov').map(x => x.callee)
    expect(c).toContain('getScopeFov')
    expect(c).not.toContain('fovFor')
  })

  it('le tir exige la lunette ouverte à 100 %', () => {
    expect(callsIn(a, 'shoot').map(x => x.callee)).toContain('isScopeReady')
  })

  it('relâcher le clic droit referme la lunette en douceur (closeScope, pas hideScope)', () => {
    const c = appels(ecouteur('document', 'mouseup'))
    expect(c).toContain('closeScope')
    expect(c).not.toContain('hideScope')
  })

  it('la sensibilité de la souris suit le zoom affiché', () => {
    const c = appels(ecouteur('document', 'mousemove'))
    expect(c).toContain('getEffectiveZoom')
    expect(c).not.toContain('getZoom')
  })

  it('le canevas est dimensionné au préréglage et au redimensionnement de la fenêtre', () => {
    expect(callsIn(a, 'applyQuality').map(x => x.callee)).toContain('resizeScope')
    const r = ecouteur('window', 'resize')
    expect(r, 'écouteur resize dans main.js').not.toBe(null)
    expect(appels(r)).toContain('resizeScope')
  })

  // Relecture de T2 : une densité d'écran changée laissait rendu et lunette à l'ancienne densité (mesuré dans Chrome sans
  // interface au commit 71578af : densité passée de 1 à 2 en Moyen, les deux canevas restés à la densité 1), et une
  // fenêtre passée sur un autre écran peut garder sa taille en pixels CSS, sans resize. La densité est suivie à part
  // (onPixelRatioChange, testée dans tests/gfx/pixelRatio.test.js) et réapplique le préréglage au nouvel écran.
  it('densité d\'écran changée (zoom du navigateur, autre écran, même sans resize) : préréglage réappliqué', () => {
    expect(a.imports.get('onPixelRatioChange')?.from).toBe('./gfx/pixelRatio.js')
    const appel = a.program.body.find(n => n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression'
      && texte(n.expression.callee) === 'onPixelRatioChange')
    expect(appel, 'onPixelRatioChange(window, …) au chargement de main.js').toBeDefined()
    const [cible, rappel] = appel.expression.arguments
    expect(texte(cible)).toBe('window')
    // Rappel : applyQuality elle-même, ou une fonction qui l'appelle.
    const reapplique = rappel.type === 'Identifier' ? rappel.name === 'applyQuality' : appels(rappel).includes('applyQuality')
    expect(reapplique, `rappel : ${texte(rappel)}`).toBe(true)
  })

  it('au montage d\'une mission, le zoom est posé à ×4 d\'un coup (pas lissé depuis la mission d\'avant)', () => {
    const z = callsIn(a, 'mountLevel').filter(x => x.callee === 'setZoom').map(texte)
    expect(z.length).toBeGreaterThan(0)
    for (const t of z) expect(t).toMatch(/instant:\s*true/)
  })
})
