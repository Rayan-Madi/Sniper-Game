// Les textes du Bivouac, le bar de M5 (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.3, §3.5, §3.6, §3.9 à
// §3.11 et §3.14 ; plan docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B5). Module pur : des données figées, et
// bilan() qui les lit. Aucun tiret cadratin (tests/texts.test.js). Une espace simple devant « ? », « ! » et « : », comme
// dans le reste du jeu : la frappe et l'écoute rattachent la ponctuation à son mot par une espace insécable (motsDe de
// src/ui/frappe.js ; spec §3.4, « Réglé en B5 »), elle ne se masque ni ne passe à la ligne seule.
//
// Ce qui se dit (§3.14) : les ÉCHANGES que Viktor épie (sous-titres masqués selon ce qu'il entend, src/bar/ecoute.js) ;
// les DIALOGUES à choix avec lui (src/bar/dialogue.js) ; les répliques du REGARD, les RÉACTIONS de la salle, ALBERT ; ce
// que Viktor pense (pensee, sa voix intérieure, ni écoutée ni masquée). Puis la CARTE de départ, le CARNET, le BILAN.
// Quand et où chaque chose se dit, et ce qu'elle déclenche, c'est la soirée (src/bar/seance.js, tâche B6) et la coquille
// du bar (src/bar/index.js, tâche B11) qui le décident ; les valeurs de ressenti sont dans src/bar/reglages.js.
import { FIN } from './dialogue.js'
import { DIALOGUE, SOUPCON } from './reglages.js'

// Fige un objet et tout ce qu'il contient : la coquille du bar ne peut rien en changer d'une partie à l'autre.
function gele(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v)) gele(x)
  }
  return v
}

// ─── Qui parle (§3.2) ──────────────────────────────────────────────
// Le sous-titre nomme le rôle, puis le nom une fois prononcé (comme « INCONNU » devenu « ANTON » au prologue, §3.4) ;
// nom : null, jamais nommé. Les clés sont les id des personnes de src/bar/plan.js (sièges, ancres, boîtes), plus le
// colonel (une voix) et Viktor.
export const PERSONNES = gele({
  fernand: { role: 'LE PATRON', nom: 'FERNAND' },
  dussart: { role: 'LE SERGENT', nom: 'DUSSART' },
  lenoir: { role: 'LE JEUNE', nom: 'LENOIR' },
  mattei: { role: 'LE JOUEUR', nom: 'MATTEI' },
  haas: { role: 'LE COLOSSE', nom: 'HAAS' },
  sorel: { role: 'LE LIEUTENANT', nom: 'SOREL' },
  lise: { role: 'LA SERVEUSE', nom: 'LISE' },
  albert: { role: 'LE VIEUX', nom: 'ALBERT' },
  colonel: { role: 'LE COLONEL', nom: 'KESSLER' },   // au téléphone seulement : une voix, pas de visage
  'ouvrier-1': { role: 'UN OUVRIER', nom: null },
  'ouvrier-2': { role: 'UN OUVRIER', nom: null },
  viktor: { role: 'VIKTOR', nom: 'VIKTOR' },
})

// ─── Le carnet « CE QU'IL ME FAUT » (§3.3) ─────────────────────────
// Une ligne par renseignement appris, « libelle · valeur », avec le tampon ; la ligne du leurre s'ajoute sous celle du
// véhicule. pensee : ce que Viktor se dit en l'apprenant. Les drapeaux de récit appel et allie n'ont pas de ligne.
export const RENSEIGNEMENTS = gele({
  trajet: { libelle: 'TRAJET', valeur: 'LA VIEILLE ROUTE', pensee: 'La vieille route.' },
  vehicule: { libelle: 'VÉHICULE', valeur: 'LE 2e SUR 3', pensee: 'La deuxième voiture.' },
  place: { libelle: 'PLACE', valeur: 'DEVANT, CÔTÉ PASSAGER', pensee: 'Devant. Côté passager.' },
  heure: { libelle: 'HEURE', valeur: 'DÉPART 19:15', pensee: 'Sept heures et quart.' },
})
// Le §3.3 fait dire à Viktor « La deuxième voiture. La casquette, c'est pour un autre. » : la seconde phrase n'a de sens
// que s'il a entendu la casquette (A2b apprend le véhicule sans elle) ; elle vient donc avec le leurre.
export const LEURRE = gele({ carnet: 'CASQUETTE AU 3e : LEURRE', pensee: 'La casquette, c\'est pour un autre.' })
export const CARNET = gele({ titre: 'CE QU\'IL ME FAUT', tampon: 'NOTÉ' })

// ─── Les échanges que Viktor épie (§3.9, §3.14) ────────────────────
// Un échange : { id, titre, foyer, t, bonus, repliques, pensee? }. foyer : d'où part la voix (FOYERS de src/bar/plan.js) ;
// t : l'instant de la soirée où il commence, en secondes de jeu (§3.9 ; null : à placer par la soirée, B6) ; bonus : hors
// socle, mêmes règles ; pensee : ce que Viktor se dit à la fin, s'il l'a entendu (B11 en juge ; la fin, toujours).
// Une réplique : { qui, texte, didascalie?, didascalieApres?, voix?, foyer?, renseignement?, motsCles?, drapeau? }.
// qui : une clé de PERSONNES, jamais Viktor ; didascalie : un geste ou un ton, montré avant ou après les mots, jamais
// frappé ; voix : une clé de ECOUTE.voix (src/bar/reglages.js), normale si absente ; foyer : quand elle ne part pas de
// celui de l'échange ; renseignement et motsCles : ce qu'elle apprend si tous ses mots-clés se sont affichés (acquis de
// src/bar/ecoute.js ; les mots entre crochets du §3.14) ; drapeau : un drapeau de récit posé si elle s'est affichée en
// entier (appel : « entendre au moins une réplique du colonel en entier », §3.14).
const VOIX_BASSE = 'baissee'
const COMBINE = 'combine'
export const ECHANGES = gele([
  { id: 'A3', titre: 'Ceux de l\'hiver', foyer: 'A', t: 21, bonus: true, repliques: [
    { qui: 'lenoir', texte: 'Tu as des nouvelles de ceux de l\'hiver ? Julien, Brunet ?' },
    { qui: 'dussart', texte: 'Mutés.' },
    { qui: 'lenoir', texte: 'Mutés où ? Personne n\'écrit.' },
    { qui: 'dussart', texte: 'Bois ta bière, Lenoir.', didascalieApres: 'Fernand s\'arrête d\'essuyer son verre.' },
  ] },
  // suppose M4 tirée à 430 m (décision 11 du lot 3, confirmée par Rayan le 28 octobre)
  { id: 'B3', titre: 'La base', foyer: 'B', t: 42, bonus: true, pensee: 'Ils parlent de moi.', repliques: [
    { qui: 'mattei', texte: 'Trois officiers, en plein midi. Personne n\'a rien vu.' },
    { qui: 'haas', texte: 'Un seul tireur ?' },
    { qui: 'mattei', texte: 'Un seul. À plus de quatre cents mètres.' },
    { qui: 'haas', texte: 'C\'est pour ça que le vieux ne parle plus à la radio.' },
  ] },
  // « le col » est une fausse piste, jamais notée
  { id: 'A1', titre: 'La route', foyer: 'A', t: 63, bonus: false, repliques: [
    { qui: 'lenoir', texte: 'On passe par le col, non ? C\'est plus court.' },
    { qui: 'dussart', texte: 'Le col, c\'est fini. Trop de monde.' },
    { qui: 'lenoir', texte: 'La nationale, alors.' },
    { qui: 'dussart', texte: 'La nationale a des yeux. Sur la vieille route, il n\'y a personne.',
      renseignement: 'trajet', motsCles: ['vieille route'] },
    { qui: 'lenoir', texte: 'Avec l\'épingle du calvaire ? On va se traîner.' },
    { qui: 'dussart', texte: 'On se traîne treize secondes. Après, c\'est tout droit jusqu\'à la frontière.' },
  ] },
  { id: 'B1', titre: 'La casquette', foyer: 'B', t: 95, bonus: false, repliques: [
    { qui: 'haas', texte: 'Il veut que je mette sa casquette. Sa vieille casquette d\'officier.' },
    { qui: 'mattei', texte: 'Belote.' },
    { qui: 'haas', texte: 'Pourquoi moi, Mattei ?' },
    { qui: 'mattei', texte: 'Tu as sa carrure. Celui qui vise la casquette, c\'est toi qu\'il vise.',
      renseignement: 'leurre', motsCles: ['casquette'] },
    { qui: 'haas', texte: 'Et lui ?' },
    { qui: 'mattei', texte: 'Lui, il est dans la deuxième. Rebelote.', renseignement: 'vehicule', motsCles: ['deuxième'] },
  ] },
  // Lise sert la table A
  { id: 'A4', titre: 'Le café', foyer: 'A', t: 126, bonus: false, repliques: [
    { qui: 'lise', texte: 'Je te ressers, Dussart ?' },
    { qui: 'dussart', texte: 'Non. On roule à sept heures et quart.', renseignement: 'heure', motsCles: ['sept heures et quart'] },
    { qui: 'lise', texte: 'Vous rentrez quand ?' },
    { qui: 'dussart', texte: 'On ne rentre pas.' },
  ] },
  { id: 'A2a', titre: 'Devant', foyer: 'A', t: 147, bonus: false, repliques: [
    { qui: 'lenoir', texte: 'Il monte derrière, le vieux ? Comme un général ?' },
    { qui: 'dussart', texte: 'Jamais. Derrière, il a mal au cœur.' },
    { qui: 'dussart', texte: 'Il monte devant. À droite. Il veut voir la route.',
      renseignement: 'place', motsCles: ['devant', 'à droite'] },
  ] },
  { id: 'B2', titre: 'La serviette', foyer: 'B', t: 168, bonus: true, repliques: [
    { qui: 'haas', texte: 'Et sa serviette ? Il ne la lâche jamais.' },
    { qui: 'mattei', texte: 'Ses registres. Des noms. Il dort avec.' },
    { qui: 'haas', texte: 'Quels noms ?' },
    { qui: 'mattei', texte: 'Ceux qu\'on ne revoit pas. Joue.' },
  ] },
  // à voix basse, au zinc
  { id: 'C2', titre: 'Julien', foyer: 'zinc', t: 189, bonus: true, repliques: [
    { qui: 'lise', texte: 'Tu n\'as rien dit à Dussart, pour Julien.', voix: VOIX_BASSE },
    { qui: 'fernand', texte: 'Il n\'en sait pas plus que moi.', voix: VOIX_BASSE },
    { qui: 'lise', texte: 'Il conduit le colonel.', voix: VOIX_BASSE },
    { qui: 'fernand', texte: 'Justement.', voix: VOIX_BASSE },
  ] },
  // la clochette ; les tables se taisent 3 s (la soirée, B6)
  { id: 'entreeSorel', titre: 'Sorel entre', foyer: 'zinc', t: 210, bonus: false, repliques: [
    { qui: 'sorel', texte: 'Un café, Fernand.' },
    { qui: 'fernand', texte: 'Lieutenant.' },
  ] },
  { id: 'A2b', titre: 'La deuxième', foyer: 'A', t: 231, bonus: true, repliques: [
    { qui: 'lenoir', texte: 'Et moi, je suis où, ce soir ?' },
    { qui: 'dussart', texte: 'Dans la deuxième, derrière lui. Tu regardes sa nuque et tu te tais.',
      renseignement: 'vehicule', motsCles: ['deuxième'] },
  ] },
  // Le téléphone sonne trois fois (B6, B7). Sorel parle d'une voix normale, le colonel dans le combiné (à 1 m au plus) :
  // TRAJET et HEURE s'apprennent de l'un ou de l'autre, PLACE seulement du colonel.
  { id: 'appel', titre: 'L\'appel', foyer: 'combine', t: 273, bonus: false, repliques: [
    { qui: 'fernand', texte: 'Bivouac. … Oui, mon colonel. Il est là.' },
    { qui: 'fernand', didascalie: 'il tend le combiné', texte: 'Lieutenant. Pour vous.' },
    { qui: 'sorel', texte: 'Sorel. … Oui, mon colonel.' },
    { qui: 'colonel', texte: 'Prenez la vieille route. Personne ne nous attendra.', voix: COMBINE,
      renseignement: 'trajet', motsCles: ['vieille route'], drapeau: 'appel' },
    { qui: 'sorel', texte: 'La vieille route. Compris.', renseignement: 'trajet', motsCles: ['vieille route'] },
    { qui: 'colonel', texte: 'Départ à sept heures et quart.', voix: COMBINE,
      renseignement: 'heure', motsCles: ['sept heures et quart'], drapeau: 'appel' },
    { qui: 'sorel', texte: 'Sept heures et quart, devant la caserne.', renseignement: 'heure', motsCles: ['sept heures et quart'] },
    { qui: 'colonel', texte: 'Je monte devant, comme toujours. Et que Haas mette la casquette.', voix: COMBINE,
      renseignement: 'place', motsCles: ['devant'], drapeau: 'appel' },
    { qui: 'sorel', texte: 'Haas la mettra. Bien, mon colonel.' },
  ] },
  // les relances (R1 et R2 en même temps, aux tables A et B)
  { id: 'R1', titre: 'Relance, la place', foyer: 'A', t: 357, bonus: false, repliques: [
    { qui: 'lenoir', texte: 'Devant, tu disais ?' },
    { qui: 'dussart', texte: 'Devant. À droite. Tu es sourd ?', renseignement: 'place', motsCles: ['devant', 'à droite'] },
  ] },
  // Le §3.3 compte R2 parmi les sources du leurre, sans en marquer le mot : c'est la casquette de Haas, comme en B1.
  { id: 'R2', titre: 'Relance, la casquette', foyer: 'B', t: 357, bonus: false, repliques: [
    { qui: 'haas', texte: 'Je la mets quand, la casquette ?', renseignement: 'leurre', motsCles: ['casquette'] },
    { qui: 'mattei', texte: 'Dans la troisième. Pas avant. Lui sera dans la deuxième.', renseignement: 'vehicule', motsCles: ['deuxième'] },
  ] },
  // le départ : Sorel au zinc, puis à la porte ; Fernand reste derrière son zinc
  { id: 'R3', titre: 'Le départ', foyer: 'porte', t: 389, bonus: false, repliques: [
    { qui: 'sorel', texte: 'On y va.', foyer: 'zinc' },
    { qui: 'sorel', didascalie: 'à la porte', texte: 'Sept heures et quart devant la caserne. Pas une minute de plus.',
      renseignement: 'heure', motsCles: ['sept heures et quart'] },
    { qui: 'mattei', texte: 'Mets ça sur l\'ardoise, Fernand.' },
    { qui: 'fernand', texte: 'L\'ardoise est pleine.', foyer: 'zinc' },
    { qui: 'sorel', texte: 'Le colonel réglera.', didascalieApres: 'la porte se referme' },
    { qui: 'fernand', didascalie: 'bas', texte: 'Le colonel ne règle jamais rien.', voix: VOIX_BASSE, foyer: 'zinc' },
  ] },
  // la fin de la soirée ; Viktor sort de lui-même 6 s plus tard (B6)
  { id: 'fin', titre: 'La fin', foyer: 'albert', t: 420, bonus: false, pensee: 'Il faut y aller.', repliques: [
    { qui: 'albert', texte: 'Le 7 a gagné.' },
  ] },
  // au mange-debout de la porte, quand la soirée le place
  { id: 'ouvriers', titre: 'La cimenterie', foyer: 'ouvriers', t: null, bonus: true, repliques: [
    { qui: 'ouvrier-1', texte: 'Encore une semaine à la cimenterie.' },
    { qui: 'ouvrier-2', texte: 'Et après ?' },
    { qui: 'ouvrier-1', texte: 'Après, encore une.' },
  ] },
])

// ─── Albert (§3.14) ────────────────────────────────────────────────
// murmures : à tout moment, à sa table (foyer albert), écoutés comme un échange ; parle : sa réponse si Viktor lui parle.
export const ALBERT = gele({
  murmures: ['Allez, le 7. Allez…', 'Regardez-moi cette carne.'],
  parle: 'Le 7. Il ne gagne jamais. C\'est pour ça que je le joue.',
})

// ─── Le regard qui fixe (§3.5) ─────────────────────────────────────
// Ce que dit qui remarque Viktor à le fixer : rang 0 à la tolérance dépassée, puis 1,5 s et 3 s plus tard
// ({ type: 'replique', qui, rang } de src/bar/regard.js). Une réplique : { texte, didascalie?, lance? } ; texte vide : un
// geste seulement ; lance : le dialogue qu'elle ouvre. Pas de ligne au-delà de la liste (Lise, Fernand) ; aucune pour
// Albert, qui ne remarque rien, ni pour les ouvriers, qui remarquent sans rien dire.
export const REGARDS = gele({
  dussart: [{ texte: '', didascalie: 'il soutient le regard' }, { texte: 'Un problème ?' }, { texte: 'Tu veux ma photo ?' }],
  lenoir: [{ texte: 'Quoi ?' }, { texte: 'Il me regarde, lui.' }, { texte: 'Sergent. Il nous regarde.' }],
  mattei: [{ texte: 'Tu joues ou tu regardes ?' }, { texte: 'Il y a un souci, l\'ami ?' },
    { texte: 'Haas. Le monsieur s\'intéresse à nous.' }],
  haas: [{ texte: '', didascalie: 'il pose ses cartes' }, { texte: '', didascalie: 'il se redresse' },
    { texte: '', didascalie: 'il se lève à demi' }],
  sorel: [{ texte: 'Monsieur ?' }, { texte: 'On se connaît ?' }, { texte: 'Restez assis.', lance: 'sorel' }],
  lise: [{ texte: 'Autre chose ?' }, { texte: 'Je ne suis pas au menu.' }],
  fernand: [{ texte: 'Encore un ?' }],
})

// ─── Les réactions de la salle (§3.5, §3.6, §3.9, §3.10) ───────────
// Ce qui se dit à Viktor, ou de lui, quand la soirée ou la jauge le décide : { qui, texte, … }. Viktor y pense (qui :
// 'viktor', sa voix intérieure).
export const REACTIONS = gele({
  bonsoir: { qui: 'fernand', texte: 'Bonsoir.' },                                    // à l'entrée, avec la clochette
  premiereFixation: { qui: 'viktor', texte: 'Ne les fixe pas.' },                    // la première remarque (§3.5)
  sansCommande: { qui: 'lise', texte: 'Tu prends quelque chose ou tu attends le bus ?' },   // rien commandé (§3.6)
  mefiance: { qui: 'mattei', texte: 'C\'est qui, lui ?' },                           // MÉFIANCE, la première fois
  soupcon: { qui: 'lenoir', texte: 'Sergent…' },                                     // SOUPÇON sans Sorel : Dussart s'approche
  soupconViktor: { qui: 'viktor', texte: 'Je me fais remarquer.' },                  // SOUPÇON
  piste: { qui: 'viktor', texte: 'Ils ne parleront pas devant le zinc.' },          // rien d'appris après 150 s (§3.9)
  sortieSoupcon: { qui: 'sorel', texte: 'Hé. Vous. Attendez.' },                     // sortir en SOUPÇON : démasqué
  demasque: { qui: 'sorel', quiAvantSorel: 'dussart', texte: 'Toi. Debout.', tampon: 'COUVERTURE GRILLÉE' },   // §3.10
  flechettes: { qui: 'mattei', texte: 'Trois dans le mille. Tu as fait l\'armée, toi ?', bonus: true },   // §3.6
})

// ─── Les objets à regarder (E, §3.14) ──────────────────────────────
// pensee : ce que Viktor se dit ; une : le titre du journal (ancres photo, journal, fenetre de src/bar/plan.js ; entree :
// en entrant).
export const OBJETS = gele({
  photo: { pensee: 'Vingt-quatre. Pas de colonel.' },
  entree: { pensee: 'Le fusil est resté sur la moto. Ici, je ne suis personne.' },
  journal: { bonus: true, une: 'TROIS OFFICIERS ABATTUS À LA BASE · LE TIREUR AURAIT TIRÉ À PLUS DE 400 MÈTRES',
    pensee: 'Ils parlent de moi.' },
  fenetre: { bonus: true, pensee: 'Le château d\'eau. J\'étais là-haut.' },
})

// ─── Les dialogues à choix (§3.8, §3.14) ───────────────────────────
// Au format de src/bar/dialogue.js. Valeurs de soupcon : celles du §3.14, de −15 à +30 (§3.6) ; un silence est
// l'événement silence de la jauge (+8), face à Sorel silenceSorel (+10, et la question revient une fois, puis la suivante).
// D1 (Fernand) se joue en deux temps : « fernand » au premier passage au zinc ; « fernand-photo », que F2.1 et F2.2
// ouvrent (ouvre), quand Viktor a regardé la photo ou passé 20 s au zinc (B11). D3 (Lise) aussi : « lise-commande » au
// premier siège pris ou après 45 s sans rien commander, « lise-regard » la première fois que Viktor fixe un soldat
// au-delà de sa tolérance. D2 (Sorel) à 315 s, dès SOUPÇON après 210 s, ou sur « Restez assis. » (REGARDS).
const ROUTIER = 'routier'
const SILENCE = { effets: { evenement: 'silence' }, suite: FIN }
const silenceSorel = suite => ({ reponse: 'Vous réfléchissez beaucoup.', effets: { evenement: 'silenceSorel' }, revient: true, suite })
const AIDE_REGARD = 'Ne fixe personne plus de deux secondes.'

export const DIALOGUES = gele({
  fernand: {
    id: 'fernand', interlocuteur: 'fernand', entree: 'f1',
    noeuds: {
      f1: {
        qui: 'fernand', dit: 'Qu\'est-ce que je vous sers ?',
        choix: [
          { texte: 'Un demi.', reponse: 'Un demi.', effets: { soupcon: -5, verre: 'demi' }, suite: 'f2' },
          { texte: 'Un café.', reponse: 'Un café.', effets: { verre: 'cafe' }, suite: 'f2' },
          { texte: 'Ce qu\'ils boivent, eux.', reponse: 'Eux, ils boivent à l\'œil. Vous, vous payez.',
            effets: { soupcon: 10, verre: 'demi' }, suite: 'f2' },
        ],
        silence: SILENCE,
      },
      f2: {
        qui: 'fernand', dit: 'Vous n\'êtes pas d\'ici.',
        choix: [
          { texte: 'Je livre à la cimenterie. Je repars ce soir.', reponse: 'Vous avez une tête à rouler la nuit.',
            effets: { couverture: ROUTIER, ouvre: 'fernand-photo' }, suite: FIN },
          { texte: 'Je cherche du travail.', reponse: 'Ici, il n\'y a que l\'armée. Et l\'armée n\'embauche plus.',
            effets: { ouvre: 'fernand-photo' }, suite: FIN },
          { texte: 'Je cherche quelqu\'un.', reponse: 'Ici, on ne cherche personne.', effets: { soupcon: 15 }, suite: FIN },
        ],
        silence: SILENCE,
      },
    },
  },
  'fernand-photo': {
    id: 'fernand-photo', interlocuteur: 'fernand', entree: 'f3',
    noeuds: {
      f3: {
        qui: 'fernand', dit: 'Vingt-quatre. Chaque année, ils posent devant chez moi.',
        choix: [
          { texte: 'Il manque le colonel.', reponse: 'Il ne pose jamais. Je l\'ai connu quand il avait encore un visage.', suite: FIN },
          { texte: 'Vous les connaissez tous ?',
            reponse: 'Le deuxième en partant de la gauche. Julien. Mon fils. Muté l\'hiver dernier, avec onze autres. Personne n\'écrit.',
            suite: 'f4' },
          { texte: 'Belle brochette.', reponse: 'Hm.', suite: FIN },
        ],
        silence: SILENCE,
      },
      // « Deux. » : la femme et la fille de Viktor, ni nommées ni montrées ; il ment aux soldats, il dit vrai au père
      f4: {
        qui: 'fernand', dit: 'Vous aussi, vous avez perdu quelqu\'un. Ça se voit.',
        choix: [
          { texte: 'Deux.', reponse: { didascalie: 'un temps', texte: '… Ils ont rendez-vous à sept heures et quart devant la caserne. Je n\'ai rien dit.' },
            effets: { soupcon: -15, apprend: ['heure', 'allie'] }, suite: FIN },
          { texte: 'Non.', reponse: 'Alors je me trompe.', suite: FIN },
          { texte: 'Les mêmes que votre fils.', reponse: { didascalie: 'il regarde la porte', texte: 'Finissez votre verre. Et partez.' },
            effets: { soupcon: 25, muet: 'fernand' }, suite: FIN },
        ],
        silence: SILENCE,
      },
    },
  },
  // Sorel s'approche. Fernand allié le renvoie ; sinon, quatre questions, 6 s chacune ; la sortie selon S.
  sorel: {
    id: 'sorel', interlocuteur: 'sorel', minuterieS: DIALOGUE.minuterieSorelS, entree: 'allie',
    noeuds: {
      allie: { aiguillage: [{ si: { renseignement: 'allie' }, suite: 'avecMoi' }, { suite: 's1' }] },
      avecMoi: { qui: 'fernand', dit: 'Il est avec moi, lieutenant.', suite: 'bien' },
      bien: { qui: 'sorel', dit: 'Bien.', effets: { soupcon: -10 }, suite: FIN },
      s1: {
        qui: 'sorel', dit: 'On ne se connaît pas.',
        choix: [
          { texte: 'Non.', reponse: 'C\'est ce que je disais.', suite: 's2' },
          { texte: 'Je suis de passage.', reponse: 'Tout le monde est de passage, ici.', effets: { soupcon: -5 }, suite: 's2' },
          { texte: 'Viktor.', didascalieApres: 'il tend la main',
            reponse: { didascalie: 'sans la prendre', texte: 'Je n\'ai pas demandé votre nom.' }, effets: { soupcon: 20 }, suite: 's2' },
        ],
        silence: silenceSorel('s2'),
      },
      s2: {
        qui: 'sorel', dit: 'Vous avez servi. Ça se voit à la façon dont vous vous tenez.',
        choix: [
          { texte: 'Comme tout le monde.', reponse: 'Pas tout le monde.', suite: 's3' },
          { texte: 'Jamais.', reponse: 'Vous mentez mal.', effets: { soupcon: 20 }, suite: 's3' },
          { texte: 'Tireur d\'élite. Douze ans.', reponse: { didascalie: 'un silence', texte: 'Debout.' },
            effets: { demasque: true }, suite: FIN },
        ],
        silence: silenceSorel('s3'),
      },
      // la réponse 1 dépend de la couverture du routier (F2.1) : « Je repars. » mène à S4, dont la question est « Par où ? »
      s3: {
        qui: 'sorel', dit: 'Vous allez où, ce soir ?',
        choix: [
          { texte: 'Je repars. De l\'autre côté de la frontière.', si: { couverture: ROUTIER }, suite: 's4' },
          { texte: 'Nulle part. Je finis mon verre.', si: { couverture: null }, reponse: 'Finissez-le vite.',
            effets: { soupcon: 5 }, suite: 'sortie' },
          { texte: 'Ça dépend de vous.', reponse: 'Qu\'est-ce que ça veut dire ?', effets: { soupcon: 30 }, suite: 'sortie' },
        ],
        silence: silenceSorel('sortie'),
      },
      // S4.1 : TRAJET par la bouche de Sorel lui-même, la seule source qui ne s'épie pas
      s4: {
        qui: 'sorel', dit: 'Par où ?',
        choix: [
          { texte: 'La nationale.', reponse: 'Bien. Pas la vieille route : ce soir, elle est à nous.',
            effets: { soupcon: -10, apprend: ['trajet'] }, suite: 'sortie' },
          { texte: 'La vieille route. C\'est plus court.', reponse: 'Plus court pour qui ?', effets: { soupcon: 30 }, suite: 'sortie' },
          { texte: 'Je ne sais pas encore.', reponse: 'Prenez la nationale.', suite: 'sortie' },
        ],
        silence: silenceSorel('sortie'),
      },
      // à 60 ou plus (le seuil du SOUPÇON), la baisse de la jauge est divisée par deux jusqu'à la fin (surveille, B11)
      sortie: { aiguillage: [{ si: { soupconMin: SOUPCON.paliers.soupcon.monte }, suite: 'oeil' }, { suite: 'bonneRoute' }] },
      oeil: { qui: 'sorel', dit: 'Je vous ai à l\'œil.', effets: { surveille: true }, suite: FIN },
      bonneRoute: { qui: 'sorel', dit: 'Bonne route.', suite: FIN },
    },
  },
  'lise-commande': {
    id: 'lise-commande', interlocuteur: 'lise', entree: 'l1',
    noeuds: {
      l1: {
        qui: 'lise', dit: 'Tu prends quoi ?',
        choix: [
          { texte: 'Un demi.', reponse: 'Ça marche.', effets: { soupcon: -5, verre: 'demi' }, suite: FIN },
          { texte: 'Un café.', reponse: 'Serré ?', effets: { verre: 'cafe' }, suite: FIN },
          { texte: 'Rien. J\'attends quelqu\'un.', reponse: 'Ici, on attend en consommant.', effets: { soupcon: 10 }, suite: FIN },
        ],
        silence: SILENCE,
      },
    },
  },
  // Lise, bas, en passant ; puis l'aide, quelle que soit la réponse
  'lise-regard': {
    id: 'lise-regard', interlocuteur: 'lise', entree: 'l2',
    noeuds: {
      l2: {
        qui: 'lise', didascalie: 'bas, en passant', dit: 'Arrête de les regarder comme ça. Ils n\'aiment pas.',
        choix: [
          { texte: 'Merci.', reponse: 'De rien.', effets: { soupcon: -5, aide: AIDE_REGARD }, suite: FIN },
          { texte: 'Je ne regardais personne.', reponse: 'Alors continue.', effets: { aide: AIDE_REGARD }, suite: FIN },
          { texte: 'Qui sont-ils ?', reponse: 'Des gens qu\'on ne regarde pas.', effets: { soupcon: 5, aide: AIDE_REGARD }, suite: FIN },
        ],
        silence: { effets: { evenement: 'silence', aide: AIDE_REGARD }, suite: FIN },
      },
    },
  },
})

// ─── La carte de départ (§3.10) ────────────────────────────────────
// Les touches se relisent selon la disposition du clavier (B12) ; partir : la sortie de secours si le verrou du
// pointeur est refusé (aucun renseignement, décision 8, G5).
export const CARTE = gele({
  lieu: 'LE BIVOUAC · 18:10',
  texte: 'Ils partent ce soir. Ce qu\'il me faut : la route, la voiture, sa place, l\'heure.',
  consigne: 'Écouter sans regarder.',
  commencer: 'CLIQUER POUR COMMENCER',
  partir: 'PARTIR SANS ENTRER',
})

// ─── Le bilan « DOSSIER 05 » et le téléphone (§3.11) ───────────────
export const BILAN = gele({
  titre: 'DOSSIER 05',
  tampon: 'NOTÉ',
  inconnu: 'INCONNU',
  telephone: { de: 'ANTON', message: 'Alors ?' },
  viktor: { tout: 'J\'ai tout.', partiel: 'Il faudra faire avec.', rien: 'Presque rien.' },
})

// Le bilan d'une soirée : renseignements, de la forme du contrat de sortie (§3.11), dont seul exactement true compte.
// Rend { titre, lignes, appris, telephone, viktor } : quatre lignes dans l'ordre du carnet, { cle, libelle, valeur,
// appris }, la valeur si le renseignement est appris, « INCONNU » sinon ; appris, leur nombre (les drapeaux leurre, appel
// et allie n'en sont pas) ; viktor, sa réponse au « Alors ? » d'Anton : 4, tout ; 2 ou 3, partiel ; 0 ou 1, presque rien.
export function bilan(renseignements = {}) {
  const lignes = Object.entries(RENSEIGNEMENTS).map(([cle, r]) => {
    const appris = renseignements[cle] === true
    return { cle, libelle: r.libelle, valeur: appris ? r.valeur : BILAN.inconnu, appris }
  })
  const appris = lignes.filter(l => l.appris).length
  const viktor = appris === lignes.length ? BILAN.viktor.tout : appris >= 2 ? BILAN.viktor.partiel : BILAN.viktor.rien
  return { titre: BILAN.titre, lignes, appris, telephone: BILAN.telephone, viktor }
}
