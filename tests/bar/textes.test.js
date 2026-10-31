import { describe, it, expect } from 'vitest'
import {
  PERSONNES, RENSEIGNEMENTS, LEURRE, CARNET, ECHANGES, ALBERT, REGARDS, REACTIONS, OBJETS, CARTE, BILAN, DIALOGUES, bilan,
} from '../../src/bar/textes.js'
import { verifierArbre, FIN } from '../../src/bar/dialogue.js'
import { decouper } from '../../src/bar/ecoute.js'
import { FOYERS } from '../../src/bar/plan.js'
import { ECOUTE, SOUPCON, DIALOGUE } from '../../src/bar/reglages.js'

// Les textes du Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.3, §3.5, §3.9 à §3.11 et §3.14 ; plan
// docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B5) : des tests de données. Chaque test a été vu rouge sur le
// témoin écrit à côté de son assertion, glissé seul dans les données finies (ou dans src/bar/ecoute.js pour la
// ponctuation), puis vert. Les dialogues eux-mêmes se jouent dans tests/bar/dialogue.test.js.

const QUATRE = ['trajet', 'vehicule', 'place', 'heure']
const PORTES = [...QUATRE, 'leurre']                 // ce qu'une réplique écoutée peut apprendre (leurre : un drapeau)
const APPRIS = [...PORTES, 'allie']                  // ce qu'un dialogue peut apprendre (§3.3 : allié, par Fernand)
const repliques = () => ECHANGES.flatMap(e => e.repliques.map((r, i) => ({ e, r, ou: `${e.id}[${i}]` })))
// toutes les issues d'un arbre : ses choix, ses silences et ses nœuds sans choix, avec leurs effets
const issues = arbre => Object.entries(arbre.noeuds).flatMap(([id, n]) => [
  ...(n.choix || []).map((c, k) => ({ ou: `${arbre.id}.${id}.${k + 1}`, effets: c.effets, reponse: c.reponse })),
  ...(n.silence ? [{ ou: `${arbre.id}.${id}.silence`, effets: n.silence.effets, reponse: n.silence.reponse }] : []),
  ...(n.dit !== undefined && !n.choix ? [{ ou: `${arbre.id}.${id}`, effets: n.effets }] : []),
])

describe('les échanges de la soirée (§3.9, §3.14)', () => {
  it('les échanges du socle et les bonus, à leur foyer et à leur heure', () => {
    const table = Object.fromEntries(ECHANGES.map(e => [e.id, [e.foyer, e.t, e.bonus]]))
    expect(table).toEqual({                               // témoin : B2 sans bonus ; C2 oublié
      A3: ['A', 21, true], B3: ['B', 42, true], A1: ['A', 63, false], B1: ['B', 95, false], A4: ['A', 126, false],
      A2a: ['A', 147, false], B2: ['B', 168, true], C2: ['zinc', 189, true], entreeSorel: ['zinc', 210, false],
      A2b: ['A', 231, true], appel: ['combine', 273, false], R1: ['A', 357, false], R2: ['B', 357, false],
      R3: ['porte', 389, false], fin: ['albert', 420, false], ouvriers: ['ouvriers', null, true],
    })
    for (const e of ECHANGES) expect(Object.keys(FOYERS), e.id).toContain(e.foyer)
  })

  it('chaque réplique dit qui parle, d\'où et à quelle voix, sans clé inconnue ; Viktor ne s\'écoute pas', () => {
    const CLES = ['qui', 'texte', 'didascalie', 'didascalieApres', 'voix', 'foyer', 'renseignement', 'motsCles', 'drapeau']
    for (const { r, ou } of repliques()) {
      for (const cle of Object.keys(r)) expect(CLES, `${ou} : ${cle}`).toContain(cle)   // témoin : « motCles »
      expect(Object.keys(PERSONNES), ou).toContain(r.qui)
      expect(r.qui, ou).not.toBe('viktor')               // ses pensées sont à part (pensee), jamais masquées
      expect(typeof r.texte === 'string' && r.texte.trim().length > 0, ou).toBe(true)
      if (r.voix !== undefined) expect(Object.keys(ECOUTE.voix), ou).toContain(r.voix)   // témoin : voix « basse »
      if (r.foyer !== undefined) expect(Object.keys(FOYERS), ou).toContain(r.foyer)
      for (const cle of ['didascalie', 'didascalieApres']) {
        if (r[cle] !== undefined) expect(typeof r[cle] === 'string' && r[cle].length > 0, `${ou} : ${cle}`).toBe(true)
      }
    }
    for (const e of ECHANGES.filter(x => x.pensee !== undefined)) expect(e.pensee.length, e.id).toBeGreaterThan(0)
    expect(ECHANGES.find(e => e.id === 'B3').pensee).toBe('Ils parlent de moi.')
    expect(ECHANGES.find(e => e.id === 'fin').pensee).toBe('Il faut y aller.')
  })

  it('chaque mot-clé est dans sa réplique, et une réplique qui apprend quelque chose en a', () => {
    let portees = 0
    for (const { r, ou } of repliques()) {
      expect(() => decouper(r), ou).not.toThrow()          // témoin : « vielle route » dans A1
      expect(r.renseignement === undefined, ou).toBe(r.motsCles === undefined)
      if (r.renseignement === undefined) continue
      portees++
      expect(PORTES, ou).toContain(r.renseignement)
      expect(decouper(r).some(m => m.cle), ou).toBe(true)
    }
    expect(portees).toBe(15)                              // témoin : la place du colonel oubliée (14)
  })

  it('au moins deux sources du socle par renseignement, dont une à épier (§3.3)', () => {
    const sources = Object.fromEntries(PORTES.map(n => [n, new Set()]))
    for (const { e, r } of repliques()) if (r.renseignement && !e.bonus) sources[r.renseignement].add(`épier ${e.id}`)
    for (const arbre of Object.values(DIALOGUES)) {
      for (const { effets } of issues(arbre)) for (const n of effets?.apprend || []) if (sources[n]) sources[n].add(`dialogue ${arbre.id}`)
    }
    const vues = Object.fromEntries(Object.entries(sources).map(([n, s]) => [n, [...s].sort()]))
    expect(vues).toEqual({                                // témoin : R2 sans le véhicule (B1 seul, A2b est un bonus)
      trajet: ['dialogue sorel', 'épier A1', 'épier appel'],
      vehicule: ['épier B1', 'épier R2'],
      place: ['épier A2a', 'épier R1', 'épier appel'],
      heure: ['dialogue fernand-photo', 'épier A4', 'épier R3', 'épier appel'],
      leurre: ['épier B1', 'épier R2'],
    })
    for (const [n, s] of Object.entries(vues)) {
      expect(s.length, n).toBeGreaterThanOrEqual(2)
      expect(s.some(x => x.startsWith('épier')), n).toBe(true)
    }
  })

  it('L\'APPEL : seules les trois répliques du colonel, dans le combiné, posent l\'appel ; PLACE ne s\'y entend que de lui', () => {
    const appel = ECHANGES.find(e => e.id === 'appel')
    const colonel = appel.repliques.filter(r => r.qui === 'colonel')
    expect(colonel).toHaveLength(3)
    for (const r of colonel) expect([r.voix, r.drapeau]).toEqual(['combine', 'appel'])   // témoin : un drapeau oublié
    expect(repliques().filter(({ r }) => r.drapeau !== undefined).map(({ r }) => r)).toEqual(colonel)
    expect(appel.repliques.filter(r => r.renseignement === 'place').map(r => r.qui)).toEqual(['colonel'])
    expect(appel.repliques.filter(r => r.qui === 'sorel').every(r => r.voix === undefined)).toBe(true)   // voix normale
  })

  it('la ponctuation ne fait jamais un mot à elle seule (spec §3.4, « Réglé en B5 »)', () => {
    // Choix de B5 : decouper (et la frappe) rattachent « ? », « ! », « … » à leur mot ; les textes gardent l'espace simple
    // du reste du jeu devant « ? » et « ! ». Aucune réplique écoutée n'a donc de mot sans lettre ni chiffre, qui se
    // masquerait seul (« Tu es sourd … »).
    const ecoutees = [...repliques().map(({ r, ou }) => ({ r, ou })),
      ...ALBERT.murmures.map((texte, i) => ({ r: { texte }, ou: `ALBERT.murmures[${i}]` }))]
    expect(ecoutees.filter(({ r }) => / [?!]/.test(r.texte)).length).toBeGreaterThan(10)   // le cas est bien là
    for (const { r, ou } of ecoutees) {
      for (const m of decouper(r)) expect(m.mot, ou).toMatch(/[\p{L}\p{N}]/u)   // témoin : decouper de B2, « ? » seul
    }
  })
})

describe('les dialogues (§3.8, §3.14)', () => {
  it('D1 en deux temps, D2, D3 en deux temps ; chaque suite existe, chaque nœud est atteignable', () => {
    expect(Object.keys(DIALOGUES).sort()).toEqual(['fernand', 'fernand-photo', 'lise-commande', 'lise-regard', 'sorel'])
    for (const [id, arbre] of Object.entries(DIALOGUES)) {
      expect(arbre.id).toBe(id)
      expect(() => verifierArbre(arbre), id).not.toThrow()   // témoins : une suite vers « s5 » ; un nœud orphelin
    }
  })

  it('qui parle et ce que les effets nomment existent ; les choix valent de −15 à +30 (§3.6)', () => {
    const personnes = Object.keys(PERSONNES)
    for (const arbre of Object.values(DIALOGUES)) {
      expect(personnes, arbre.id).toContain(arbre.interlocuteur)
      for (const [id, n] of Object.entries(arbre.noeuds)) if (n.qui !== undefined) expect(personnes, `${arbre.id}.${id}`).toContain(n.qui)
      for (const { ou, effets = {}, reponse } of issues(arbre)) {
        if (reponse && typeof reponse === 'object' && reponse.qui !== undefined) expect(personnes, ou).toContain(reponse.qui)
        if (effets.ouvre !== undefined) expect(Object.keys(DIALOGUES), ou).toContain(effets.ouvre)   // témoin : « fernand-photos »
        for (const n of effets.apprend || []) expect(APPRIS, ou).toContain(n)
        if (effets.evenement !== undefined) expect(Object.keys(SOUPCON.evenements), ou).toContain(effets.evenement)
        if (effets.muet !== undefined) expect(personnes, ou).toContain(effets.muet)
        if (effets.soupcon !== undefined) {
          expect(effets.soupcon, ou).toBeGreaterThanOrEqual(-15)   // témoin : +35
          expect(effets.soupcon, ou).toBeLessThanOrEqual(30)
        }
      }
    }
    for (const [qui, liste] of Object.entries(REGARDS)) {
      for (const r of liste) if (r.lance !== undefined) expect(Object.keys(DIALOGUES), qui).toContain(r.lance)
    }
  })

  it('à chaque question, 2 ou 3 choix montrés, avec ou sans la couverture du routier', () => {
    for (const arbre of Object.values(DIALOGUES)) {
      for (const [id, n] of Object.entries(arbre.noeuds)) {
        if (!n.choix) continue
        for (const c of n.choix) for (const cle of Object.keys(c.si || {})) expect(cle, `${arbre.id}.${id}`).toBe('couverture')
        for (const couverture of [null, 'routier']) {
          const montres = n.choix.filter(c => !c.si || c.si.couverture === couverture).length
          expect(montres, `${arbre.id}.${id}, couverture ${couverture}`).toBeGreaterThanOrEqual(2)   // témoin : « Ça dépend de vous. » réservé au routier
          expect(montres, `${arbre.id}.${id}, couverture ${couverture}`).toBeLessThanOrEqual(3)
        }
      }
    }
  })

  it('6 s pour répondre à Sorel, 10 s aux autres (décision 7, G4) ; sa question revient une fois au silence', () => {
    expect(DIALOGUES.sorel.minuterieS).toBe(DIALOGUE.minuterieSorelS)   // témoin : Sorel sans minuterie, 10 s
    for (const id of ['fernand', 'fernand-photo', 'lise-commande', 'lise-regard']) expect(DIALOGUES[id].minuterieS, id).toBe(undefined)
    for (const arbre of Object.values(DIALOGUES)) {
      for (const [id, n] of Object.entries(arbre.noeuds)) {
        if (!n.silence) continue
        const sorel = arbre.id === 'sorel'
        expect(n.silence.revient === true, `${arbre.id}.${id}`).toBe(sorel)   // témoin : S1 sans revient
        expect(n.silence.effets.evenement, `${arbre.id}.${id}`).toBe(sorel ? 'silenceSorel' : 'silence')
        expect(n.silence.reponse, `${arbre.id}.${id}`).toBe(sorel ? 'Vous réfléchissez beaucoup.' : undefined)
      }
    }
  })
})

describe('les répliques du regard (§3.5)', () => {
  it('trois par homme de l\'escorte, deux pour Lise, une pour Fernand, aucune pour Albert ; Sorel lance D2', () => {
    expect(Object.fromEntries(Object.entries(REGARDS).map(([qui, l]) => [qui, l.length]))).toEqual({
      dussart: 3, lenoir: 3, mattei: 3, haas: 3, sorel: 3, lise: 2, fernand: 1,   // témoin : une réplique de Lise en trop
    })
    for (const [qui, liste] of Object.entries(REGARDS)) {
      for (const r of liste) expect(r.texte.length > 0 || r.didascalie?.length > 0, qui).toBe(true)
    }
    expect(REGARDS.haas.map(r => r.texte)).toEqual(['', '', ''])   // Haas ne dit rien : des gestes
    expect(REGARDS.sorel[2]).toEqual({ texte: 'Restez assis.', lance: 'sorel' })
    expect(REGARDS.lise.map(r => r.texte)).toEqual(['Autre chose ?', 'Je ne suis pas au menu.'])
  })
})

describe('le carnet et le bilan (§3.3, §3.11)', () => {
  it('le carnet : quatre renseignements, la ligne du leurre ; Viktor pense chacun', () => {
    expect(Object.keys(RENSEIGNEMENTS)).toEqual(QUATRE)
    expect(Object.values(RENSEIGNEMENTS).map(r => `${r.libelle} · ${r.valeur}`)).toEqual([
      'TRAJET · LA VIEILLE ROUTE', 'VÉHICULE · LE 2e SUR 3', 'PLACE · DEVANT, CÔTÉ PASSAGER', 'HEURE · DÉPART 19:15'])
    expect(Object.values(RENSEIGNEMENTS).map(r => r.pensee)).toEqual([
      'La vieille route.', 'La deuxième voiture.', 'Devant. Côté passager.', 'Sept heures et quart.'])
    expect(LEURRE).toEqual({ carnet: 'CASQUETTE AU 3e : LEURRE', pensee: 'La casquette, c\'est pour un autre.' })
    expect(CARNET).toEqual({ titre: 'CE QU\'IL ME FAUT', tampon: 'NOTÉ' })
  })

  it('quatre lignes dans l\'ordre du carnet : la valeur si elle est apprise, « INCONNU » sinon', () => {
    const b = bilan({ trajet: true, heure: true, vehicule: 'true', leurre: true })
    expect(b.titre).toBe('DOSSIER 05')
    expect(b.lignes).toEqual([
      { cle: 'trajet', libelle: 'TRAJET', valeur: 'LA VIEILLE ROUTE', appris: true },
      { cle: 'vehicule', libelle: 'VÉHICULE', valeur: 'INCONNU', appris: false },   // témoin : « true » compté vrai
      { cle: 'place', libelle: 'PLACE', valeur: 'INCONNU', appris: false },
      { cle: 'heure', libelle: 'HEURE', valeur: 'DÉPART 19:15', appris: true },
    ])
    expect(b.appris).toBe(2)
    expect(b.telephone).toEqual({ de: 'ANTON', message: 'Alors ?' })
    expect(bilan().lignes.map(l => l.valeur)).toEqual(['INCONNU', 'INCONNU', 'INCONNU', 'INCONNU'])
  })

  it('au téléphone, Viktor : 4 « J\'ai tout. » ; 2 ou 3 « Il faudra faire avec. » ; 0 ou 1 « Presque rien. »', () => {
    const avec = n => Object.fromEntries(QUATRE.slice(0, n).map(c => [c, true]))
    const dit = [0, 1, 2, 3, 4].map(n => bilan(avec(n)).viktor)
    expect(dit).toEqual(['Presque rien.', 'Presque rien.', 'Il faudra faire avec.', 'Il faudra faire avec.', 'J\'ai tout.'])   // témoin : seuil à 1
    // les drapeaux ne sont pas des renseignements (témoin : tout ce qui est vrai compté, 4 et « J'ai tout. »)
    expect(bilan({ ...avec(2), leurre: true, appel: true, allie: true })).toMatchObject({ appris: 2, viktor: 'Il faudra faire avec.' })
    expect(BILAN.viktor).toEqual({ tout: 'J\'ai tout.', partiel: 'Il faudra faire avec.', rien: 'Presque rien.' })
  })
})

describe('les autres textes du bar', () => {
  it('la carte de départ, Albert, les objets et les réactions : les textes de la spec (§3.5, §3.6, §3.9, §3.10, §3.14)', () => {
    expect(CARTE).toEqual({
      lieu: 'LE BIVOUAC · 18:10',
      texte: 'Ils partent ce soir. Ce qu\'il me faut : la route, la voiture, sa place, l\'heure.',
      consigne: 'Écouter sans regarder.',
      commencer: 'CLIQUER POUR COMMENCER',
      partir: 'PARTIR SANS ENTRER',
    })
    expect(ALBERT).toEqual({
      murmures: ['Allez, le 7. Allez…', 'Regardez-moi cette carne.'],
      parle: 'Le 7. Il ne gagne jamais. C\'est pour ça que je le joue.',
    })
    expect(Object.fromEntries(Object.entries(OBJETS).map(([id, o]) => [id, [o.pensee, o.bonus === true]]))).toEqual({
      photo: ['Vingt-quatre. Pas de colonel.', false],
      entree: ['Le fusil est resté sur la moto. Ici, je ne suis personne.', false],
      journal: ['Ils parlent de moi.', true],
      fenetre: ['Le château d\'eau. J\'étais là-haut.', true],
    })
    expect(OBJETS.journal.une).toBe('TROIS OFFICIERS ABATTUS À LA BASE · LE TIREUR AURAIT TIRÉ À PLUS DE 400 MÈTRES')
    for (const [id, r] of Object.entries(REACTIONS)) {
      expect(Object.keys(PERSONNES), id).toContain(r.qui)
      expect(r.texte.length, id).toBeGreaterThan(0)
    }
    expect(REACTIONS.sansCommande).toEqual({ qui: 'lise', texte: 'Tu prends quelque chose ou tu attends le bus ?' })
    expect(REACTIONS.demasque).toEqual({ qui: 'sorel', quiAvantSorel: 'dussart', texte: 'Toi. Debout.', tampon: 'COUVERTURE GRILLÉE' })
    expect(REACTIONS.flechettes).toEqual({ qui: 'mattei', texte: 'Trois dans le mille. Tu as fait l\'armée, toi ?', bonus: true })
  })

  const toutes = { PERSONNES, RENSEIGNEMENTS, LEURRE, CARNET, ECHANGES, ALBERT, REGARDS, REACTIONS, OBJETS, CARTE, BILAN, DIALOGUES }

  it('aucun tiret cadratin dans les textes (couvert aussi par tests/texts.test.js)', () => {
    const avecTiret = []
    const visiter = (v, ou) => {
      if (typeof v === 'string') { if (v.includes('—')) avecTiret.push(ou); return }
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visiter(x, `${ou}.${k}`)
    }
    for (const [nom, v] of Object.entries(toutes)) visiter(v, nom)
    expect(avecTiret).toEqual([])                         // témoin : un tiret cadratin dans « Bonsoir. »
  })

  it('toutes les données sont figées, jusqu\'au fond : la coquille du bar ne peut pas les changer d\'une partie à l\'autre', () => {
    const nonFiges = []
    const visiter = (v, ou) => {
      if (!v || typeof v !== 'object') return
      if (!Object.isFrozen(v)) nonFiges.push(ou)
      for (const [k, x] of Object.entries(v)) visiter(x, `${ou}.${k}`)
    }
    for (const [nom, v] of Object.entries(toutes)) visiter(v, nom)
    expect(nonFiges).toEqual([])                          // témoin : Object.freeze en surface seulement
    expect(DIALOGUES.sorel.noeuds.s2.choix[2].effets).toEqual({ demasque: true })
    expect(FIN).toBe('fin')
  })
})
