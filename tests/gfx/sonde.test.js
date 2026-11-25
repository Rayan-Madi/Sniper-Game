import { describe, it, expect } from 'vitest'

// Sonde de lisibilité à longue distance (spec du lot 3, §1 « 3.0 » et §4, porte de décision ; plan du lot 3a, tâche
// S0) : partie pure de la route de développement ?sonde=1 (src/gfx/sonde.js). Elle lit les paramètres de l'adresse,
// mesure le masque d'identification d'un personnage (pixels allumés du rendu où il est seul, blanc sur noir), place le
// groupe des cibles sous le point regardé et donne la taille qu'un objet doit avoir à l'écran (le calcul de la spec).
//
// Témoin : avant la tâche S0 (commit 267ca90), la route n'existe pas. L'adresse ?sonde=1… est ignorée (aucune
// configuration) et rien n'est mesuré : les tailles de la spec ne sont que des calculs. Sans src/gfx/sonde.js, les
// tests tournent sur cette règle (regleAvant) et échouent sur elle (vus rouges).

const SONDE_JS = '../../src/gfx/sonde.js'   // chemin dans une variable : Vite refuserait le fichier si le module manque
const mod = await import(/* @vite-ignore */ SONDE_JS).catch(() => null)
const regleAvant = {
  lireSonde: () => null,
  mesureMasque: () => null,
  placesDuGroupe: () => [],
  capVers: () => 0,
  plongeeDeg: () => 0,
  pixelsAttendus: () => 0,
}
const { lireSonde, mesureMasque, placesDuGroupe, capVers, plongeeDeg, pixelsAttendus } = mod ?? regleAvant

describe('lireSonde : les paramètres de la route ?sonde=1', () => {
  it('sans sonde=1, la route est éteinte', () => {
    expect(lireSonde('?memtest=1')).toBeNull()
    expect(lireSonde('')).toBeNull()
  })

  it('lit le poste, le regard, le profil, le zoom, la qualité, les modèles, l\'écart et la carte', () => {
    const c = lireSonde('?sonde=1&poste=-28,41,146&regard=0,1.345,-0.5&near=0.5&far=600&brume=exp2:0.0035' +
      '&soleil=4,60,2&zoom=10&qualite=bas&modele=gangster_man_01,mafia_woman_03&ecart=1.4&carte=3')
    expect(c).toEqual({
      poste: [-28, 41, 146], regard: [0, 1.345, -0.5], near: 0.5, far: 600, brume: { type: 'exp2', densite: 0.0035 },
      soleil: [4, 60, 2], zoom: 10, qualite: 'bas', modeles: ['gangster_man_01', 'mafia_woman_03'], ecart: 1.4, carte: 3,
    })
  })

  it('brume linéaire : début et fin (m)', () => {
    expect(lireSonde('?sonde=1&brume=lin:150:1600').brume).toEqual({ type: 'lin', debut: 150, fin: 1600 })
  })

  // Le plan dit modele=<url> : le nom du fichier suffit, l'adresse du modèle aussi.
  it('un modèle se donne par son nom ou par son adresse', () => {
    expect(lireSonde('?sonde=1&modele=/models/mafia_boss.glb').modeles).toEqual(['mafia_boss'])
    expect(lireSonde('?sonde=1&modele=models/mafia_henchman.glb, mafia_woman_01').modeles).toEqual(['mafia_henchman', 'mafia_woman_01'])
  })

  it('carte : une mission de 1 à 6, ou nu (un sol nu) ; sans elle, la mission en cours', () => {
    expect(lireSonde('?sonde=1&carte=4').carte).toBe(4)
    expect(lireSonde('?sonde=1&carte=nu').carte).toBe('nu')
    expect(lireSonde('?sonde=1').carte).toBeNull()
  })

  it('une valeur illisible est écartée (champ nul), l\'écart et la liste des modèles ont un défaut', () => {
    const c = lireSonde('?sonde=1&poste=1,2&regard=a,b,c&near=-1&far=0&brume=lin:200:100&soleil=&zoom=0.5' +
      '&qualite=ultra&ecart=-2&carte=9')
    expect(c).toEqual({
      poste: null, regard: null, near: null, far: null, brume: null, soleil: null, zoom: null, qualite: null,
      modeles: [], ecart: 1.4, carte: null,
    })
  })

  it('un plan lointain plus proche que le plan proche est écarté', () => {
    expect(lireSonde('?sonde=1&near=5&far=2').far).toBeNull()
    expect(lireSonde('?sonde=1&near=5&far=2').near).toBe(5)
  })

  it('brume d\'un type inconnu, ou exponentielle sans densité positive : écartée', () => {
    expect(lireSonde('?sonde=1&brume=epais:3').brume).toBeNull()
    expect(lireSonde('?sonde=1&brume=exp2:0').brume).toBeNull()
    expect(lireSonde('?sonde=1&brume=exp2').brume).toBeNull()
    expect(lireSonde('?sonde=1&brume=lin:150').brume).toBeNull()
  })

  it('qualité : un préréglage du jeu seulement', () => {
    for (const q of ['auto', 'bas', 'moyen', 'haut']) expect(lireSonde(`?sonde=1&qualite=${q}`).qualite).toBe(q)
  })
})

// Masque au format de readPixels : RGBA, lignes du BAS vers le haut (la première ligne du tampon est le bas de
// l'image). allume(x, y), y compté depuis le haut de l'image, rend la valeur du rouge (0 à 255).
function masqueRGBA(largeur, hauteur, allume) {
  const px = new Uint8Array(largeur * hauteur * 4)
  for (let r = 0; r < hauteur; r++) {
    for (let x = 0; x < largeur; x++) {
      const v = allume(x, hauteur - 1 - r)
      const i = (r * largeur + x) * 4
      px[i] = px[i + 1] = px[i + 2] = v
      px[i + 3] = 255
    }
  }
  return px
}

describe('mesureMasque : la boîte du personnage dans son rendu d\'identification', () => {
  it('rien d\'allumé : pas de mesure', () => {
    expect(mesureMasque(masqueRGBA(64, 48, () => 0), 64, 48)).toBeNull()
  })

  it('un corps de 10 × 86 px : sa boîte, en pixels du tampon, y depuis le haut', () => {
    const px = masqueRGBA(200, 300, (x, y) => (x >= 40 && x <= 49 && y >= 100 && y <= 185 ? 255 : 0))
    expect(mesureMasque(px, 200, 300)).toEqual({ gauche: 40, droite: 49, haut: 100, bas: 185, largeur: 10, hauteur: 86, pixels: 860 })
  })

  // readPixels rend les lignes du bas vers le haut : un pixel de la première ligne du tampon est en bas de l'image.
  it('la première ligne du tampon est le bas de l\'image', () => {
    const px = new Uint8Array(8 * 6 * 4)
    px[0] = 255   // ligne 0 du tampon, colonne 0
    expect(mesureMasque(px, 8, 6)).toMatchObject({ gauche: 0, haut: 5, bas: 5, hauteur: 1 })
  })

  it('un bord à demi allumé (sous le seuil) ne compte pas ; le seuil se règle', () => {
    const px = masqueRGBA(50, 50, (x, y) => (y >= 10 && y <= 29 ? 255 : y === 30 ? 100 : 0))
    expect(mesureMasque(px, 50, 50).hauteur).toBe(20)
    expect(mesureMasque(px, 50, 50, 64).hauteur).toBe(21)
  })

  // La tête peut se détacher du corps d'une ligne (cou fin, bord du rendu) : la silhouette va du haut de la tête aux
  // pieds quand même.
  it('une tête séparée du corps par une ligne vide : la hauteur va du haut de la tête aux pieds', () => {
    const px = masqueRGBA(40, 120, (x, y) => ((y >= 10 && y <= 17 && x >= 18 && x <= 21) || (y >= 19 && y <= 90 && x >= 14 && x <= 25) ? 255 : 0))
    expect(mesureMasque(px, 40, 120)).toMatchObject({ haut: 10, bas: 90, hauteur: 81, largeur: 12 })
  })
})

const dist2D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

describe('placesDuGroupe : les cibles côte à côte sous le point regardé', () => {
  it('une seule : sous le point regardé', () => {
    expect(placesDuGroupe([2, 1.2, -4], [0, 20, 130], 1, 1.4)).toEqual([[2, -4]])
  })

  it('deux à 1,4 m, visée vers -z : de gauche à droite vu du poste, à la même profondeur', () => {
    const p = placesDuGroupe([0, 1, 0], [0, 30, 400], 2, 1.4)
    expect(p[0][0]).toBeCloseTo(-0.7, 9)
    expect(p[1][0]).toBeCloseTo(0.7, 9)
    expect(p[0][1]).toBeCloseTo(0, 9)
    expect(p[1][1]).toBeCloseTo(0, 9)
  })

  it('trois à 5 m : celui du milieu sous le point regardé, les autres à 5 m de part et d\'autre', () => {
    const p = placesDuGroupe([0, 1.2, 0], [0, 37.5, 428.5], 3, 5)
    expect(p[1][0]).toBeCloseTo(0, 9)
    expect(p[1][1]).toBeCloseTo(0, 9)
    expect(dist2D(p[0], p[1])).toBeCloseTo(5, 9)
    expect(dist2D(p[2], p[1])).toBeCloseTo(5, 9)
  })

  // Poste de M3 (spec §3) : la visée part en biais. Le groupe se range sur la perpendiculaire à la visée : aucun ne
  // passe derrière l'autre, et tous sont à la même distance du poste à quelques centimètres près.
  it('visée oblique (poste de M3) : le groupe sur la perpendiculaire à la visée', () => {
    const poste = [-28, 41, 146], regard = [0, 1.345, -0.5]
    const p = placesDuGroupe(regard, poste, 2, 1.4)
    const vise = [regard[0] - poste[0], regard[2] - poste[2]]
    const rang = [p[1][0] - p[0][0], p[1][1] - p[0][1]]
    expect(Math.abs(vise[0] * rang[0] + vise[1] * rang[1]) / Math.hypot(...vise)).toBeLessThan(1e-9)
    expect(Math.hypot(...rang)).toBeCloseTo(1.4, 9)
    // Vu du poste, le premier est à gauche : le produit vectoriel (visée × rang) pointe vers le bas (repère y vers le haut)
    expect(vise[0] * rang[1] - vise[1] * rang[0]).toBeGreaterThan(0)
  })
})

describe('capVers : un personnage tourné vers le poste', () => {
  // Les modèles regardent vers +Z (characters.js) ; NPC les tourne de atan2(dx, dz) autour de Y.
  it('le +Z du modèle, tourné de ce cap autour de Y, pointe vers le poste', () => {
    for (const vers of [[0, 10], [10, 0], [0, -10], [-10, 0], [-28, 146.5]]) {
      const a = capVers([0, 0], vers)
      const l = Math.hypot(...vers)
      expect(Math.sin(a)).toBeCloseTo(vers[0] / l, 9)
      expect(Math.cos(a)).toBeCloseTo(vers[1] / l, 9)
    }
  })
})

describe('plongeeDeg : angle de la visée sous l\'horizontale', () => {
  it('les plongées de la spec : 14,9° en M3, 4,9° en M4', () => {
    expect(plongeeDeg([-28, 41, 146], [0, 1.345, -0.5])).toBeCloseTo(14.9, 1)
    expect(plongeeDeg([0, 37.5, 428.5], [0, 1.2, 0])).toBeCloseTo(4.84, 2)
  })
})

describe('pixelsAttendus : la taille qu\'un objet doit avoir à l\'écran (calculs de la spec)', () => {
  it('les chiffres de la spec du lot 3 en 1080p : 86 px et 12,5 px à 430 m (×20), 123 px à 155 m (×10), 166 px à 138 m (×12)', () => {
    expect(pixelsAttendus(1.8, 430, 20, 1080)).toBeCloseTo(86.3, 1)
    expect(pixelsAttendus(0.26, 430, 20, 1080)).toBeCloseTo(12.5, 1)
    expect(pixelsAttendus(1.85, 155, 10, 1080)).toBeCloseTo(123, 0)
    expect(pixelsAttendus(1.85, 138, 12, 1080)).toBeCloseTo(166, 0)
  })

  it('en Bas, le tampon fait 810 px de haut en 1080p : la taille rendue est 0,75 fois celle de l\'écran', () => {
    expect(pixelsAttendus(1.8, 430, 20, 810) / pixelsAttendus(1.8, 430, 20, 1080)).toBeCloseTo(0.75, 9)
  })

  it('vu en plongée, un objet vertical paraît plus court de cos θ', () => {
    expect(pixelsAttendus(1.85, 155, 10, 1080, 15)).toBeCloseTo(pixelsAttendus(1.85, 155, 10, 1080) * Math.cos(Math.PI / 12), 9)
  })
})
