import { SON } from './tuning.js'

// Ce qu'on entend quand la balle arrive (spec du lot 2, §3.5). Module pur : main.js le demande à la résolution du tir,
// src/audio.js le joue (playShotSounds).
//
// Le départ n'y est pas : il se joue au clic (playShot, playSilencedShot), et part de lui-même vers l'écho de la carte.
// L'écho, lui, est celui de la mission (une ConvolverNode montée avec sa carte, src/shot/acoustics.js) : le calendrier
// dit seulement quel son y est envoyé.

// Calendrier des sons de l'arrivée d'une balle, en secondes depuis la résolution : [{ son, at, echo }].
// distance (m) : du tireur au point d'impact ; surface : la matière du décor touché ('metal', 'pierre', 'bois',
// 'sol') ; part : la zone du PNJ touché ('tete', 'torse', 'membre'), qui l'emporte (la chair). Le son revient du point
// d'impact : il arrive distance / 343 s plus tard ; au-delà de SON.echoImpactM, il part aussi vers l'écho. C'est lui
// qui confirme une touche, plus de bip. Rien sur le rayon (la balle part au loin, ni surface ni part) : rien à entendre.
export function planShotSounds({ distance, surface = null, part = null }) {
  const matiere = part ? 'chair' : surface
  if (!matiere) return []
  return [{ son: `impact-${matiere}`, at: distance / SON.vitesse, echo: distance >= SON.echoImpactM }]
}
