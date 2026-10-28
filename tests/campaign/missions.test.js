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
const { getStats } = await import('../../src/upgrades.js')
const { MISSIONS, missionFor, ancresCitees, resoudreAncres, nombreDeCivils } = await import('../../src/campaign/missions/index.js')

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
  const z = m.zoom || {}
  exige([z.depart, z.min, z.max].every(fini) && z.min <= z.depart && z.depart <= z.max, 'zoom')
  const p = m.profil || {}, b = p.brume || {}
  exige(fini(p.near) && fini(p.far) && p.near > 0 && p.near < p.far, 'profil.near, profil.far')
  exige(fini(b.couleur) && (b.type === 'lin' ? fini(b.debut) && fini(b.fin) && b.debut < b.fin
    : b.type === 'exp2' && fini(b.densite) && b.densite > 0), 'profil.brume')
  exige(!!p.soleil && FORMES.point(p.soleil.pos) && FORMES.point(p.soleil.cible), 'profil.soleil')
  exige(fini(p.cadreOmbre) && p.cadreOmbre > 0, 'profil.cadreOmbre')
  const c = m.casting || {}
  exige(Array.isArray(c.cibles) && c.cibles.length > 0 && c.cibles.every(x => !!x && typeof x === 'object' &&
    (x.place === undefined || nom(x.place)) && (x.pool === undefined || ['target', 'guard', 'civilian'].includes(x.pool)) &&
    (x.routine === undefined || x.routine === 'telephone') && (x.femme === undefined || typeof x.femme === 'boolean')), 'casting.cibles')
  exige(Number.isInteger(c.gardes) && c.gardes >= 0, 'casting.gardes')
  const n = c.civils && c.civils.nombre
  exige(Number.isInteger(n) ? n >= 0 : Array.isArray(n) && n.length === 2 && n.every(Number.isInteger) && n[0] >= 0 &&
    n[0] <= n[1], 'casting.civils')
  const a = m.allure || {}
  exige(fini(a.cibles) && fini(a.gardes) && typeof a.imprevisibles === 'boolean', 'allure')
  exige(typeof m.marqueurs === 'boolean', 'marqueurs')
  exige(m.fiche === null || (!!m.fiche && nom(m.fiche.texte)), 'fiche')
  exige(['opposee', 'laterale'].includes(m.fuite), 'fuite')
  for (const k of ['sorties', 'abris']) exige(Array.isArray(m[k]) && m[k].every(nom), k)
  for (const k of ['fenetres', 'radio']) exige(Array.isArray(m[k]), k)
  exige(!!m.fin && fini(m.fin.calmeS) && m.fin.calmeS >= 0, 'fin')
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

  it('témoins : une mission sans fin, ou au zoom de départ sous le minimum, est relevée', () => {
    const { fin, ...sansFin } = MISSIONS[0]
    expect(fin).toBeDefined()
    expect(defautsDeForme(sansFin)).toEqual(['fin'])
    expect(defautsDeForme({ ...MISSIONS[2], zoom: { depart: 2, min: 3, max: 6 } })).toEqual(['zoom'])
    expect(defautsDeForme({ ...MISSIONS[5], casting: { ...MISSIONS[5].casting, cibles: [{ routine: 'danse' }] } }))
      .toEqual(['casting.cibles'])
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

  it('zoom : ×4 au départ et ×3 au moins (main.js), ×6 au plus sans la Lunette (getStats, src/upgrades.js)', () => {
    const src = readFileSync(join(ROOT, 'src', 'main.js'), 'utf8')
    const depart = /setZoom\(([\d.]+), \{ instant: true \}\)/.exec(src)
    const min = /Math\.max\(([\d.]+), Math\.min\(stats\.maxZoom/.exec(src)
    expect(depart && min, 'main.js : zoom de départ ou minimum introuvable').toBeTruthy()
    for (const m of MISSIONS) expect(m.zoom, `M${m.numero}`).toEqual({ depart: +depart[1], min: +min[1], max: getStats().maxZoom })
  })

  it('ni sortie, ni abri, ni fenêtre, ni radio, fin immédiate : le cône de 80° décide de la fuite, la réussite suit le ralenti', () => {
    for (const m of MISSIONS) {
      expect([m.sorties, m.abris, m.fenetres, m.radio], `M${m.numero}`).toEqual([[], [], [], []])
      expect(m.fin, `M${m.numero}`).toEqual({ calmeS: 0 })
    }
  })
})
