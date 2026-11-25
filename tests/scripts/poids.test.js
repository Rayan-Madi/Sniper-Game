import { describe, it, expect } from 'vitest'
import { sommePoids, choisirMorceaux, SEUIL } from '../../scripts/poids.mjs'
import { SCENES } from '../../scripts/port-maquette.mjs'

// Budget de la spec des cinématiques (§8) : images de public/briefing/img plus morceaux des scènes (et de l'enquête
// selon la décision D1 des cinématiques v2) au plus 1 500 000 octets. Partie pure de scripts/poids.mjs, reprise par
// la tâche E0 du lot 5 : options (--check, --avec-enquete) et seuil gelés.

const IDS = Object.keys(SCENES)
// Noms d'un vrai build (vite 8.1, 28 octobre 2026, main 3cd328d) : [nom]-[empreinte de 8 caractères].js
const BUILD = ['index-BeKb6yH0.js', 'm1-Cr_wHj27.js', 'm2-By00QjWS.js', 'm3-CrX0SG_o.js', 'm4-b7wmN0JH.js', 'm5-kzM9nynY.js',
  'm6-Z3srbubh.js', 'epilogue-UyIUbI2i.js', 'prologue-a-B3JsXEnr.js', 'prologue-b-CwhPBXrR.js', 'investigation-CrEHPsYC.js']
const SCENES_DU_BUILD = ['m1-Cr_wHj27.js', 'm2-By00QjWS.js', 'm3-CrX0SG_o.js', 'm4-b7wmN0JH.js', 'm5-kzM9nynY.js', 'm6-Z3srbubh.js',
  'epilogue-UyIUbI2i.js', 'prologue-a-B3JsXEnr.js', 'prologue-b-CwhPBXrR.js']

describe('sommePoids', () => {
  it('additionne les fichiers, en tout et par groupe, et donne la marge sous le seuil', () => {
    const r = sommePoids([
      { nom: 'public/briefing/img/a.webp', octets: 1000, groupe: 'images' },
      { nom: 'dist/assets/m1-Cr_wHj27.js', octets: 200, groupe: 'scenes' },
      { nom: 'public/briefing/img/b.jpg', octets: 30, groupe: 'images' },
      { nom: 'dist/assets/investigation-CrEHPsYC.js', octets: 7, groupe: 'enquete' },
    ], { seuil: 2000 })
    expect(r).toEqual({ total: 1237, seuil: 2000, marge: 763, ok: true, parGroupe: { images: 1030, scenes: 200, enquete: 7 } })
  })

  it('le seuil est permis ; un octet de plus est un échec', () => {
    const fichiers = dernier => [{ nom: 'a', octets: 1000000, groupe: 'images' }, { nom: 'b', octets: dernier, groupe: 'scenes' }]
    expect(sommePoids(fichiers(500000), { seuil: 1500000 })).toMatchObject({ total: 1500000, marge: 0, ok: true })
    expect(sommePoids(fichiers(500001), { seuil: 1500000 })).toMatchObject({ total: 1500001, marge: -1, ok: false })
  })

  it('seuil par défaut : 1 500 000 octets (spec des cinématiques §8)', () => {
    expect(SEUIL).toBe(1500000)
    expect(sommePoids([{ nom: 'a', octets: 1500000, groupe: 'images' }]).ok).toBe(true)
    expect(sommePoids([{ nom: 'a', octets: 1500001, groupe: 'images' }])).toMatchObject({ seuil: 1500000, ok: false })
  })
})

describe('choisirMorceaux', () => {
  it('garde le morceau de chaque scène, ni l\'enquête ni le reste du jeu', () => {
    expect(choisirMorceaux(BUILD, { ids: IDS })).toEqual(SCENES_DU_BUILD.map(nom => ({ nom, groupe: 'scenes' })))
  })

  it('ajoute le morceau de l\'enquête avec avecEnquete', () => {
    expect(choisirMorceaux(BUILD, { ids: IDS, avecEnquete: true })).toEqual([
      ...SCENES_DU_BUILD.map(nom => ({ nom, groupe: 'scenes' })), { nom: 'investigation-CrEHPsYC.js', groupe: 'enquete' },
    ])
  })

  it('compte la feuille de style qu\'un morceau aurait à son nom', () => {
    const avecCss = [...BUILD, 'investigation-Df8_k2Pq.css']
    expect(choisirMorceaux(avecCss, { ids: IDS, avecEnquete: true }).filter(f => f.groupe === 'enquete')).toEqual([
      { nom: 'investigation-CrEHPsYC.js', groupe: 'enquete' }, { nom: 'investigation-Df8_k2Pq.css', groupe: 'enquete' },
    ])
  })

  // Une carte du lot 3 (src/maps/m1-rue.js) chargée à la demande donnerait un morceau m1-rue-<empreinte>.js.
  it('ne prend pas pour une scène un morceau dont le nom la prolonge', () => {
    const voisins = [...BUILD, 'm1-rue-Dx3kP9aQ.js', 'prologue-a-bis-0aZ_9-Yx.js', 'prologue-Q1w2E3r4.js']
    expect(choisirMorceaux(voisins, { ids: IDS })).toEqual(SCENES_DU_BUILD.map(nom => ({ nom, groupe: 'scenes' })))
  })

  it('échoue, en nommant la scène, si son morceau manque ou se trouve en double (jamais une somme fausse en silence)', () => {
    expect(() => choisirMorceaux(BUILD.filter(n => n !== 'm3-CrX0SG_o.js'), { ids: IDS })).toThrow(/m3/)
    expect(() => choisirMorceaux([...BUILD, 'm3-AAAAAAAA.js'], { ids: IDS })).toThrow(/m3/)
    expect(() => choisirMorceaux(BUILD.filter(n => !n.startsWith('investigation-')), { ids: IDS, avecEnquete: true })).toThrow(/investigation/)
    expect(() => choisirMorceaux(BUILD.filter(n => !n.startsWith('investigation-')), { ids: IDS })).not.toThrow()
  })
})
