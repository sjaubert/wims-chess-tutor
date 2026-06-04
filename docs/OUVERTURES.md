# Tuteur d'ouvertures — Maintenance

Doc d'entrée pour maintenir/améliorer le **tuteur d'ouvertures en 3 phases** (Étude →
Restitution → Partie). Voir aussi `docs/TUTEUR-IA.md` (tuteur IA en partie), `docs/BILAN.md`
(bilan/Elo), et les specs/plans :
- `docs/superpowers/specs/2026-06-04-tuteur-ouvertures-design.md` (conception)
- `docs/superpowers/plans/2026-06-04-tuteur-ouvertures.md` (plan d'implémentation)
- `docs/superpowers/specs|plans/2026-06-03-module-ouvertures*` (version initiale, historique)

- **Runtime livré :** `chess.html` (section `// === ENTRAÎNEMENT OUVERTURES` et
  `// === PHASE ÉTUDE`) + `lessons.json` (curé) + `openings.json` (catalogue ECO).
- **Build/validation (dev, non livré) :** `tools/validate-lessons.js` (valide `lessons.json`),
  `tools/build-openings.mjs` (régénère `openings.json`).
- **Tests :** `tests/lessons-data.spec.js`, `tests/study.spec.js`, `tests/recall.spec.js`,
  `tests/handoff.spec.js`, `tests/openings.spec.js` (Playwright). Branche `main`.

> Règle d'or : **mode « Partie libre » strictement inchangé.** La garde
> `if(mode==='train') return drillTryMove(...)` en tête de `tryMove` isole l'entraînement.

## Les 3 phases

1. **Étude** (`phase==='study'`) — on fait défiler une leçon (⏮ ◀ ▶ ▶▌ ⏭ + lecture auto),
   commentaire par demi-coup, encart **« ⚠ Piège »** au `trapPly`, liste de coups cliquable
   (notation française). Plateau en **lecture seule**.
2. **Restitution** (`phase==='recall'`, moteur `drill`) — le stagiaire rejoue la ligne de
   mémoire ; l'adversaire est scripté. **Indices progressifs à 4 niveaux** (mot → pièce →
   case → coup joué) ; après 3 essais ratés, le niveau d'indice monte tout seul.
3. **Partie** — bouton **« Jouer à partir d'ici »** (`playFromHere`) : la position courante
   devient le départ d'une partie libre contre le moteur (le stagiaire garde son camp).

## Données

### `lessons.json` (bibliothèque curée)

Schéma (un objet = une leçon) :

```json
{
  "id": "legal-mate",            // identifiant kebab-case unique
  "name": "Mat de Légal",        // nom affiché (français)
  "category": "trap",            // "mainline" | "trap"
  "eco": "C41",                  // optionnel
  "side": "w",                   // camp étudié/joué : "w" | "b"
  "uci": ["e2e4", "..."],        // ligne principale, demi-coups UCI (promo: "e7e8q")
  "comments": ["...", "..."],    // 1 commentaire par demi-coup, MÊME longueur que uci
  "trapPly": 8,                  // index du coup-piège (obligatoire si category=="trap")
  "summary": "…",                // résumé affiché à l'ouverture (ply 0)
  "refutation": "…"              // optionnel : si l'adversaire évite la ligne
}
```

- **Contenu livré :** 8 ouvertures essentielles + 11 pièges classiques (Légal, Fegatello,
  Blackburne-Shilling, Englund, mat du berger, mat de l'imbécile, éléphant, Lasker, Halloween,
  Stafford, Damiano).
- **Valider :** `node tools/validate-lessons.js` — vérifie via **chess.js** que chaque ligne
  est **légale**, que `comments.length === uci.length`, que les `id` sont uniques, que les
  champs obligatoires sont présents et que `trapPly` est valide pour les pièges. La fonction
  `validateLessons(lessons)` est aussi rejouée par `tests/lessons-data.spec.js`.
- **Ajouter une leçon :** éditer `lessons.json`, puis lancer le validateur. (La justesse
  *théorique* des coups reste à la charge du rédacteur ; le validateur ne garantit que la
  légalité.)

### `openings.json` (catalogue ECO) — inchangé

Source lichess `chess-openings` (~3706 lignes, `{eco,name,uci}`). Régénérer :
`node tools/build-openings.mjs`. Accessible en recherche libre dans le picker ; une sélection
catalogue est convertie en leçon (sans commentaires) par `openingToLesson(o, side)` puis
ouverte en Étude.

## Carte du code (`chess.html`, IIFE principale)

- **État** : `mode`(`'play'|'train'`), `phase`(`'study'|'recall'`), `study`(`{lesson, ply}`),
  `drill`(`{opening, side, line, plyIndex, hintLevel, wrongTries}` — `opening` porte la leçon
  et ses `comments`), `lessonsData`/`openingsData` (caches).
- **Données** : `loadLessons`, `featuredLessons`, `searchLessons`, `openingToLesson` ;
  `loadOpenings`, `featuredOpenings`, `searchOpenings`.
- **Picker** : `showOpeningPicker` (charge les deux jeux de données, retire la classe
  `study`), `renderLessonGroups`/`renderLessonRows` (groupes `#lessonMainlines`/`#lessonTraps`),
  `renderOpeningRows`/`openingMovesPreview`, `askSideThenStart` (catalogue → choix camp →
  `startStudy`).
- **Étude** : `startStudy(lesson)`, `studyStep(±1)`, `studyJumpTo(ply)`, `studyApplyTo(ply)`
  (reconstruit la position depuis START, fixe `lastMove`, vide `legalCache`), `studyAutoplay`/
  `studyAutoStop` (intervalle `studyTimer`), `renderStudyPanel`.
- **Restitution** : `startDrill(opening, side)`, `drillTryMove`, `drillPlayOpponent`,
  `drillHint` (4 niveaux), `drillComplete`, `renderDrillPanel`, `drillFeedback`.
- **Bascule** : `playFromHere` (aligné sur `startNewGame` : reset history/undo/bilan/
  positionCounts/lastMove/scoredThisGame, garde la position courante) ; alias
  `continueInFreePlay`.
- **Lecture seule en Étude** : les handlers `pointerdown`/`click` du plateau retournent tôt si
  `mode==='train' && phase==='study'`.
- Helpers réutilisés : `pvToSan`/`formatPvLine` (notation FR), `uciOf`, `sqIndex`/`sqName`/
  `fromFEN`, `posKey`, `render`, `triggerBot`.

### HTML / CSS

- `#trainPane` contient `#openingPicker` (groupes leçons + catalogue), `#drillPanel`
  (restitution, avec `#drillHintText`, `#drillToFree`, `#drillToPlay`), `#studyPanel` (étude).
- CSS clés : `.study-comment`, `.study-trap`, `.study-controls`, `.study-move(.current)`,
  `.drill-hinttext` ; `.right-stack.train.study #drillPanel,#openingPicker{display:none}` et
  `.study-panel.hidden,.study-trap.hidden{display:none}`.

### Seam de test

`window.__trainTest` expose : `getMode`, `getPhase`, `getDrill`, `getStudy`, `loadOpenings`,
`featuredOpenings`, `searchOpenings`, `loadLessons`, `featuredLessons`, `searchLessons`,
`openingToLesson`, `startDrill`, `startStudy`, `studyStep`, `studyJumpTo`, `playFromHere`,
`uciOf`, `buildOpeningPrompt`.

## Pièges & notes

- Plateau au **glisser-déposer** : tests via `dragPiece(page, from, to)` (indices 0=a8…63=h1).
- Les tests d'étude/restitution utilisent des **leçons en dur** (fixtures) → indépendants du
  contenu réel ; seul `tests/lessons-data.spec.js` valide `lessons.json` livré.
- Comparaison **par coup exact** en restitution (pas de transpositions — choix assumé).
- `studyApplyTo` rejoue avec `applyMove(...,false)` (pas d'effet de bord) et pose `lastMove`
  manuellement pour la surbrillance.

## Améliorations possibles (backlog)

- **Suivi de progression** par leçon (non vue / en cours / acquise) en localStorage, pastilles
  + révision « ce qui n'est pas acquis » ; à terme révision espacée type Anki.
- Accepter les **transpositions** (comparer par position plutôt que par coup exact).
- Rebrancher le bouton **« Explique »** (Claude) sur les leçons curées.
- Regrouper les variantes d'une même famille ECO dans le catalogue ; mode « révision
  aléatoire » ; barre de progression graphique en restitution.
- Étendre le contenu `lessons.json` (objectif spec : ~15-20 ouvertures + ~30 pièges).
