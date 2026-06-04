# Scoreboard — Documentation de maintenance

Compteur **cumulé** des résultats de tes parties contre le bot (mode Partie libre /
parties classiques). Persisté dans le navigateur via `localStorage`.

- **Fichier livré (runtime) :** `chess.html`
- **Tests :** `tests/game-controls.spec.js`
- **Modifié le 2026-06-04** : passage de la ligne unique `0 - 0 - 0` à **3 colonnes
  étiquetées et colorées**.

---

## 1. Comportement & affichage

Trois colonnes, dans l'ordre **Vous – Bot – Nulles** :

| Colonne | Span | Couleur | Sens |
|---------|------|---------|------|
| Vous    | `#scoreYou`  | vert (`--accent`) | tes victoires |
| Bot     | `#scoreBot`  | rouge (`#b0432e`) | victoires du bot |
| Nulles  | `#scoreDraw` | gris (`--muted`)  | parties nulles |

C'est la convention **W–L–D** (Wins–Losses–Draws), pas la notation de résultat d'une
partie unique (`1-0`, `½-½`, `0-1`).

> Avant le 2026-06-04 : un seul `<div id="scoreboard" class="scoreline">` affichait
> `${you} - ${bot} - ${draw}`. Aucune légende → format ambigu. Corrigé.

---

## 2. Carte du code (`chess.html`)

- **HTML** : conteneur `#scoreboard.scoreboard` contenant 3 `.score-cell`, chacune avec
  un `.score-num` (classe `you`/`bot`/`draw`) + un `.score-lbl`.
- **CSS** : classes `.scoreboard`, `.score-cell`, `.score-num` (+ `.you/.bot/.draw` pour
  la couleur), `.score-lbl`.
- **État** : objet `scores = {you, bot, draw}`.
  - `loadScores()` / `saveScores()` ⇄ `localStorage` clé `chessBotScoresV1`.
  - `scoredThisGame` : garde-fou « un seul point par partie ».
- **Mise à jour** : `updateScoreboard()` écrit dans `scoreYouEl` / `scoreBotEl` /
  `scoreDrawEl` (références cachées en haut du thread principal).
- **Incréments** : à la fin de partie — `scores.draw++` (pat/nulle), `scores.you++` /
  `scores.bot++` (échec et mat ou abandon).
- **Reset** : bouton `#resetScores` → confirmation → remise à `{0,0,0}`.

---

## 3. Backlog

- Score persistant lié à un Elo (cf. `docs/BILAN.md`, backlog « Elo persistant »).
- Distinguer victoires par mat / par abandon / au temps.
