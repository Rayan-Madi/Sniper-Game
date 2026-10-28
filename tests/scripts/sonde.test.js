import { describe, it, expect, vi } from 'vitest'

// Sonde de lisibilité, côté script (spec du lot 3, §1 « 3.0 », §3 et §4 ; plan du lot 3a, tâche S0) :
// scripts/sonde.mjs dit quoi capturer (postes à 155, 138 et 430 m avec les modèles imposés de la spec, plus le repli
// de M4 à 250 m ; zooms ×8, ×12, ×20 et le zoom maximum de base de chaque mission ; Moyen et Bas), écrit l'adresse
// que la route ?sonde=1 relit (src/gfx/sonde.js), et applique le critère par défaut de la porte de décision :
// silhouette ≥ 80 px et signe d'identification ≥ 10 px, en Bas, au zoom maximum de base de la mission.
//
// Témoin : avant la tâche S0 (commit 267ca90), aucune sonde : aucun poste à mesurer, aucune adresse, aucun critère
// appliqué (verdict absent). Sans scripts/sonde.mjs, les tests tournent sur cette règle (regleAvant) et échouent sur
// elle (vus rouges). Les postes du jeu d'aujourd'hui, eux, sont relus dans les cartes (témoin plus bas).

// Les cartes (src/maps/) posent leurs objets dans la scène du jeu : une vraie THREE.Scene ici, sans rendu ni lumières.
vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})

const SONDE_MJS = '../../scripts/sonde.mjs'   // chemin dans une variable : Vite refuserait le fichier si le module manque
const mod = await import(/* @vite-ignore */ SONDE_MJS).catch(() => null)
const regleAvant = {
  POSTES_SONDE: [],
  jobsSonde: () => [],
  urlSonde: () => '',
  verdictPoste: () => null,
  decisionM4: () => null,
  distanceLimite: () => null,
  carreLunette: () => null,
  tableauMesures: () => '',
  ecartAuCalcul: () => null,
  tableauVerdicts: () => '',
}
const { POSTES_SONDE, jobsSonde, urlSonde, verdictPoste, decisionM4, distanceLimite, carreLunette, tableauMesures, ecartAuCalcul, tableauVerdicts } = mod ?? regleAvant
const SONDE_JS = '../../src/gfx/sonde.js'
const { lireSonde, plongeeDeg } = await import(/* @vite-ignore */ SONDE_JS).catch(() => ({ lireSonde: () => null, plongeeDeg: () => 0 }))
const { MODELS } = await import('../../src/characters.js')
const { MAP_BUILDERS } = await import('../../src/maps/index.js')
const { withSeed } = await import('../../src/gfx/memtest.js')

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const poste = nom => POSTES_SONDE.find(p => p.nom === nom)
const modelesDuJeu = Object.values(MODELS).flatMap(c => (c.variants ? c.variants.map(v => v.url) : [c.url]))
  .map(u => u.split('/').pop().replace(/\.glb$/, ''))

describe('les postes de la sonde (spec du lot 3, §1 et §3)', () => {
  it('155 m (M3), 138 m (M5), 430 m (M4), et le haut du repli de M4, 250 m', () => {
    expect(POSTES_SONDE.map(p => [p.nom, p.mission, p.distance])).toEqual([
      ['155m', 3, 155], ['138m', 5, 138], ['430m', 4, 430], ['250m', 4, 250],
    ])
  })

  // Distance de l'œil au point regardé (le milieu du groupe, à hauteur de buste) : 154,3 m au centre de la zone de M3
  // (spec §3 : « centre 154,3 »), 430 m au centre du dépôt de M4, 138 m sur la route de M5.
  it('chaque poste est à sa distance, à 1 % près', () => {
    expect(POSTES_SONDE.length).toBeGreaterThan(0)
    for (const p of POSTES_SONDE) expect(Math.abs(dist(p.poste, p.regard) / p.distance - 1), p.nom).toBeLessThan(0.01)
  })

  // Le jeu d'aujourd'hui place l'œil à une trentaine de mètres de ses cibles (spec §0) : la même vérification refuse
  // ses postes. C'est ce que la sonde vient mesurer avant que le lot 3 ne les déplace.
  it('témoin : les postes du jeu d\'aujourd\'hui (cartes de M3, M4 et M5) sont à une trentaine de mètres', () => {
    for (const [m, d] of [[3, 155], [4, 430], [5, 138]]) {
      const info = withSeed(1000 + m, MAP_BUILDERS[m - 1])
      const vu = dist(info.cameraPos, info.cameraTarget)
      expect(vu, `M${m}`).toBeLessThan(35)
      expect(Math.abs(vu / d - 1), `M${m}`).toBeGreaterThan(0.01)
    }
  })

  it('les plongées de la spec : 14,9° en M3, 4,9° en M4, environ 8° en M5 ; même œil (37,5 m) pour le repli de M4', () => {
    expect(plongeeDeg(poste('155m').poste, poste('155m').regard)).toBeCloseTo(14.9, 1)
    expect(Math.abs(plongeeDeg(poste('430m').poste, poste('430m').regard) - 4.9)).toBeLessThan(0.1)
    expect(Math.abs(plongeeDeg(poste('138m').poste, poste('138m').regard) - 8)).toBeLessThan(1)
    expect(poste('250m').poste[1]).toBe(poste('430m').poste[1])
  })

  it('les modèles imposés de la spec §3, tous chargés par le jeu', () => {
    expect(poste('155m').modeles).toEqual(['gangster_man_01', 'mafia_woman_03'])   // Vosko, Mira
    expect(poste('138m').modeles).toEqual(['mafia_boss'])                          // Kessler
    expect(poste('430m').modeles).toEqual(['mafia_woman_02', 'mafia_henchman', 'mafia_woman_01'])   // Verne, Halder, Rossi
    expect(poste('250m').modeles).toEqual(poste('430m').modeles)
    for (const p of POSTES_SONDE) {
      expect(p.noms.length, p.nom).toBe(p.modeles.length)
      for (const m of p.modeles) expect(modelesDuJeu, `${p.nom} : ${m}`).toContain(m)
    }
  })

  // Signe d'identification annoncé (spec §2, critères de lisibilité de 3c et 3d) : le buste en M3 (costume sombre
  // contre t-shirt clair ; le chignon de Mira est trop petit à 155 m), la tête en M4 (casque de Halder, chignon de
  // Verne) et en M5 (casquette d'officier de Kessler, posée sur la tête).
  it('le signe compté par mission : le buste en M3, la tête en M4 et M5', () => {
    expect(POSTES_SONDE.map(p => [p.nom, p.signe])).toEqual([['155m', 'torse'], ['138m', 'tete'], ['430m', 'tete'], ['250m', 'tete']])
  })

  it('zoom maximum de base de la spec §3 : ×10 en M3, ×12 en M5, ×20 en M4', () => {
    expect(POSTES_SONDE.map(p => [p.nom, p.zoomMaxBase])).toEqual([['155m', 10], ['138m', 12], ['430m', 20], ['250m', 20]])
  })
})

describe('jobsSonde : une capture par poste, zoom et qualité', () => {
  const jobs = jobsSonde()

  it('zooms ×8, ×12 et ×20, plus le zoom maximum de base de la mission ; Moyen et Bas', () => {
    const de = nom => jobs.filter(j => j.nom === nom)
    expect([...new Set(de('155m').map(j => j.zoom))]).toEqual([8, 10, 12, 20])
    expect([...new Set(de('430m').map(j => j.zoom))]).toEqual([8, 12, 20])
    for (const p of POSTES_SONDE) {
      for (const z of new Set(de(p.nom).map(j => j.zoom))) {
        expect(de(p.nom).filter(j => j.zoom === z).map(j => j.qualite), `${p.nom} ×${z}`).toEqual(['moyen', 'bas'])
      }
    }
    expect(jobs).toHaveLength(26)
  })

  it('chaque capture a son fichier, sans ambiguïté', () => {
    expect(new Set(jobs.map(j => j.fichier)).size).toBe(jobs.length)
    expect(jobs.find(j => j.nom === '430m' && j.zoom === 20 && j.qualite === 'bas').fichier).toBe('sonde-430m-x20-bas.jpg')
  })
})

describe('urlSonde : l\'adresse que la route ?sonde=1 relit', () => {
  it('lireSonde(urlSonde(job)) rend le poste, le profil, le zoom, la qualité, les modèles, l\'écart et la carte du job', () => {
    const jobs = jobsSonde()
    expect(jobs.length).toBeGreaterThan(0)
    for (const j of jobs) {
      expect(lireSonde('?' + urlSonde(j)), j.fichier).toEqual({
        poste: j.poste, regard: j.regard, near: j.near, far: j.far, brume: j.brume, soleil: j.soleil, zoom: j.zoom,
        qualite: j.qualite, modeles: j.modeles, ecart: j.ecart, carte: j.carte,
      })
    }
  })
})

// Relevé d'un personnage tel que la route le rend (src/gfx/sondeScene.js) : pixels rendus.
const perso = (nom, sil, tete, buste) => ({ nom, silhouette: { hauteur: sil, largeur: 20 }, tete: { hauteur: tete, largeur: 8 }, torse: { hauteur: 30, largeur: buste } })
const releve = (nom, zoom, qualite, personnages) => ({ nom, zoom, qualite, personnages })

describe('verdictPoste : le critère par défaut de la spec §4', () => {
  const p430 = () => poste('430m')
  const releves430 = [
    releve('430m', 20, 'moyen', [perso('Verne', 86, 12.6, 19), perso('Halder', 89, 13.4, 20), perso('Rossi', 88, 13, 19)]),
    releve('430m', 20, 'bas', [perso('Verne', 64, 9.5, 14), perso('Halder', 67, 10, 15), perso('Rossi', 66, 9.8, 14)]),
    releve('430m', 12, 'bas', [perso('Verne', 39, 6, 9), perso('Halder', 40, 6, 9), perso('Rossi', 40, 6, 9)]),
  ]

  it('en Bas au zoom maximum de base : le plus petit personnage décide', () => {
    expect(verdictPoste(p430(), releves430)).toEqual({
      nom: '430m', mission: 4, distance: 430, zoom: 20, qualite: 'bas', signe: 'tete',
      silhouette: { px: 64, nom: 'Verne' }, signePx: { px: 9.5, nom: 'Verne' }, tient: false,
    })
  })

  // Le même relevé, jugé en Moyen, tiendrait : le critère porte bien sur le Bas (pixels réellement rendus).
  it('témoin : en Moyen, le même relevé tiendrait', () => {
    expect(verdictPoste(p430(), releves430, { qualite: 'moyen' }).tient).toBe(true)
  })

  it('le signe de M3 est la largeur du buste', () => {
    const v = verdictPoste(poste('155m'), [releve('155m', 10, 'bas', [perso('Vosko', 92, 7, 29), perso('Mira', 88, 6, 23)])])
    expect(v.signePx).toEqual({ px: 23, nom: 'Mira' })
    expect(v.tient).toBe(true)
  })

  it('aux seuils exacts (80 et 10 px), le critère tient ; en dessous, non', () => {
    expect(verdictPoste(p430(), [releve('430m', 20, 'bas', [perso('Verne', 80, 10, 15)])]).tient).toBe(true)
    expect(verdictPoste(p430(), [releve('430m', 20, 'bas', [perso('Verne', 79, 10, 15)])]).tient).toBe(false)
    expect(verdictPoste(p430(), [releve('430m', 20, 'bas', [perso('Verne', 80, 9, 15)])]).tient).toBe(false)
  })

  it('sans relevé en Bas au zoom maximum de base, pas de verdict', () => {
    expect(verdictPoste(p430(), [releves430[2]])).toBeNull()
  })
})

describe('decisionM4 et distanceLimite', () => {
  it('M4 garde 430 m si le critère y tient, sinon elle passe au repli ; la décision dit pourquoi', () => {
    const verdict = (sil, tete) => verdictPoste(poste('430m'), [releve('430m', 20, 'bas', [perso('Verne', sil, tete, 14), perso('Halder', 90, 13, 15)])])
    expect(decisionM4(verdict(84, 11))).toMatchObject({ garde: true, texte: expect.stringMatching(/garde 430 m/) })
    const repli = decisionM4(verdict(64, 9.5))
    expect(repli.garde).toBe(false)
    expect(repli.texte).toMatch(/repli de 120 à 250 m/)
    expect(repli.texte).toMatch(/64 px \(Verne\).*tête 9,5 px \(Verne\)/)
    expect(decisionM4(null)).toBeNull()
  })

  // La taille à l'écran suit 1 / distance : la distance où le critère tiendrait encore, pour la plus petite des deux
  // marges (silhouette 80 px, signe 10 px).
  it('distance limite : celle où la plus petite marge s\'annule', () => {
    expect(distanceLimite({ distance: 430, silhouette: { px: 64.5 }, signePx: { px: 9.35 } })).toBeCloseTo(430 * 64.5 / 80, 6)
    expect(distanceLimite({ distance: 430, silhouette: { px: 120 }, signePx: { px: 9 } })).toBeCloseTo(387, 6)
  })
})

describe('carreLunette : la capture garde le carré de la lunette', () => {
  // Cercle de la lunette (drawScope, src/scope.js) : rayon 0,38 × le plus petit côté, vignette ouverte à 1,02 fois ce rayon.
  it('en 1080p, un carré centré qui contient le cercle de la lunette', () => {
    const c = carreLunette(1920, 1080)
    const r = 0.38 * 1.02 * 1080
    expect(c.width).toBe(c.height)
    expect(c.width).toBeGreaterThanOrEqual(2 * r)
    expect(c.width).toBeLessThan(2 * r + 4)
    expect(c.x + c.width / 2).toBeCloseTo(960, 0)
    expect(c.y + c.height / 2).toBeCloseTo(540, 0)
  })
})

describe('tableauMesures : les mesures d\'un poste, une ligne par zoom et par qualité', () => {
  it('silhouette, tête et buste de chaque personnage, en pixels rendus', () => {
    const t = tableauMesures(poste('155m'), [
      releve('155m', 8, 'moyen', [perso('Vosko', 98, 15, 31), perso('Mira', 94, 13, 25)]),
      releve('155m', 8, 'bas', [perso('Vosko', 73, 11, 23), perso('Mira', 70, 10, 19)]),
      releve('430m', 8, 'bas', [perso('Verne', 35, 5, 7)]),   // un autre poste : pas dans ce tableau
    ])
    const lignes = t.trim().split(String.fromCharCode(10))
    expect(lignes[0]).toBe('| Zoom | Qualité | Vosko : silhouette, tête, buste | Mira : silhouette, tête, buste |')
    expect(lignes[2]).toBe('| ×8 | Moyen | 98, 15, 31 | 94, 13, 25 |')
    expect(lignes[3]).toBe('| ×8 | Bas | 73, 11, 23 | 70, 10, 19 |')
    expect(lignes).toHaveLength(4)
  })
})

// La silhouette mesurée (pixels du rendu) contre la taille calculée (pixelsAttendus, hauteur d'ajustement du modèle) :
// la sonde vérifie le calcul de la spec sur le vrai rendu.
describe('ecartAuCalcul : la mesure contre le calcul', () => {
  it('rapports extrêmes de la silhouette mesurée à la silhouette calculée, sur tous les relevés', () => {
    const avec = (p, attendu) => ({ ...p, attendu: { silhouette: attendu } })
    expect(ecartAuCalcul([
      releve('430m', 20, 'moyen', [avec(perso('Verne', 84, 12, 19), 86), avec(perso('Halder', 90, 13, 20), 88)]),
      releve('430m', 20, 'bas', [avec(perso('Verne', 63, 9, 14), 64.5)]),
    ])).toEqual({ min: 63 / 64.5, max: 90 / 88 })
  })
})

describe('tableauVerdicts : le tableau de l\'annexe, tiré des mesures', () => {
  it('une ligne par poste, avec ce qui décide et le verdict', () => {
    const t = tableauVerdicts([
      { nom: '155m', mission: 3, distance: 155, zoom: 10, qualite: 'bas', signe: 'torse', silhouette: { px: 88, nom: 'Mira' }, signePx: { px: 23, nom: 'Mira' }, tient: true },
      { nom: '430m', mission: 4, distance: 430, zoom: 20, qualite: 'bas', signe: 'tete', silhouette: { px: 64, nom: 'Verne' }, signePx: { px: 9.5, nom: 'Verne' }, tient: false },
    ])
    const lignes = t.trim().split('\n')
    expect(lignes).toHaveLength(4)   // en-tête, séparateur, deux postes
    expect(lignes[2]).toMatch(/^\| M3 \| 155 m \| ×10 \| 88 px \(Mira\) \| buste : 23 px \(Mira\) \| tient \|$/)
    expect(lignes[3]).toMatch(/^\| M4 \| 430 m \| ×20 \| 64 px \(Verne\) \| tête : 9,5 px \(Verne\) \| ne tient pas \|$/)
    expect(t.includes(String.fromCharCode(0x2014))).toBe(false)   // aucun tiret cadratin (tests/texts.test.js)
  })
})
