import { describe, it, expect } from 'vitest'
import { REGARD, SOUPCON } from '../../src/bar/reglages.js'
import { seuilFixation, voitViktor, createRegards } from '../../src/bar/regard.js'
import { createSoupcon } from '../../src/bar/soupcon.js'
import { ANCRES, TYPES_SIEGE, dansZone, lacetVers } from '../../src/bar/plan.js'
import { forwardOf } from '../../src/prologue/fpsController.js'

// Le regard qui fixe, au Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.5 et §10 ; plan
// docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B3). Chaque test de comportement a été vu rouge sur le témoin écrit
// à côté de son assertion : d'abord sur un regard naïf qui réunissait ces témoins, puis un à un, glissés seuls dans le
// regard fini.

const DT = 1 / 60                                     // une image à 60 Hz
const RAD = Math.PI / 180
const OEIL = Object.freeze({ x: 0, y: 1.65, z: 0 })   // Viktor debout ; sauf mention, aucune boîte autour de lui
// Viktor assis sur une chaise, au même endroit : son œil (1,20 m) est 0,45 m sous la tête d'une personne debout (1,65 m)
const ASSIS = Object.freeze({ x: 0, y: TYPES_SIEGE.chaise.oeil, z: 0 })
// Viktor regarde vers le sud (+z) : dans son dos pour qui est devant lui (−z), de côté pour qui est à l'est ou à l'ouest
const AILLEURS = Object.freeze({ oeil: OEIL, direction: Object.freeze({ x: 0, y: 0, z: 1 }) })

// Une personne à d mètres devant Viktor (vers −z), tournée vers lui, la tête à la hauteur de son œil.
const enFace = (id, categorie, d = 2, plus = {}) =>
  ({ id, categorie, x: 0, y: OEIL.y, z: -d, lacet: lacetVers({ x: 0, z: -d }, OEIL), ...plus })
// La vue de Viktor depuis `oeil` qui vise la tête de p, décalée de `ecart` degrés à l'horizontale. Tête et œil à la
// même hauteur : le centre de l'écran est alors exactement à `ecart` degrés de la tête.
function vise(p, ecart = 0, oeil = OEIL) {
  const h = Math.hypot(p.x - oeil.x, p.z - oeil.z)
  const a = Math.atan2(p.x - oeil.x, p.z - oeil.z) + ecart * RAD
  return { oeil, direction: { x: Math.sin(a) * h, y: p.y - oeil.y, z: Math.cos(a) * h } }
}
// La vue de Viktor depuis `oeil` qui vise `ecart` degrés au-dessus de la tête de p (au-dessous si ecart < 0), dans le
// plan vertical qui passe par elle : le centre de l'écran est alors exactement à |ecart| degrés de la tête, quelle que
// soit la hauteur de l'œil.
function viseAuDessus(p, ecart, oeil = OEIL) {
  const azimut = Math.atan2(p.x - oeil.x, p.z - oeil.z)
  const site = Math.atan2(p.y - oeil.y, Math.hypot(p.x - oeil.x, p.z - oeil.z)) + ecart * RAD
  return { oeil, direction: { x: Math.sin(azimut) * Math.cos(site), y: Math.sin(site), z: Math.cos(azimut) * Math.cos(site) } }
}
// Viktor à 3 m d'une personne qui regarde vers −z, à `deg` degrés de sa face
const aDeSaFace = deg => { const f = forwardOf(deg * RAD); return { x: 3 * f.x, z: 3 * f.z } }

// Fait avancer les regards de `duree` secondes, image par image, avec la même vue ; rend ce qu'ils ont émis, chaque
// émission datée (t : secondes depuis le début de l'appel, à la fin de l'image où elle tombe).
function avance(regards, duree, vue) {
  const emis = []
  for (let k = 1, n = Math.round(duree / DT); k <= n; k++) {
    for (const e of regards.update(DT, vue)) emis.push({ ...e, t: k * DT })
  }
  return emis
}
const remarques = emis => emis.filter(e => e.type === 'remarque')
const ms = t => Math.round(t * 1000)                  // un instant à la milliseconde, pour comparer

describe('le seuil du regard (θmax)', () => {
  it('θmax(d) = atan(0,10 / d) + 3° : 6,8° à 1,5 m, 5,9° à 2 m, 4,9° à 3 m, 4,1° à 5 m', () => {
    expect(seuilFixation(2)).toBeCloseTo(5.9, 1)      // témoin : seuil fixe de 10°
    expect(seuilFixation(5)).toBeCloseTo(4.1, 1)      // témoin : seuil fixe, celui de 2 m (5,86°)
    expect(seuilFixation(1.5)).toBeCloseTo(6.8, 1)
    expect(seuilFixation(3)).toBeCloseTo(4.9, 1)
    expect(seuilFixation(2)).toBeCloseTo(Math.atan(0.05) / RAD + 3, 12)
  })

  it('à 2 m, la tête est fixée à 5,5° du centre de l\'écran, pas à 6,3° ; à 5 m, à 3,9°, pas à 4,4°', () => {
    for (const [d, dedans, dehors] of [[2, 5.5, 6.3], [5, 3.9, 4.4]]) {
      for (const cote of [1, -1]) {                   // d'un côté comme de l'autre
        const p = enFace('dussart', 'escorte', d)
        const fixee = createRegards([p], REGARD, []), ratee = createRegards([p], REGARD, [])
        avance(fixee, 1, vise(p, cote * dedans))
        avance(ratee, 1, vise(p, cote * dehors))
        expect(fixee.etat('dussart').fixation, `${d} m, ${cote * dedans}°`).toBeCloseTo(1, 9)
        expect(ratee.etat('dussart').fixation, `${d} m, ${cote * dehors}°`).toBe(0)   // témoin : seuil fixe de 10°, 1
      }
    }
  })

  it('Viktor assis, Sorel debout à 2 m, la tête 12,7° au-dessus de l\'horizontale : l\'écart en hauteur compte', () => {
    const sorel = enFace('sorel', 'escorte')          // tête à 1,65 m, à 2 m au sol de l'œil de Viktor assis (1,20 m)
    const fixation = vue => { const r = createRegards([sorel], REGARD, []); avance(r, 1, vue); return r.etat('sorel').fixation }
    expect(fixation(vise(sorel, 0, ASSIS))).toBeCloseTo(1, 9)                         // le centre de l'écran sur sa tête
    expect(fixation({ oeil: ASSIS, direction: { x: 0, y: 0, z: -1 } })).toBe(0)       // même azimut, à l'horizontale : 12,7° sous sa tête (témoin : angle horizontal seul, 1)
    expect(fixation({ oeil: ASSIS, direction: { x: 0, y: 1.45, z: -2 } })).toBe(0)    // 1 m au-dessus de sa tête : 23,3° (témoin : angle horizontal seul, 1)
  })

  it('le seuil se calcule sur la distance de l\'œil à la tête, pas au sol : debout à 1 m de Viktor assis, 8,2° et non 8,7°', () => {
    const sorel = enFace('sorel', 'escorte', 1)       // 1 m au sol, 0,45 m plus haut que l'œil : sa tête en est à 1,10 m
    for (const cote of [1, -1]) {                     // au-dessus comme au-dessous de sa tête
      const fixee = createRegards([sorel], REGARD, []), ratee = createRegards([sorel], REGARD, [])
      avance(fixee, 1, viseAuDessus(sorel, cote * 8, ASSIS))
      avance(ratee, 1, viseAuDessus(sorel, cote * 8.4, ASSIS))
      expect(fixee.etat('sorel').fixation, `${cote * 8}°`).toBeCloseTo(1, 9)
      expect(ratee.etat('sorel').fixation, `${cote * 8.4}°`).toBe(0)   // témoin : seuil sur la distance au sol (8,71°), 1
    }
  })
})

describe('qui voit Viktor : le cône et la ligne de vue de chacun', () => {
  const face = Object.freeze({ x: 0, z: 0, lacet: 0 })   // une personne qui regarde vers −z

  it('Viktor à 70° ou moins de sa face est vu, au-delà non ; alertée, à 110° ou moins', () => {
    for (const deg of [0, 45, -69.5, 69.5]) expect(voitViktor(face, aDeSaFace(deg), []), `${deg}°`).toBe(true)
    for (const deg of [70.5, -70.5, 120, 180]) {
      expect(voitViktor(face, aDeSaFace(deg), []), `${deg}°`).toBe(false)              // témoin : sans cône de la personne
    }
    for (const deg of [70.5, -109.5, 109.5]) {
      expect(voitViktor(face, aDeSaFace(deg), [], true), `alertée, ${deg}°`).toBe(true)   // témoin : cône d'alerte ignoré
    }
    for (const deg of [110.5, 180]) expect(voitViktor(face, aDeSaFace(deg), [], true), `alertée, ${deg}°`).toBe(false)
  })

  it('un mur, une cloison ou une porte entre eux : rien ; un meuble ou une personne laissent passer la vue', () => {
    const viktor = aDeSaFace(0)                       // à 3 m, droit devant elle
    const entre = son => [{ minX: -1, maxX: 1, minZ: -1.6, maxZ: -1.4, son }]
    for (const son of ['mur', 'cloison', 'porte']) expect(voitViktor(face, viktor, entre(son)), son).toBe(false)   // témoin : murs ignorés
    expect(voitViktor(face, viktor, entre('meuble'))).toBe(true)
  })

  it('la zone discrète est un lieu, pas un abri : dans le sas des toilettes, Fernand voit Viktor ; au fond du couloir, non', () => {
    const fernand = { id: 'fernand', categorie: 'fernand', ...ANCRES.fernand, y: 1.65 }   // derrière le zinc, face aux tabourets
    const sas = { x: -2.0, y: 1.65, z: -4.2 }, fond = { x: -2.0, y: 1.65, z: -6.5 }
    expect([dansZone('discrete', sas), dansZone('discrete', fond)]).toEqual([true, true])
    expect(voitViktor(fernand, sas)).toBe(true)       // les boîtes du plan par défaut (témoin : hors de vue en zone discrète)
    expect(voitViktor(fernand, fond)).toBe(false)     // la cloison du couloir et le mur nord
    const r = createRegards([fernand])                // les réglages et les boîtes du plan par défaut
    r.update(DT, { oeil: sas, direction: { x: 0, y: 0, z: -1 } })   // face au WC
    expect(r.temoins).toEqual(['fernand'])            // il en est témoin (témoin : témoins réduits aux personnes fixées, [])
    r.update(DT, { oeil: fond, direction: { x: 0, y: 0, z: -1 } })
    expect(r.temoins).toEqual([])
  })
})

describe('le temps de fixation f_p et « remarqué »', () => {
  it('dos tourné ou derrière un mur, la fixer ne compte pas, même 5 s', () => {
    const dos = enFace('dussart', 'escorte', 2, { lacet: 0 })   // il tourne le dos à Viktor
    const r = createRegards([dos], REGARD, [])
    expect(avance(r, 5, vise(dos))).toEqual([])       // témoin : sans cône de la personne, remarqué à 1,2 s
    expect(r.etat('dussart').fixation).toBe(0)
    const cache = enFace('dussart', 'escorte')
    const q = createRegards([cache], REGARD, [{ minX: -1, maxX: 1, minZ: -1.1, maxZ: -0.9, son: 'cloison' }])
    expect(avance(q, 5, vise(cache))).toEqual([])     // témoin : murs ignorés, remarqué à 1,2 s
    expect([q.etat('dussart').fixation, q.temoins]).toEqual([0, []])
  })

  it('regard détourné, f_p redescend deux fois plus vite qu\'il n\'est monté, jusqu\'à 0', () => {
    const p = enFace('dussart', 'escorte')
    const r = createRegards([p], REGARD, [])
    avance(r, 1, vise(p))                             // sous la tolérance de l'escorte (1,2 s)
    expect(r.etat('dussart').fixation).toBeCloseTo(1, 9)
    avance(r, 0.25, AILLEURS)
    expect(r.etat('dussart').fixation).toBeCloseTo(0.5, 9)   // témoin : même vitesse, 0,75
    avance(r, 0.5, AILLEURS)
    expect(r.etat('dussart').fixation).toBe(0)
  })

  it('« remarqué » une fois par épisode ; l\'épisode ne se clôt que quand f_p revient à 0', () => {
    const p = enFace('dussart', 'escorte')
    const r = createRegards([p], REGARD, [])
    expect(remarques(avance(r, 1.5, vise(p))).map(e => [e.qui, e.categorie, ms(e.t)])).toEqual([['dussart', 'escorte', 1200]])
    avance(r, 0.5, AILLEURS)                          // f_p redescend à 0,5 : l'épisode dure
    expect(r.etat('dussart').fixation).toBeCloseTo(0.5, 9)
    expect(remarques(avance(r, 1.5, vise(p)))).toEqual([])   // témoin : remarqué chaque fois que f_p franchit la tolérance
    avance(r, 1, AILLEURS)                            // de 2 à 0 en 1 s : l'épisode est clos
    expect(r.etat('dussart').fixation).toBe(0)
    expect(remarques(avance(r, 1.3, vise(p)))).toHaveLength(1)   // témoin : remarqué une seule fois de la soirée, 0
    // au reste d'arrondi près : 72 images de fixation, puis 36 de regard détourné, ramènent f_p à 0, l'épisode est clos
    const q = createRegards([p], REGARD, [])
    expect(remarques(avance(q, 1.2, vise(p)))).toHaveLength(1)
    avance(q, 0.6, AILLEURS)
    expect(q.etat('dussart').fixation).toBe(0)        // témoin : f_p arrêté par max(0, …), 2e-16
    expect(remarques(avance(q, 1.2, vise(p)))).toHaveLength(1)
  })

  it('ses répliques tombent à la tolérance, puis 1,5 s et 3 s plus tard si la fixation dure, une fois chacune', () => {
    const sorel = enFace('sorel', 'escorte')
    const r = createRegards([sorel], REGARD, [])
    expect(avance(r, 6, vise(sorel)).map(e => [e.type, e.rang, ms(e.t)])).toEqual([
      ['remarque', undefined, 1200], ['replique', 0, 1200], ['replique', 1, 2700], ['replique', 2, 4200],
    ])                                                // témoins : une réplique à chaque image passé son palier ; toutes à la remarque
    // le regard détourné, la suite attend que la fixation reprenne et dure
    const q = createRegards([sorel], REGARD, [])
    avance(q, 2, vise(sorel))                         // remarqué à 1,2 s ; f_p à 2
    expect(avance(q, 0.25, AILLEURS)).toEqual([])     // f_p à 1,5
    expect(avance(q, 1.5, vise(sorel)).map(e => [e.rang, ms(e.t)])).toEqual([[1, 1200]])   // f_p à 2,7 en 1,2 s (témoin : comptées depuis la remarque, à 0,45 s)
  })

  it('l\'interlocuteur du dialogue en cours n\'est pas fixé, mais il voit Viktor', () => {
    const sorel = enFace('sorel', 'escorte')
    const lise = { id: 'lise', categorie: 'civil', x: 2, y: OEIL.y, z: 0, lacet: lacetVers({ x: 2, z: 0 }, OEIL) }   // à l'est, tournée vers lui
    const r = createRegards([sorel, lise], REGARD, [])
    expect(avance(r, 5, { ...vise(sorel), interlocuteur: 'sorel' })).toEqual([])   // témoin : interlocuteur fixé comme un autre
    expect(r.etat('sorel').fixation).toBe(0)
    expect(r.temoins).toEqual(['escorte', 'civil'])   // témoin : interlocuteur retiré de la vue, ['civil']
    // en parlant avec Lise, fixer Sorel compte
    expect(remarques(avance(r, 1.5, { ...vise(sorel), interlocuteur: 'lise' })).map(e => e.qui)).toEqual(['sorel'])
  })

  it('la tolérance selon qui l\'on fixe : escorte 1,2 s, civil 2 s, Fernand 3 s ; × 1,3 assis avec un verre', () => {
    for (const [categorie, tolerance] of [['escorte', 1.2], ['civil', 2], ['fernand', 3]]) {
      for (const [assisAvecVerre, facteur] of [[false, 1], [true, 1.3]]) {
        const quoi = `${categorie}${assisAvecVerre ? ', assis avec un verre' : ''}`
        const p = enFace('p', categorie)
        const r = createRegards([p], REGARD, [])
        const emis = remarques(avance(r, 5, { ...vise(p), assisAvecVerre }))
        expect(emis.length, quoi).toBe(1)
        expect(emis[0].t, quoi).toBeGreaterThan(tolerance * facteur - 1e-9)   // pas avant (témoins : sans le verre ; 1,2 s pour tous)
        expect(emis[0].t, quoi).toBeLessThan(tolerance * facteur + DT)         // à l'image où elle est atteinte (témoin : sans le milliardième)
        expect(r.etat('p').tolerance, quoi).toBeCloseTo(tolerance * facteur, 12)
      }
    }
  })

  it('Albert ne remarque jamais rien, même fixé une minute, et le fixer n\'est pas une source de la jauge', () => {
    const albert = enFace('albert', 'albert')
    const r = createRegards([albert], REGARD, [])
    expect(avance(r, 60, vise(albert))).toEqual([])   // témoin : une tolérance de 1,2 s pour tous, remarqué
    expect(r.sources).toEqual([])
    expect(r.temoins).toEqual(['albert'])             // il voit Viktor ; la jauge ne lui donne aucun poids (§3.6)
  })

  it('remarqué, on est alerté 10 s à l\'image près : le cône passe à 110°, la fixation compte de côté, puis il revient à 70°', () => {
    const p = enFace('dussart', 'escorte')            // en (0 ; −2), tourné vers Viktor
    const cote = { x: 2, y: OEIL.y, z: -2 }           // à l'est de Dussart, à 90° de sa face
    const deCote = { oeil: cote, direction: { x: 0, y: 0, z: 1 } }   // Viktor y regarde vers le sud, loin de lui
    const r = createRegards([p], REGARD, [])
    r.update(DT, vise(p, 0, cote))
    expect([r.etat('dussart').voit, r.etat('dussart').fixation]).toEqual([false, 0])   // hors de son cône : ni vu ni fixé
    expect(remarques(avance(r, 1.3, vise(p)))).toHaveLength(1)   // en face : remarqué à 1,2 s
    expect(r.etat('dussart').alerte).toBeCloseTo(9.9, 9)   // témoins : jamais alerté, 0 ; alerte sans fin, 10
    avance(r, 1, vise(p, 0, cote))                    // de côté, Viktor le fixe encore
    expect(r.etat('dussart').voit).toBe(true)         // témoin : cône d'alerte ignoré, faux
    expect(r.etat('dussart').fixation).toBeCloseTo(2.3, 9)
    avance(r, 8.8, deCote)                            // 9,9 s après la remarque
    expect(r.etat('dussart').voit).toBe(true)
    avance(r, 0.1, deCote)                            // l'image qui finit 10 s pile après la remarque : encore alerté
    expect(r.etat('dussart').voit).toBe(true)         // témoin : alerte décomptée avant de regarder, une image trop tôt
    avance(r, DT, deCote)                             // l'image d'après
    expect([r.etat('dussart').voit, r.etat('dussart').alerte]).toEqual([false, 0])   // témoin : cône d'alerte gardé une fois alerté
  })
})

describe('ce que la jauge de soupçon en reçoit', () => {
  it('les catégories du regard sont celles de la jauge ; chacune peut remarquer Viktor, sauf Albert', () => {
    expect(Object.keys(REGARD.tolerance).sort()).toEqual(Object.keys(SOUPCON.temoins).sort())   // témoin : une catégorie d'un seul côté
    for (const [categorie, tolerance] of Object.entries(REGARD.tolerance)) {
      expect(Object.hasOwn(SOUPCON.evenements.remarque, categorie), categorie).toBe(tolerance !== Infinity)   // témoin : Albert remarque
    }
  })

  it('une source par fixation au-delà de la tolérance, tant qu\'elle dure ; la catégorie de chaque personne qui voit Viktor', () => {
    const dussart = enFace('dussart', 'escorte')
    const lise = { id: 'lise', categorie: 'civil', x: 3, y: OEIL.y, z: 0, lacet: lacetVers({ x: 3, z: 0 }, OEIL) }   // à l'est, tournée vers lui
    const mattei = { id: 'mattei', categorie: 'escorte', x: -3, y: OEIL.y, z: 0, lacet: lacetVers({ x: -3, z: 0 }, { x: -6, z: 0 }) }   // dos tourné
    const r = createRegards([dussart, lise, mattei], REGARD, [])
    avance(r, 1, vise(dussart))
    expect(r.sources).toEqual([])                     // sous la tolérance : rien (témoin : source dès le début de la fixation)
    expect(r.temoins).toEqual(['escorte', 'civil'])   // Mattei ne voit rien (témoin : sans cône de la personne)
    avance(r, 0.5, vise(dussart))
    expect(r.sources).toEqual([{ nom: 'fixation', qui: 'escorte' }])
    avance(r, DT, AILLEURS)
    expect(r.sources).toEqual([])                     // les yeux ailleurs (témoin : source tant que f_p dépasse la tolérance)
    expect(r.temoins).toEqual(['escorte', 'civil'])
  })

  it('l\'exemple du §3.6 : Sorel fixé 3 s à 2 m, remarqué à 1,2 s, puis 1,8 s de fixation : 30, plancher 10 ; les yeux ailleurs, sous 22 en 2,7 s', () => {
    const sorel = enFace('sorel', 'escorte')
    const r = createRegards([sorel], REGARD, [])
    const s = createSoupcon()
    let t = 0
    const remarqueA = []
    // une image du bar (tâche B11) : les regards, puis la jauge avec leurs sources et leurs témoins, puis les remarques
    const image = vue => {
      t += DT
      const emis = r.update(DT, vue)
      s.update(DT, { sources: r.sources, temoins: r.temoins })
      for (const e of emis) if (e.type === 'remarque') { remarqueA.push(t); s.evenement('remarque', e.categorie) }
    }
    for (let k = 0; k < 180; k++) image(vise(sorel))
    expect(remarqueA.map(ms)).toEqual([1200])
    expect(s.S).toBeCloseTo(30, 9)                    // témoins : source dès l'image où la tolérance est atteinte, 30,17 ; dès le début, 42
    expect([s.plancher, s.palier]).toEqual([10, 'mefiance'])
    let duree = 0                                     // les yeux ailleurs ; Sorel, alerté, regarde toujours Viktor : 3 par seconde
    while (s.palier !== 'calme' && duree < 10) { image(AILLEURS); duree += DT }
    expect(duree).toBeGreaterThan(2.6)                // témoin : témoins réduits aux personnes fixées, 5 par seconde, 1,6 s
    expect(duree).toBeLessThan(2.8)
  })
})

describe('les entrées', () => {
  it('une personne, un interlocuteur ou une vue mal décrits sont des erreurs, jamais ignorés en silence', () => {
    const p = enFace('dussart', 'escorte')
    expect(() => createRegards([{ ...p, categorie: 'barman' }])).toThrow(/barman/)     // témoin : tolérance absente, jamais remarqué
    expect(() => createRegards([{ ...p, categorie: 'toString' }])).toThrow(/toString/)   // témoin : nom hérité des objets
    expect(() => createRegards([p, { ...p }])).toThrow(/dussart/)                        // la même personne deux fois
    const r = createRegards([p], REGARD, [])
    expect(() => r.update(DT, { ...vise(p), interlocuteur: 'sorrel' })).toThrow(/sorrel/)   // témoin : personne n'est exclu
    expect(() => r.etat('sorrel')).toThrow(/sorrel/)
    expect(() => r.update(DT, { oeil: OEIL, direction: { x: 0, y: 0, z: 0 } })).toThrow(/direction/)   // témoin : tout le monde fixé
    expect(() => r.update(DT, { oeil: { x: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 } })).toThrow(/œil/)
    p.lacet = NaN
    expect(() => r.update(DT, vise(p))).toThrow(/dussart/)   // témoin : aveugle en silence
    expect(r.etat('dussart').fixation).toBe(0)
  })

  it('chaque image relit la tête et la face de chacun : l\'appelant les modifie sur place, sans remplacer l\'objet', () => {
    const p = enFace('dussart', 'escorte')            // en (0 ; −2), tourné vers Viktor
    const r = createRegards([p], REGARD, [])
    const vue = vise(p)                               // Viktor garde les yeux où était sa tête
    const etat = () => [r.etat('dussart').voit, r.etat('dussart').fixe]
    r.update(DT, vue)
    expect(etat()).toEqual([true, true])
    p.x = 1                                           // un pas de côté : sa tête est à 26,6° du centre de l'écran
    r.update(DT, vue)
    expect(etat()).toEqual([true, false])             // témoin : personnes copiées à la création, [true, true]
    p.x = 0
    p.lacet = 0                                       // revenu, il tourne le dos à Viktor
    r.update(DT, vue)
    expect(etat()).toEqual([false, false])            // témoin : personnes copiées à la création, [true, true]
  })

  it('absente (present: false), une personne ne voit pas Viktor et n\'est pas fixée ; sans le champ, elle est là', () => {
    const sorel = enFace('sorel', 'escorte', 2, { present: false })   // Sorel monté au début de la soirée, il entre à 18:30
    const dussart = enFace('dussart', 'escorte', 3, { x: 0.5 })
    const r = createRegards([sorel, dussart], REGARD, [])
    const emis = avance(r, 3, vise(sorel))
    expect(remarques(emis)).toEqual([])                                // témoin : le regard sans présence, remarqué à 1,2 s
    expect(r.etat('sorel')).toMatchObject({ voit: false, fixe: false, fixation: 0 })
    expect(r.temoins).toEqual(['escorte'])                             // Dussart seul, qui n'a pas de champ present
    sorel.present = true                                               // il entre : modifié sur place, comme sa tête
    expect(remarques(avance(r, 1.5, vise(sorel))).map(e => e.qui)).toEqual(['sorel'])
    expect(r.temoins).toEqual(['escorte', 'escorte'])
  })

  it('un pas de temps invalide ne change rien', () => {
    const p = enFace('dussart', 'escorte')
    const r = createRegards([p], REGARD, [])
    avance(r, 1, vise(p))
    for (const dt of [NaN, undefined, -1, 0, Infinity]) expect(r.update(dt, vise(p)), String(dt)).toEqual([])
    expect(r.etat('dussart').fixation).toBeCloseTo(1, 9)   // témoin : pas de temps lu tel quel, f_p illisible
  })

  it('le regard lit ses valeurs dans les réglages qu\'on lui passe', () => {
    const r = structuredClone(REGARD)
    Object.assign(r, { rayonTeteM: 0.2, margeDeg: 1, coneDeg: 30, coneAlerteDeg: 40, oubli: 4, verre: 2, alerteS: 1, repliquesS: [0, 0.5] })
    r.tolerance.escorte = 0.5
    expect(seuilFixation(2, r)).toBeCloseTo(Math.atan(0.1) / RAD + 1, 12)   // témoin : REGARD écrit en dur, 5,86
    const face = { x: 0, z: 0, lacet: 0 }
    expect([voitViktor(face, aDeSaFace(35), [], false, r), voitViktor(face, aDeSaFace(35), [], true, r)])
      .toEqual([false, true])                         // témoin : 70° et 110° écrits en dur, [true, true]
    const p = enFace('dussart', 'escorte')
    const q = createRegards([p], r, [])
    expect(avance(q, 1.5, { ...vise(p), assisAvecVerre: true }).map(e => [e.type, e.rang, ms(e.t)])).toEqual([
      ['remarque', undefined, 1000], ['replique', 0, 1000], ['replique', 1, 1500],   // 0,5 × 2 ; puis 0,5 s plus tard
    ])                                                // témoin : REGARD écrit en dur, rien avant 1,56 s
    expect(q.etat('dussart').alerte).toBeCloseTo(0.5, 9)
    avance(q, 0.25, AILLEURS)
    expect(q.etat('dussart').fixation).toBeCloseTo(0.5, 9)   // 1,5 − 4 × 0,25
  })
})
