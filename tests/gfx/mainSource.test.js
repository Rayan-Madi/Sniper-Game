import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAIN_SRC, readSource, executer } from './mainSource.js'

// Les gardes de câblage lisent main.js tel qu'il est sur le disque. Sous Windows, Git (core.autocrlf, true par défaut
// avec Git pour Windows) l'extrait en fins de ligne CRLF : une garde qui cherche « })\n » ne trouvait plus son
// instruction, et son témoin échouait sur une copie fraîche du dépôt, verte seulement là où main.js était en LF
// (relecture de L7). Les gardes lisent donc le source en LF, comme le dépôt le stocke, quelle que soit l'extraction.
describe('lecture du source pour les gardes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mainsource-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('un fichier en CRLF est lu en LF', () => {
    const file = join(dir, 'crlf.js')
    writeFileSync(file, 'function f() {\r\n  g({\r\n  })\r\n}\r\n')
    expect(readSource(file)).toBe('function f() {\n  g({\n  })\n}\n')
  })

  it('un fichier en LF est lu tel quel', () => {
    const file = join(dir, 'lf.js')
    writeFileSync(file, 'const a = 1\nconst b = 2\n')
    expect(readSource(file)).toBe('const a = 1\nconst b = 2\n')
  })

  it('main.js est lu sans retour chariot', () => {
    expect(MAIN_SRC.includes('\r')).toBe(false)
  })
})

// executer : des fonctions de main.js exécutées telles quelles, dans une portée de doublures (tests/shot/
// main.ballePerdue.test.js, main.vueDuTir.test.js). Ici sur un petit source, qui a la forme de main.js : des variables et
// des fonctions au niveau du module.
describe('exécuter des fonctions du source telles quelles (executer)', () => {
  const SOURCE = 'let x = 1\nfunction f() { x += 1; return g(x) }\nfunction h() { return f() * 10 }\n'

  it('les fonctions lisent et écrivent les variables de la portée, s\'appellent entre elles ; poser en change', () => {
    const s = executer(['f', 'h'], { x: 1, g: v => v + 100 }, SOURCE)
    expect(s.fns.f()).toBe(102)
    expect(s.etat().x).toBe(2)
    expect(s.fns.h()).toBe(1030)
    s.poser({ x: 10 })
    expect(s.fns.f()).toBe(111)
    expect(s.etat()).toEqual({ x: 11, g: expect.any(Function) })
  })

  it('un nom qui manque à la portée lève quand la fonction l\'atteint', () => {
    const s = executer(['f'], { x: 1 }, SOURCE)
    expect(() => s.fns.f()).toThrow(ReferenceError)
  })

  it('une fonction absente du source, ou un nom à la fois fonction et variable : erreur dès le montage', () => {
    expect(() => executer(['k'], {}, SOURCE)).toThrow(/aucune fonction k/)
    expect(() => executer(['f'], { f: 1, x: 1 }, SOURCE)).toThrow(/à la fois fonction exécutée et variable de la portée : f/)
  })

  it('main.js par défaut : la fonction exécutée est celle du jeu', () => {
    const s = executer(['roleDe'], {})
    expect(s.fns.roleDe({ kind: 'npc', npc: { isTarget: false, isCivilian: true } })).toBe('civilian')
    expect(s.fns.roleDe({ kind: 'decor', cadenas: true })).toBe('lock')
    expect(s.fns.roleDe({ kind: 'rien' })).toBe('rien')
  })
})
