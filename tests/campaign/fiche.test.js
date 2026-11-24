import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { MISSIONS } from '../../src/campaign/missions/index.js'
import { portrait, PORTRAITS } from '../../src/campaign/portraits.js'
import * as fiche from '../../src/campaign/fiche.js'
import { afficherFiche, barrerCible, entreeDeFiche, titreDeFiche } from '../../src/campaign/fiche.js'
import { readSource, executer } from '../gfx/mainSource.js'

// Fiche des cibles dans le HUD (spec du lot 3, §2 e et tests 3a : « Fiche : nombre d'entrées = cibles nommées, aucun
// tiret cadratin » ; contrat avec le lot 4, §2 c : « chaque entrée de la fiche HUD est retrouvée par cibleId ; le
// portrait complet figure dans les données de mission, cité par une seule fonction portrait(nom), et un test vérifie
// que le fichier existe dans public/ » ; plan du lot 3a, tâche A7).
// - Données : chaque mission a sa fiche, une entrée par cible de son casting (cibleId : l'indice dans casting.cibles),
//   avec le nom, le rôle et le signe de son briefing, et son portrait (le nom de l'image du briefing ; null : aucune
//   photo, Kessler et le commanditaire). M3 et M4 ont un ordre de tir (Vosko puis Mira ; Verne, Halder, Rossi).
// - portrait(nom) : la seule fonction qui sait où est l'image et sous quel format ; chaque portrait existe dans public/.
// - Le DOM (src/campaign/fiche.js) : titre « DOSSIER 0n », une entrée par cible retrouvée par son cibleId, numérotée
//   quand la mission a un ordre de tir, barrée à la mort de la cible (sans animation en effets atténués).
//
// Témoin : sur les missions d'avant la tâche (commit fcb5151), M1 à M5 n'ont pas de fiche et celle de M6 n'a qu'un texte
// (vus rouges) ; le jeu les montre par tests/campaign/main.fiche.test.js, rouge sur le main.js d'avant la tâche. Les
// fonctions du module sont neuves : leurs témoins sont plus bas, des versions fautives de fiche.js exécutées sur les
// mêmes cas (ficheModifiee).

const ROOT = resolve(__dirname, '../..')
const DASH = String.fromCodePoint(0x2014)   // le tiret cadratin

// Ce que dit chaque briefing (docs/superpowers/maquettes/cinematiques/briefing-m<n>.html : NOM, RÔLE ou ACTIVITÉ,
// GRADE, SIGNE ; M4 : les signes de ses portraits, spec §3), cible par cible, dans l'ordre de casting.cibles.
const BRIEFINGS = {
  1: { ordre: false, entrees: [['MARKOV', 'TRAITE HUMAINE', 'COSTUME BLEU NUIT', 'gangster-man-01']] },
  2: { ordre: false, entrees: [['LUC SANCTECHAIR', 'L\'AÎNÉ', 'POLO BLANC', 'freres-a'], ['MARC SANCTECHAIR', 'LE CADET', 'POLO BEIGE', 'freres-b']] },
  3: { ordre: true, entrees: [['VOSKO', 'LE PASSEUR', 'COSTUME SOMBRE · CHEVEUX PLAQUÉS', 'passeur-cam'],
    ['MIRA', 'LA SECONDE', 'T-SHIRT CLAIR · CHIGNON', 'seconde-cam']] },
  4: { ordre: true, entrees: [['VERNE', 'COMMANDANT', 'TAILLEUR BLEU NUIT · CHIGNON', 'mafia-woman-02'],
    ['HALDER', 'CAPITAINE', 'CASQUE NOIR', 'mafia-henchman'], ['ROSSI', 'LIEUTENANT', 'CHEVEUX COURTS · CHEMISE BLANCHE', 'mafia-woman-01']] },
  5: { ordre: false, entrees: [['KESSLER', 'COLONEL', 'VÉHICULE 2 · PASSAGER', null]] },
  6: { ordre: false, entrees: [['???', 'COMMANDITAIRE', 'NE DANSE PAS · AU TÉLÉPHONE', null]] },
}

// La mission numero avec la fiche que dit son briefing (BRIEFINGS) : les témoins et le DOM ne dépendent pas des données.
function avecFiche(numero) {
  const b = BRIEFINGS[numero]
  return { ...MISSIONS[numero - 1], fiche: { ordre: b.ordre,
    entrees: b.entrees.map(([nom, role, signe, portrait], cibleId) => ({ cibleId, nom, role, signe, portrait })) } }
}

// Ce qui ne va pas dans la fiche d'une mission (vide : conforme).
function defautsDeFiche(m) {
  const out = []
  const f = m.fiche
  if (!f || typeof f !== 'object') return ['pas de fiche']
  if (typeof f.ordre !== 'boolean') out.push('ordre : ni vrai ni faux')
  if (!Array.isArray(f.entrees)) return [...out, 'pas d\'entrées']
  const ids = f.entrees.map(e => e && e.cibleId)
  const attendus = m.casting.cibles.map((_, i) => i)
  if (JSON.stringify([...ids].sort((a, b) => a - b)) !== JSON.stringify(attendus)) {
    out.push(`cibleId ${JSON.stringify(ids)} au lieu d'une entrée par cible ${JSON.stringify(attendus)}`)
  }
  const texte = v => typeof v === 'string' && v.trim().length > 0
  f.entrees.forEach((e, i) => {
    for (const k of ['nom', 'role', 'signe']) if (!texte(e[k])) out.push(`entrée ${i} : ${k} vide`)
    for (const k of ['nom', 'role', 'signe']) if (texte(e[k]) && e[k].includes(DASH)) out.push(`entrée ${i} : tiret cadratin dans ${k}`)
    if (e.portrait !== null && !PORTRAITS.includes(e.portrait)) out.push(`entrée ${i} : portrait inconnu ${e.portrait}`)
  })
  return out
}

describe('données : une fiche par mission, une entrée par cible, retrouvée par cibleId', () => {
  for (const m of MISSIONS) {
    it(`M${m.numero} : ${m.casting.cibles.length} entrée(s), du nom, du rôle et du signe de son briefing`, () => {
      expect(defautsDeFiche(m)).toEqual([])
      const b = BRIEFINGS[m.numero]
      expect(m.fiche.ordre, 'ordre de tir').toBe(b.ordre)
      expect(m.fiche.entrees.map(e => [e.nom, e.role, e.signe, e.portrait])).toEqual(b.entrees)
      expect(m.fiche.entrees.map(e => e.cibleId)).toEqual(b.entrees.map((_, i) => i))
    })
  }

  it.each([
    ['une fiche absente (M1 à M5 avant la tâche)', m => ({ ...m, fiche: null }), 'pas de fiche'],
    ['la fiche d\'avant la tâche (M6 : un texte, aucune entrée)', m => ({ ...m, fiche: { texte: 'Aucune photo.' } }), 'ordre : ni vrai ni faux'],
    ['une cible sans entrée', m => ({ ...m, fiche: { ...m.fiche, entrees: m.fiche.entrees.slice(1) } }), /^cibleId /],
    ['deux entrées pour la même cible', m => ({ ...m, fiche: { ...m.fiche, entrees: m.fiche.entrees.map(e => ({ ...e, cibleId: 0 })) } }), /^cibleId /],
    ['un signe vide', m => ({ ...m, fiche: { ...m.fiche, entrees: [{ ...m.fiche.entrees[0], signe: ' ' }, ...m.fiche.entrees.slice(1)] } }), 'entrée 0 : signe vide'],
    ['un tiret cadratin', m => ({ ...m, fiche: { ...m.fiche, entrees: [{ ...m.fiche.entrees[0], signe: `POLO ${DASH} BLANC` }, ...m.fiche.entrees.slice(1)] } }), 'entrée 0 : tiret cadratin dans signe'],
    ['un portrait que portrait() ne connaît pas', m => ({ ...m, fiche: { ...m.fiche, entrees: [{ ...m.fiche.entrees[0], portrait: 'freres-c' }, ...m.fiche.entrees.slice(1)] } }), 'entrée 0 : portrait inconnu freres-c'],
  ])('témoin : %s : relevé', (_, fausse, attendu) => {
    const defauts = defautsDeFiche(fausse(avecFiche(2)))
    if (attendu instanceof RegExp) expect(defauts.some(d => attendu.test(d)), JSON.stringify(defauts)).toBe(true)
    else expect(defauts).toContain(attendu)
  })
})

describe('portrait(nom) : la seule fonction qui sait où est l\'image d\'un portrait', () => {
  const surDisque = url => join(ROOT, 'public', url.slice(import.meta.env.BASE_URL.length))

  it('chaque portrait existe dans public/, sous briefing/img/', () => {
    expect(PORTRAITS.length).toBeGreaterThanOrEqual(8)
    for (const nom of PORTRAITS) {
      const url = portrait(nom)
      expect(url.startsWith(`${import.meta.env.BASE_URL}briefing/img/portrait-${nom}.`), url).toBe(true)
      expect(existsSync(surDisque(url)), url).toBe(true)
    }
  })

  it('chaque portrait cité par une fiche existe dans public/ (le complet, pas la vignette -lo)', () => {
    const cites = MISSIONS.flatMap(m => m.fiche.entrees.map(e => e.portrait)).filter(Boolean)
    expect(cites).toHaveLength(8)
    for (const nom of cites) {
      expect(nom.endsWith('-lo'), nom).toBe(false)
      expect(existsSync(surDisque(portrait(nom))), nom).toBe(true)
    }
  })

  // Les portraits de M3 sont des JPEG dans public/ (port-maquette.mjs y réécrit les .png des maquettes) : une adresse
  // faite du seul nom, en .png comme dans la maquette, mènerait à un fichier absent.
  it('témoin : le portrait de Vosko en .png, comme le cite sa maquette, n\'existe pas dans public/', () => {
    expect(existsSync(join(ROOT, 'public', 'briefing', 'img', 'portrait-passeur-cam.png'))).toBe(false)
    expect(portrait('passeur-cam').endsWith('.jpg')).toBe(true)
  })

  it('un nom inconnu est une erreur qui le nomme', () => {
    expect(() => portrait('freres-c')).toThrow(/freres-c/)
    expect(() => portrait(null)).toThrow()
  })
})

// Le DOM de la fiche, sur un élément neuf, avec les vraies missions.
const neuf = () => document.createElement('div')
const entrees = el => [...el.querySelectorAll('[data-cible-id]')]
const textes = (el, sel) => [...el.querySelectorAll(sel)].map(n => n.textContent)

// Une version fautive de fiche.js, pour les témoins : son source, un passage remplacé, exécuté tel quel par executer
// (tests/gfx/mainSource.js) avec le vrai portrait(). Le passage doit y être une fois : sinon le témoin ne témoignerait
// de rien. La copie sans rien remplacer se comporte comme le module (vérifié plus bas) : ce qui rougit un témoin, c'est
// le passage remplacé.
const FICHE_SRC = readSource(resolve(ROOT, 'src/campaign/fiche.js'))
function ficheModifiee(avant, apres) {
  expect(FICHE_SRC.split(avant), `« ${avant} » absent de fiche.js, ou plusieurs fois : témoin impossible`).toHaveLength(2)
  const source = FICHE_SRC.replace(avant, () => apres).replace(/^export /gm, '')
  return executer(['titreDeFiche', 'div', 'afficherFiche', 'entreeDeFiche', 'barrerCible'], { portrait }, source).fns
}
// Les passages remplacés : la fiche vidée à chaque départ (afficherFiche), l'entrée d'une cible (entreeDeFiche).
const VIDER = 'el.replaceChildren(div(doc, \'fiche-titre\', titreDeFiche(mission)))'
const PAR_CIBLE_ID = 'return el.querySelector(`.fiche-entree[data-cible-id="${Number(cibleId)}"]`)'

// M4 relancée après la mort de Halder, puis M2 : ce que montre la fiche du module f (le vrai, ou une version fautive).
function relancee(f) {
  const el = neuf()
  f.afficherFiche(el, avecFiche(4))
  f.barrerCible(el, 1)
  f.afficherFiche(el, avecFiche(4))
  const relance = { entrees: entrees(el).length, barrees: el.querySelectorAll('.abattue').length }
  f.afficherFiche(el, avecFiche(2))
  return { relance, suivante: entrees(el).map(e => e.dataset.cibleId) }
}
const VIERGE = { relance: { entrees: 3, barrees: 0 }, suivante: ['0', '1'] }

// Une fiche dont l'ordre n'est pas celui du casting (M3 inversée : la cible 0, Vosko, est la deuxième entrée) : ce que
// rend entreeDeFiche du module f pour les cibles 0, 1 et 7, puis le nom barré pour la cible 0.
const M3 = avecFiche(3)
const INVERSEE = { ...M3, fiche: { ...M3.fiche, entrees: [...M3.fiche.entrees].reverse() } }
function retrouvees(f) {
  const el = neuf()
  f.afficherFiche(el, INVERSEE)
  const nomDe = e => (e ? e.querySelector('.fiche-nom-texte').textContent : null)
  const trouvees = [0, 1, 7].map(id => nomDe(f.entreeDeFiche(el, id)))
  f.barrerCible(el, 0)
  return { trouvees, barrees: [...el.querySelectorAll('.abattue')].map(nomDe) }
}
const RETROUVEES = { trouvees: ['VOSKO', 'MIRA', null], barrees: ['VOSKO'] }

describe('afficherFiche : titre « DOSSIER 0n », une entrée par cible, dans l\'ordre de la fiche', () => {
  for (const numero of [1, 2, 3, 4, 5, 6]) {
    it(`M${numero}`, () => {
      const m = avecFiche(numero)
      const el = neuf()
      afficherFiche(el, m)
      expect(el.style.display).toBe('block')
      expect(titreDeFiche(m)).toBe(`DOSSIER 0${m.numero}`)
      expect(textes(el, '.fiche-titre')).toEqual([`DOSSIER 0${m.numero}`])
      expect(entrees(el).map(e => +e.dataset.cibleId)).toEqual(m.fiche.entrees.map(e => e.cibleId))
      expect(textes(el, '.fiche-nom-texte')).toEqual(m.fiche.entrees.map(e => e.nom))
      expect(textes(el, '.fiche-role')).toEqual(m.fiche.entrees.map(e => e.role))
      // Le signe, un élément par ligne (« TAILLEUR BLEU NUIT », puis « CHIGNON »), comme le briefing de M3 les liste : un
      // « · » ne finit ni ne commence jamais une ligne
      expect(entrees(el).map(e => textes(e, '.fiche-signe'))).toEqual(m.fiche.entrees.map(e => e.signe.split(' · ')))
      expect(textes(el, '.fiche-signe').every(t => !t.includes('·'))).toBe(true)
      expect(textes(el, '.fiche-ordre')).toEqual(m.fiche.ordre ? m.fiche.entrees.map((_, i) => String(i + 1)) : [])
      // Le portrait complet (portrait(nom)), sinon une photo absente marquée « ? »
      entrees(el).forEach((e, i) => {
        const nom = m.fiche.entrees[i].portrait
        const img = e.querySelector('img')
        if (nom) expect(img && img.getAttribute('src')).toBe(portrait(nom))
        else {
          expect(img).toBeNull()
          expect(e.querySelector('.fiche-sans-photo').textContent).toBe('?')
        }
      })
      expect(el.textContent.includes(DASH)).toBe(false)
    })
  }

  it('une mission relancée, ou la suivante : la fiche repart vierge (ni entrée en double, ni ligne barrée)', () => {
    expect(relancee(fiche)).toEqual(VIERGE)
  })

  // Témoin : fiche.js qui ajoute la fiche sans vider l'élément garde la mission d'avant, et sa ligne barrée.
  it('témoin : fiche.js sans vider l\'élément, la fiche relancée garde l\'ancienne', () => {
    const f = ficheModifiee(VIDER, VIDER.replace('el.replaceChildren(', 'el.append('))
    expect(relancee(f)).toEqual({
      relance: { entrees: 6, barrees: 1 },
      suivante: ['0', '1', '2', '0', '1', '2', '0', '1'],
    })
  })
})

describe('barrerCible et entreeDeFiche : l\'entrée retrouvée par cibleId, pas par sa place', () => {
  it('sur une fiche à l\'ordre inverse du casting : Vosko pour la cible 0, Mira pour la 1, rien pour la 7', () => {
    expect(retrouvees(fiche)).toEqual(RETROUVEES)
  })

  it('entreeDeFiche : l\'élément de chaque cible ; null pour une cible sans entrée', () => {
    const el = neuf()
    afficherFiche(el, INVERSEE)
    expect(entreeDeFiche(el, 0)).toBe(entrees(el)[1])
    expect(entreeDeFiche(el, 1)).toBe(entrees(el)[0])
    expect(entreeDeFiche(el, 0).querySelector('.fiche-nom-texte').textContent).toBe('VOSKO')
    expect(entreeDeFiche(el, 7)).toBeNull()
  })

  it('barrerCible : l\'entrée de cette cible barrée, les autres non ; rend l\'entrée', () => {
    const el = neuf()
    afficherFiche(el, INVERSEE)
    const e = barrerCible(el, 0)
    expect(e).toBe(entrees(el)[1])
    expect(entrees(el).map(x => x.classList.contains('abattue'))).toEqual([false, true])
    expect(barrerCible(el, 7)).toBeNull()
  })

  it('barrée d\'un trait animé, ou d\'un coup en effets atténués (anime: false)', () => {
    const el = neuf()
    afficherFiche(el, avecFiche(4))
    expect(barrerCible(el, 0).classList.contains('instantanee')).toBe(false)
    expect(barrerCible(el, 1, { anime: false }).classList.contains('instantanee')).toBe(true)
  })

  // Témoin : fiche.js qui cherche l'entrée par sa place dans la fiche, et non par son cibleId, barre Mira pour Vosko.
  it('témoin : fiche.js qui cherche l\'entrée par sa place, Mira barrée pour Vosko', () => {
    const f = ficheModifiee(PAR_CIBLE_ID, 'return el.querySelectorAll(\'.fiche-entree\')[cibleId] ?? null')
    expect(retrouvees(f)).toEqual({ trouvees: ['MIRA', 'VOSKO', null], barrees: ['MIRA'] })
  })
})

describe('les témoins exécutent fiche.js', () => {
  it('la copie sans rien remplacer se comporte comme le module', () => {
    expect(relancee(ficheModifiee(VIDER, VIDER))).toEqual(VIERGE)
    expect(retrouvees(ficheModifiee(PAR_CIBLE_ID, PAR_CIBLE_ID))).toEqual(RETROUVEES)
  })

  it('un passage absent de fiche.js : le témoin est refusé', () => {
    expect(() => ficheModifiee('el.innerHTML = \'\'', '')).toThrow(/absent de fiche\.js/)
  })
})
