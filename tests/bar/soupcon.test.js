import { describe, it, expect } from 'vitest'
import { REGARD, SOUPCON, COUVERTURE, DIALOGUE } from '../../src/bar/reglages.js'
import { createSoupcon, PALIERS } from '../../src/bar/soupcon.js'

// La jauge de soupçon du Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.6 ; plan
// docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B1). Chaque test de comportement a été vu rouge sur le témoin écrit
// à côté de son assertion, glissé seul dans la jauge finie (la plupart l'avaient d'abord été sur une jauge naïve qui
// réunissait ces témoins), puis vert.

const DT = 1 / 60                                          // une image à 60 Hz
const FIXE_ESCORTE = { nom: 'fixation', qui: 'escorte' }   // Viktor fixe un homme du colonel au-delà de sa tolérance

// Fait avancer la jauge de `duree` secondes, image par image, dans la même situation ; rend tout ce qu'elle a émis.
function avance(jauge, duree, situation) {
  const emis = []
  for (let k = Math.round(duree / DT); k > 0; k--) emis.push(...jauge.update(DT, situation))
  return emis
}

describe('les réglages du bar', () => {
  it('les valeurs de reglages.js sont celles de la spec (§3.5 à §3.8)', () => {
    expect(REGARD).toMatchObject({ rayonTeteM: 0.1, margeDeg: 3, coneDeg: 70, coneAlerteDeg: 110, oubli: 2, verre: 1.3,
      alerteS: 10, repliquesS: [0, 1.5, 3] })
    expect(REGARD.tolerance).toEqual({ escorte: 1.2, civil: 2, fernand: 3, albert: Infinity })
    expect(SOUPCON.temoins).toEqual({ escorte: 1, fernand: 0.8, civil: 0.5, albert: 0 })
    expect(SOUPCON.montees).toEqual({ fixation: 10, tropPres: 6, zonePrivee: 2.5, zonePriveePretexte: 0.5, zoneInterdite: 12 })
    expect(SOUPCON.deboutSeulement).toEqual(['tropPres', 'zonePrivee', 'zonePriveePretexte'])
    expect(SOUPCON).toMatchObject({ tropPresM: 1.3, presenceTablesS: 90, presenceTablesM: 3, baisseHorsDeVue: 5, plancherMax: 55 })
    expect(SOUPCON.baisses).toEqual({ debout: 3, assis: 3, pose: 5 })
    expect(SOUPCON.paliers).toEqual({ mefiance: { monte: 30, redescend: 22 }, soupcon: { monte: 60, redescend: 52 },
      demasque: { monte: 100 } })
    expect(SOUPCON.effets).toEqual({ voixEscorte: 0.7, regardS: [8, 12], reportS: 20, reportEssais: 2 })
    expect(COUVERTURE).toMatchObject({ sansCommandeS: 60, toilettesS: [240, 300], jukeboxMaintienS: 1 })
    expect(DIALOGUE).toMatchObject({ minuterieS: 10, minuterieSorelS: 6 })
  })
})

describe('ce qui fait monter la jauge', () => {
  it('une fixation que personne ne voit ne fait rien monter', () => {
    const s = createSoupcon()
    avance(s, 5, { sources: [FIXE_ESCORTE], temoins: [] })
    expect(s.S).toBe(0)                                     // témoin : jauge sans témoins, 50
    avance(s, 5, { sources: [FIXE_ESCORTE], temoins: ['albert'] })
    expect(s.S).toBe(0)                                     // Albert ne voit rien : seul témoin, il ne compte pas
    avance(s, 1, { sources: [FIXE_ESCORTE], temoins: ['albert', 'escorte'] })
    expect(s.S).toBeCloseTo(10, 9)                          // vue de l'escorte, la même fixation monte de 10 par seconde
  })

  it('les montées s\'additionnent, multipliées par le poids du témoin le plus sévère qui voit Viktor', () => {
    const cas = [                                           // [sources actives, qui voit Viktor, hausse en 1 s]
      [[FIXE_ESCORTE, 'tropPres'], ['escorte'], 16],        // 10 + 6
      [[FIXE_ESCORTE], ['civil', 'fernand', 'escorte'], 10],   // le plus sévère (témoin : poids additionnés, 23)
      [[{ nom: 'fixation', qui: 'civil' }], ['civil'], 2.5],   // Lise fixée, vue d'elle seule : 10 × 0,5 × 0,5
      [[{ nom: 'fixation', qui: 'fernand' }], ['fernand'], 6.4],   // Fernand fixé : 10 × 0,8 × 0,8
      [['zoneInterdite'], ['fernand'], 9.6],                // derrière le zinc, sous les yeux de Fernand : 12 × 0,8
      [['zonePrivee'], ['escorte'], 2.5],                   // debout près de la table A, sans verre ni prétexte
      [['zonePriveePretexte'], ['escorte'], 0.5],           // la même avec un prétexte
    ]
    for (const [sources, temoins, hausse] of cas) {
      const s = createSoupcon()
      avance(s, 1, { sources, temoins })
      expect(s.S, JSON.stringify({ sources, temoins })).toBeCloseTo(hausse, 9)
    }
  })

  it('« trop près » et la zone privée ne valent que debout : assis ou posé, ils ne montent rien', () => {
    const vu = { temoins: ['escorte'] }
    for (const pose of ['assis', 'pose']) {
      const sansSource = createSoupcon()                    // la même seconde sans aucune source : la baisse seule
      sansSource.evenement('choix', 40)
      avance(sansSource, 1, { ...vu, pose })
      for (const source of ['tropPres', 'zonePrivee', 'zonePriveePretexte']) {
        const s = createSoupcon()
        s.evenement('choix', 40)
        avance(s, 1, { ...vu, pose, sources: [source] })
        expect(s.S, `${source}, ${pose}`).toBe(sansSource.S)   // témoin : comptées quelle que soit la pose, 46 (« trop près »)
      }
    }
  })

  it('assis ou posé, la fixation monte toujours, même avec « trop près » ou la zone privée dans la même image', () => {
    const cas = [                                           // [pose, sources actives, hausse en 1 s sous le regard de l'escorte]
      ['pose', [FIXE_ESCORTE, 'tropPres', 'zonePrivee'], 10],   // témoin : sources comptées quelle que soit la pose, 18,5
      ['assis', [FIXE_ESCORTE, 'zonePriveePretexte'], 10],       // témoin : la même, 10,5
      ['debout', [FIXE_ESCORTE, 'tropPres', 'zonePrivee'], 18.5],   // debout, tout compte
    ]
    for (const [pose, sources, hausse] of cas) {
      const s = createSoupcon()
      avance(s, 1, { sources, temoins: ['escorte'], pose })
      expect(s.S, JSON.stringify({ pose, sources })).toBeCloseTo(hausse, 9)   // témoin : toute source écartée hors debout, 0
    }
  })
})

describe('ce qui la fait redescendre', () => {
  it('la baisse s\'arrête au plancher, même sous un bon choix de dialogue', () => {
    const s = createSoupcon()
    s.evenement('remarque', 'escorte')                      // +12, plancher +10
    avance(s, 10, { temoins: ['escorte'] })
    expect(s.S).toBe(10)                                    // témoin : sans plancher, 0
    s.evenement('choix', -15)
    expect(s.S).toBe(10)
  })

  it('le plancher plafonne à 55', () => {
    const s = createSoupcon()
    for (let k = 0; k < 6; k++) s.evenement('remarque', 'escorte')   // S à 72 ; plancher à 60 sans plafond
    expect(s.plancher).toBe(55)                             // témoin : plancher non plafonné, 60
    avance(s, 30, { temoins: [] })
    expect(s.S).toBe(55)
  })

  it('3 par seconde debout sous le regard ; 5 posé avec un verre, ou hors de la vue de tous', () => {
    const cas = [                                           // [situation sans montée, baisse par seconde]
      [{ pose: 'debout', temoins: ['escorte'] }, 3],
      [{ temoins: ['civil'] }, 3],                          // debout par défaut
      [{ pose: 'assis', temoins: ['fernand'] }, 3],         // assis sans verre : comme debout
      [{ pose: 'pose', temoins: ['escorte'] }, 5],          // témoin : une seule baisse, 3 par seconde
      [{ pose: 'debout', temoins: [] }, 5],
      [{ pose: 'assis', temoins: ['albert'] }, 5],          // Albert seul : hors de la vue de tous
    ]
    for (const [situation, baisse] of cas) {
      const s = createSoupcon()
      s.evenement('choix', 50)                              // mise en place : S à 50, plancher à 0
      avance(s, 2, situation)
      expect(s.S, JSON.stringify(situation)).toBeCloseTo(50 - 2 * baisse, 9)
    }
  })

  // tâche B11 : la baisse que la coquille règle à chaque image (spec §3.14) : divisée par deux après « Je vous ai à
  // l'œil » (D2, effet surveille, SOUPCON.surveilleBaisse), et 2 par seconde de plus assis à la table d'Albert
  // (COUVERTURE.albertBaisse), toujours jusqu'au plancher, jamais en même temps qu'une montée
  it('la baisse se règle à l\'image : divisée par deux sous surveillance, 2 par seconde de plus à la table d\'Albert', () => {
    expect(SOUPCON.surveilleBaisse).toBe(0.5)
    expect(COUVERTURE.albertBaisse).toBe(2)
    const cas = [                                           // [situation sans montée, baisse par seconde]
      [{ pose: 'debout', temoins: ['escorte'], facteurBaisse: 0.5 }, 1.5],   // témoin : réglage ignoré, 3 par seconde
      [{ pose: 'debout', temoins: [], facteurBaisse: 0.5 }, 2.5],
      [{ pose: 'assis', temoins: ['escorte'], baisseEnPlus: 2 }, 5],
      [{ pose: 'assis', temoins: ['albert'], baisseEnPlus: 2 }, 7],          // hors de la vue de tous, plus Albert
      [{ pose: 'pose', temoins: ['fernand'], baisseEnPlus: 2, facteurBaisse: 0.5 }, 3.5],
    ]
    for (const [situation, baisse] of cas) {
      const s = createSoupcon()
      s.evenement('choix', 50)
      avance(s, 2, situation)
      expect(s.S, JSON.stringify(situation)).toBeCloseTo(50 - 2 * baisse, 9)
    }
    const plancher = createSoupcon()
    plancher.evenement('remarque', 'escorte')               // S 12, plancher 10
    avance(plancher, 5, { pose: 'assis', temoins: ['albert'], baisseEnPlus: 2 })
    expect(plancher.S).toBe(10)                             // jusqu'au plancher, pas plus bas
    const monte = createSoupcon()
    avance(monte, 1, { sources: ['zoneInterdite'], temoins: ['fernand'], baisseEnPlus: 2 })
    expect(monte.S).toBeCloseTo(12 * 0.8, 9)                // une montée : la baisse en plus ne compte pas
    expect(() => createSoupcon().update(DT, { facteurBaisse: -1 })).toThrow()
    expect(() => createSoupcon().update(DT, { baisseEnPlus: NaN })).toThrow()
  })

  it('jamais de montée et de baisse dans la même image', () => {
    const s = createSoupcon()
    s.evenement('choix', 40)
    avance(s, 1, { sources: ['zonePriveePretexte'], temoins: ['civil'] })   // une montée faible : 0,5 × 0,5 par seconde
    expect(s.S).toBeCloseTo(40.25, 9)                       // témoin : montée et baisse ensemble, 40 + 0,25 - 3 = 37,25
    avance(s, 1, { temoins: ['civil'] })                    // plus rien ne monte : la baisse seule
    expect(s.S).toBeCloseTo(37.25, 9)
  })
})

describe('les paliers', () => {
  it('de 62 à 55, on reste en SOUPÇON ; on n\'en sort que sous 52, et de MÉFIANCE que sous 22', () => {
    expect(PALIERS).toEqual(['calme', 'mefiance', 'soupcon', 'demasque'])
    const s = createSoupcon()
    const vu = { temoins: ['escorte'] }
    avance(s, 6.2, { ...vu, sources: [FIXE_ESCORTE] })     // 10 par seconde
    expect(s.S).toBeCloseTo(62, 9)
    expect(s.palier).toBe('soupcon')
    avance(s, 7 / 3, vu)                                    // 3 par seconde : 55
    expect(s.S).toBeCloseTo(55, 9)
    expect(s.palier).toBe('soupcon')                        // témoin : seuil sans hystérésis, MÉFIANCE sous 60
    avance(s, 1.1, vu)                                      // 51,7
    expect(s.palier).toBe('mefiance')
    avance(s, 9.8, vu)                                      // 22,3
    expect(s.palier).toBe('mefiance')                       // témoin : seuil sans hystérésis, CALME sous 30
    avance(s, 0.2, vu)                                      // 21,7
    expect(s.palier).toBe('calme')
  })

  it('un seuil atteint au calcul l\'est aussi image par image : ni une image trop tard, ni une trop tôt', () => {
    const vu = { temoins: ['escorte'] }, fixe = { ...vu, sources: [FIXE_ESCORTE] }
    const monte = createSoupcon()
    avance(monte, 6, fixe)                                  // 10 par seconde : 60 au calcul, 59,99999999999969 en images
    expect(monte.palier).toBe('soupcon')                    // témoin : comparaison stricte, il reste en MÉFIANCE
    const descend = createSoupcon()
    avance(descend, 3, fixe)                                // 30
    avance(descend, 8 / 3, vu)                              // 3 par seconde : 22 au calcul, 21,99999999999996 en images
    expect(descend.palier).toBe('mefiance')                 // témoin : comparaison stricte, CALME une image trop tôt
    avance(descend, DT, vu)
    expect(descend.palier).toBe('calme')
  })

  it('un changement de palier est émis une seule fois, avec sa première fois', () => {
    const s = createSoupcon()
    const fixe = { sources: [FIXE_ESCORTE], temoins: ['escorte'] }, vu = { temoins: ['escorte'] }
    const paliers = emis => emis.filter(e => e.type === 'palier')
    expect(paliers(avance(s, 4, fixe)))                     // témoin : émis à chaque image au-dessus de 30
      .toEqual([{ type: 'palier', de: 'calme', vers: 'mefiance', premiere: true }])
    expect(paliers(avance(s, 10, vu))).toEqual([{ type: 'palier', de: 'mefiance', vers: 'calme', premiere: false }])
    expect(paliers(avance(s, 4, fixe)))                     // témoin : première fois toujours vraie
      .toEqual([{ type: 'palier', de: 'calme', vers: 'mefiance', premiere: false }])
    expect(s.paliersAtteints).toEqual({ mefiance: true, soupcon: false })
  })

  it('DÉMASQUÉ est émis une seule fois, et la jauge s\'arrête là', () => {
    const s = createSoupcon()
    const emis = [...s.evenement('choix', 95)]
    emis.push(...avance(s, 2, { sources: [FIXE_ESCORTE], temoins: ['escorte'] }))   // 100 au bout d'une demi-seconde
    emis.push(...s.evenement('remarque', 'escorte'), ...avance(s, 5, { temoins: [] }))
    expect(emis.filter(e => e.type === 'demasque')).toHaveLength(1)   // témoin : émis à chaque image passée à 100
    expect([s.S, s.palier, s.max]).toEqual([100, 'demasque', 100])    // témoin : la jauge redescend ensuite
  })

  it('un choix qui démasque (Sorel, S2.3) démasque d\'un coup, depuis le calme', () => {
    const s = createSoupcon()
    expect(s.evenement('demasque')).toEqual([
      { type: 'palier', de: 'calme', vers: 'demasque', premiere: true },
      { type: 'demasque' },
    ])
    expect([s.S, s.palier]).toEqual([100, 'demasque'])
    expect(s.paliersAtteints).toEqual({ mefiance: true, soupcon: true })   // témoin : paliers franchis d'un coup oubliés
  })
})

describe('l\'exemple de la spec (§3.6)', () => {
  it('Sorel fixé 3 s à 2 m : 30 et plancher 10 ; les yeux ailleurs, sous 22 en 2,7 s, puis au plancher', () => {
    const s = createSoupcon()
    expect([s.S, s.plancher, s.palier, s.max]).toEqual([0, 0, 'calme', 0])
    expect(s.paliersAtteints).toEqual({ mefiance: false, soupcon: false })
    const vuParSorel = { temoins: ['escorte'] }             // à 2 m, Sorel voit Viktor (la distance compte au regard, B3)
    avance(s, 1.2, vuParSorel)                              // sous la tolérance de l'escorte : rien ne monte
    expect(s.S).toBe(0)
    s.evenement('remarque', 'escorte')                      // à 1,2 s, Sorel le remarque
    expect([s.S, s.plancher]).toEqual([12, 10])
    avance(s, 1.8, { ...vuParSorel, sources: [FIXE_ESCORTE] })
    expect(s.S).toBeCloseTo(30, 9)
    expect([s.plancher, s.palier]).toEqual([10, 'mefiance'])
    let t = 0                                               // les yeux ailleurs ; Sorel, alerté, le suit du regard
    while (s.palier !== 'calme' && t < 10) { s.update(DT, vuParSorel); t += DT }
    expect(t).toBeGreaterThan(2.6)                          // témoin : baisse de 5 par seconde sous le regard, 1,6 s
    expect(t).toBeLessThan(2.8)
    expect(s.S).toBeLessThan(22)
    avance(s, 10, vuParSorel)
    expect(s.S).toBe(10)                                    // puis il descend au plancher
    expect(s.max).toBeCloseTo(30, 9)                        // témoin : le maximum suit S, 10
    expect(s.paliersAtteints).toEqual({ mefiance: true, soupcon: false })
  })
})

describe('les événements', () => {
  it('chaque événement monte S et le plancher des valeurs de la spec', () => {
    const cas = [                                           // [événement, hausse de S, hausse du plancher]
      [['remarque', 'escorte'], 12, 10],
      [['remarque', 'civil'], 6, 3],
      [['remarque', 'fernand'], 4, 2],
      [['surprisZoneInterdite'], 25, 10],
      [['presenceTables'], 10, 5],
      [['sansCommande'], 10, 0],
      [['silence'], 8, 0],
      [['silenceSorel'], 10, 0],
      [['flechettes'], 15, 0],
      [['choix', 30], 30, 0],
      [['choix', -15], -15, 0],
    ]
    for (const [evenement, ds, dp] of cas) {
      const s = createSoupcon()
      s.evenement('choix', 20)                              // mise en place : S à 20, plancher à 0
      s.evenement(...evenement)
      expect([s.S - 20, s.plancher], evenement.join(' ')).toEqual([ds, dp])   // témoin : événements sans plancher
    }
  })

  it('un nom inconnu est refusé, jamais ignoré en silence', () => {
    const s = createSoupcon()
    const vu = { temoins: ['escorte'] }
    expect(() => s.update(DT, { ...vu, sources: ['tropLoin'] })).toThrow(/tropLoin/)   // témoin : source ignorée
    expect(() => s.update(DT, { ...vu, pose: 'pose', sources: ['tropLoin'] }))   // témoin : écartée avant d'être lue
      .toThrow(/tropLoin/)
    expect(() => createSoupcon({ ...SOUPCON, deboutSeulement: ['tropPrès'] }))   // témoin : liste lue sans contrôle
      .toThrow(/tropPrès/)
    expect(() => s.update(DT, { ...vu, sources: [{ nom: 'fixation' }] })).toThrow(/témoin/)
    expect(() => s.update(DT, { temoins: ['barman'] })).toThrow(/barman/)
    expect(() => s.update(DT, { ...vu, pose: 'couche' })).toThrow(/couche/)
    expect(() => s.evenement('regard')).toThrow(/regard/)
    expect(() => s.evenement('toString')).toThrow(/toString/)   // témoin : nom hérité des objets pris pour un réglage
    expect(() => s.update(DT, { temoins: ['constructor'] })).toThrow(/constructor/)
    expect(() => s.evenement('remarque', 'albert')).toThrow(/albert/)   // Albert ne remarque jamais rien
    expect(() => s.evenement('choix')).toThrow(/choix/)
    expect([s.S, s.plancher, s.palier]).toEqual([0, 0, 'calme'])
  })

  it('un pas de temps invalide ne change rien', () => {
    const s = createSoupcon()
    s.evenement('choix', 40)
    for (const dt of [NaN, undefined, -1, 0, Infinity]) {
      expect(s.update(dt, { sources: [FIXE_ESCORTE], temoins: ['escorte'] })).toEqual([])
      expect(s.update(dt, { temoins: [] })).toEqual([])
    }
    expect(s.S).toBe(40)                                    // témoin : pas de temps lu tel quel, S illisible (NaN)
  })
})

describe('les réglages passés', () => {
  it('la jauge lit ses valeurs dans les réglages qu\'on lui passe', () => {
    const r = structuredClone(SOUPCON)
    Object.assign(r, { plancherMax: 5, baisseHorsDeVue: 7 })
    r.temoins.civil = 1
    r.montees.tropPres = 2
    r.baisses.debout = 1
    r.evenements.silence = { s: 31, plancher: 7 }
    r.paliers.mefiance = { monte: 31, redescend: 30 }
    r.deboutSeulement = ['zoneInterdite']
    const s = createSoupcon(r)
    s.evenement('silence')
    expect([s.S, s.plancher, s.palier]).toEqual([31, 5, 'mefiance'])   // témoin : valeurs de reglages.js en dur, 8, 0, CALME
    avance(s, 1, { sources: ['tropPres'], temoins: ['civil'] })        // 2 × 1
    expect(s.S).toBeCloseTo(33, 9)
    avance(s, 3.5, { temoins: ['civil'] })                             // 1 par seconde
    expect(s.S).toBeCloseTo(29.5, 9)
    expect(s.palier).toBe('calme')
    avance(s, 1, { temoins: [] })                                      // 7 par seconde hors de vue
    expect(s.S).toBeCloseTo(22.5, 9)
    // assis : cette liste écarte la zone interdite, et « trop près » compte, 2 × 1
    avance(s, 1, { sources: ['zoneInterdite', 'tropPres'], temoins: ['civil'], pose: 'assis' })
    expect(s.S).toBeCloseTo(24.5, 9)                                   // témoin : liste écrite en dur dans la jauge, 34,5
  })
})
