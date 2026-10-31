import { describe, it, expect, vi, afterEach } from 'vitest'
import { DIALOGUE, SOUPCON } from '../../src/bar/reglages.js'
import { createDialogue, choixDepuisCode, libelleChoix, verifierArbre, FIN, EFFETS } from '../../src/bar/dialogue.js'
import { DIALOGUES } from '../../src/bar/textes.js'
import { dureeFrappe } from '../../src/ui/frappe.js'
import { estimate } from '../../src/briefing/kit.js'

// Les dialogues à choix du Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.8 et §10 ; plan
// docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B5). Chaque test de comportement a été vu rouge sur le témoin écrit
// à côté de son assertion, glissé seul dans le module fini, puis vert. Les dialogues du Bivouac eux-mêmes (D1, D2, D3,
// src/bar/textes.js) sont joués à la fin de ce fichier.

const DT = 1 / 60                                          // une image à 60 Hz
// les minuteurs et les horloges du navigateur, simulés : le dialogue ne doit dépendre d'aucun
const FAUX = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
const NBSP = ' '

afterEach(() => vi.useRealTimers())

// Une touche pressée : e.code, la touche physique ; e.key, ce qu'elle écrit selon la disposition du clavier.
const touche = (code, key = code) => new KeyboardEvent('keydown', { code, key })
// La carte d'un clavier AZERTY (navigator.keyboard.getLayoutMap()) : la rangée des chiffres, sans Maj.
const AZERTY = new Map([['Digit1', '&'], ['Digit2', 'é'], ['Digit3', '"'], ['KeyE', 'e'], ['KeyW', 'z']])

// Fait avancer le dialogue image par image tant que `condition` est fausse (au plus `max` images) ; rend ce qu'il a
// émis et le nombre d'images jouées.
function jusqua(d, condition, max = 6000) {
  const emis = []
  let images = 0
  while (!condition() && images < max) { emis.push(...d.update(DT)); images++ }
  return { emis, images }
}
const jusquaFin = d => jusqua(d, () => d.fini).emis
// Joue jusqu'à la fin en notant l'instant (secondes depuis `depart`) de chaque émission.
function journal(d, depart = 0, max = 6000) {
  const notes = []
  let temps = depart
  for (let images = 0; !d.fini && images < max; images++) {
    temps += DT
    for (const e of d.update(DT)) notes.push([temps, e])
  }
  return notes
}
const resume = e => (e.type === 'replique' ? `${e.qui} : ${e.texte}` : e.type === 'effets' ? `effets ${JSON.stringify(e.effets)}` : e.type)
// une émission tombe à la première image qui atteint l'instant prévu
function aLHeure(instant, prevu) {
  expect(instant).toBeGreaterThanOrEqual(prevu - 1e-9)
  expect(instant).toBeLessThan(prevu + DT + 1e-9)
}
const duree = texte => estimate(texte) / 1000          // une réplique dure son estimation (src/briefing/kit.js:10)

// Un petit arbre d'essai : Fernand demande, trois réponses, une suite sans choix, et le silence.
const Q1 = 'Qu\'est-ce que je vous sers ?'
const COMMANDE = {
  id: 'commande', interlocuteur: 'fernand', entree: 'q1',
  noeuds: {
    q1: {
      qui: 'fernand', dit: Q1,
      choix: [
        { texte: 'Un demi.', reponse: 'Un demi.', effets: { soupcon: -5, verre: 'demi' }, suite: 'q2' },
        { texte: 'Un café.', reponse: 'Un café.', effets: { verre: 'cafe' }, suite: 'q2' },
        { texte: 'Rien.', reponse: 'Comme vous voulez.', effets: { soupcon: 10 }, suite: FIN },
      ],
      silence: { effets: { evenement: 'silence' }, suite: FIN },
    },
    q2: { qui: 'fernand', dit: 'Vous n\'êtes pas d\'ici.', suite: FIN },
  },
}
const auxChoix = d => jusqua(d, () => d.phase === 'choix')

describe('les réglages des dialogues', () => {
  it('les valeurs de reglages.js sont celles de la spec (§3.8 ; décision 7, G4)', () => {
    expect(DIALOGUE).toMatchObject({ minuterieS: 10, minuterieSorelS: 6, choixApresS: 0.6, enchainementS: 0.4 })
    expect(DIALOGUE.ticsS).toEqual([1.5, 1, 0.5])        // clock() toutes les 0,5 s sur la dernière 1,5 s
  })
})

describe('les touches des choix', () => {
  it('Digit1 à Digit3 et Numpad1 à Numpad3 choisissent, et rien d\'autre', () => {
    const cas = [['Digit1', 1], ['Digit2', 2], ['Digit3', 3], ['Numpad1', 1], ['Numpad2', 2], ['Numpad3', 3]]
    for (const [code, n] of cas) expect(choixDepuisCode(code)).toBe(n)   // témoin : table des caractères de e.key, '1' à '3'
    for (const code of ['Digit4', 'Digit0', 'Numpad4', 'KeyE', '1', '&', '', 'toString', undefined, null, 1]) {
      expect(choixDepuisCode(code), String(code)).toBe(null)
    }
  })

  it('touche(e) lit e.code : Digit1 choisit 1 quand e.key vaut « & » (AZERTY), Digit2 choisit 2 sous « é »', () => {
    const d = createDialogue(COMMANDE)
    auxChoix(d)
    expect(d.touche(touche('Digit1', '&'))).toBe(true)   // témoin : lecture de e.key, « & » ne choisit rien
    expect(resume(jusquaFin(d)[0])).toBe('viktor : Un demi.')
    const d2 = createDialogue(COMMANDE)
    auxChoix(d2)
    expect(d2.touche(touche('Digit2', 'é'))).toBe(true)
    expect(resume(jusquaFin(d2)[0])).toBe('viktor : Un café.')
    const d3 = createDialogue(COMMANDE)
    auxChoix(d3)
    expect(d3.touche(touche('Numpad3', '3'))).toBe(true)
    expect(resume(jusquaFin(d3)[0])).toBe('viktor : Rien.')
  })

  it('une touche maintenue (e.repeat) ne compte pas : seul son premier appui choisit, valide ou déplace', () => {
    // Un chiffre gardé enfoncé depuis la question d'avant ne répond pas à la suivante ; E maintenu (pour sortir, pour le
    // juke-box) ne valide pas des choix qui apparaissent sous lui.
    const maintenue = code => new KeyboardEvent('keydown', { code, key: code, repeat: true })
    const d = createDialogue(COMMANDE)
    auxChoix(d)
    for (const code of ['Digit1', 'Numpad2', 'KeyE', 'Enter', 'NumpadEnter', 'ArrowDown', 'Space']) {
      expect(d.touche(maintenue(code)), code).toBe(false)   // témoin : e.repeat ignoré, Digit1 répond
    }
    expect(d.phase).toBe('choix')
    expect(d.surbrillance).toBe(1)
    expect(d.touche(touche('Digit1', '&'))).toBe(true)     // le premier appui, lui, compte
  })

  it('libellés toujours « 1 » à « 3 », même avec la carte d\'un clavier AZERTY', () => {
    for (const n of [1, 2, 3]) expect(libelleChoix(n, AZERTY)).toBe(String(n))   // témoin : keyName de l'enquête, « & »
    expect(libelleChoix(2)).toBe('2')
    for (const n of [0, 4, 1.5, '1', NaN]) expect(() => libelleChoix(n, AZERTY), String(n)).toThrow(/choix/)
  })
})

describe('le déroulé d\'un dialogue', () => {
  it('la question se frappe au temps de jeu ; 0,6 s après la fin de sa frappe, les choix s\'affichent et la minuterie part ; sans update, rien ne bouge', () => {
    vi.useFakeTimers(FAUX)
    const d = createDialogue(COMMANDE)
    vi.advanceTimersByTime(20000)                         // 20 s sans update : en pause
    expect(vi.getTimerCount()).toBe(0)                    // témoin : choix montrés par setTimeout à la fin de la frappe
    expect(d.phase).toBe('parole')
    expect(d.texte).toBe('')
    expect(d.choix).toEqual([])
    expect(d.restant).toBe(null)
    const { emis, images } = auxChoix(d)
    const apparition = dureeFrappe(Q1) + DIALOGUE.choixApresS
    aLHeure(images * DT, apparition)                      // témoin : choix à la fin de la frappe, sans les 0,6 s
    expect(d.texte).toBe(`Qu'est-ce que je vous sers${NBSP}?`)
    expect(d.qui).toBe('fernand')
    expect(emis).toEqual([
      { type: 'replique', qui: 'fernand', texte: Q1, didascalie: null, didascalieApres: null, dureeS: duree(Q1) },
      { type: 'choix', noeud: 'q1', choix: [{ n: 1, texte: 'Un demi.' }, { n: 2, texte: 'Un café.' }, { n: 3, texte: 'Rien.' }] },
    ])
    expect(d.choix).toEqual([{ n: 1, texte: 'Un demi.' }, { n: 2, texte: 'Un café.' }, { n: 3, texte: 'Rien.' }])
    expect(d.surbrillance).toBe(1)
    expect(d.delai).toBe(DIALOGUE.minuterieS)
    expect(d.restant).toBeCloseTo(DIALOGUE.minuterieS - (images * DT - apparition), 9)
    const restant = d.restant
    vi.advanceTimersByTime(5000)                          // 5 s de pause
    expect(d.restant).toBe(restant)                       // témoin : minuterie à l'horloge du navigateur (performance.now)
    expect(d.phase).toBe('choix')
    d.update(1)                                           // une seconde de jeu
    expect(d.restant).toBeCloseTo(restant - 1, 9)
  })

  it('à l\'échéance, l\'issue silence : ses effets une seule fois, puis sa suite', () => {
    const d = createDialogue(COMMANDE)
    const { images } = auxChoix(d)
    const notes = journal(d, images * DT)
    const effets = notes.filter(([, e]) => e.type === 'effets')
    expect(effets.map(([, e]) => e)).toEqual([{ type: 'effets', noeud: 'q1', issue: 'silence', effets: { evenement: 'silence' } }])   // témoin : sans échéance, les choix restent
    aLHeure(effets[0][0], dureeFrappe(Q1) + DIALOGUE.choixApresS + DIALOGUE.minuterieS)
    expect(notes.at(-1)[1]).toEqual({ type: 'fin' })
    expect(d.fini).toBe(true)
    expect(d.phase).toBe('fin')
    expect(d.choix).toEqual([])
    expect(d.restant).toBe(null)
    expect(d.update(DT)).toEqual([])
  })

  it('le choix fait dire sa réplique à Viktor, puis la réponse ; ses effets tombent à la fin de la réponse, puis vient la suite', () => {
    const d = createDialogue(COMMANDE)
    const { images } = auxChoix(d)
    const tv = images * DT                                // l'instant du choix
    expect(d.choisir(1)).toBe(true)
    expect(d.phase).toBe('parole')
    expect(d.choix).toEqual([])
    expect(d.surbrillance).toBe(0)
    const notes = journal(d, tv)
    expect(notes.map(([, e]) => resume(e))).toEqual(['viktor : Un demi.', 'fernand : Un demi.',
      'effets {"soupcon":-5,"verre":"demi"}', 'fernand : Vous n\'êtes pas d\'ici.', 'fin'])   // témoin : effets au choix, avant les répliques
    const [viktor, reponse, effets, suite, fin] = notes.map(([instant]) => instant)
    const { enchainementS } = DIALOGUE
    aLHeure(viktor, tv)                                   // Viktor répond aussitôt
    aLHeure(reponse, tv + duree('Un demi.') + enchainementS)          // témoins : réponse sans attendre la fin de Viktor ; sans enchaînement
    aLHeure(effets, tv + 2 * duree('Un demi.') + enchainementS)       // témoin : effets à la fin de la frappe de la réponse
    aLHeure(suite, tv + 2 * duree('Un demi.') + 2 * enchainementS)
    aLHeure(fin, tv + 2 * duree('Un demi.') + 2 * enchainementS + duree('Vous n\'êtes pas d\'ici.'))
    expect(notes[0][1]).toEqual({ type: 'replique', qui: 'viktor', texte: 'Un demi.', didascalie: null, didascalieApres: null, dureeS: duree('Un demi.') })
    expect(d.noeud).toBe('q2')
  })

  it('les effets d\'une issue tombent une seule fois, même si valider est appelé deux fois', () => {
    const d = createDialogue(COMMANDE)
    auxChoix(d)
    expect(d.valider()).toBe(true)
    expect(d.valider()).toBe(false)                       // témoin : sans garde, le choix repart une seconde fois
    expect(d.choisir(2)).toBe(false)
    const emis = jusquaFin(d)
    expect(emis.filter(e => e.type === 'effets')).toEqual([{ type: 'effets', noeud: 'q1', issue: 1, effets: { soupcon: -5, verre: 'demi' } }])
    expect(emis.filter(e => e.type === 'replique' && e.qui === 'viktor')).toHaveLength(1)
  })

  it('choisir(n) prend le n-ième choix montré ; avant les choix, ou hors de la liste, rien', () => {
    const d = createDialogue(COMMANDE)
    expect(d.choisir(1)).toBe(false)                      // rien n'est encore dit
    d.update(DT)
    expect(d.choisir(1)).toBe(false)                      // la question se frappe (témoin : choix acceptés avant d'être montrés)
    expect(d.valider()).toBe(false)
    auxChoix(d)
    for (const n of [0, 4, -1, 1.5, NaN, '2', undefined]) expect(d.choisir(n), String(n)).toBe(false)
    expect(d.phase).toBe('choix')
    expect(d.choisir(3)).toBe(true)
    expect(jusquaFin(d).map(resume)).toEqual(['viktor : Rien.', 'fernand : Comme vous voulez.', 'effets {"soupcon":10}', 'fin'])
  })

  it('les flèches déplacent la surbrillance sans faire le tour ; E, Entrée ou NumpadEnter valident, lus par e.code', () => {
    const d = createDialogue(COMMANDE)
    auxChoix(d)
    expect(d.touche(touche('ArrowUp'))).toBe(false)       // déjà en haut
    expect(d.surbrillance).toBe(1)                        // témoin : surbrillance qui fait le tour, 3
    expect(d.touche(touche('ArrowDown'))).toBe(true)
    expect(d.touche(touche('ArrowDown'))).toBe(true)
    expect(d.surbrillance).toBe(3)
    expect(d.touche(touche('ArrowDown'))).toBe(false)
    expect(d.surbrillance).toBe(3)                        // témoin : surbrillance qui fait le tour, 1
    expect(d.deplacer(-1)).toBe(true)                     // la molette
    expect(d.surbrillance).toBe(2)
    expect(d.deplacer(0)).toBe(false)
    expect(d.touche(touche('KeyE', '.'))).toBe(true)      // E d'un clavier Dvorak, e.key « . » (témoin : lecture de e.key)
    expect(resume(jusquaFin(d)[0])).toBe('viktor : Un café.')
    for (const code of ['Enter', 'NumpadEnter']) {
      const d2 = createDialogue(COMMANDE)
      auxChoix(d2)
      expect(d2.touche(touche(code)), code).toBe(true)
      expect(d2.phase).toBe('parole')
    }
    const d3 = createDialogue(COMMANDE)
    auxChoix(d3)
    for (const e of [touche('KeyW', 'z'), touche('Digit4', '\''), {}, null]) expect(d3.touche(e)).toBe(false)
    expect(d3.phase).toBe('choix')
  })

  it('Espace frappe la réplique d\'un coup : les choix suivent alors de 0,6 s', () => {
    const d = createDialogue(COMMANDE)
    d.update(0.2)
    expect(d.texte).not.toBe(`Qu'est-ce que je vous sers${NBSP}?`)
    expect(d.touche(touche('Space', ' '))).toBe(true)
    expect(d.texte).toBe(`Qu'est-ce que je vous sers${NBSP}?`)
    expect(d.touche(touche('Space', ' '))).toBe(false)   // déjà toute frappée
    const { images } = auxChoix(d)
    aLHeure(images * DT, DIALOGUE.choixApresS)           // témoin : saut ignoré, les choix à 0,6 s de la fin normale de la frappe
  })

  it('clock() : un tic quand il reste 1,5 s, 1 s puis 0,5 s, une fois chacun, même dans une seule grande image', () => {
    const d = createDialogue(COMMANDE)
    const { images } = auxChoix(d)
    const tics = journal(d, images * DT).filter(([, e]) => e.type === 'tic')
    expect(tics.map(([, e]) => e.restant)).toEqual([1.5, 1, 0.5])   // témoin : un tic à chaque image de la dernière 1,5 s
    const echeance = dureeFrappe(Q1) + DIALOGUE.choixApresS + DIALOGUE.minuterieS
    tics.forEach(([instant, e]) => aLHeure(instant, echeance - e.restant))
    const d2 = createDialogue(COMMANDE)
    auxChoix(d2)
    expect(d2.update(20).map(e => e.type)).toEqual(['tic', 'tic', 'tic', 'effets'])
  })
})

describe('les conditions et les aiguillages', () => {
  const PARTIR = {
    id: 'partir', interlocuteur: 'sorel', entree: 'q',
    noeuds: {
      q: {
        qui: 'sorel', dit: 'Vous allez où, ce soir ?',
        choix: [
          { texte: 'Je repars.', si: { couverture: 'routier' }, suite: FIN },
          { texte: 'Nulle part.', si: { couverture: null }, suite: FIN },
          { texte: 'Ça dépend de vous.', suite: FIN },
        ],
        silence: { suite: FIN },
      },
    },
  }

  it('un choix sous condition n\'est montré que si elle est remplie quand les choix s\'affichent ; ils se numérotent dans l\'ordre montré', () => {
    const etat = { couverture: null }
    const d = createDialogue(PARTIR, { etat })
    d.update(DT)
    etat.couverture = 'routier'                           // F2.1 entre la création et l'affichage des choix
    auxChoix(d)
    expect(d.choix).toEqual([{ n: 1, texte: 'Je repars.' }, { n: 2, texte: 'Ça dépend de vous.' }])   // témoins : si ignoré, trois choix ; lu à la création, « Nulle part. »
    etat.couverture = null                                // une fois montrés, les choix ne changent plus
    expect(d.choix.map(c => c.texte)).toEqual(['Je repars.', 'Ça dépend de vous.'])
    const sans = createDialogue(PARTIR)                   // sans état : sans couverture
    auxChoix(sans)
    expect(sans.choix).toEqual([{ n: 1, texte: 'Nulle part.' }, { n: 2, texte: 'Ça dépend de vous.' }])
    expect(sans.choisir(1)).toBe(true)
    expect(resume(jusquaFin(sans)[0])).toBe('viktor : Nulle part.')
  })

  it('les effets d\'un choix portent en issue son numéro montré au joueur (de 1 à 3 après les conditions), pas son rang dans les données', () => {
    // le choix 3 des données, montré en 2 au routier : « Ça dépend de vous. » en S3 (src/bar/textes.js)
    const choix = PARTIR.noeuds.q.choix.map((c, k) => ({ ...c, effets: { soupcon: 10 * (k + 1) } }))
    const d = createDialogue({ ...PARTIR, noeuds: { q: { ...PARTIR.noeuds.q, choix } } }, { etat: { couverture: 'routier' } })
    auxChoix(d)
    expect(d.choix).toEqual([{ n: 1, texte: 'Je repars.' }, { n: 2, texte: 'Ça dépend de vous.' }])
    expect(d.choisir(2)).toBe(true)
    expect(jusquaFin(d).filter(e => e.type === 'effets')).toEqual([{ type: 'effets', noeud: 'q', issue: 2, effets: { soupcon: 30 } }])   // témoin : le rang dans les données, 3
  })

  it('un aiguillage prend la première branche dont la condition est remplie, la dernière sinon', () => {
    const arbre = si => ({
      id: 'aiguille', interlocuteur: 'sorel', entree: 'a',
      noeuds: {
        a: { aiguillage: [{ si, suite: 'oui' }, { suite: 'non' }] },
        oui: { qui: 'sorel', dit: 'Oui.', suite: FIN },
        non: { qui: 'sorel', dit: 'Non.', suite: FIN },
      },
    })
    const branche = (si, etat) => createDialogue(arbre(si), { etat }).update(DT).find(e => e.type === 'replique').texte
    const cas = [
      [{ couverture: 'routier' }, { couverture: 'routier' }, 'Oui.'],
      [{ couverture: 'routier' }, {}, 'Non.'],
      [{ couverture: null }, {}, 'Oui.'],
      [{ renseignement: 'allie' }, { renseignements: { allie: true } }, 'Oui.'],
      [{ renseignement: 'allie' }, { renseignements: { allie: 'true' } }, 'Non.'],   // vrai seulement s'il vaut true
      [{ renseignement: 'allie' }, {}, 'Non.'],
      [{ sans: 'trajet' }, { renseignements: { trajet: true } }, 'Non.'],
      [{ sans: 'trajet' }, {}, 'Oui.'],
      [{ soupconMin: 60 }, { soupcon: 60 }, 'Oui.'],
      [{ soupconMin: 60 }, { soupcon: 59.9 }, 'Non.'],
      [{ soupconMin: 60 }, {}, 'Non.'],                   // S inconnu : ni à 60 ou plus…
      [{ soupconSous: 60 }, {}, 'Non.'],                  // …ni en dessous
      [{ soupconSous: 60 }, { soupcon: 59.9 }, 'Oui.'],
      [{ soupconSous: 60 }, { soupcon: 60 }, 'Non.'],
      [{ renseignement: 'heure', couverture: 'routier' }, { couverture: 'routier', renseignements: { heure: true } }, 'Oui.'],
      [{ renseignement: 'heure', couverture: 'routier' }, { couverture: 'routier' }, 'Non.'],   // toutes les clés
    ]
    for (const [si, etat, attendu] of cas) {
      expect(branche(si, etat), JSON.stringify([si, etat])).toBe(attendu)   // témoin : conditions ignorées, « Oui. » partout
    }
  })

  it('une condition se lit après les effets de l\'issue d\'avant, que l\'appelant applique entre deux images', () => {
    const arbre = {
      id: 'barriere', interlocuteur: 'fernand', entree: 'q',
      noeuds: {
        q: {
          qui: 'fernand', dit: 'Vous n\'êtes pas d\'ici.',
          choix: [
            { texte: 'Je livre à la cimenterie.', effets: { couverture: 'routier' }, suite: 'a' },
            { texte: 'Je cherche du travail.', suite: 'a' },
          ],
          silence: { suite: FIN },
        },
        a: { aiguillage: [{ si: { couverture: 'routier' }, suite: 'routier' }, { suite: 'autre' }] },
        routier: { qui: 'fernand', dit: 'Vous avez une tête à rouler la nuit.', suite: FIN },
        autre: { qui: 'fernand', dit: 'Hm.', suite: FIN },
      },
    }
    const etat = { couverture: null }
    const d = createDialogue(arbre, { etat })
    auxChoix(d)
    d.choisir(1)
    const dites = []
    for (let image = 0; image < 10 && !d.fini; image++) {
      for (const e of d.update(30)) {                     // de très grandes images : tout le reste en deux ou trois
        if (e.type === 'effets' && e.effets.couverture) etat.couverture = e.effets.couverture   // l'appelant (B11)
        if (e.type === 'replique') dites.push(e.texte)
      }
    }
    expect(dites).toEqual(['Je livre à la cimenterie.', 'Vous avez une tête à rouler la nuit.'])   // témoin : condition lue dans l'image des effets, « Hm. »
  })
})

describe('le silence qui revient', () => {
  const SOREL = {
    id: 'sorel-essai', interlocuteur: 'sorel', minuterieS: DIALOGUE.minuterieSorelS, entree: 's1',
    noeuds: {
      s1: {
        qui: 'sorel', dit: 'On ne se connaît pas.',
        choix: [
          { texte: 'Non.', reponse: 'C\'est ce que je disais.', suite: 'sortie' },
          { texte: 'Je suis de passage.', suite: 'sortie' },
        ],
        silence: { reponse: 'Vous réfléchissez beaucoup.', effets: { evenement: 'silenceSorel' }, revient: true, suite: 'sortie' },
      },
      sortie: { qui: 'sorel', dit: 'Bonne route.', suite: FIN },
    },
  }

  it('au premier silence, sa réponse, ses effets, et la question une seconde fois ; au second, ses effets et sa suite', () => {
    const d = createDialogue(SOREL)
    expect(d.delai).toBe(DIALOGUE.minuterieSorelS)
    const notes = journal(d)
    expect(notes.map(([, e]) => resume(e)).filter(r => r !== 'tic')).toEqual([
      'sorel : On ne se connaît pas.', 'choix',
      'sorel : Vous réfléchissez beaucoup.', 'effets {"evenement":"silenceSorel"}',
      'sorel : On ne se connaît pas.', 'choix',
      'effets {"evenement":"silenceSorel"}',
      'sorel : Bonne route.', 'fin',
    ])                                                    // témoin : revient ignoré, la sortie dès le premier silence
    const [choix1] = notes.filter(([, e]) => e.type === 'choix')
    const [silence1] = notes.filter(([, e]) => e.type === 'replique' && e.texte === 'Vous réfléchissez beaucoup.')
    aLHeure(silence1[0], dureeFrappe('On ne se connaît pas.') + DIALOGUE.choixApresS + DIALOGUE.minuterieSorelS)   // 6 s face à Sorel
    expect(silence1[0] - choix1[0]).toBeLessThan(DIALOGUE.minuterieSorelS + DT)
  })

  it('après la question reposée, un choix se joue comme la première fois', () => {
    const d = createDialogue(SOREL)
    auxChoix(d)
    jusqua(d, () => d.phase !== 'choix')                  // premier silence
    auxChoix(d)                                           // la question reposée
    expect(d.choisir(1)).toBe(true)
    expect(jusquaFin(d).map(resume)).toEqual(['viktor : Non.', 'sorel : C\'est ce que je disais.', 'sorel : Bonne route.', 'fin'])
  })
})

describe('un arbre mal formé est refusé dès sa création', () => {
  // une copie de l'arbre d'essai, modifiée par `change`
  const avec = change => { const a = structuredClone(COMMANDE); change(a); return a }
  const cas = [
    ['suite inconnue', a => { a.noeuds.q2.suite = 'q9' }, /suite inconnue « q9 »/],
    ['nœud jamais atteint', a => { a.noeuds.q3 = { qui: 'fernand', dit: 'Seul.', suite: FIN } }, /jamais atteint.*q3/],
    ['boucle', a => { a.noeuds.q2.suite = 'q1' }, /boucle/],
    ['entrée inconnue', a => { a.entree = 'q0' }, /entrée inconnue « q0 »/],
    ['condition inconnue', a => { a.noeuds.q1.choix[0].si = { couleur: 'rouge' } }, /condition inconnue « couleur »/],
    ['condition illisible', a => { a.noeuds.q1.choix[0].si = { soupconMin: '60' } }, /condition « soupconMin »/],
    ['effet inconnu', a => { a.noeuds.q1.choix[0].effets.argent = 5 }, /effet inconnu « argent »/],
    ['effet illisible', a => { a.noeuds.q1.choix[0].effets.soupcon = '5' }, /effet « soupcon »/],
    ['choix sans silence', a => { delete a.noeuds.q1.silence }, /silence/],
    ['choix sans texte', a => { a.noeuds.q1.choix[1].texte = '' }, /texte/],
    ['réplique sans dit', a => { delete a.noeuds.q2.dit }, /dit/],
    ['réplique sans qui', a => { delete a.noeuds.q2.qui }, /qui/],
    ['sans suite', a => { delete a.noeuds.q2.suite }, /suite/],
    ['nœud à choix avec une suite', a => { a.noeuds.q1.suite = 'q2' }, /suite/],
    ['aiguillage sans branche par défaut', a => {
      a.noeuds.q1.choix[0].suite = 'a'
      a.noeuds.a = { aiguillage: [{ si: { couverture: 'routier' }, suite: 'q2' }] }
    }, /dernière branche/],
    ['branche par défaut avant la fin', a => {
      a.noeuds.q1.choix[0].suite = 'a'
      a.noeuds.a = { aiguillage: [{ suite: 'q2' }, { si: { couverture: 'routier' }, suite: FIN }] }
    }, /dernière branche/],
    ['un nœud nommé « fin »', a => { a.noeuds[FIN] = { qui: 'fernand', dit: 'Fin.', suite: FIN } }, /« fin »/],
  ]
  for (const [nom, change, erreur] of cas) {
    it(nom, () => {
      expect(() => createDialogue(avec(change)), nom).toThrow(erreur)   // témoin : arbre accepté sans contrôle
      expect(() => verifierArbre(avec(change)), nom).toThrow(erreur)
    })
  }

  it('l\'arbre d\'essai, lui, passe ; les effets connus sont ceux de la spec (§3.6, §3.8, §3.14)', () => {
    expect(verifierArbre(COMMANDE)).toBe(COMMANDE)
    expect([...EFFETS].sort()).toEqual(['aide', 'apprend', 'couverture', 'demasque', 'evenement', 'muet', 'ouvre', 'soupcon',
      'surveille', 'verre'])
  })

  it('montrer moins de 2 ou plus de 3 choix est une erreur des données, jamais un silence', () => {
    const arbre = avec(a => { for (const c of a.noeuds.q1.choix) c.si = { couverture: 'routier' } })
    const d = createDialogue(arbre)                       // sans couverture : aucun choix à montrer
    expect(() => auxChoix(d)).toThrow(/0 choix montrés au nœud « q1 »/)   // témoin : liste vide montrée, minuterie qui court
    const quatre = avec(a => { a.noeuds.q1.choix.push({ texte: 'Une eau.', suite: FIN }) })
    expect(() => auxChoix(createDialogue(quatre))).toThrow(/4 choix montrés/)
  })
})

describe('les dialogues du Bivouac (src/bar/textes.js)', () => {
  // L'appelant (la coquille du bar, tâche B11), réduit à ce qui compte ici : il applique les effets émis avant l'image
  // suivante (la jauge par soupcon, evenement et demasque, sans plancher ; la couverture ; le carnet par apprend), et il
  // répond aux questions dans l'ordre de `reponses` : un numéro de choix, ou 'silence' (la minuterie expire).
  function jouer(arbre, reponses, etat = {}) {
    etat.soupcon ??= 0
    etat.renseignements ??= {}
    const d = createDialogue(arbre, { etat })
    const dites = [], effets = []
    let k = 0, attend = false, images = 0
    while (!d.fini && images++ < 60000) {
      for (const e of d.update(DT)) {
        if (e.type === 'replique') dites.push(`${e.qui} : ${e.texte}`)
        if (e.type !== 'effets') continue
        effets.push(e.effets)
        const { soupcon, evenement, demasque, couverture, apprend } = e.effets
        if (soupcon !== undefined) etat.soupcon += soupcon
        if (evenement !== undefined) etat.soupcon += SOUPCON.evenements[evenement].s
        if (demasque) etat.soupcon = SOUPCON.paliers.demasque.monte
        if (couverture !== undefined) etat.couverture = couverture
        for (const n of apprend || []) etat.renseignements[n] = true
      }
      if (d.phase !== 'choix') { attend = false; continue }
      if (attend) continue
      const r = reponses[k++]
      if (r === 'silence') attend = true
      else expect(d.choisir(r), `réponse ${k} : ${r}`).toBe(true)
    }
    expect(d.fini).toBe(true)
    expect(k).toBe(reponses.length)                         // chaque réponse a servi, à une question posée
    return { dites, effets, etat, delai: d.delai }
  }
  const { sorel: D2, fernand: F12, 'fernand-photo': F34, 'lise-commande': L1, 'lise-regard': L2 } = DIALOGUES

  it('D2, Sorel : « Tireur d\'élite. Douze ans. » démasque (S2.3), et rien ne suit', () => {
    const { dites, effets, etat } = jouer(D2, [1, 3])
    expect(dites).toEqual(['sorel : On ne se connaît pas.', 'viktor : Non.', 'sorel : C\'est ce que je disais.',
      'sorel : Vous avez servi. Ça se voit à la façon dont vous vous tenez.', 'viktor : Tireur d\'élite. Douze ans.',
      'sorel : Debout.'])
    expect(effets).toEqual([{ demasque: true }])          // témoin : S2.3 à +30, vers S3
    expect(etat.soupcon).toBe(100)
  })

  it('D2 : « La nationale. » donne TRAJET par la bouche de Sorel (S4.1), qui n\'est ouverte qu\'au routier', () => {
    const { dites, effets, etat } = jouer(D2, [2, 1, 1, 1], { couverture: 'routier', soupcon: 20 })
    expect(dites).toEqual(['sorel : On ne se connaît pas.', 'viktor : Je suis de passage.',
      'sorel : Tout le monde est de passage, ici.', 'sorel : Vous avez servi. Ça se voit à la façon dont vous vous tenez.',
      'viktor : Comme tout le monde.', 'sorel : Pas tout le monde.', 'sorel : Vous allez où, ce soir ?',
      'viktor : Je repars. De l\'autre côté de la frontière.', 'sorel : Par où ?', 'viktor : La nationale.',
      'sorel : Bien. Pas la vieille route : ce soir, elle est à nous.', 'sorel : Bonne route.'])
    expect(effets).toEqual([{ soupcon: -5 }, { soupcon: -10, apprend: ['trajet'] }])   // témoin : S4.1 sans apprend
    expect(etat.renseignements).toEqual({ trajet: true })
    // sans la couverture, la même réponse 1 à S3 ne mène pas à S4 : « Nulle part. », +5, et la sortie
    const sans = jouer(D2, [2, 1, 1], { soupcon: 20 })
    expect(sans.dites.slice(-3)).toEqual(['viktor : Nulle part. Je finis mon verre.', 'sorel : Finissez-le vite.', 'sorel : Bonne route.'])
    expect(sans.etat.renseignements).toEqual({})
  })

  it('D1, Fernand : « Deux. » donne HEURE et fait de lui un allié (F4.1)', () => {
    const { dites, effets, etat } = jouer(F34, [2, 1])
    expect(effets).toEqual([{ soupcon: -15, apprend: ['heure', 'allie'] }])   // témoin : apprend ['heure'] seul
    expect(etat.renseignements).toEqual({ heure: true, allie: true })
    expect(dites.at(-1)).toBe('fernand : … Ils ont rendez-vous à sept heures et quart devant la caserne. Je n\'ai rien dit.')
    expect(jouer(F34, [2, 3]).effets).toEqual([{ soupcon: 25, muet: 'fernand' }])   // « Les mêmes que votre fils. »
    expect(jouer(F34, [1]).effets).toEqual([])            // « Il manque le colonel. » : la fin, sans F4
  })

  it('D1, le premier passage au zinc : F2.1 donne la couverture du routier ; F2.1 et F2.2 ouvrent la photo, F2.3 la ferme', () => {
    const routier = jouer(F12, [1, 1])
    expect(routier.effets).toEqual([{ soupcon: -5, verre: 'demi' }, { couverture: 'routier', ouvre: 'fernand-photo' }])
    expect(routier.etat.couverture).toBe('routier')
    expect(jouer(F12, [2, 2]).effets).toEqual([{ verre: 'cafe' }, { ouvre: 'fernand-photo' }])
    expect(jouer(F12, [3, 3]).effets).toEqual([{ soupcon: 10, verre: 'demi' }, { soupcon: 15 }])   // témoin : F2.3 qui ouvre aussi
    expect(jouer(F12, ['silence']).effets).toEqual([{ evenement: 'silence' }])   // F1 sans réponse : +8, la fin
  })

  it('D2 : Fernand allié couvre Viktor, Sorel s\'en va (−10) sans rien demander', () => {
    const { dites, effets } = jouer(D2, [], { renseignements: { allie: true }, soupcon: 40 })
    expect(dites).toEqual(['fernand : Il est avec moi, lieutenant.', 'sorel : Bien.'])   // témoin : la branche sans condition
    expect(effets).toEqual([{ soupcon: -10 }])
    expect(jouer(D2, [1, 1, 2]).dites[0]).toBe('sorel : On ne se connaît pas.')
  })

  it('D2 : à la sortie, S à 60 ou plus, « Je vous ai à l\'œil. » et la surveillance ; dessous, « Bonne route. »', () => {
    const haut = jouer(D2, [1, 1, 1], { soupcon: 55 })     // « Nulle part. » : +5, S = 60 à la sortie
    expect(haut.dites.at(-1)).toBe('sorel : Je vous ai à l\'œil.')   // témoin : seuil à 61
    expect(haut.effets.at(-1)).toEqual({ surveille: true })
    const bas = jouer(D2, [1, 1, 1], { soupcon: 54 })
    expect(bas.dites.at(-1)).toBe('sorel : Bonne route.')
    expect(bas.effets.some(e => e.surveille)).toBe(false)
  })

  it('D2 : 6 s pour répondre ; au silence, « Vous réfléchissez beaucoup. » et la question une seconde fois, puis la suivante', () => {
    const { dites, effets, delai } = jouer(D2, ['silence', 'silence', 1, 'silence', 1])
    expect(delai).toBe(DIALOGUE.minuterieSorelS)
    expect(dites).toEqual(['sorel : On ne se connaît pas.', 'sorel : Vous réfléchissez beaucoup.', 'sorel : On ne se connaît pas.',
      'sorel : Vous avez servi. Ça se voit à la façon dont vous vous tenez.', 'viktor : Comme tout le monde.',
      'sorel : Pas tout le monde.', 'sorel : Vous allez où, ce soir ?', 'sorel : Vous réfléchissez beaucoup.',
      'sorel : Vous allez où, ce soir ?', 'viktor : Nulle part. Je finis mon verre.', 'sorel : Finissez-le vite.',
      'sorel : Bonne route.'])                             // témoin : S1 sans revient, S2 dès le premier silence
    expect(effets).toEqual([{ evenement: 'silenceSorel' }, { evenement: 'silenceSorel' }, { evenement: 'silenceSorel' }, { soupcon: 5 }])
  })

  it('D3, Lise : la commande ; puis, au premier regard trop long, son conseil et l\'aide, même au silence', () => {
    expect(jouer(L1, [2]).dites).toEqual(['lise : Tu prends quoi ?', 'viktor : Un café.', 'lise : Serré ?'])
    expect(jouer(L1, [1]).effets).toEqual([{ soupcon: -5, verre: 'demi' }])
    expect(jouer(L1, [3]).effets).toEqual([{ soupcon: 10 }])
    const aide = 'Ne fixe personne plus de deux secondes.'
    expect(jouer(L2, [1]).effets).toEqual([{ soupcon: -5, aide }])
    expect(jouer(L2, [3]).effets).toEqual([{ soupcon: 5, aide }])
    expect(jouer(L2, ['silence']).effets).toEqual([{ evenement: 'silence', aide }])   // témoin : l'aide oubliée au silence
  })
})
