// Fiche des cibles dans le HUD (#target-dossier ; spec du lot 3, §2 e ; plan du lot 3a, tâche A7). Sans marqueur
// après le tutoriel (M1), le joueur reconnaît ses cibles aux signes de leur briefing : la fiche les lui rappelle, une
// entrée par cible (portrait, nom, rôle, signe), numérotée quand le briefing donne un ordre de tir (M3, M4), barrée à sa
// mort. Elle se tient en haut à gauche, dans la marge noire de la lunette jusqu'en 4:3 (index.html).
//
// Chaque entrée porte le cibleId de sa cible (l'indice dans casting.cibles de sa mission, que mountLevel donne au PNJ,
// npc.cibleId) : main.js la barre par lui, et le lot 4 (petite fiche, dossier de la kill-cam) la retrouve par lui
// (entreeDeFiche ; contrat de la spec, §2 c). DOM seulement, ni three ni état du jeu.
import { portrait } from './portraits.js'

// « DOSSIER 04 » : le numéro de la mission sur deux chiffres, comme les briefings et le mur du prologue.
export function titreDeFiche(mission) {
  return `DOSSIER ${String(mission.numero).padStart(2, '0')}`
}

function div(doc, classe, texte) {
  const n = doc.createElement('div')
  n.className = classe
  if (texte !== undefined) n.textContent = texte
  return n
}

// Remplit el (#target-dossier) avec la fiche de la mission et l'affiche ; ce qu'il montrait avant (la mission d'avant,
// des lignes barrées) disparaît.
export function afficherFiche(el, mission) {
  const doc = el.ownerDocument
  const { ordre, entrees } = mission.fiche
  el.replaceChildren(div(doc, 'fiche-titre', titreDeFiche(mission)))
  entrees.forEach((e, i) => {
    const entree = div(doc, 'fiche-entree')
    entree.dataset.cibleId = String(e.cibleId)

    // Le portrait complet, réduit ; sans photo (Kessler, le commanditaire), un cadre vide marqué « ? »
    const photo = div(doc, 'fiche-photo')
    if (e.portrait) {
      const img = doc.createElement('img')
      img.src = portrait(e.portrait)
      img.alt = ''   // le nom suit
      photo.append(img)
    } else {
      photo.classList.add('fiche-sans-photo')
      photo.textContent = '?'
    }

    const texte = div(doc, 'fiche-texte')
    const nom = div(doc, 'fiche-nom')
    if (ordre) nom.append(div(doc, 'fiche-ordre', String(i + 1)))
    nom.append(div(doc, 'fiche-nom-texte', e.nom))
    texte.append(nom, div(doc, 'fiche-role', e.role))
    // Le signe, un élément par ligne (« TAILLEUR BLEU NUIT · CHIGNON » : deux lignes), comme le briefing de M3 les
    // liste : dans la colonne étroite, un « · » coupé laissait une ligne commencer par lui
    for (const element of e.signe.split(' · ')) texte.append(div(doc, 'fiche-signe', element))
    entree.append(photo, texte)
    el.append(entree)
  })
  el.style.display = 'block'
}

// L'entrée de la cible cibleId, ou null si la fiche n'en a pas.
export function entreeDeFiche(el, cibleId) {
  return el.querySelector(`.fiche-entree[data-cible-id="${Number(cibleId)}"]`)
}

// La cible cibleId est morte : son entrée est barrée (un trait tiré en 220 ms ; d'un coup avec anime: false, en effets
// atténués). Rend l'entrée, ou null si la fiche n'en a pas.
export function barrerCible(el, cibleId, { anime = true } = {}) {
  const entree = entreeDeFiche(el, cibleId)
  if (!entree) return null
  entree.classList.toggle('instantanee', !anime)
  entree.classList.add('abattue')
  return entree
}
