// ─── Sonde de lisibilité : ce que la porte de décision 3.0 capture et ce qu'elle décide ──────────────────────────
// Spec du lot 3, §1 « 3.0 », §3 et §4 ; plan du lot 3a, tâche S0. scripts/capture-mission.mjs (cible sonde) ouvre un
// Chrome par capture sur la route de développement ?sonde=1 (main.js, src/gfx/sondeScene.js), relève les mesures de la
// page, puis applique ici le critère par défaut de la spec §4 : silhouette d'au moins 80 px et signe d'identification
// d'au moins 10 px, en Bas (pixels réellement rendus), au zoom maximum de base de la mission ; sinon M4 passe au repli.
// Pur, sans Chrome ni fichier : tests/scripts/sonde.test.js.

// Les postes mesurés. Les cibles restent sur la zone d'apparition actuelle de chaque carte (spec §1 : « les modèles
// imposés posés sur la zone actuelle ») ; seul l'œil recule. regard : le point visé, au milieu du groupe, à hauteur de
// buste (1 m au-dessus du sol de la zone). modeles : les fichiers imposés par la spec §3, noms : qui ils jouent (de
// gauche à droite vu du poste). signe : ce qui identifie la cible et que le critère compte (spec §2, critères de
// lisibilité de 3c et 3d). zoomMaxBase : le zoom maximum de base de la mission (spec §3), où le critère se juge.
export const POSTES_SONDE = [
  // M3, le port : œil dans la cabine de la grue G3 (spec §3), Vosko et Mira au centre de la zone (dalle du quai, dessus à
  // 0,345 m), à deux pas : 154,3 m (« centre 154,3 »), plongée de 14,9°. Nuit : le soleil de la carte. Brume
  // exponentielle de densité 0,0035, plans à 0,5 et 600 m. Signe : le buste (costume sombre contre t-shirt clair), le
  // chignon de Mira étant trop petit à 155 m (8 px à ×10, spec, rapport M3).
  {
    nom: '155m', mission: 3, distance: 155, carte: 3, poste: [-28, 41, 146], regard: [0, 1.345, -0.5],
    near: 0.5, far: 600, brume: { type: 'exp2', densite: 0.0035 }, soleil: null,
    modeles: ['gangster_man_01', 'mafia_woman_03'], noms: ['Vosko', 'Mira'], ecart: 1.4, signe: 'torse', zoomMaxBase: 10,
  },
  // M5, le convoi : sur la crête, 20 m au-dessus de la route (18 à 22 m, spec §3), Kessler debout sur la route actuelle,
  // à 138 m, plongée d'environ 8°. L'œil est décalé de 30 m le long de la route : dans l'axe, l'ancien promontoire du
  // tireur (6,4 m de haut, 30 m devant la route) cacherait Kessler ; la visée reste à 78° de la route (81 à 104° dans
  // le virage, rapport M5). Couchant derrière le tireur, à sa gauche, 13° au-dessus de l'horizon (spec §3 : « couchant
  // derrière à gauche » ; §2 3d : 12 à 15°). Brume exponentielle de densité 0,0016, plans à 0,5 et 1 000 m. Signe : la
  // tête, qui portera la casquette d'officier.
  {
    nom: '138m', mission: 5, distance: 138, carte: 5, poste: [30, 20.2, 129.36], regard: [0, 1.2, -4],
    near: 0.5, far: 1000, brume: { type: 'exp2', densite: 0.0016 }, soleil: [-30, 23, 95],
    modeles: ['mafia_boss'], noms: ['Kessler'], ecart: 1.4, signe: 'tete', zoomMaxBase: 12,
  },
  // M4, la base : passerelle du château d'eau (œil à 37,5 m), Verne, Halder et Rossi au centre du dépôt (l'origine) :
  // 430 m, plongée de 4,9°. Midi, soleil vers (4, 60, 2). Brume linéaire de 150 à 1 600 m, plans à 1 et 1 700 m. 5 m
  // entre eux : le groupe resserré du rapport M4 (4 à 10 m), hors des piliers de l'ancienne tour de garde, encore sur la
  // ligne de visée tant que 3c n'a pas refait la carte. Signe : la tête (casque de Halder, chignon de Verne).
  {
    nom: '430m', mission: 4, distance: 430, carte: 4, poste: [0, 37.5, 428.5], regard: [0, 1.2, 0],
    near: 1, far: 1700, brume: { type: 'lin', debut: 150, fin: 1600 }, soleil: [4, 60, 2],
    modeles: ['mafia_woman_02', 'mafia_henchman', 'mafia_woman_01'], noms: ['Verne', 'Halder', 'Rossi'], ecart: 5,
    signe: 'tete', zoomMaxBase: 20,
  },
  // Repli de M4 (décisions de Rayan, REPRISE.md : 120 à 250 m si 430 m est illisible) : le haut de la fourchette, le
  // plus proche du briefing, même château d'eau, même profil, même zoom maximum de base. Il dit si le repli tient.
  // 2,5 m entre eux : à ×20, le carré de la lunette ne couvre que 5 m de part et d'autre du point visé à 250 m, et les
  // piliers de l'ancienne tour passent à 3,7 à 4,2 m.
  {
    nom: '250m', mission: 4, distance: 250, carte: 4, poste: [0, 37.5, 247.35], regard: [0, 1.2, 0],
    near: 1, far: 1700, brume: { type: 'lin', debut: 150, fin: 1600 }, soleil: [4, 60, 2],
    modeles: ['mafia_woman_02', 'mafia_henchman', 'mafia_woman_01'], noms: ['Verne', 'Halder', 'Rossi'], ecart: 2.5,
    signe: 'tete', zoomMaxBase: 20,
  },
]

export const ZOOMS_SONDE = [8, 12, 20]
export const QUALITES_SONDE = ['moyen', 'bas']
export const SEUILS = { silhouette: 80, signe: 10 }   // spec §4 : pixels rendus, en Bas

// Une capture par poste, zoom (ceux de la spec, plus le zoom maximum de base de la mission) et qualité.
export function jobsSonde(postes = POSTES_SONDE, { zooms = ZOOMS_SONDE, qualites = QUALITES_SONDE } = {}) {
  const jobs = []
  for (const p of postes) {
    for (const zoom of [...new Set([...zooms, p.zoomMaxBase])].sort((a, b) => a - b)) {
      for (const qualite of qualites) jobs.push({ ...p, zoom, qualite, fichier: `sonde-${p.nom}-x${zoom}-${qualite}.jpg` })
    }
  }
  return jobs
}

// Adresse (sans le « ? ») que la route ?sonde=1 relit (lireSonde, src/gfx/sonde.js).
export function urlSonde(job) {
  const p = [['sonde', '1'], ['poste', job.poste.join(',')], ['regard', job.regard.join(',')]]
  if (job.near) p.push(['near', job.near])
  if (job.far) p.push(['far', job.far])
  if (job.brume) p.push(['brume', job.brume.type === 'lin' ? `lin:${job.brume.debut}:${job.brume.fin}` : `exp2:${job.brume.densite}`])
  if (job.soleil) p.push(['soleil', job.soleil.join(',')])
  p.push(['zoom', job.zoom], ['qualite', job.qualite], ['modele', job.modeles.join(',')], ['ecart', job.ecart], ['carte', job.carte])
  return p.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2C/g, ',').replace(/%3A/g, ':')}`).join('&')
}

// Taille du signe d'un personnage (pixels rendus) : la hauteur de la tête, ou la largeur du buste (bras compris, comme
// le rapport M3 compte le torse : « Torse (largeur) »).
const tailleDuSigne = (p, signe) => (signe === 'tete' ? (p.tete ? p.tete.hauteur : 0) : (p.torse ? p.torse.largeur : 0))

// Critère par défaut (spec §4) sur un poste : le relevé de sa qualité (Bas) à son zoom maximum de base, le plus petit
// personnage décidant de la silhouette comme du signe. null sans ce relevé. releves : [{ nom, zoom, qualite,
// personnages: [{ nom, silhouette, tete, torse }] }], tels que capture-mission.mjs les écrit.
export function verdictPoste(poste, releves, { qualite = 'bas', seuils = SEUILS } = {}) {
  const r = releves.find(x => x.nom === poste.nom && x.zoom === poste.zoomMaxBase && x.qualite === qualite)
  if (!r || !r.personnages || !r.personnages.length) return null
  const plusPetit = f => r.personnages.map(p => ({ px: f(p), nom: p.nom })).reduce((a, b) => (b.px < a.px ? b : a))
  const silhouette = plusPetit(p => (p.silhouette ? p.silhouette.hauteur : 0))
  const signePx = plusPetit(p => tailleDuSigne(p, poste.signe))
  return {
    nom: poste.nom, mission: poste.mission, distance: poste.distance, zoom: poste.zoomMaxBase, qualite, signe: poste.signe,
    silhouette, signePx, tient: silhouette.px >= seuils.silhouette && signePx.px >= seuils.signe,
  }
}

const SIGNES = { tete: 'tête', torse: 'buste' }
const px = v => `${String(Math.round(v * 10) / 10).replace('.', ',')} px`

// Décision de la porte 3.0 pour M4, sur le verdict de son poste à 430 m.
export function decisionM4(verdict) {
  if (!verdict) return null
  const detail = `silhouette ${px(verdict.silhouette.px)} (${verdict.silhouette.nom}), ${SIGNES[verdict.signe]} ${px(verdict.signePx.px)} (${verdict.signePx.nom}), en Bas à ×${verdict.zoom}`
  return verdict.tient
    ? { garde: true, texte: `M4 garde 430 m : ${detail}.` }
    : { garde: false, texte: `M4 passe au repli de 120 à 250 m : à 430 m, ${detail}, sous le critère (80 et 10 px).` }
}

// Distance (m) où le critère tiendrait encore au même zoom : la taille à l'écran suit 1 / distance, et c'est la plus
// petite des deux marges (silhouette, signe) qui s'annule la première.
export function distanceLimite(verdict, seuils = SEUILS) {
  return verdict.distance * Math.min(verdict.silhouette.px / seuils.silhouette, verdict.signePx.px / seuils.signe)
}

// Carré de la capture : celui qui contient le cercle de la lunette, centré (drawScope, src/scope.js : rayon de 0,38 fois
// le plus petit côté, vignette ouverte à 1,02 fois ce rayon). Pixels de l'écran.
export function carreLunette(largeur, hauteur) {
  const cote = 2 * Math.ceil(0.38 * 1.02 * Math.min(largeur, hauteur))
  return { x: Math.round((largeur - cote) / 2), y: Math.round((hauteur - cote) / 2), width: cote, height: cote }
}

const QUALITES = { moyen: 'Moyen', bas: 'Bas', haut: 'Haut', auto: 'Auto' }

// Tableau Markdown des mesures d'un poste : une ligne par zoom et qualité, silhouette, tête et buste (largeur) de
// chaque personnage, en pixels rendus.
export function tableauMesures(poste, releves) {
  const lignes = [`| Zoom | Qualité | ${poste.noms.map(n => `${n} : silhouette, tête, buste`).join(' | ')} |`,
    `|---|---|${poste.noms.map(() => '---').join('|')}|`]
  for (const r of releves.filter(x => x.nom === poste.nom)) {
    const cellules = r.personnages.map(p => [p.silhouette && p.silhouette.hauteur, p.tete && p.tete.hauteur, p.torse && p.torse.largeur]
      .map(v => (v == null ? 'n/a' : String(v).replace('.', ','))).join(', '))
    lignes.push(`| ×${r.zoom} | ${QUALITES[r.qualite] || r.qualite} | ${cellules.join(' | ')} |`)
  }
  return lignes.join('\n') + '\n'
}

// Rapports extrêmes, sur tous les relevés, de la silhouette mesurée à la silhouette calculée (attendu.silhouette :
// pixelsAttendus de src/gfx/sonde.js, avec la hauteur d'ajustement du modèle et la plongée). null sans relevé.
export function ecartAuCalcul(releves) {
  const r = releves.flatMap(x => x.personnages)
    .filter(p => p.silhouette && p.attendu && p.attendu.silhouette > 0)
    .map(p => p.silhouette.hauteur / p.attendu.silhouette)
  return r.length ? { min: Math.min(...r), max: Math.max(...r) } : null
}

// Annexe où capture-mission.mjs recopie le relevé et les captures d'une passe (ANNEXE_SONDE) : nom, ou null pour
// aucune. echecs : nombre de captures en échec dans la passe. Une passe incomplète (une capture refusée à chaque essai
// pour rendu interrompu, par exemple : scripts/garde-rendu.mjs) n'en écrit aucune : le relevé versionné y perdrait des
// mesures, voire le verdict d'un poste et la décision pour M4, et les images de la passe d'avant resteraient à côté
// d'un relevé qui ne les cite plus.
export function annexeSonde(nom, echecs) {
  return nom && !echecs ? nom : null
}

// Tableau Markdown des verdicts : une ligne par poste.
export function tableauVerdicts(verdicts) {
  const lignes = ['| Mission | Distance | Zoom maximum de base | Silhouette, en Bas | Signe, en Bas | Critère |',
    '|---|---|---|---|---|---|']
  for (const v of verdicts) {
    lignes.push(`| M${v.mission} | ${v.distance} m | ×${v.zoom} | ${px(v.silhouette.px)} (${v.silhouette.nom}) | ` +
      `${SIGNES[v.signe]} : ${px(v.signePx.px)} (${v.signePx.nom}) | ${v.tient ? 'tient' : 'ne tient pas'} |`)
  }
  return lignes.join('\n') + '\n'
}
