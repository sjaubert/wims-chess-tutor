# Spécification — Tuteur IA pour l'application d'échecs

**Date :** 2026-06-03
**Fichier cible :** `/home/wims/public_html/chess/chess.html` (application autonome, un seul fichier)
**Auteur de la demande :** S. Jaubert (administrateur WIMS)

## 1. Objectif

Ajouter à l'application d'échecs un **mode « Tuteur IA » activable** qui, en temps réel,
commente la pertinence des coups :

- indique si un coup est **théorique** (présent dans le livre d'ouvertures) ;
- fournit une **évaluation** de la position ;
- propose les **meilleures lignes à jouer** ;
- permet, **à la demande**, un commentaire en prose rédigé par une IA générative (Claude).

Le tutorat est **désactivé par défaut** ; allumé/éteint par un interrupteur. Tuteur éteint,
l'application se comporte exactement comme aujourd'hui (non-régression stricte).

## 2. Contexte technique existant

L'application est **100 % autonome dans le navigateur** :

- **Moteur d'échecs** embarqué dans un Web Worker (Blob URL) : recherche negamax +
  alpha-bêta + quiescence + table de transposition + évaluation statique en centipions.
  Produit déjà une **évaluation** et un **meilleur coup**.
- **Livre d'ouvertures Polyglot** (`gm2001.bin`, `Performance.bin`) chargé par l'utilisateur
  via un sélecteur de fichier, plus une petite table d'ouvertures interne. Fonctions
  `openingBookMove`, `polyLookup` déjà présentes → **détection « théorique » disponible**.
- Fonction `notation(s, m)` (ligne ~1325) produisant la **notation algébrique française**
  (Cf3, e4, Dxd5…), réutilisée pour l'historique → **réutilisable pour afficher les lignes**.

## 3. Décisions de conception (validées)

| Décision | Choix retenu |
|---|---|
| Type d'IA | **Hybride** : moteur local (base, toujours dispo, gratuit, hors-ligne) + LLM optionnel |
| Connexion LLM | **Chaque utilisateur colle sa propre clé API**, stockée en localStorage, appel direct navigateur → API |
| Déclenchement LLM | **À la demande** via un bouton « Avis de l'IA » (le moteur local, lui, s'affiche en temps réel) |
| Fournisseur LLM | **Claude (Anthropic) uniquement**, modèle sélectionnable (Haiku économique / Sonnet qualité) |
| Périmètre fichiers | Tout dans `chess.html`, **aucun serveur, aucun nouveau fichier de code** |

## 4. Expérience utilisateur

- **Lien « ← Retour à WIMS »** discret, toujours visible, pointant vers `/wims/wims.cgi`.
- **Interrupteur « 🎓 Tuteur IA »** dans le panneau latéral, éteint par défaut.
- **Panneau « Tuteur »** affiché quand l'interrupteur est allumé, mis à jour après chaque coup :
  - **Badge théorique** : `📖 Coup théorique (dans le livre)` ou `Hors livre`.
  - **Évaluation** : barre d'évaluation + valeur chiffrée (`+0,7`, `−1,3`) + traduction en mots
    (« léger avantage aux Blancs », « position égale », « les Noirs sont gagnants »…).
  - **Meilleure ligne** : variante principale en notation française (« Meilleur : 1.Cf3 Cc6 2.e4… »).
  - **Bouton `✨ Avis de l'IA`** : commentaire en prose à la demande.
- **Réglages** (roue crantée du panneau Tuteur) : champ clé API Claude, choix du modèle,
  bouton « Tester la connexion ». Clé stockée **uniquement** en localStorage. Sans clé, le
  bouton IA est grisé mais **tout le tuteur local fonctionne**.

## 5. Architecture technique

1. **Message Worker `analyze`** : on envoie la position courante au worker ; il renvoie
   `{ evalCp, pv: [coups UCI], isBook, bookMoves }` **sans jouer de coup**. Réutilise le
   moteur negamax existant, instrumenté pour **remonter la variante principale (PV)**.
2. **Conversion notation** : la PV revient en UCI ; le thread principal la rejoue sur une
   copie du plateau et appelle `notation()` pour produire la notation française.
3. **Détection théorique** : réutilisation directe de `openingBookMove` / `polyLookup`.
4. **Appel LLM** : `fetch` direct navigateur → `api.anthropic.com`, en-tête
   `anthropic-dangerous-direct-browser-access: true`. Prompt **ancré** sur l'analyse réelle
   du moteur (FEN, historique, éval, meilleure ligne, statut livre). Gestion d'erreurs : clé
   invalide / hors-ligne / quota → message clair, partie jamais cassée.

**Découpage en unités isolées et testables :**
`requestAnalysis()`, `renderTutorPanel()`, `pvToSan()`, `formatEval()`, `bookStatusFor()`,
`askLLM()`, `tutorSettings` (get/set localStorage). Greffe en surcouche : tuteur éteint =
comportement actuel inchangé.

## 6. Prompt LLM (ancrage anti-hallucination)

Claude reçoit : FEN, coups joués, **évaluation et meilleure ligne du moteur local**, statut
théorique/hors-livre, niveau visé (débutant). Consigne : expliquer en français simple en
s'appuyant sur ces données, sans inventer de coups, en restant cohérent avec l'évaluation
fournie. Le moteur garantit l'exactitude ; Claude apporte la pédagogie.

## 7. Points de vigilance

- **Sécurité de la clé** : localStorage du navigateur de l'utilisateur uniquement, transmise
  seulement à `api.anthropic.com`. Avertissement : ne pas utiliser sur un poste partagé.
  Compromis assumé du choix « chaque utilisateur sa clé, sans serveur ».
- **Latence** : l'analyse tourne dans le worker → interface non gelée ; bouton IA en état
  « réflexion… » pendant l'appel.
- **Coût** : à la charge de l'utilisateur, uniquement au clic ; modèle Haiku par défaut pour
  minimiser.
- **Non-régression** : tuteur éteint ⇒ application strictement identique à l'actuelle.

## 8. Hors périmètre (YAGNI)

- Pas de serveur, pas de proxy, pas d'authentification par e-mail.
- Pas de support OpenAI / autres fournisseurs (Claude uniquement).
- Pas de commentaire LLM automatique à chaque coup (uniquement à la demande).
