// Enquête du prologue — les 6 indices et le téléphone (spec docs/superpowers/specs/2026-10-04-enquete-design.md §2).
export const CLUES = [
  { id: 'serrure', n: 1, lieu: 'LE PALIER', titre: 'LA SERRURE', viktor: 'Ils n\'ont pas sonné. Ils ont fait sauter la serrure.', piste: 'La porte…' },
  { id: 'lutte', n: 2, lieu: 'L\'ENTRÉE', titre: 'LES TRACES DE LUTTE', viktor: 'Elle s\'est défendue.', piste: 'L\'entrée… tout est renversé.' },
  { id: 'corps', n: 3, lieu: 'LE SALON', titre: 'ELLES', viktor: 'Elles étaient là. Ma femme. Ma fille.', piste: 'Le salon…', acouphene: true },
  { id: 'photo', n: 4, lieu: 'LE SALON', titre: 'LA PHOTO', viktor: 'Elles n\'avaient rien fait. C\'est moi qui avais dit non.', piste: 'Près de l\'étagère…' },
  { id: 'mot', n: 5, lieu: 'LE SALON', titre: 'LE MOT', citation: 'Tu aurais dû dire oui.', viktor: 'Ils voulaient que je sache.', piste: 'La table basse…' },
  { id: 'doudou', n: 6, lieu: 'LA CHAMBRE DE LA PETITE', titre: 'LE DOUDOU', viktor: 'Elle ne dormait jamais sans lui.', piste: 'La chambre de la petite…' },
]

export const PHONE = {
  id: 'telephone', lieu: 'L\'ENTRÉE', titre: 'LE TÉLÉPHONE', seuil: 4,
  verrouille: 'Pas encore… Je dois comprendre ce qui s\'est passé.',
  appels: [
    { de: '06 39 98 41 07', heure: '18:52', note: 'MANQUÉ · 1 MESSAGE' },
    { de: 'MAISON', heure: '19:04', note: 'MANQUÉ' },
  ],
  viktor: ['Ce jour-là, j\'avais oublié mon téléphone.', 'Elle m\'a appelé. Il était là, en silencieux.'],
  piste: 'Mon téléphone… dans l\'entrée.',
  action: 'ÉCOUTER LE MESSAGE',
}
