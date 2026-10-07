═══════════════════════════════════════════════════════════════
  AJOUTER DE VRAIS PERSONNAGES 3D (MIXAMO) AU JEU
═══════════════════════════════════════════════════════════════

Par défaut, le jeu utilise des personnages procéduraux (capsules
articulées). Tu peux les remplacer par de vrais modèles Mixamo.

ÉTAPES :

1) Va sur https://www.mixamo.com  (compte Adobe gratuit)

2) Choisis un personnage (onglet "Characters").

3) Dans "Animations", récupère AU MOINS :
      - une animation "Idle"      (immobile)
      - une animation "Walking"   (marche)
   Coche "In Place" pour la marche (sinon le perso dérive).

4) Télécharge chaque animation en FBX (Binary), AVEC skin la
   première fois (pour avoir le maillage).

5) Regroupe tout dans UN SEUL .glb contenant le perso + les 2 clips.
   Le plus simple :
      - importe les FBX dans Blender,
      - renomme les actions "Idle" et "Walking" (NLA),
      - exporte en glTF Binary (.glb) avec "Animations" coché.
   Alternative rapide (1 anim/fichier) : convertis chaque FBX en
   .glb via https://anyconv.com/fbx-to-glb (tu auras alors un
   fichier par animation — dans ce cas indique l'url de l'idle
   comme modèle principal, le système jouera ce qui est dispo).

6) Dépose le(s) .glb ICI, dans  public/models/
   ex :  public/models/civilian.glb

7) Ouvre  src/characters.js  et renseigne MODELS, par exemple :

      export const MODELS = {
        civilian: { url: MODEL_DIR + 'civilian.glb', scale: 1.0,
                    anims: { idle: 'Idle', walk: 'Walking' } },
        target:   { url: MODEL_DIR + 'target.glb',   scale: 1.0,
                    anims: { idle: 'Idle', walk: 'Walking' } },
        guard:    { url: MODEL_DIR + 'guard.glb',     scale: 1.0,
                    anims: { idle: 'Idle', walk: 'Walking' } },
      }

   - "scale" ajuste la taille (vise ~1.8 m de haut).
   - "anims" mappe idle/walk aux NOMS EXACTS des clips dans le .glb.
   - Toujours MODEL_DIR + 'fichier.glb', jamais un chemin qui commence
     par /models/ : il casse le jeu ouvert en file:// (Electron).

8) Recharge le jeu. Les types configurés utilisent le modèle 3D ;
   les autres restent procéduraux. Tout fonctionne sans fichier.

NOTE : garde des modèles légers (peu de polygones) — plusieurs
PNJ s'affichent en même temps (jusqu'à ~18 au niveau de la fête).
