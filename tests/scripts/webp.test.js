import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { infoWebp, taillePng, chromeDump } from '../../scripts/webp.mjs'

// Portraits à transparence des cinématiques passés en WebP par scripts/webp.mjs (tâche C0 des cinématiques v2) :
// lecture des en-têtes (format RIFF de WebP, IHDR de PNG), échec propre quand Chrome ne se lance pas, état du dépôt.

const IMG = join(process.cwd(), 'public', 'briefing', 'img')

// En-têtes WebP fabriqués d'après la spécification du conteneur RIFF (chunks VP8X, ALPH, VP8, VP8L).
function bloc(fourcc, donnees) {
  const tete = Buffer.alloc(8)
  tete.write(fourcc, 0, 'latin1')
  tete.writeUInt32LE(donnees.length, 4)
  return Buffer.concat([tete, donnees, Buffer.alloc(donnees.length & 1)])
}
function riff(...blocs) {
  const corps = Buffer.concat([Buffer.from('WEBP', 'latin1'), ...blocs])
  const tete = Buffer.alloc(8)
  tete.write('RIFF', 0, 'latin1')
  tete.writeUInt32LE(corps.length, 4)
  return Buffer.concat([tete, corps])
}
function vp8x(largeur, hauteur, drapeaux) {
  const d = Buffer.alloc(10)
  d[0] = drapeaux
  d.writeUIntLE(largeur - 1, 4, 3)
  d.writeUIntLE(hauteur - 1, 7, 3)
  return bloc('VP8X', d)
}
function vp8(largeur, hauteur) {   // image clé : étiquette de 3 octets, code de départ 9d 01 2a, tailles sur 14 bits
  const d = Buffer.alloc(16)
  d.set([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a])
  d.writeUInt16LE(largeur, 6)
  d.writeUInt16LE(hauteur, 8)
  return bloc('VP8 ', d)
}
function vp8l(largeur, hauteur, alpha) {   // signature 2f, puis largeur - 1 et hauteur - 1 sur 14 bits, bit d'alpha
  const d = Buffer.alloc(8)
  d[0] = 0x2f
  d.writeUInt32LE(((largeur - 1) | ((hauteur - 1) << 14) | ((alpha ? 1 : 0) << 28)) >>> 0, 1)
  return bloc('VP8L', d)
}
const ALPHA = 0x10   // drapeau L (alpha) du chunk VP8X

describe('infoWebp', () => {
  it('lit la taille et le canal alpha d\'un WebP avec perte à transparence (VP8X, ALPH, VP8)', () => {
    expect(infoWebp(riff(vp8x(360, 450, ALPHA), bloc('ALPH', Buffer.alloc(5)), vp8(360, 450))))
      .toEqual({ largeur: 360, hauteur: 450, alpha: true })
  })

  it('un WebP avec perte sans transparence n\'a pas d\'alpha (VP8 seul)', () => {
    expect(infoWebp(riff(vp8(360, 450)))).toEqual({ largeur: 360, hauteur: 450, alpha: false })
  })

  it('le drapeau alpha seul ne suffit pas : il faut les données ALPH', () => {
    expect(infoWebp(riff(vp8x(360, 450, ALPHA), vp8(360, 450)))).toEqual({ largeur: 360, hauteur: 450, alpha: false })
  })

  it('lit un WebP sans perte (VP8L) et son bit d\'alpha', () => {
    expect(infoWebp(riff(vp8l(40, 50, true)))).toEqual({ largeur: 40, hauteur: 50, alpha: true })
    expect(infoWebp(riff(vp8l(40, 50, false)))).toEqual({ largeur: 40, hauteur: 50, alpha: false })
  })

  it('refuse ce qui n\'est pas un WebP', () => {
    expect(() => infoWebp(readFileSync(join(IMG, 'portrait-passeur-cam-lo.png')))).toThrow(/WebP/)
  })
})

describe('taillePng', () => {
  it('lit la taille dans l\'en-tête IHDR', () => {
    expect(taillePng(readFileSync(join(IMG, 'portrait-passeur-cam-lo.png')))).toEqual({ largeur: 40, hauteur: 50 })
    const source = join(process.cwd(), 'docs', 'superpowers', 'maquettes', 'cinematiques', 'img', 'portrait-freres-a.png')
    expect(taillePng(readFileSync(source))).toEqual({ largeur: 480, hauteur: 600 })
  })

  it('refuse ce qui n\'est pas un PNG', () => {
    expect(() => taillePng(readFileSync(join(IMG, 'portrait-crime-1.jpg')))).toThrow(/PNG/)
  })
})

// Relecture de C0 : un Chrome introuvable (chemin faux dans la variable CHROME) n'émet que l'événement « error »,
// jamais « exit ». Sans écoute de « error », le script plantait sur ENOENT (ou la promesse attendait sans fin) et
// laissait son dossier jetable (page et profil) dans le dossier temporaire.
describe('chromeDump', () => {
  it('un Chrome qui ne se lance pas rend une erreur qui le nomme, sans laisser ni dossier jetable ni garde', async () => {
    const temporaire = mkdtempSync(join(tmpdir(), 'webp-test-'))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const chrome = join(temporaire, 'chrome-absent.exe')
      await expect(chromeDump('<p>essai</p>', { chrome, temporaire })).rejects.toThrow(/chrome-absent\.exe/)
      expect(readdirSync(temporaire)).toEqual([])
      expect(vi.getTimerCount()).toBe(0)   // la garde de 2 minutes (taskkill) est arrêtée
    } finally {
      vi.useRealTimers()
      rmSync(temporaire, { recursive: true, force: true })
    }
  })
})

// Les six portraits PNG à transparence de 360 × 450 (spec des cinématiques v2 §1, « Poids ») : 940 399 octets en PNG.
const PORTRAITS = ['portrait-freres-a', 'portrait-freres-b', 'portrait-gangster-man-01', 'portrait-mafia-henchman',
  'portrait-mafia-woman-01', 'portrait-mafia-woman-02']

describe('portraits livrés (public/briefing/img)', () => {
  it('les six portraits sont des WebP de 360 × 450 qui gardent leur transparence, sans PNG resté à côté', () => {
    const etat = PORTRAITS.map(nom => ({
      nom,
      png: existsSync(join(IMG, nom + '.png')),
      webp: existsSync(join(IMG, nom + '.webp')) ? infoWebp(readFileSync(join(IMG, nom + '.webp'))) : null,
    }))
    expect(etat).toEqual(PORTRAITS.map(nom => ({ nom, png: false, webp: { largeur: 360, hauteur: 450, alpha: true } })))
  })

  it('les six pèsent au plus 350 000 octets (objectif repris du lot 4, kill-cams-design.md §5)', () => {
    const octets = PORTRAITS.map(nom => join(IMG, nom + '.webp')).filter(existsSync).map(f => readFileSync(f).length)
    expect(octets).toHaveLength(6)
    expect(octets.reduce((s, n) => s + n, 0)).toBeLessThanOrEqual(350000)
  })

  it('aucun autre PNG de 360 × 450 dans public/briefing/img (il compterait au poids sans servir)', () => {
    const grands = readdirSync(IMG).filter(f => f.endsWith('.png'))
      .filter(f => { const t = taillePng(readFileSync(join(IMG, f))); return t.largeur === 360 && t.hauteur === 450 })
    expect(grands).toEqual([])
  })
})
