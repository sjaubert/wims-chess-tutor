# Tuteur d'ouvertures — Spec de conception

**Date :** 2026-06-04
**Statut :** validé (design approuvé par l'utilisateur le 2026-06-04)
**Application :** `chess.html` (fichier HTML unique, JS vanilla + Web Worker)
**Remplace/étend :** le module « Entraînement ouvertures » du 2026-06-03
(`docs/superpowers/specs/2026-06-03-module-ouvertures-design.md`, doc de maintenance
`docs/OUVERTURES.md`).

---

## 1. Objectif & motivation

Le mode entraînement actuel est sommaire : on choisit une ouverture nommée, on rejoue **une
seule ligne exacte** avec 2 niveaux d'indice (pièce, case d'arrivée), plus un bouton
« Explique » via Claude. Pas de défilement, pas de pièges, profondeur limitée en pratique.

On veut un **véritable tuteur d'ouvertures** en trois phases :

1. **Étude** — faire défiler les coups d'une ligne de la littérature (≈ 10 premiers coups)
   pour les mémoriser, avec les commentaires pédagogiques et les **grands pièges classiques**.
2. **Restitution** — tenter de retrouver les coups soi-même, avec des indices **progressifs**
   allant sur toute la profondeur de la ligne (pas seulement les 3-4 premiers coups).
3. **Partie** — commencer une partie contre le bot **à n'importe quel moment**, à partir de
   la position courante.

> **Règle d'or (non-régression) :** le mode « Partie libre » et le tuteur éteint restent
> strictement identiques à l'existant. La garde `if(mode==='train')` en tête de `tryMove`
> isole tout l'entraînement. Voir `tests/baseline.spec.js`.

---

## 2. Décisions prises (brainstorming du 2026-06-04)

| Sujet | Décision |
|-------|----------|
| Source des pièges/contenu | **Pack curé hors-ligne**, écrit à la main, fiable, sans clé API requise pour le cœur. |
| Couverture | **Leçons curées annotées** (~15-20 ouvertures essentielles + ~30 pièges) **+** catalogue ECO (3706) conservé en recherche libre. |
| Indices en restitution | **4 niveaux progressifs** : mot → pièce → case → coup joué. S'applique sur toute la ligne. |
| Suivi de progression | **Pas dans cette version** (backlog : statut par leçon, révision espacée type Anki). |
| Bascule en partie | Bouton « Jouer à partir d'ici » en Étude et Restitution → partie libre depuis la position courante, le moteur prend le relais. |

---

## 3. Données — `lessons.json` (curé)

Fichier **distinct** du gros `openings.json` (catalogue ECO inchangé). Tableau de **leçons**,
schéma unique pour mainlines et pièges :

```json
{
  "id": "legal-mate",
  "name": "Mat de Légal",
  "category": "trap",
  "eco": "C41",
  "side": "w",
  "uci": ["e2e4","e7e5","g1f3","d7d6","f1c4","c8g4","b1c3","g7g6","f3e5","g4d1","c4f7","e8e7","c3d5"],
  "comments": ["Contrôle le centre.", "…", "⚠ Le piège : sacrifice de la dame !", "…"],
  "trapPly": 8,
  "summary": "Sacrifice de dame menant à un mat si Noir prend en d1.",
  "refutation": "Si Noir joue …Cf6 au lieu de prendre, Blanc garde l'avantage."
}
```

### Schéma (contrat)

| Champ | Type | Obligatoire | Sens |
|-------|------|-------------|------|
| `id` | string | oui | identifiant stable (kebab-case), unique. |
| `name` | string | oui | nom affiché (français). |
| `category` | `"mainline"` \| `"trap"` | oui | groupe dans le sélecteur. |
| `eco` | string | non | code ECO indicatif. |
| `side` | `"w"` \| `"b"` | oui | camp que le stagiaire étudie/joue. |
| `uci` | string[] | oui | ligne principale, demi-coups en UCI (`e2e4`, promo `e7e8q`). |
| `comments` | string[] | oui | commentaire par demi-coup, **même longueur que `uci`**. Chaîne vide permise. |
| `trapPly` | number | non (oui si `category==="trap"`) | index 0-based dans `uci` du coup-piège ; déclenche l'encart « ⚠ Piège ». |
| `summary` | string | oui | résumé affiché à l'ouverture de la leçon. |
| `refutation` | string | non | que faire si l'adversaire évite le piège / la ligne. |

### Contenu visé (indicatif, ajustable)

- **Ouvertures essentielles (~15-20)** : Espagnole (Ruy Lopez), Italienne (Giuoco Piano),
  Sicilienne (Najdorf, Dragon), Française, Caro-Kann, Scandinave, Gambit Dame accepté/refusé,
  Est-Indienne, Nimzo-indienne, Anglaise, Londres, Petroff, Scotch, Vienne.
- **Pièges célèbres (~30)** : Mat de Légal, Fried Liver (Cavalier en f7), Fishing Pole,
  Blackburne-Shilling, Gambit Englund (piège …Qb4+/Nd6#), Piège de Lasker, Noah's Ark,
  Elephant Trap (Cambridge Springs), Halloween Gambit, Stafford Gambit, Mat du berger et sa
  parade, Mat de l'imbécile, piège Mortimer, Würzburger Trap, Magnus Smith, Tarrasch Trap, etc.

### Validation des données

Script de build/validation **`tools/validate-lessons.mjs`** (dépendance dev `chess.js`) :

- rejoue chaque `uci` depuis la position de départ → **échoue si un coup est illégal** ;
- vérifie `comments.length === uci.length` ;
- vérifie unicité des `id`, présence des champs obligatoires, `trapPly` valide (`0 ≤ trapPly < uci.length`) quand `category==="trap"`.

Exécuté en CI locale et **rejoué dans la suite Playwright** (seam de test ou test node) pour
garantir qu'aucune leçon invalide n'est livrée.

---

## 4. Phases & comportement

### 4.1 Sélecteur de leçons

- Deux groupes curés : **« Ouvertures essentielles »** et **« Pièges »** (depuis
  `lessons.json`), chacun listant nom + ECO + camp.
- Un onglet **« Catalogue »** réutilisant la recherche existante sur les 3706 lignes ECO
  (`openings.json`) — comportement actuel conservé (sélection → choix du camp → Étude/Restitution
  sur la ligne brute, sans commentaires).
- Choisir une leçon ouvre la **phase Étude**.

### 4.2 Phase Étude

- Plateau affichant la leçon depuis le départ.
- Contrôles : **⏮ ◀ ▶ ⏭** + lecture automatique (play/pause, cadence fixe).
- À chaque pas : la pièce se déplace **avec surbrillance** du coup ; le panneau affiche le n° de
  coup, la **notation française**, et le `comment` du demi-coup courant.
- Au `trapPly` : encart proéminent **« ⚠ Piège ! »** avec l'explication (le `comment` de ce coup
  et/ou `summary`/`refutation`).
- **Liste de coups cliquable** : sauter à n'importe quel demi-coup (`studyJumpTo`).
- Boutons : **« M'exercer »** (→ Restitution depuis le début) et **« Jouer à partir d'ici »**
  (→ Partie depuis la position courante).

### 4.3 Phase Restitution

- Rejoue depuis le début (ou depuis une position de départ choisie). Les **réponses adverses
  sont jouées automatiquement** depuis la ligne scriptée.
- Le stagiaire joue les coups de **son camp** (`side`) au glisser-déposer.
- **Indices progressifs (4 niveaux)**, à la demande, escaladant :
  1. **Idée en mots** (réutilise le `comment` ou un libellé générique).
  2. **Surligne la pièce** à jouer.
  3. **Surligne la case** d'arrivée.
  4. **Joue le coup** à la place du stagiaire.
- Coup faux : **refusé** avec retour bienveillant ; après **2-3 essais ratés**, on propose
  automatiquement le niveau d'indice suivant.
- **Barre de progression** (X / N demi-coups du camp retrouvés).
- Fin de ligne : message de réussite + boutons « Revoir (Étude) », « Rejouer », « Jouer à
  partir d'ici ».
- Comparaison **par coup exact** (pas de transpositions — choix assumé, cohérent avec
  l'existant ; transpositions = backlog).

### 4.4 Bascule « Jouer à partir d'ici »

- Disponible en Étude et en Restitution, à n'importe quelle position.
- Bascule en **partie libre** (`mode='play'`) à partir de la position courante : le stagiaire
  **garde son camp** (`side`), le moteur prend le relais (il a déjà son propre livre Polyglot).
- Réutilise intégralement le moteur de jeu existant. **Aucune régression** sur la partie libre.

---

## 5. Architecture & découpage du code (`chess.html`, IIFE principale)

### État

- `mode` reste `'play' | 'train'` → la garde baseline `if(mode==='train')` est **préservée**.
- Ajouts : `lesson` (objet leçon courant ou null) et `phase ∈ {'study','recall'}`.
- Le `drill` actuel (`{opening, side, line, plyIndex, hintLevel}`) est **généralisé** en
  contrôleur de restitution opérant sur une leçon (`lesson.uci` / `lesson.comments`).

### Unités (chacune compréhensible et testable isolément)

| Unité | Fonctions | Rôle |
|-------|-----------|------|
| Données | `loadLessons()`, `featuredLessons()`, `searchLessons()` (+ `loadOpenings()` existant) | charge/cherche le contenu curé et le catalogue. |
| Sélecteur | `showLessonPicker()`, `renderLessonGroups()`, `renderCatalogTab()` | UI de choix (2 groupes curés + onglet catalogue). |
| Étude | `startStudy(lesson)`, `studyStep(±1)`, `studyJumpTo(ply)`, `studyAutoplay()`, `renderStudyPanel()` | défilement + commentaires + encart piège. |
| Restitution | `startRecall(lesson, fromPly)`, `recallTryMove()`, `recallPlayOpponent()`, `recallHint()`, `recallComplete()`, `renderRecallPanel()` | rejeu guidé + indices 4 niveaux. |
| Bascule | `playFromHere()` | passe en partie libre depuis la position courante. |

- Notation FR et rendu plateau **réutilisés** : `pvToSan`, `formatPvLine`, helpers de
  surbrillance, `uciOf`, `sqIndex`/`sqName`/`fromFEN`.
- Seam de test étendu : `window.__trainTest` exposant `getMode`, `getPhase`, `getLesson`,
  `loadLessons`, `searchLessons`, `startStudy`, `studyStep`, `startRecall`, `recallHint`,
  `playFromHere` (sans déclencher le bot).

### HTML / CSS

- Sélecteur de mode existant `#modePlay` / `#modeTrain` conservé.
- `#trainPane` étendu : sélecteur `#lessonPicker` (groupes + onglet catalogue), panneau
  d'étude `#studyPanel` (contrôles ⏮◀▶⏭, liste de coups, commentaire, encart piège) et panneau
  de restitution `#recallPanel` (indices, progression, feedback).
- `.right-stack.train` masque les panneaux de jeu et montre `#trainPane` (mécanique existante).

---

## 6. Tests

| Test | Vérifie |
|------|---------|
| `tools/validate-lessons.mjs` (rejoué en test) | toutes les lignes légales, commentaires alignés, ids uniques, `trapPly` valide. |
| Étude | ◀/▶ déplacent les pièces ; commentaire mis à jour ; encart piège au `trapPly` ; saut par clic. |
| Restitution | bon coup avance / faux refusé ; les 4 niveaux d'indice escaladent dans l'ordre ; fin de ligne = succès ; progression correcte. |
| Bascule | « Jouer à partir d'ici » passe en `mode='play'` à la bonne position, camp conservé. |
| Catalogue | l'onglet catalogue conserve le comportement de recherche existant. |
| Baseline | partie libre + tuteur éteint strictement inchangés (`baseline.spec.js`). |

Les tests du drill/étude utilisent des **leçons en dur** (fixtures) pour rester indépendants
du contenu réel ; seuls les tests « contenu » vérifient `lessons.json` livré.

---

## 7. Documentation

Mise à jour de **`docs/OUVERTURES.md`** : nouveau flux 3 phases, schéma `lessons.json`,
validation, carte du code par nom de fonction, seams de test, et backlog mis à jour.

---

## 8. Hors périmètre (backlog)

- Suivi de progression par stagiaire (statut non vue/en cours/acquise, révision espacée Anki).
- Acceptation des **transpositions** (comparaison par position plutôt que par coup exact).
- Explication enrichie par Claude à la demande sur une leçon (le bouton « Explique » existant
  pourra être rebranché sur les leçons curées).
- Regroupement automatique des variantes d'une même famille ECO dans l'onglet catalogue.
- Mode « révision aléatoire » piochant une leçon au hasard.
