# Module « Entraînement ouvertures » — Maintenance

Doc d'entrée pour maintenir/améliorer le mode entraînement aux ouvertures.
Voir aussi `docs/TUTEUR-IA.md` (tuteur IA) et les `docs/superpowers/specs|plans/2026-06-03-module-ouvertures*`.

- **Runtime livré :** `chess.html` (section `// === ENTRAÎNEMENT OUVERTURES`) + `openings.json`.
- **Build (dev, non livré) :** `tools/build-openings.mjs` (+ dépendance dev `chess.js`).
- **Tests :** `tests/openings.spec.js` (Playwright). Branche `main`. Ajouté le 2026-06-03.

> Règle d'or : **mode « Partie libre » strictement inchangé.** La garde
> `if(mode==='train') return drillTryMove(...)` en tête de `tryMove` isole l'entraînement ;
> tout le reste du jeu n'est pas touché.

## Données (`openings.json`)

- Source : **lichess `chess-openings`** (TSV ECO `a..e`, CC0). Schéma livré :
  `[{ "eco","name","uci":["e2e4",…] }, …]` (~3706 entrées).
- **Régénérer :** `node tools/build-openings.mjs` (télécharge les TSV dans
  `tools/openings-src/` — gitignoré —, les met en cache, rejoue chaque PGN via `chess.js`,
  écrit `openings.json`). Idempotent.
- **Classiques mis en avant :** constante `FEATURED_OPENINGS` dans `chess.html` (noms exacts
  du dataset, ex. `Sicilian Defense`). Éditable à volonté.

## Carte du code (`chess.html`, dans l'IIFE principale)

- État : `mode` (`'play'|'train'`), `openingsData` (cache), `drill`
  (`{opening, side, line:[uci], plyIndex, hintLevel}`).
- Catalogue : `loadOpenings()` (fetch+cache), `featuredOpenings()`, `searchOpenings(q)`.
- Sélecteur : `showOpeningPicker()`, `renderOpeningRows()`, `askSideThenStart()`,
  `openingMovesPreview()`.
- Drill : `startDrill(opening,side)` (établit le mode train de façon autonome),
  `drillTryMove(from,to)`, `drillPlayOpponent()` (adversaire scripté), `renderDrillPanel()`,
  `drillFeedback()`, `drillHint()` (2 niveaux : pièce puis arrivée), `drillComplete()`,
  `continueInFreePlay()`.
- IA : `buildOpeningPrompt(opening)` + `explainOpening()`, via le helper partagé
  `claudeComplete(system,user)` (aussi utilisé par le tuteur `askLLM`).
- `uciOf(m)` = identifiant UCI d'un coup. `sqIndex`/`sqName`/`fromFEN`/`pvToSan`/`formatPvLine`
  réutilisés.
- Seam de test : `window.__trainTest` (getMode, getDrill, loadOpenings, featuredOpenings,
  searchOpenings, startDrill, uciOf, buildOpeningPrompt).
- HTML : sélecteur `#modePlay`/`#modeTrain` + `#trainPane` (picker `#openingPicker` +
  `#drillPanel`). CSS : `.right-stack` en flex ; `.right-stack.train` masque les panneaux de
  jeu et montre `#trainPane`.

## Pièges / notes

- Plateau au **glisser-déposer** : tests via `dragPiece(page, from, to)` (indices 0=a8…63=h1).
- Les tests du drill utilisent des **lignes en dur** (`TEST_LINE`) → indépendants du dataset ;
  seuls les tests « catalogue » dépendent de noms réels (Ruy Lopez, Sicilian).
- `startDrill` ajoute lui-même la classe `train` au `.right-stack` (robuste même appelé hors
  du flux `setMode`).
- Une seule **ligne exacte** est attendue (pas de transpositions — choix assumé).

## Améliorations possibles (backlog)

- Suivi de progression par stagiaire (ouvertures réussies) en localStorage.
- Accepter les transpositions (comparer par position plutôt que par coup exact).
- Regrouper les variantes d'une même famille (filtre par ECO) dans le sélecteur.
- Mode « révision aléatoire » piochant une ouverture au hasard.
- Après une ligne, proposer d'enchaîner sur une **variante** voisine (même préfixe).
