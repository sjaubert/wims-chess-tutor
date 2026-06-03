# Annuler un coup (take-back) — Spécification

**Date :** 2026-06-03
**Fichier cible :** `/home/wims/public_html/chess/chess.html`
**Demandeur :** S. Jaubert

## 1. Objectif

Permettre, en **partie classique** (mode « Partie libre », contre le bot), d'**annuler son
dernier coup et la réponse du bot**, revenant à son trait — de façon répétable jusqu'au début
de la partie.

## 2. Décisions de conception (validées)

| Sujet | Choix |
|---|---|
| Comportement | Annuler **un coup complet** (votre coup + réponse du bot), **répétable** jusqu'au début |
| Périmètre | **Partie classique uniquement** (pas en mode entraînement) |
| Fin de partie | Annuler **désactivé** une fois la partie terminée (on repart par « Nouvelle partie ») |

## 3. Expérience utilisateur

- **Bouton « ↩ Annuler »** dans les contrôles (près de « Nouvelle partie » / « Abandonner »),
  visible en mode Partie libre.
- Chaque clic ramène le joueur à son trait précédent (annule son coup + la réponse du bot).
- **Activé** quand : c'est le trait du joueur, au moins un de ses coups a été joué, la partie
  n'est pas terminée, et le bot ne réfléchit pas. **Désactivé** sinon.
- Réinitialisé à « Nouvelle partie ».
- Si le tuteur IA est allumé, son analyse se rafraîchit après l'annulation.

## 4. Architecture

- **Pile d'annulation** `undoStack` : avant chaque coup réel (du joueur **et** du bot), on
  empile une **photo** `{ state: clone(state), lastMove, historyLen, positionCounts:
  new Map(positionCounts), turnAtSnapshot }`.
- `undoMove()` : dépile en restaurant jusqu'à retrouver une photo où `turnAtSnapshot ===
  userColor` (le trait du joueur avant son dernier coup), puis restaure cette photo (state,
  lastMove, troncature de `history`, positionCounts, `gameOver=false`, `botBusy=false`,
  `selected=null`), `render()`, et `requestAnalysis()` si le tuteur est actif.
- **Robustesse** : on restaure un **clone complet** de la position → tous les coups spéciaux
  (roque, prise en passant, promotion) sont gérés sans rejeu.
- **Points d'empilement** : `tryMove`, `completePromo`, et l'application du coup du bot dans
  `worker.onmessage`.
- **Disponibilité** : `canUndo()` = `mode==='play' && !botBusy && !gameOver && ∃ photo avec
  turnAtSnapshot===userColor`. L'état activé/désactivé du bouton est mis à jour dans
  `updatePanel()`.
- **Réinitialisation** : `startNewGame` vide `undoStack`. En mode entraînement (`startDrill`),
  l'`undoStack` est ignoré et le bouton masqué/désactivé.

## 5. Unités

`pushUndoSnapshot()`, `undoMove()`, `canUndo()`, `restoreSnapshot(snap)` — petites fonctions
isolées et testables, greffées en surcouche sans toucher la logique de jeu existante.

## 6. Tests (Playwright)

- Jouer 1.e4 (bot répond) → « Annuler » → retour à la position de départ, trait au joueur,
  bouton désactivé (rien à annuler).
- Jouer deux coups complets → « Annuler » deux fois → retour au départ.
- Le bouton est **désactivé** pendant que le bot réfléchit et **après échec et mat**.
- Un coup spécial (ex. petit roque) est correctement annulé (pièces et droits de roque
  restaurés).
- **Non-régression** : le jeu normal et le mode entraînement sont inchangés (suite existante
  verte).

## 7. Hors périmètre (YAGNI)

- Pas de « refaire » (redo).
- Pas d'annulation en mode entraînement.
- Pas d'annulation après la fin de partie (ni de décompte de score).
- Pas de raccourci clavier (peut être ajouté plus tard).
