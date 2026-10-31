import { describe, it, expect, vi, afterEach } from 'vitest'
import { createFrappe, dureeFrappe, PART_FRAPPEE, MASQUE } from '../../src/ui/frappe.js'
import { estimate } from '../../src/briefing/kit.js'
import { decouper, fragilites, affichage, masquer, acquis } from '../../src/bar/ecoute.js'

// La frappe des sous-titres au temps de jeu (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.4 et §3.14 ;
// plan docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B4). Chaque test de comportement a été vu rouge sur le témoin
// écrit à côté de son assertion : d'abord sur une frappe naïve qui réunissait ces témoins (celle de l'enquête, par
// setTimeout, src/prologue/investigation.js:167-177), puis un à un, glissés seuls dans la frappe finie.

const DT = 1 / 60                                          // une image à 60 Hz
// les minuteurs et les horloges du navigateur, simulés : la frappe ne doit dépendre d'aucun
const FAUX = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
const A1 = 'La nationale a des yeux. Sur la vieille route, il n\'y a personne.'   // spec §3.14, 65 lettres

afterEach(() => vi.useRealTimers())

// Fait avancer la frappe image par image jusqu'à ce que `condition` soit vraie (au plus `max` images) ; rend le nombre
// d'images jouées.
function imagesJusqua(frappe, condition, max = 1200) {
  let images = 0
  while (!condition() && images < max) { frappe.update(DT); images++ }
  return images
}
const avance = (frappe, secondes) => { for (let k = Math.round(secondes / DT); k > 0; k--) frappe.update(DT) }

describe('la frappe n\'avance qu\'au temps de jeu', () => {
  it('5 s sans update ne frappent rien, au début comme au milieu d\'une réplique : en pause, elle est figée', () => {
    vi.useFakeTimers(FAUX)
    const f = createFrappe()
    f.dire(A1)
    expect(vi.getTimerCount()).toBe(0)                    // témoin : frappe par setTimeout (investigation.js:167-177), 1 minuteur
    vi.advanceTimersByTime(5000)
    expect(f.texte).toBe('')                              // témoin : frappe à l'horloge du navigateur (performance.now), A1 entière
    expect(f.motsFrappes).toEqual([])
    expect(f.fini).toBe(false)
    avance(f, 1)                                          // une seconde de jeu : 18 lettres sur 65
    const milieu = f.texte
    expect(milieu).toBe('La nationale a des')
    vi.advanceTimersByTime(5000)                          // 5 s de pause : on n'appelle plus update
    expect(f.texte).toBe(milieu)
    expect(f.fini).toBe(false)
  })

  it('une réplique se tape en 0,8 × estimate (src/briefing/kit.js:10) à une image près, lettres régulièrement espacées', () => {
    const n = A1.length, duree = 0.8 * estimate(A1) / 1000   // 3,504 s
    expect(PART_FRAPPEE).toBe(0.8)
    expect(dureeFrappe(A1)).toBeCloseTo(duree, 12)
    const f = createFrappe()
    f.dire(A1)
    let images = 0
    while (!f.fini && images < 1200) {
      f.update(DT); images++
      // la k-ième lettre des n tombe à k × duree / n ; le texte affiché la suit, à une lettre près (l'espace qui suit un
      // mot ne s'affiche qu'avec le mot suivant). Témoin : estimate entière, sans le 0,8 (4,38 s), la frappe prend du retard
      expect(Math.abs(f.texte.length - Math.min(n, Math.floor(images * DT * n / duree)))).toBeLessThanOrEqual(1)
    }
    const fin = images * DT
    expect(fin).toBeGreaterThanOrEqual(duree - 1e-9)      // témoin : la dernière lettre un pas trop tôt, à (n − 1) × duree / n (enquête)
    expect(fin).toBeLessThan(duree + DT)
    expect(f.texte).toBe(A1)
  })

  it('une durée donnée est tenue à une image près ; une durée nulle frappe tout à la première image ; un pas invalide ne compte pas', () => {
    const f = createFrappe()
    f.dire('Belote.', 2)
    for (const dt of [NaN, -1, Infinity, -Infinity, undefined]) f.update(dt)
    expect(f.texte).toBe('')                              // témoin : pas non gardé, Infinity frappe tout d'un coup
    const fin = imagesJusqua(f, () => f.fini) * DT
    expect(fin).toBeGreaterThanOrEqual(2 - 1e-9)
    // témoins : pas non gardé, NaN, jamais fini ; sans tolérance d'arrondi, la dernière lettre, due pile à la 120e image
    // (120 × 1/60 font 1,9999999999999978), tombe à la 121e
    expect(fin).toBeLessThan(2 + DT)
    expect(f.texte).toBe('Belote.')
    f.dire('Rebelote.', 0)
    expect(f.texte).toBe('')
    f.update(DT)
    expect(f.fini).toBe(true)                             // témoin : durée nulle prise pour une durée absente (dureeS || défaut)
    expect(f.texte).toBe('Rebelote.')
  })
})

describe('les mots masqués', () => {
  it('masque(i, mot) est appelée une seule fois par mot, dans l\'ordre, à l\'image où sa première lettre est frappée', () => {
    const texte = 'On roule à sept heures et quart.', n = texte.length, mots = texte.split(' ')
    const f = createFrappe()
    const appels = []
    let images = 0
    f.dire(texte, 2, { masque: (i, mot) => { appels.push({ i, mot, t: images * DT }); return false } })
    while (!f.fini && images < 1200) { images++; f.update(DT); f.texte }   // l'affichage relit le texte à chaque image
    avance(f, 2); f.texte; f.toutAfficher()               // après la fin, plus aucun appel
    expect(appels.map(a => a.mot)).toEqual(mots)          // témoin : masque relue à chaque lecture du texte, des centaines d'appels
    expect(appels.map(a => a.i)).toEqual(mots.map((_, i) => i))
    let debut = 0                                         // indice de la première lettre du mot
    for (const a of appels) {
      const due = (debut + 1) * 2 / n                     // l'instant où tombe cette lettre
      expect(a.t).toBeGreaterThanOrEqual(due - 1e-9)      // témoin : décidé avant sa première lettre, avec l'espace d'avant
      expect(a.t).toBeLessThan(due + DT)                  // témoin : décidé à la dernière lettre du mot
      debut += a.mot.length + 1
    }
  })

  it('un I qui baisse après la frappe d\'un mot ne le masque pas : un mot se décide à sa première lettre', () => {
    const fr = [0.1, 0.5, 0.8, 0.8, 0.3]                  // fragilités de « Il monte devant. À droite. » (§3.4)
    let I = 0.9                                           // Viktor est tout près
    const f = createFrappe()
    f.dire('Il monte devant. À droite.', 2, { masque: i => I < fr[i] })
    imagesJusqua(f, () => f.motsFrappes.length === 3)     // la première lettre de « devant. » vient de tomber
    expect(f.texte).toBe('Il monte d')
    I = 0.1                                               // il s'éloigne
    imagesJusqua(f, () => f.motsFrappes.length === 4)     // « À » commencé
    expect(f.texte).toBe('Il monte devant. …')            // témoin : masque relue à chaque image, « Il … »
    imagesJusqua(f, () => f.fini)
    expect(f.texte).toBe('Il monte devant. …')
    expect(f.motsFrappes).toEqual(['Il', 'monte', 'devant.', 'À', 'droite.'])   // les mots frappés, en clair
  })

  it('un mot masqué s\'affiche « … » dès sa première lettre ; des mots masqués voisins n\'en font qu\'un', () => {
    const f = createFrappe()
    f.dire('Il monte devant. À droite.', 2, { masque: i => i >= 1 && i <= 3 })
    imagesJusqua(f, () => f.motsFrappes.length === 2)
    expect(f.texte).toBe('Il …')                          // dès le « m » de « monte » (témoin : « … » posé à la dernière lettre, « Il »)
    expect(f.motsFrappes).toEqual(['Il', 'm'])            // le mot en cours, coupé à sa dernière lettre frappée
    imagesJusqua(f, () => f.motsFrappes.length === 4)
    expect(f.texte).toBe('Il …')                          // témoin : un « … » par mot masqué, « Il … … … »
    imagesJusqua(f, () => f.fini)
    expect(f.texte).toBe('Il … droite.')
    expect(MASQUE).toBe('…')
  })

  it('toutAfficher() frappe d\'un coup ce qui reste, décidé à cet instant ; ensuite, plus rien ne change', () => {
    const fr = [0.1, 0.5, 0.8, 0.8, 0.3]
    let I = 0.9
    const appels = []
    const f = createFrappe()
    f.dire('Il monte devant. À droite.', 2, { masque: i => { appels.push(i); return I < fr[i] } })
    imagesJusqua(f, () => f.motsFrappes.length === 2)     // « monte » décidé à 0,9
    I = 0.4
    f.toutAfficher()                                      // clic droit ou Espace
    expect(f.fini).toBe(true)
    expect(f.texte).toBe('Il monte … droite.')            // témoin : le texte brut, « Il monte devant. À droite. »
    expect(f.motsFrappes).toEqual(['Il', 'monte', 'devant.', 'À', 'droite.'])
    expect(appels).toEqual([0, 1, 2, 3, 4])
    I = 0
    avance(f, 3); f.toutAfficher()
    expect(f.texte).toBe('Il monte … droite.')
    expect(appels).toEqual([0, 1, 2, 3, 4])
  })

  it('une erreur de masque remonte d\'update comme de toutAfficher, jamais avalée ; le mot n\'est pas décidé, il se redécide au prochain appel', () => {
    let pannes, appels
    const masque = (i, mot) => {
      appels.push(mot)
      if (mot === 'C' && pannes-- > 0) throw new Error('masque en panne')   // en panne une fois, sur le dernier mot
      return mot === 'C'
    }
    const f = createFrappe()
    for (const appel of [() => f.update(DT), () => f.toutAfficher()]) {
      pannes = 1; appels = []
      f.dire('A B C', 0, { masque })
      expect(appel).toThrow('masque en panne')            // témoin : erreur avalée, « C » pris pour un mot en clair
      expect(f.fini).toBe(false)                          // témoin : lettres comptées frappées avant la décision, « C » jamais décidé
      expect(f.texte).toBe('A B')                         // témoin : mot compté commencé avant sa décision, « A B  » puis « A B C »
      appel()                                             // la réplique reprend là où elle s'était arrêtée
      expect(f.fini).toBe(true)
      expect(f.texte).toBe('A B …')
      expect(appels).toEqual(['A', 'B', 'C', 'C'])
    }
  })
})

describe('une réplique à la fois', () => {
  it('dire() remplace la réplique en cours : la nouvelle part de rien, et l\'ancienne ne se décide plus', () => {
    const appels = []
    const f = createFrappe()
    f.dire('Le col, c\'est fini. Trop de monde.', 2, { masque: (i, mot) => { appels.push('ancienne : ' + mot); return false } })
    avance(f, 1)
    expect(f.texte).toMatch(/^Le col, c'est /)
    const avant = appels.length
    f.dire('Belote.', 1, { masque: (i, mot) => { appels.push('nouvelle : ' + mot); return true } })
    expect(f.texte).toBe('')
    expect(f.motsFrappes).toEqual([])
    expect(f.fini).toBe(false)                            // témoin : lettres frappées gardées d'une réplique à l'autre, finie d'emblée
    const fin = imagesJusqua(f, () => f.fini) * DT
    expect(fin).toBeGreaterThanOrEqual(1 - 1e-9)          // témoin : temps écoulé gardé d'une réplique à l'autre, finie d'un coup
    expect(f.texte).toBe(MASQUE)                          // témoin : masque de l'ancienne gardée, « Belote. » en clair
    expect(appels.slice(avant)).toEqual(['nouvelle : Belote.'])
  })

  it('sans réplique, rien à frapper ; un texte ou un masque mal formé est une erreur, jamais un silence', () => {
    const f = createFrappe()
    expect(f.texte).toBe('')
    expect(f.motsFrappes).toEqual([])
    expect(f.fini).toBe(true)                             // témoin : fini faux tant que rien n'a été dit
    f.update(DT); f.toutAfficher()
    expect(f.texte).toBe('')
    f.dire('')
    expect(f.fini).toBe(true)
    expect(() => f.dire(undefined)).toThrow(/texte/)      // témoin : « undefined » tapé à l'écran
    expect(() => f.dire('Belote.', 1, { masque: [true] })).toThrow(/masque/)   // témoin : tableau ignoré, rien de masqué
    expect(() => f.dire('Belote.', 1, i => i === 0)).toThrow(/masque/)         // témoin : masque passée seule, ignorée
    expect(f.fini).toBe(true)                             // une réplique refusée ne remplace pas la précédente
    f.dire('Belote.', 1, { masque: false })               // { masque: ecoute && fn }, sans écoute : rien de masqué (témoin : erreur)
    imagesJusqua(f, () => f.fini)
    expect(f.texte).toBe('Belote.')
  })
})

describe('la ponctuation se frappe avec son mot (choix de B5, spec §3.4)', () => {
  it('un morceau sans lettre ni chiffre ne se décide ni ne se masque seul, et ne passe pas seul à la ligne', () => {
    const appels = []
    const f = createFrappe()
    f.dire('Tu es sourd ?', 1, { masque: (i, mot) => { appels.push(mot); return mot.startsWith('sourd') } })
    let images = 0
    while (!f.fini && images < 1200) {
      f.update(DT); images++
      expect(f.texte).not.toMatch(/ \?/)                  // jamais une espace sécable devant « ? » (témoin : B4, « Tu es … ? »)
    }
    expect(appels).toEqual(['Tu', 'es', 'sourd ?'])  // témoin : frappe de B4, « ? » décidé seul, et en clair
    expect(f.texte).toBe('Tu es …')                       // témoin : frappe de B4, « Tu es … ? »
    expect(f.motsFrappes).toEqual(['Tu', 'es', 'sourd ?'])
    f.dire('… Ils partent. Allez…', 1)
    imagesJusqua(f, () => f.motsFrappes.length === 1)
    expect(f.texte).toBe('…')                             // la première lettre de « … Ils » : le mot commence par elle
    imagesJusqua(f, () => f.fini)
    expect(f.texte).toBe('… Ils partent. Allez…')    // témoin : frappe de B4, « … Ils partent. Allez… »
  })

  it('un mot coupé en cours de frappe garde son espace insécable', () => {
    const f = createFrappe()
    f.dire('Tu es sourd ?', 1)
    imagesJusqua(f, () => f.motsFrappes.length === 3 && f.motsFrappes[2].length === 6)   // « sourd » et l'espace
    expect(f.motsFrappes[2]).toBe('sourd ')
    expect(f.texte).toBe('Tu es sourd ')
  })
})

describe('avec l\'écoute du Bivouac (src/bar/ecoute.js)', () => {
  // R1 (spec §3.14), à la française : une espace insécable avant le point d'interrogation ; elle reste insécable, et
  // « ? » se frappe avec « sourd » (choix de B5)
  const R1 = { texte: 'Devant. À droite. Tu es sourd ?', motsCles: ['Devant', 'À droite'], renseignement: 'place' }

  // Le Bivouac branché sur la frappe (tâches B11 et B12) : masque retient l'I du moment où le mot i est frappé (ici
  // donné mot par mot), le sous-titre est masquer(motsFrappes, Is, f), le renseignement suit acquis à la fin.
  function ecouter(IauMoment) {
    const f = createFrappe(), fr = fragilites(R1), Is = []
    f.dire(R1.texte, undefined, { masque: i => { Is[i] = IauMoment[i]; return !affichage(Is, fr)[i] } })
    let images = 0
    while (!f.fini && images < 1200) {
      f.update(DT); images++
      expect(f.texte).toBe(masquer(f.motsFrappes, Is, fr))   // à chaque image, la même chose (témoin : un « … » par mot masqué)
    }
    return { f, appris: acquis(R1, affichage(Is, fr)) }
  }

  it('les mots sont ceux de decouper ; le sous-titre est celui de masquer, et le renseignement suit acquis', () => {
    const net = ecouter([0.85, 0.85, 0.85, 0.1, 0.1, 0.9])       // « Tu es » sous les murmures
    // témoins : mots coupés aux seules espaces, « sourd ? » d'un bloc (B4) ; « ? » rattaché par la frappe seule, ou par
    // decouper seul (l'un change sans l'autre)
    expect(net.f.motsFrappes).toEqual(decouper(R1).map(m => m.mot))
    expect(net.f.motsFrappes).toEqual(['Devant.', 'À', 'droite.', 'Tu', 'es', 'sourd ?'])
    expect(net.f.texte).toBe('Devant. À droite. … sourd ?')
    expect(net.appris).toBe(true)
    const flou = ecouter([0.85, 0.85, 0.75, 0.1, 0.1, 0.9])      // « droite. » frappé à 0,75 : un mot-clé masqué
    expect(flou.f.texte).toBe('Devant. À … sourd ?')
    expect(flou.appris).toBe(false)
  })
})
