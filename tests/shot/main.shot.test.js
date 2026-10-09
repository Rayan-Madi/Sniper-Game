import { describe, it, expect } from 'vitest'
import { MAIN_SRC, analyse, callsIn } from '../gfx/mainSource.js'

// Câblage du coup de feu dans main.js (spec du lot 2, §3.3 ; plan, tâche T3). Les pièces ont leurs tests (recoil,
// bolt, scopeShot, trail, audio) ; main.js ne s'importe pas sous jsdom, cette garde lit son source :
// - recul : le coup le déclenche après la capture du rayon (la balle part là où l'on visait), la boucle le fait
//   revenir, la caméra l'ajoute au regard du joueur (ses mouvements de souris s'ajoutent), chaque mission repart sans ;
// - culasse : le tir est refusé tant qu'elle n'est pas prête, sa durée suit la Vélocité, ses sons et sa jauge suivent
//   le temps de la mission ;
// - sillage : il part au tir, pour le temps de vol de la balle ; le trait d'impact (spawnTracer) n'existe plus.
//
// Témoin : au commit df6dd66, aucune de ces gardes ne tient (vu rouge avant le branchement).

const a = analyse(MAIN_SRC)
const texte = n => a.source.slice(n.start, n.end)
const appels = nom => (callsIn(a, nom) || []).map(c => c.callee)
const appel = (nom, callee) => (callsIn(a, nom) || []).find(c => c.callee === callee)
const texteAppel = (nom, callee) => { const c = appel(nom, callee); return c ? a.source.slice(c.start, c.end) : null }

describe('recul', () => {
  it('createRecoil vient de src/shot/recoil.js', () => {
    expect(a.imports.get('createRecoil')?.from).toBe('./shot/recoil.js')
  })

  it('le coup déclenche le recul, après la capture du rayon du tir', () => {
    const c = callsIn(a, 'shoot')
    const kick = c.findIndex(x => x.callee === 'recoil.kick')
    const rayon = c.findIndex(x => /\.setFromCamera$/.test(x.callee))
    expect(kick, 'shoot appelle recoil.kick()').toBeGreaterThan(-1)
    expect(rayon, 'shoot capture le rayon').toBeGreaterThan(-1)
    expect(kick).toBeGreaterThan(rayon)
  })

  it('la boucle fait revenir le recul avant de régler la caméra', () => {
    const c = appels('loop')
    expect(c).toContain('recoil.update')
    expect(c.indexOf('recoil.update')).toBeLessThan(c.indexOf('aimMissionCamera'))
  })

  // Première expression « new <callee>(…) » sous un nœud.
  function premierNew(racine, callee) {
    let found = null
    const walk = n => {
      if (!n || typeof n !== 'object' || found) return
      if (n.type === 'NewExpression' && texte(n.callee) === callee) { found = n; return }
      for (const k in n) if (k !== 'parent') { const v = n[k]; Array.isArray(v) ? v.forEach(walk) : walk(v) }
    }
    walk(racine)
    return found
  }

  it('la caméra ajoute le recul au regard du joueur, en tangage comme en lacet', () => {
    const euler = premierNew(a.fns.get('aimMissionCamera').body, 'THREE.Euler')
    expect(euler, 'new THREE.Euler(…) dans aimMissionCamera').toBeTruthy()
    const [tangage, lacet] = euler.arguments.map(texte)
    expect(tangage).toMatch(/^pitch\s*\+\s*\w*[rR]ecoil\w*\.pitch$/)
    expect(lacet).toMatch(/^yaw\s*\+\s*\w*[rR]ecoil\w*\.yaw$/)
  })

  it('chaque mission repart sans recul (montage)', () => {
    expect(appels('mountLevel')).toContain('recoil.reset')
  })
})

describe('culasse', () => {
  it('createBolt vient de src/shot/bolt.js', () => {
    expect(a.imports.get('createBolt')?.from).toBe('./shot/bolt.js')
  })

  it('le tir est refusé tant que la culasse n\'est pas prête', () => {
    const shoot = a.fns.get('shoot')
    const garde = shoot.body.body.find(n => n.type === 'IfStatement' && n.consequent.type === 'ReturnStatement')
    expect(garde, 'garde de shoot (if (…) return)').toBeDefined()
    expect(texte(garde.test)).toMatch(/!\s*bolt\.ready\(/)
  })

  it('le coup arme la culasse pour la durée de la Vélocité (getStats().boltS)', () => {
    const t = texteAppel('shoot', 'bolt.fire')
    expect(t, 'shoot appelle bolt.fire').toBeTruthy()
    expect(t).toMatch(/\.boltS\b/)
  })

  it('la boucle joue les sons de la culasse à leurs instants et nourrit la jauge', () => {
    const c = appels('loop')
    for (const f of ['bolt.cues', 'playBoltOpen', 'playBoltClose', 'setBoltProgress', 'bolt.progress']) expect(c, f).toContain(f)
    expect(a.imports.get('playBoltOpen')?.from).toBe('./audio.js')
    expect(a.imports.get('playBoltClose')?.from).toBe('./audio.js')
    expect(a.imports.get('setBoltProgress')?.from).toBe('./scope.js')
  })

  it('chaque mission repart culasse prête', () => {
    expect(appels('startLevel')).toContain('bolt.reset')
  })
})

describe('sillage', () => {
  it('le coup lance le sillage, pour le temps de vol de la balle', () => {
    expect(a.imports.get('spawnTrail')?.from).toBe('./effects.js')
    const t = texteAppel('shoot', 'spawnTrail')
    expect(t, 'shoot appelle spawnTrail').toBeTruthy()
    expect(t).toMatch(/bulletDelay/)
  })

  it('plus de trait d\'impact : spawnTracer n\'est plus ni importé ni appelé', () => {
    expect(a.imports.has('spawnTracer')).toBe(false)
    expect(MAIN_SRC).not.toMatch(/\bspawnTracer\s*\(/)
  })
})
