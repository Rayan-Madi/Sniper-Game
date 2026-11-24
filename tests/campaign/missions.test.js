import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parseSync } from 'vite'

// Données de mission et ancres des cartes (spec du lot 3, §2 a, approche B ; plan du lot 3a, tâche A2). Chaque mission
// est décrite dans un module pur, src/campaign/missions/m1.js à m6.js (poste, zone, zoom, profil de caméra, casting,
// allure, marqueurs, fiche, fuite, sorties, abris, fenêtres, radio, fin ; le choix moral de M3, le convoi de M5),
// rempli avec les valeurs du jeu d'aujourd'hui. Sa carte (src/maps/) ne dit plus que son décor : son sol, son écho, sa
// pluie et ses ancres nommées (oeil, regard, zone, sorties, abris, places, cadenas, route). La mission cite les ancres
// de sa carte par leur nom : chaque ancre citée existe dans sa carte, de la bonne sorte.
//
// Témoin : avec les données de mission et les cartes d'avant la tâche (commit 71edf6a), qui ne rendent aucune ancre mais
// leurs champs épars (cameraPos, cameraTarget, spawnBounds, hiddenTarget, moralLock, convoy, sideExit, party,
// indoors), le contrat des ancres et la garde des cartes sont rouges pour les six missions (vus rouges). Les autres
// témoins sont plus bas, par mutation des données.

vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})

const { scene } = await import('../../src/scene.js')
const { MAP_BUILDERS, clearMap } = await import('../../src/maps/index.js')
const { withSeed } = await import('../../src/gfx/memtest.js')
const { MAX_LEVEL } = await import('../../src/campaign/progress.js')
const { MISSIONS, EVENEMENTS, missionFor, ancresCitees, resoudreAncres, nombreDeCivils } = await import('../../src/campaign/missions/index.js')
const { CONDITIONS_DE_FIN } = await import('../../src/campaign/phase.js')

const ROOT = resolve(__dirname, '../..')
const DOSSIER = join(ROOT, 'src', 'campaign', 'missions')

// La carte de chaque mission, construite une fois (hasard à graine) sur une brume témoin, avec la brume et le ciel
// (fond) qu'elle laisse : depuis la tâche A3, la brume est celle du profil de sa mission, posée au montage (mountLevel),
// et la carte n'y touche plus.
const BRUME_TEMOIN = { temoin: 'la brume d\'avant la carte' }
const cartes = MAP_BUILDERS.map((build, i) => {
  scene.fog = BRUME_TEMOIN
  const info = withSeed(1000 + i, build)
  return { info, brume: scene.fog, fond: scene.background }
})
clearMap()
scene.fog = null

// Forme de chaque sorte d'ancre (voir l'en-tête de src/campaign/missions/index.js), relue ici sans le module. La garde
// « la copie des formes connaît chaque sorte que cite le module », plus bas, vérifie qu'elle n'en oublie aucune.
const fini = v => typeof v === 'number' && Number.isFinite(v)
const FORMES = {
  point: a => Array.isArray(a) && a.length === 3 && a.every(fini),
  zone: a => !!a && ['minX', 'maxX', 'minZ', 'maxZ'].every(k => fini(a[k])) && a.minX < a.maxX && a.minZ < a.maxZ,
  place: a => !!a && fini(a.x) && fini(a.z) && (a.assise === undefined || fini(a.assise)) &&
    (a.debout === undefined || (Array.isArray(a.debout) && a.debout.length === 2 && a.debout.every(fini))),
  sortie: a => !!a && fini(a.x) && fini(a.z),
  abri: a => !!a && fini(a.x) && fini(a.z),
  route: a => !!a && fini(a.z) && fini(a.depart) && (a.sens === 1 || a.sens === -1),
}
const GROUPES = { sorties: 'sortie', abris: 'abri', places: 'place' }
const AVEC_ARTICLE = { point: 'un point', zone: 'une zone', place: 'une place', sortie: 'une sortie', abri: 'un abri', route: 'une route' }

// Source d'index.js, en fins de ligne LF comme le dépôt le stocke (sous Windows, core.autocrlf peut l'extraire en CRLF).
const SOURCE_INDEX = readFileSync(join(DOSSIER, 'index.js'), 'utf8').replace(/\r\n/g, '\n')

// Les citations que range ancresCitees, lues dans son source : { sorte, groupe } pour chaque objet qui porte une sorte
// (groupe undefined : une ancre à la racine de la carte). Une sorte ou un groupe qui n'est pas un texte écrit en toutes
// lettres vaut null, pour que rien n'échappe à la lecture.
function citationsDuSource(source) {
  const { program, errors } = parseSync('index.js', source)
  if (errors.length) throw new Error(`index.js : analyse impossible (${errors[0].message})`)
  const fn = program.body.map(n => (n.type === 'ExportNamedDeclaration' ? n.declaration : n))
    .find(n => n && n.type === 'FunctionDeclaration' && n.id.name === 'ancresCitees')
  if (!fn) throw new Error('index.js : ancresCitees introuvable')
  const texte = v => (v.type === 'Literal' && typeof v.value === 'string' ? v.value : null)
  const out = []
  const walk = n => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    if (n.type === 'ObjectExpression') {
      const p = new Map(n.properties.filter(x => x.type === 'Property' && !x.computed).map(x => [x.key.name ?? x.key.value, x.value]))
      if (p.has('sorte')) out.push({ sorte: texte(p.get('sorte')), groupe: p.has('groupe') ? texte(p.get('groupe')) : undefined })
    }
    for (const k in n) if (k !== 'parent') walk(n[k])
  }
  walk(fn.body)
  return out
}

// Ce que la copie ci-dessus ignore de ces citations : une sorte sans forme (FORMES) ou sans article (AVEC_ARTICLE), un
// groupe absent de GROUPES ou rangé ici sous une autre sorte.
function inconnuesDeLaCopie(citations) {
  const out = new Set()
  for (const { sorte, groupe } of citations) {
    if (sorte === null) { out.add('une sorte qui n\'est pas écrite en toutes lettres'); continue }
    if (!Object.hasOwn(FORMES, sorte)) out.add(`sorte ${sorte} : pas de forme ici (FORMES)`)
    if (!Object.hasOwn(AVEC_ARTICLE, sorte)) out.add(`sorte ${sorte} : pas d'article ici (AVEC_ARTICLE)`)
    if (groupe === null) out.add('un groupe qui n\'est pas écrit en toutes lettres')
    else if (groupe !== undefined && GROUPES[groupe] !== sorte) {
      out.add(`groupe ${groupe} : ${Object.hasOwn(GROUPES, groupe) ? `sorte ${GROUPES[groupe]} ici` : 'absent ici (GROUPES)'}, ${sorte} dans ancresCitees`)
    }
  }
  return [...out]
}

describe('six missions, dans l\'ordre de la campagne', () => {
  it('une par mission de la campagne et par carte, numérotées de 1 à 6', () => {
    expect(MISSIONS).toHaveLength(MAX_LEVEL)
    expect(MAP_BUILDERS).toHaveLength(MAX_LEVEL)
    expect(MISSIONS.map(m => m.numero)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('missionFor(n) : la mission n, celle de la carte MAP_BUILDERS[n - 1]', () => {
    for (let n = 1; n <= 6; n++) expect(missionFor(n)).toBe(MISSIONS[n - 1])
  })

  // Au-delà de 6, où seule une sauvegarde corrompue mène (recordClear plafonne à MAX_LEVEL, raccourcis de 1 à 6),
  // mountLevel prend la carte MAP_BUILDERS[(n - 1) % 6] : la mission suit sa carte. getLevel (src/levels.js, avant la
  // tâche A2) bornait à la dernière, d'où la carte 1 avec les données de M6 (relecture de A2).
  it('missionFor(n) au-delà de 6 : la mission de sa carte, MAP_BUILDERS[(n - 1) % 6], pas la dernière', () => {
    for (let n = 7; n <= 12; n++) expect(missionFor(n), `n = ${n}`).toBe(MISSIONS[(n - 1) % MISSIONS.length])
  })

  it('modules purs : les fichiers de mission n\'importent rien, index.js n\'importe qu\'eux (ni three ni DOM)', () => {
    const fichiers = readdirSync(DOSSIER).filter(f => f.endsWith('.js')).sort()
    expect(fichiers).toEqual(['index.js', 'm1.js', 'm2.js', 'm3.js', 'm4.js', 'm5.js', 'm6.js'])
    for (const f of fichiers) {
      const src = readFileSync(join(DOSSIER, f), 'utf8')
      const { program, errors } = parseSync(f, src)
      expect(errors, f).toEqual([])
      const sources = program.body.filter(n => n.source && typeof n.source.value === 'string').map(n => n.source.value)
      expect(sources, f).toEqual(f === 'index.js' ? ['./m1.js', './m2.js', './m3.js', './m4.js', './m5.js', './m6.js'] : [])
      expect(src, `${f} : import dynamique`).not.toMatch(/\bimport\s*\(/)
    }
  })
})

// Ce qui manque à une mission, ou n'a pas la forme attendue (champs décrits en tête de src/campaign/missions/index.js).
function defautsDeForme(m) {
  const out = []
  const exige = (ok, quoi) => { if (!ok) out.push(quoi) }
  const nom = v => typeof v === 'string' && v.length > 0
  exige(Number.isInteger(m.numero), 'numero')
  exige(nom(m.nom), 'nom')
  exige(Number.isInteger(m.points) && m.points > 0, 'points')
  exige(!!m.poste && nom(m.poste.oeil) && (m.poste.regard === null || nom(m.poste.regard)), 'poste')
  exige(nom(m.zone), 'zone')
  // Zoom : départ entre les bornes de la molette, et jamais sous ×1 (60 / zoom au-delà de 60° : plus large que sans
  // lunette ; à ×0, aucun champ de vision)
  const z = m.zoom || {}
  exige([z.depart, z.min, z.max].every(fini) && z.min >= 1 && z.min <= z.depart && z.depart <= z.max, 'zoom')
  const p = m.profil || {}, b = p.brume || {}
  exige(fini(p.near) && fini(p.far) && p.near > 0 && p.near < p.far, 'profil.near, profil.far')
  exige(fini(b.couleur) && (b.type === 'lin' ? fini(b.debut) && fini(b.fin) && b.debut < b.fin
    : b.type === 'exp2' && fini(b.densite) && b.densite > 0), 'profil.brume')
  exige(!!p.soleil && FORMES.point(p.soleil.pos) && FORMES.point(p.soleil.cible), 'profil.soleil')
  exige(fini(p.cadreOmbre) && p.cadreOmbre > 0, 'profil.cadreOmbre')
  // Casting (tâche A6) : chaque cible a son modèle et le sexe de son personnage de secours ; une teinte, celle du modèle
  // entier ou de certains maillages, est facultative ; les gardes, un nombre et peut-être un modèle ; les civils, un
  // nombre et peut-être des modèles exclus. Les modèles cités existent : tests/campaign/casting.test.js.
  const c = m.casting || {}
  const teinte = v => v === undefined || fini(v)
  const parMaillage = v => v === undefined || (!!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0 &&
    Object.entries(v).every(([k, t]) => nom(k) && fini(t)))
  exige(Array.isArray(c.cibles) && c.cibles.length > 0 && c.cibles.every(x => !!x && typeof x === 'object' &&
    nom(x.modele) && typeof x.femme === 'boolean' && teinte(x.teinte) && parMaillage(x.teinteMaillage) &&
    (x.place === undefined || nom(x.place)) && (x.routine === undefined || x.routine === 'telephone')), 'casting.cibles')
  const g = c.gardes || {}
  exige(Number.isInteger(g.nombre) && g.nombre >= 0 && (g.modele === undefined || nom(g.modele)) && teinte(g.teinte), 'casting.gardes')
  const civ = c.civils || {}, n = civ.nombre
  exige((Number.isInteger(n) ? n >= 0 : Array.isArray(n) && n.length === 2 && n.every(Number.isInteger) && n[0] >= 0 &&
    n[0] <= n[1]) && (civ.exclure === undefined || (Array.isArray(civ.exclure) && civ.exclure.every(nom))), 'casting.civils')
  const a = m.allure || {}
  exige(fini(a.cibles) && fini(a.gardes) && typeof a.imprevisibles === 'boolean', 'allure')
  exige(typeof m.marqueurs === 'boolean', 'marqueurs')
  // Fiche du HUD (tâche A7) : un ordre de tir ou non, une entrée par cible ; le détail est dans tests/campaign/fiche.test.js
  exige(!!m.fiche && typeof m.fiche.ordre === 'boolean' && Array.isArray(m.fiche.entrees) && m.fiche.entrees.length > 0, 'fiche')
  exige(['opposee', 'laterale'].includes(m.fuite), 'fuite')
  for (const k of ['sorties', 'abris']) exige(Array.isArray(m[k]) && m[k].every(nom), k)
  // Réaction, fuite, fenêtres, radio et fin (tâche A8 ; en-tête de src/campaign/missions/index.js)
  const issues = Array.isArray(m.sorties) && Array.isArray(m.abris) ? [...m.sorties, ...m.abris] : []
  const r = m.reaction
  // une réaction dans une mission à sorties ou abris, et là seulement (sans elles, alarm.js ne la lit pas)
  exige(issues.length === 0 ? r === null : !!r && fini(r.stupeurS) && r.stupeurS >= 0 && fini(r.rayonChuteM) && r.rayonChuteM >= 0,
    'reaction')
  exige(m.perteDeVueS === null || (fini(m.perteDeVueS) && m.perteDeVueS > 0), 'perteDeVueS')
  exige(m.fuiteMessages === undefined || (!!m.fuiteMessages && typeof m.fuiteMessages === 'object' &&
    Object.entries(m.fuiteMessages).every(([k, t]) => issues.includes(k) && nom(t))), 'fuiteMessages')
  const evenement = e => EVENEMENTS.includes(e)
  const echeance = e => !!e && Object.keys(e).length > 0 && (Object.keys(e).join() === 'echec' ? nom(e.echec)
    : Object.keys(e).sort().join() === 'fil,penalite' ? Number.isInteger(e.penalite) && e.penalite > 0 && nom(e.fil)
      : Object.keys(e).join() === 'evenement' && evenement(e.evenement))
  exige(Array.isArray(m.fenetres) && m.fenetres.every(f => !!f && nom(f.nom) && evenement(f.depart) && fini(f.dureeS) &&
    f.dureeS > 0 && echeance(f.echeance)) && new Set(m.fenetres.map(f => f.nom)).size === m.fenetres.length, 'fenetres')
  exige(Array.isArray(m.radio) && m.radio.every(l => !!l && evenement(l.evenement) && nom(l.texte) &&
    (l.apresS === undefined || (fini(l.apresS) && l.apresS >= 0)) && (l.fois === undefined || (Number.isInteger(l.fois) && l.fois >= 1))), 'radio')
  exige(!!m.fin && fini(m.fin.calmeS) && m.fin.calmeS >= 0 && (m.fin.tantQue === undefined || CONDITIONS_DE_FIN.includes(m.fin.tantQue)), 'fin')
  exige(fini(m.zero) && m.zero > 0, 'zero')
  if (m.choixMoral !== undefined) {
    const x = m.choixMoral || {}
    exige(nom(x.cadenas) && !!x.indice && fini(x.indice.apresS) && nom(x.indice.texte) && Number.isInteger(x.points) &&
      Number.isInteger(x.victimes), 'choixMoral')
  }
  if (m.convoi !== undefined) exige(!!m.convoi && nom(m.convoi.route) && fini(m.convoi.vitesse) && m.convoi.vitesse > 0, 'convoi')
  return out
}

describe('chaque mission a tous ses champs, de la forme attendue', () => {
  MISSIONS.forEach(m => {
    it(`M${m.numero} : ${m.nom}`, () => {
      expect(defautsDeForme(m)).toEqual([])
    })
  })

  it('témoins : une mission sans fin, au zoom de départ sous le minimum, ou au zoom minimum sous ×1, est relevée', () => {
    const { fin, ...sansFin } = MISSIONS[0]
    expect(fin).toBeDefined()
    expect(defautsDeForme(sansFin)).toEqual(['fin'])
    expect(defautsDeForme({ ...MISSIONS[2], zoom: { depart: 2, min: 3, max: 6 } })).toEqual(['zoom'])
    expect(defautsDeForme({ ...MISSIONS[2], zoom: { depart: 0.5, min: 0.5, max: 6 } })).toEqual(['zoom'])
    expect(defautsDeForme({ ...MISSIONS[5], casting: { ...MISSIONS[5].casting, cibles: [{ ...MISSIONS[5].casting.cibles[0], routine: 'danse' }] } }))
      .toEqual(['casting.cibles'])
  })

  // Témoins des règles (tâche A8) : chaque champ hors de sa forme est relevé, seul.
  const M = MISSIONS[1]
  it.each([
    ['une sortie sans réaction', { sorties: ['ruelle'] }, 'reaction'],
    ['une réaction sans sortie ni abri', { reaction: { stupeurS: 0.4, rayonChuteM: 15 } }, 'reaction'],
    ['une stupeur négative', { abris: ['igloo'], reaction: { stupeurS: -1, rayonChuteM: 15 } }, 'reaction'],
    ['une perte de vue nulle', { perteDeVueS: 0 }, 'perteDeVueS'],
    ['un message pour une issue que la mission n\'a pas', { sorties: ['ruelle'], reaction: { stupeurS: 0, rayonChuteM: 0 }, fuiteMessages: { porte: 'Parti.' } }, 'fuiteMessages'],
    ['un message vide', { sorties: ['ruelle'], reaction: { stupeurS: 0, rayonChuteM: 0 }, fuiteMessages: { ruelle: '' } }, 'fuiteMessages'],
    ['une fenêtre au départ inconnu', { fenetres: [{ nom: 'f', depart: 'premierTir', dureeS: 6, echeance: { echec: 'Raté.' } }] }, 'fenetres'],
    ['une fenêtre à l\'échec sans texte', { fenetres: [{ nom: 'f', depart: 'premier-tir', dureeS: 6, echeance: { echec: '' } }] }, 'fenetres'],
    ['une fenêtre à la pénalité sans fil', { fenetres: [{ nom: 'f', depart: 'tir', dureeS: 2, echeance: { penalite: 50 } }] }, 'fenetres'],
    ['une fenêtre à deux échéances', { fenetres: [{ nom: 'f', depart: 'tir', dureeS: 2, echeance: { echec: 'Raté.', evenement: 'alerte' } }] }, 'fenetres'],
    ['deux fenêtres du même nom', { fenetres: [1, 2].map(() => ({ nom: 'f', depart: 'tir', dureeS: 2, echeance: { evenement: 'alerte' } })) }, 'fenetres'],
    ['une ligne à l\'événement inconnu', { radio: [{ evenement: 'decroche', texte: 'Il décroche.' }] }, 'radio'],
    ['une ligne sans texte', { radio: [{ evenement: 'calme', texte: '' }] }, 'radio'],
    ['une ligne dite zéro fois', { radio: [{ evenement: 'calme', texte: 'Calme.', fois: 0 }] }, 'radio'],
    ['une fin tant qu\'une condition inconnue', { fin: { calmeS: 12, tantQue: 'pluie' } }, 'fin'],
  ])('témoin des règles : %s : relevé', (_, champs, attendu) => {
    expect(defautsDeForme({ ...M, ...champs })).toEqual([attendu])
  })

  it('la forme complète des règles, telle que les sous-lots la rempliront, est acceptée', () => {
    expect(defautsDeForme({ ...M, sorties: ['ruelle'], abris: ['igloo'], reaction: { stupeurS: 0.4, rayonChuteM: 15 }, perteDeVueS: 3,
      fuiteMessages: { ruelle: 'Luc a filé par la ruelle.' },
      fenetres: [{ nom: 'triple', depart: 'premier-tir', dureeS: 6, echeance: { echec: 'Un officier a gagné un igloo.' } },
        { nom: 'lente', depart: 'tir', dureeS: 2, echeance: { penalite: 50, fil: 'Trop lent' } },
        { nom: 'appel', depart: 'depart', dureeS: 90, echeance: { evenement: 'alerte' } }],
      radio: [{ evenement: 'calme', texte: 'Eux deux, c\'est fait.', apresS: 1, fois: 2 }],
      fin: { calmeS: 12, tantQue: 'cadenas' } })).toEqual([])
  })

  // Témoins du casting (tâche A6) : chaque champ hors de sa forme est relevé, seul.
  it.each([
    ['une cible sans modèle (le tirage d\'avant la tâche)', c => ({ ...c, cibles: [{ femme: false }] }), 'casting.cibles'],
    ['une cible sans le sexe de son personnage de secours', c => ({ ...c, cibles: [{ modele: 'gangster_man_01' }] }), 'casting.cibles'],
    ['une teinte de maillage qui n\'est pas un nombre', c => ({ ...c, cibles: [{ ...c.cibles[0], teinteMaillage: { Ch01_Shirt: 'beige' } }] }), 'casting.cibles'],
    ['des gardes comptés par un nombre seul (la forme d\'avant la tâche)', c => ({ ...c, gardes: 2 }), 'casting.gardes'],
    ['un modèle de gardes vide', c => ({ ...c, gardes: { nombre: 2, modele: '' } }), 'casting.gardes'],
    ['des exclus qui ne sont pas une liste', c => ({ ...c, civils: { ...c.civils, exclure: 'mafia_woman_02' } }), 'casting.civils'],
  ])('témoin : %s : relevé', (_, casting, attendu) => {
    expect(defautsDeForme({ ...MISSIONS[0], casting: casting(MISSIONS[0].casting) })).toEqual([attendu])
  })
})

// Réglage de la lunette (spec du lot 3, décision 1 ; plan du lot 3a, tâche A4) : la distance qu'annonce Anton au
// briefing, affichée « ZÉRO n m » dans la lunette ; la balle recroise la ligne de visée à cette distance. Le compteur de
// distance de chaque briefing (docs/superpowers/maquettes/cinematiques/briefing-m<n>.html, K.counter) la dit, sauf
// celui de M5, qui n'annonce aucun chiffre : 138 m y est lu sur l'échelle de la carte (spec §3 ; REPRISE.md, décisions
// du 7 octobre 2026). Ce réglage est déjà le vrai, bien que M3, M4 et M5 se jouent encore de 20 à 44 m de leur poste
// jusqu'aux sous-lots 3c et 3d : la balle y passe au-dessus de la visée, de 2 à 4 cm en M3 et M5, de 6 à 13 cm en M4.
// Témoin : les missions d'avant la tâche n'ont pas de réglage (vu rouge).
describe('le réglage de la lunette : la distance qu\'annonce le briefing (décision 1)', () => {
  const ANNONCE = { 1: 31, 2: 42, 3: 155, 4: 430, 5: 138, 6: 38 }
  it('M1 31 m, M2 42 m, M3 155 m, M4 430 m, M5 138 m, M6 38 m', () => {
    expect(Object.fromEntries(MISSIONS.map(m => [m.numero, m.zero]))).toEqual(ANNONCE)
  })

  it.each([1, 2, 3, 4, 6])('M%i : le compteur de distance de son briefing va jusqu\'à ce réglage', n => {
    const maquette = readFileSync(join(ROOT, 'docs', 'superpowers', 'maquettes', 'cinematiques', `briefing-m${n}.html`), 'utf8')
    const comptes = [...maquette.matchAll(/counter\('[\w-]+', 0, (\d+), \d+, ' m'/g)].map(x => +x[1])
    expect(comptes).toContain(missionFor(n).zero)
  })
})

describe('les cartes ne disent que leur décor : sol, écho, pluie et ancres nommées', () => {
  cartes.forEach(({ info }, i) => {
    it(`M${i + 1} : ni poste, ni zone d'apparition, ni règle de jeu hors des ancres`, () => {
      expect(Object.keys(info).filter(k => !['groundY', 'acoustics', 'rain', 'ancres'].includes(k))).toEqual([])
      expect(info.ancres, 'la carte ne rend pas d\'ancres').toBeTruthy()
      for (const g of Object.keys(GROUPES)) expect(typeof info.ancres[g], g).toBe('object')
    })

    it(`M${i + 1} : chaque ancre a la forme d'une sorte connue`, () => {
      expect(info.ancres, 'la carte ne rend pas d\'ancres').toBeTruthy()
      for (const [nom, a] of Object.entries(info.ancres)) {
        if (GROUPES[nom]) for (const [n, x] of Object.entries(a)) expect(FORMES[GROUPES[nom]](x), `${nom}.${n}`).toBe(true)
        else expect(FORMES.point(a) || FORMES.zone(a) || FORMES.route(a), nom).toBe(true)
      }
    })
  })
})

// La copie des formes (en tête de ce fichier) ne doit rien ignorer de ce que le module cite : sinon, une sorte d'ancre
// ajoutée à index.js, que nulle mission ne cite encore, passerait sans qu'aucun test ne la relise (relecture de A2).
// Témoin : index.js qui gagne une sorte « ligne » (forme, article, lieu et citation d'une patrouille), sans mission qui
// la cite, laisse vert tout le reste de ce fichier ; cette garde, et la mission inventée plus bas, rougissent.
describe('la copie des formes connaît chaque sorte que cite le module', () => {
  it('chaque sorte que range ancresCitees (lue dans index.js) a sa forme et son article ici, chaque groupe sa sorte', () => {
    const citations = citationsDuSource(SOURCE_INDEX)
    expect(citations.length, 'aucune citation lue dans ancresCitees').toBeGreaterThan(0)
    expect(inconnuesDeLaCopie(citations)).toEqual([])
  })

  // Témoins : chaque écart entre le source et la copie est relevé.
  it.each([
    ['une sorte nouvelle, à la racine des ancres', '  return out\n}',
      "  if (m.patrouille) out.push({ champ: 'patrouille', sorte: 'ligne', nom: m.patrouille })\n  return out\n}",
      ['sorte ligne : pas de forme ici (FORMES)', 'sorte ligne : pas d\'article ici (AVEC_ARTICLE)']],
    ['une sorte nouvelle, dans un groupe nouveau', '  return out\n}',
      "  m.portes.forEach((nom, i) => out.push({ champ: `portes[${i}]`, sorte: 'porte', groupe: 'portes', nom }))\n  return out\n}",
      ['sorte porte : pas de forme ici (FORMES)', 'sorte porte : pas d\'article ici (AVEC_ARTICLE)',
        'groupe portes : absent ici (GROUPES), porte dans ancresCitees']],
    ['un abri rangé dans le groupe des sorties', "groupe: 'abris'", "groupe: 'sorties'", ['groupe sorties : sorte sortie ici, abri dans ancresCitees']],
    ['une sorte qui n\'est pas écrite en toutes lettres', "sorte: 'route'", 'sorte: m.convoi.sorte', ['une sorte qui n\'est pas écrite en toutes lettres']],
    ['un groupe qui n\'est pas écrit en toutes lettres', "groupe: 'places'", 'groupe: c.groupe', ['un groupe qui n\'est pas écrit en toutes lettres']],
  ])('témoin : %s : relevé', (_, avant, apres, attendu) => {
    expect(SOURCE_INDEX.split(avant), `« ${avant} » absent d'index.js, ou plusieurs fois : témoin impossible`).toHaveLength(2)
    expect(inconnuesDeLaCopie(citationsDuSource(SOURCE_INDEX.replace(avant, apres)))).toEqual(attendu)
  })
})

describe('contrat : chaque ancre citée par une mission existe dans sa carte, de la bonne sorte', () => {
  MISSIONS.forEach((m, i) => {
    it(`M${m.numero} : ${ancresCitees(m).map(c => c.nom).join(', ')}`, () => {
      const { ancres } = cartes[i].info
      expect(ancres, 'la carte ne rend pas d\'ancres').toBeTruthy()
      for (const c of ancresCitees(m)) {
        const a = c.groupe ? (ancres[c.groupe] || {})[c.nom] : ancres[c.nom]
        expect(a, `${c.champ} : l'ancre « ${c.nom} » manque à la carte`).toBeDefined()
        expect(FORMES[c.sorte](a), `${c.champ} : l'ancre « ${c.nom} » n'a pas la forme d'${AVEC_ARTICLE[c.sorte]}`).toBe(true)
      }
      expect(() => resoudreAncres(m, ancres)).not.toThrow()
    })
  })
})

describe('ancresCitees et resoudreAncres', () => {
  // Une carte et une mission inventées, qui citent chaque sorte d'ancre.
  const ancres = {
    oeil: [1, 2, 3], regard: [4, 5, 6], autreOeil: [7, 8, 9], cadenas: [0, 1, 2],
    zone: { minX: -1, maxX: 1, minZ: -2, maxZ: 2 },
    route: { z: -4, depart: -55, sens: 1 },
    places: { banc: { x: 1, z: 2, assise: 0.4, debout: [0, 0.5] }, chaise: { x: 3, z: 4 } },
    sorties: { porte: { x: 9, z: 9 }, ruelle: { x: -9, z: 9 } },
    abris: { igloo: { x: 0, z: -9 } },
  }
  const mission = {
    numero: 7, poste: { oeil: 'oeil', regard: 'regard' }, zone: 'zone',
    casting: { cibles: [{ place: 'banc' }, {}, { place: 'chaise' }] },
    sorties: ['ruelle'], abris: ['igloo'],
    choixMoral: { cadenas: 'cadenas' }, convoi: { route: 'route' },
  }

  // Les tests qui suivent passent par chaque sorte et chaque groupe : la mission inventée n'en oublie aucun de ceux que
  // le source d'ancresCitees range, et la lecture du source n'en manque aucun de ceux qu'elle cite à l'exécution.
  it('la mission inventée cite chaque sorte et chaque groupe que range ancresCitees (lus dans index.js)', () => {
    const cle = c => `${c.sorte} ${c.groupe ?? '(racine)'}`
    expect([...new Set(ancresCitees(mission).map(cle))].sort()).toEqual([...new Set(citationsDuSource(SOURCE_INDEX).map(cle))].sort())
  })

  it('ancresCitees : chaque citation, son champ, sa sorte, et son groupe pour les places, sorties et abris', () => {
    expect(ancresCitees(mission)).toEqual([
      { champ: 'poste.oeil', sorte: 'point', nom: 'oeil' },
      { champ: 'poste.regard', sorte: 'point', nom: 'regard' },
      { champ: 'zone', sorte: 'zone', nom: 'zone' },
      { champ: 'casting.cibles[0].place', sorte: 'place', groupe: 'places', nom: 'banc' },
      { champ: 'casting.cibles[2].place', sorte: 'place', groupe: 'places', nom: 'chaise' },
      { champ: 'sorties[0]', sorte: 'sortie', groupe: 'sorties', nom: 'ruelle' },
      { champ: 'abris[0]', sorte: 'abri', groupe: 'abris', nom: 'igloo' },
      { champ: 'choixMoral.cadenas', sorte: 'point', nom: 'cadenas' },
      { champ: 'convoi.route', sorte: 'route', nom: 'route' },
    ])
  })

  it('resoudreAncres : les ancres citées, prises telles quelles dans la carte, et celles-là seulement', () => {
    expect(resoudreAncres(mission, ancres)).toEqual({
      oeil: [1, 2, 3], regard: [4, 5, 6], zone: ancres.zone,
      places: { banc: ancres.places.banc, chaise: ancres.places.chaise },
      sorties: { ruelle: ancres.sorties.ruelle }, abris: { igloo: ancres.abris.igloo },
      cadenas: [0, 1, 2], route: ancres.route,
    })
    const l = resoudreAncres({ ...mission, poste: { oeil: 'autreOeil', regard: 'regard' } }, ancres)
    expect(l.oeil).toBe(ancres.autreOeil)
  })

  it('sans regard, cadenas ni convoi : null ; ni place, sortie ni abri cités : vides', () => {
    const simple = { numero: 7, poste: { oeil: 'oeil', regard: null }, zone: 'zone', casting: { cibles: [{}] }, sorties: [], abris: [] }
    expect(ancresCitees(simple).map(c => c.champ)).toEqual(['poste.oeil', 'zone'])
    expect(resoudreAncres(simple, ancres)).toEqual({ oeil: [1, 2, 3], regard: null, zone: ancres.zone, places: {}, sorties: {},
      abris: {}, cadenas: null, route: null })
  })

  // Témoins du contrat : chaque défaut est refusé, avec la mission, le champ et l'ancre en cause.
  it.each([
    ['un regard absent de la carte (le point d\'appel de M1, avant le sous-lot 3b)', { poste: { oeil: 'oeil', regard: 'pointAppel' } },
      /M7 : poste\.regard : l'ancre « pointAppel » manque à la carte/],
    ['une place absente', { casting: { cibles: [{ place: 'fauteuil' }] } }, /M7 : casting\.cibles\[0\]\.place : l'ancre « fauteuil » manque/],
    ['une sortie absente', { sorties: ['porte', 'toit'] }, /M7 : sorties\[1\] : l'ancre « toit » manque/],
    ['un abri absent', { abris: ['hangar'] }, /M7 : abris\[0\] : l'ancre « hangar » manque/],
    ['la zone citée comme cadenas (mauvaise sorte)', { choixMoral: { cadenas: 'zone' } }, /M7 : choixMoral\.cadenas : l'ancre « zone » n'a pas la forme d'un point/],
    ['un point cité comme zone', { zone: 'oeil' }, /M7 : zone : l'ancre « oeil » n'a pas la forme d'une zone/],
    ['une route absente', { convoi: { route: 'piste' } }, /M7 : convoi\.route : l'ancre « piste » manque/],
    ['une place prise à la racine plutôt que dans places', { casting: { cibles: [{ place: 'cadenas' }] } }, /M7 : casting\.cibles\[0\]\.place : l'ancre « cadenas » manque/],
  ])('%s : erreur', (_, mutation, message) => {
    expect(() => resoudreAncres({ ...mission, ...mutation }, ancres)).toThrow(message)
  })

  it('une carte sans ancres (les cartes d\'avant la tâche A2 rendaient cameraPos, spawnBounds…) : erreur', () => {
    expect(() => resoudreAncres(mission, undefined)).toThrow(/M7 : la carte ne rend pas d'ancres/)
  })
})

describe('nombreDeCivils', () => {
  it('un nombre fixé : lui, sans tirage', () => {
    let tirages = 0
    expect(nombreDeCivils({ nombre: 24 }, () => { tirages++; return 0.5 })).toBe(24)
    expect(nombreDeCivils({ nombre: 0 }, () => { tirages++; return 0.5 })).toBe(0)
    expect(tirages).toBe(0)
  })

  it('[min, max] : un seul tirage, min + ⌊r × (max - min + 1)⌋ ; de 3 à 5, le 3 + ⌊r × 3⌋ d\'avant la tâche', () => {
    for (const r of [0, 0.2, 0.34, 0.5, 0.67, 0.999]) {
      let tirages = 0
      expect(nombreDeCivils({ nombre: [3, 5] }, () => { tirages++; return r })).toBe(3 + Math.floor(r * 3))
      expect(tirages).toBe(1)
    }
  })
})

// Valeurs du jeu d'aujourd'hui pour les champs que les tâches du socle branchent (A3 : le profil de caméra, A5 : le
// zoom) : elles partent de ce que le jeu faisait déjà, pris là où il le faisait. Les sous-lots 3b à 3d y mettent les
// vraies, mission par mission : ils changent alors ces relevés, sciemment.
//
// Brume que posait chaque carte avant la tâche A3 (src/maps/, commit 69ab74a, scene.fog = new THREE.Fog(couleur, début,
// fin)), de M1 à M6 : la tâche l'a passée dans le profil de sa mission, et la carte garde un ciel (son fond) de la même
// couleur. Plans de la caméra (0,1 et 200 m), soleil (20, 40, 10) et cadre d'ombre (±60 m) : ceux d'initScene avant la
// tâche (src/scene.js), communs à toutes les cartes ; la cible du soleil, celle de three par défaut (l'origine).
const BRUMES_D_AVANT_A3 = [
  [0x87a0b0, 50, 140], [0x0a0a18, 40, 100], [0x0a1520, 35, 95], [0x9ab0c0, 70, 160], [0xb0a088, 80, 180], [0x0a0a14, 60, 130],
]
describe('valeurs du jeu d\'aujourd\'hui', () => {
  it('profil : la brume que posait sa carte ; plans de la caméra, soleil et cadre d\'ombre d\'avant la tâche A3', () => {
    MISSIONS.forEach((m, i) => {
      const [couleur, debut, fin] = BRUMES_D_AVANT_A3[i]
      expect(m.profil, `M${m.numero}`).toEqual({
        near: 0.1, far: 200,
        brume: { type: 'lin', couleur, debut, fin },
        soleil: { pos: [20, 40, 10], cible: [0, 0, 0] },
        cadreOmbre: 60,
      })
    })
  })

  // Témoin : avant la tâche A3 (commit 69ab74a), chaque carte posait sa brume (vu rouge pour les six).
  it('la carte ne pose plus de brume (celle du profil de sa mission la remplace au montage), et garde son ciel', () => {
    const posent = cartes.flatMap((c, i) => (c.brume === BRUME_TEMOIN ? [] : [`M${i + 1}`]))
    expect(posent, 'cartes qui posent encore leur brume').toEqual([])
    expect(cartes.map(c => c.fond && c.fond.getHex())).toEqual(BRUMES_D_AVANT_A3.map(([couleur]) => couleur))
  })

  // Zoom que posait le jeu avant la tâche A5 (commit 4b6e4e8), le même dans les six missions : ×4 au départ
  // (setZoom(4, { instant: true }) dans mountLevel), et la molette de ×3 à 6 + 2 × niveau de Lunette (main.js, maxZoom
  // de getStats, src/upgrades.js), soit ×6 sans la Lunette. Depuis la tâche, le zoom de la mission en décide (et la
  // Lunette relève son maximum de 15 % par niveau, décision 2) : 3b à 3d y mettront ceux de leurs postes.
  it('zoom : ×4 au départ, de ×3 à ×6 sans la Lunette, celui d\'avant la tâche A5', () => {
    for (const m of MISSIONS) expect(m.zoom, `M${m.numero}`).toEqual({ depart: 4, min: 3, max: 6 })
  })

  // Tâche A8 : les règles sont branchées, chaque mission garde le jeu d'aujourd'hui ; les sous-lots 3b à 3d les remplissent.
  it('ni sortie, ni abri, ni réaction, ni perte de vue, ni fenêtre, ni radio, fin immédiate : le cône de 80° décide de la fuite, la réussite suit le ralenti', () => {
    for (const m of MISSIONS) {
      expect([m.sorties, m.abris, m.fenetres, m.radio], `M${m.numero}`).toEqual([[], [], [], []])
      expect([m.reaction, m.perteDeVueS, m.fuiteMessages], `M${m.numero}`).toEqual([null, null, undefined])
      expect(m.fin, `M${m.numero}`).toEqual({ calmeS: 0 })
    }
  })
})
