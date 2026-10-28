// Cartes du jeu (spec du lot 3, §2 a ; plan du lot 3a, tâche A1 : découpage de l'ancien src/maps.js) : une carte par
// fichier, construite avec les primitives de prims.js, qui tient aussi la carte affichée ; le menu a son décor à lui
// (menu.js). Le reste du jeu passe par ici.
import { verifiable } from './prims.js'
import { buildMapStreet } from './m1-rue.js'
import { buildMapWarehouse } from './m2-place.js'
import { buildMapDocks } from './m3-port.js'
import { buildMapMilitary } from './m4-base.js'
import { buildMapConvoy } from './m5-convoi.js'
import { buildMapParty } from './m6-fete.js'
import { buildMenuDecor as decorDuMenu } from './menu.js'

export { solidMeshes, SOLID_TINTS, setSolidTint, updateMapAmbient, isMapObject, getObstacles, makeJeep } from './prims.js'

// Vide la scène de la carte courante (carte PvP, sol nu de la sonde de lisibilité).
export { clear as clearMap } from './prims.js'

// La carte de chaque mission, de M1 à M6 (mountLevel de main.js).
export const MAP_BUILDERS = [
  buildMapStreet,
  buildMapWarehouse,
  buildMapDocks,
  buildMapMilitary,
  buildMapConvoy,
  buildMapParty,
].map(verifiable)

// Le décor du menu, monté au démarrage, au retour d'une mission et au retour du PvP ; teinté lui aussi pendant la
// vérification des solides.
export const buildMenuDecor = verifiable(decorDuMenu)
