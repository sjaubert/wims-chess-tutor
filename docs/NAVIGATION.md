# Navigation d'historique & Annuler — Documentation de maintenance

Deux fonctions liées du **mode Partie libre** (`mode==='play'`) qui manipulent la
position affichée sans corrompre l'historique de la partie :

1. **Navigation « time travel » (non destructive)** — revoir une position passée puis
   revenir au direct. La partie n'est **pas** modifiée.
2. **Annuler (take-back)** — supprimer réellement ton dernier coup *et* la réponse du bot.
   La partie **est** modifiée.

- **Fichiers livrés (runtime) :** `chess.html` (+ sa copie identique `index.html` — toute
  modification doit être appliquée **aux deux**).
- **Tests :** `tests/undo.spec.js` (les deux fonctions).
- **Modifié le 2026-06-04** : ajout de la navigation time-travel (clic sur un coup de
  l'historique + boutons ◀ ▶ Direct) ; nettoyage des `console.log` de débogage de
  `navigateToHistory` le 2026-06-05.

---

## 1. État

| Variable | Rôle |
|----------|------|
| `viewPly` | Index du **pli actuellement visualisé** (0 = position de départ, `history.length` = direct). Quand `viewPly < history.length`, on regarde le passé : le plateau est en **lecture seule**. |
| `history` | Liste des coups joués `[{by,piece,from,to,captured,notation,uci}, …]`. La navigation **ne la touche jamais**. |
| `undoStack` | Pile de snapshots pour l'Annuler (voir §4). |

**Invariant clé :** toute action qui modifie réellement la partie **réaligne** la vue sur
le direct avec `viewPly = history.length`. On le retrouve dans `tryMove`, `completePromo`,
`undoMove`, le retour de bilan, et la réinitialisation de partie. Oublier ce réalignement =
rester « coincé » en lecture seule après avoir joué.

---

## 2. Navigation time-travel

### Carte du code

| Élément | Emplacement | Rôle |
|---------|-------------|------|
| `applyHistoryTo(ply)` | `chess.html` | Rejoue la partie depuis `START` jusqu'à `ply` demi-coups (via `legalMoves` + `uci`), recalcule `lastMove`, vide `selected`/`legalCache`. **Pure** : reconstruit `state`, ne modifie pas `history`. |
| `navigateToHistory(idx)` | exposé sur `window` | Clic sur un coup de la liste. Cible `targetPly = idx+1`, garde `mode==='play' && !botBusy` et les bornes, puis `applyHistoryTo` + `render` (+ `requestAnalysis` si tuteur allumé). |
| Boutons `#prevMove` / `#nextMove` / `#liveMove` | handlers `onclick` | Reculer / avancer d'un pli, ou sauter au direct (`viewPly=history.length`). |
| Rendu de la liste | `updatePanel` | Chaque coup est un `<span class="history-move" onclick="navigateToHistory(i)">` ; le pli courant reçoit la classe `history-move current`. |

### Lecture seule pendant la visualisation

Quand `viewPly < history.length`, on bloque toute saisie sur le plateau :

- `tryMove` : `if(mode==='play' && viewPly < history.length) return false;`
- `boardEl` `pointerdown` : `if(mode==='play' && viewPly<history.length) return;`
- `updatePanel` affiche le statut **« Visualisation de l'historique »**.

Pour rejouer, l'utilisateur doit d'abord cliquer **« Retour au Direct »** (`#liveMove`).

### Activation des boutons (dans `updatePanel`, mode `play`)

```
prevMove.disabled = (viewPly <= 0);              // déjà au départ
nextMove.disabled = (viewPly >= history.length); // déjà au direct
liveMove.disabled = (viewPly >= history.length); // déjà au direct
```

### CSS

`.history-move` (cliquable, curseur pointer), `.history-move:hover`,
`.history-move.current` (surligne le pli affiché).

---

## 3. Annuler (take-back) — destructif

Mode Partie libre uniquement. Annule **ton coup + la réponse du bot**, répétable jusqu'au
début. Bouton `#undoMove`.

| Fonction | Rôle |
|----------|------|
| `pushUndoSnapshot()` | Empile un clone complet avant chaque coup utilisateur : `{state, lastMove, historyLen, positionCounts, turnAtSnapshot}`. |
| `restoreSnapshot(snap)` | Restaure l'état, **tronque** `history` à `snap.historyLen`, restaure `positionCounts`. |
| `canUndo()` | Vrai si `play`, pas de bot en cours, pas fini, c'est ton trait, et il existe un snapshot à ton tour. |
| `undoMove()` | Dépile jusqu'au dernier snapshot pris à `userColor`, restaure, réaligne `viewPly`. |

> Subtilité **triple répétition** : `positionCounts` est clonée (`new Map(...)`) dans le
> snapshot pour que l'annulation rétablisse exactement les compteurs d'occurrences.

---

## 4. Tests (`tests/undo.spec.js`)

- Annuler → retour au départ + bouton désactivé.
- Annuler restaure la position intermédiaire exacte (et deux fois → départ).
- Annuler désactivé pendant la réflexion du bot, puis réactivé.
- Annuler désactivé après fin de partie (abandon).
- **Time-travel** : cliquer un coup de l'historique ne supprime **pas** l'historique ;
  `#liveMove` ramène au direct.
- **Time-travel** : boutons ◀ Précédent / Suivant ▶ / Retour au Direct (activations).

Lancer : `npx playwright test tests/undo.spec.js` (ou toute la suite : `npx playwright test`).

---

## 5. Pièges à connaître

- **Toujours éditer `chess.html` ET `index.html`** : ils doivent rester identiques
  (`diff -q chess.html index.html`).
- Ne jamais modifier `history` lors d'une simple visualisation — seule l'Annuler tronque.
- Après tout coup réellement joué (y compris promotion et fin de bilan), vérifier que
  `viewPly = history.length` est bien remis, sinon le plateau reste en lecture seule.
