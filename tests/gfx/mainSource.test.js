import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAIN_SRC, readSource } from './mainSource.js'

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
