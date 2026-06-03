# Module d'entraînement aux ouvertures — Spécification

**Date :** 2026-06-03
**Fichier cible :** `/home/wims/public_html/chess/chess.html` (+ données `openings.json`, + script de dev)
**Demandeur :** S. Jaubert (administrateur WIMS, formateur)

## 1. Objectif

Ajouter à l'application d'échecs un **mode « Entraînement ouvertures »** : le stagiaire
choisit une **ouverture nommée** (catalogue ECO complet) et son **camp** (Blancs ou Noirs),
puis **drille la ligne** — l'app joue le camp adverse selon la théorie, le stagiaire doit
trouver les coups de sa couleur, avec correction immédiate, indices, et une explication IA à
la demande.

Mode **« Partie libre »** = le jeu actuel contre le bot, **strictement inchangé**
(non-régression garantie par les 21 tests existants).

## 2. Décisions de conception (validées)

| Sujet | Choix |
|---|---|
| Expérience | **Drill guidé** d'ouvertures nommées |
| Choix du camp | Le stagiaire choisit **Blancs ou Noirs** |
| Source des lignes | Jeu de données **lichess `chess-openings`** (ECO, ~3 500 lignes, CC0) |
| Navigation catalogue | **Classiques mis en avant + recherche** par nom sur tout le catalogue |
| Ampleur | **Tout le catalogue** (pas de filtrage) |
| Lien avec le tuteur IA | **Module indépendant** + bouton **« Explique cette ouverture »** (API Claude à la demande) |
| Périmètre fichiers | Code dans `chess.html` (section délimitée) ; données dans `openings.json` ; script de conversion de dev versionné |

## 3. Expérience utilisateur

- **Sélecteur de mode** en haut : « Partie libre » / « Entraînement ouvertures » (défaut : Partie libre).
- **En mode entraînement :**
  1. **Choix de l'ouverture** : liste de **classiques mis en avant** (Ruy Lopez, Italienne,
     Sicilienne, Française, Caro-Kann, Scandinave, Gambit Dame, Est-Indienne, Anglaise,
     Réti…) + **champ de recherche** par nom (accès aux ~3 500). Chaque entrée : nom, code
     ECO, aperçu des premiers coups.
  2. **Choix du camp** : Blancs ou Noirs.
  3. **Drill** : plateau en position initiale ; l'app joue automatiquement les coups du camp
     adverse selon la ligne (si le stagiaire est Noir, l'app joue d'abord le 1er coup blanc).
     - **Coup juste** → on avance ; l'adversaire répond.
     - **Coup faux** → refusé (position inchangée) ; message « Ce n'est pas le coup de la
       ligne » ; bouton **« Indice »** : 1er appui surligne la pièce à jouer, 2e appui
       surligne/joue la case d'arrivée.
     - **Fin de ligne** → « ✅ Ligne terminée — vous maîtrisez *[nom]* ». Boutons :
       **Recommencer**, **Continuer en partie libre** (bascule en mode jeu depuis la
       position courante, contre le bot), **Choisir une autre ouverture**.
  4. Bouton **« 💡 Explique cette ouverture »** (à la demande) : API Claude, explique l'idée
     et les plans typiques de l'ouverture en cours. Grisé sans clé API (comme le tuteur).
- **Panneau « Entraînement »** (remplace le panneau scores/tuteur en mode entraînement) :
  nom + ECO, progression (coup X / N), dernier message de feedback, et les boutons ci-dessus.

## 4. Ressource de données

**Pipeline de développement (exécuté une fois, non livré au runtime) :**
1. Récupérer `a.tsv`…`e.tsv` du dépôt lichess `chess-openings` (colonnes `eco / name / pgn`).
2. Script de dev `tools/build-openings.mjs` (Node, dépendance dev `chess.js`) : rejoue chaque
   séquence SAN, produit la liste de coups **UCI**. Les lignes non convertibles sont
   **ignorées et comptées** (qualité des données).
3. Sortie **`openings.json`** (livré, chargé par `fetch`) :
   ```json
   [ { "eco":"C60", "name":"Ruy Lopez", "uci":["e2e4","e7e5","g1f3","b8c6","f1b5"] }, … ]
   ```
4. **Classiques mis en avant** : liste de noms canoniques **dans `chess.html`** (éditable),
   appariée aux entrées de `openings.json`.

**Propriétés :** taille ~0,8–1,2 Mo (chargé une fois, négligeable en local) ; **aucune
dépendance runtime** (`chess.js` sert uniquement au build) ; régénérable ; licence CC0
(attribution notée dans le dépôt).

## 5. Architecture

- **État de mode** `mode` (`'play'` | `'train'`, défaut `'play'`). En `'play'`, comportement
  actuel inchangé (greffe en surcouche).
- **État du drill** : `{ opening, side, line:[uci…], plyIndex, hintLevel }`.
- **Intégration dans `chess.html`** (section délimitée `// === ENTRAÎNEMENT OUVERTURES`,
  dans l'IIFE principale, pour accéder aux fonctions internes `legalMoves`/`applyMove`/
  `render`/`state`/`notation`) :
  - **Garde de mode** dans `tryMove`/`completePromo` : si `mode==='train'`, router vers
    `drillTryMove(from,to)` **au lieu** de déclencher le moteur (`triggerBot`) et l'analyse
    du tuteur (`requestAnalysis`).
  - **Adversaire scripté** `drillPlayOpponent()` : joue le coup suivant de la ligne (pas le
    moteur).
  - **Camp** : réutilise `userColor`/`flipped` ; les gestionnaires de souris limitent déjà
    les coups à la couleur du stagiaire.
  - **Chargement** : `fetch('openings.json')` à la première entrée en entraînement, mis en
    cache mémoire.
  - **Explication IA** : réutilise l'infra `askLLM` avec `buildOpeningPrompt(opening)`.
- **Unités testables** : `loadOpenings()`, `featuredOpenings()`, `searchOpenings(query)`,
  `startDrill(opening, side)`, `drillTryMove(from,to)`, `drillPlayOpponent()`,
  `renderDrillPanel()`, `buildOpeningPrompt()`, script `tools/build-openings.mjs`.

## 6. Tests (Playwright)

- `openings.json` se charge ; la liste affiche les classiques ; la recherche filtre par nom.
- Drill **Blancs** : coup juste → avance ; coup faux → refusé + message ; **Indice** surligne.
- Drill **Noirs** : l'app joue d'abord le coup blanc.
- **Fin de ligne** → message de réussite ; « Continuer en partie libre » rebascule en mode jeu.
- **« Explique »** → appel Claude **intercepté** (mock), texte affiché.
- **Non-régression** : mode « Partie libre » inchangé ; les 21 tests existants restent verts.

## 7. Gestion d'erreurs

- Échec de chargement `openings.json` → message dans le panneau, entraînement indisponible,
  **le jeu reste utilisable**.
- Drill : un coup légal mais hors ligne est traité comme « coup faux » (refusé), pas comme une
  erreur. Promotions dans la ligne gérées via le suffixe UCI.

## 8. Hors périmètre (YAGNI)

- Pas de suivi de progression/statistiques par stagiaire (au-delà de l'état de la session).
- Pas de prise en charge des transpositions (seule la ligne exacte choisie est attendue).
- Pas d'édition du catalogue dans l'UI (le catalogue se régénère via le script de dev).
- Pas de tuteur live (éval/meilleure ligne) pendant le drill.
