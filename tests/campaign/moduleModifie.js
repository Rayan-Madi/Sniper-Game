// Témoins rejoués dans les tests (pratique de la relecture de A7) : une copie d'un module pur de src/, modifiée par un
// remplacement exact, exécutée telle quelle. Ses imports sont retirés et remplacés par `deps` (les vrais modules, passés
// par le test) ; ses exports deviennent les champs de l'objet rendu. Le remplacement doit trouver son texte une fois
// exactement : sinon le témoin serait impossible, et le test le dit.
import { resolve } from 'node:path'
import { readSource } from '../gfx/mainSource.js'

export function moduleModifie(fichier, [avant, apres], deps = {}) {
  const src = readSource(resolve(__dirname, '../..', fichier))
  const n = src.split(avant).length - 1
  if (n !== 1) throw new Error(`${fichier} : « ${avant} » trouvé ${n} fois : témoin impossible`)
  const noms = [...src.matchAll(/^export (?:function|const|let) (\w+)/gm)].map(m => m[1])
  const corps = src.replace(avant, () => apres).replace(/^import [^\n]*$/gm, '').replace(/^export (function|const|let) /gm, '$1 ')
  return new Function(...Object.keys(deps), `'use strict'\n${corps}\nreturn { ${noms.join(', ')} }`)(...Object.values(deps))
}
