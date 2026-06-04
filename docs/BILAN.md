# Bilan de niveau & Elo estimé — maintenance

**But :** en fin de partie classique, estimer pour chaque camp un Elo indicatif, une précision %
et le compte bourdes/erreurs/imprécisions, d'après la qualité des coups.

## Flux
1. `updatePanel()` → `maybeRequestBilan()` quand `mode==='play'` et `gameOver` (une fois/partie).
2. `requestBilan()` reconstruit les positions (`buildBilanPositions`) et poste `{type:'bilan',states,moves}` au worker.
3. Worker : pour chaque position, `analyzePosition(s,hist,{timeMs:BILAN_TIME_MS,depth:BILAN_DEPTH})`
   → `{evalCp,isBook,nLegal}` ; poste `bilanProgress` puis `bilanResult`.
4. Main : `computeBilan(history, records)` → indicateurs par camp ; `renderBilan()` affiche `#bilanOverlay`.

## Fonctions clés
- Pures (testables via `window.__bilanTest`) : `winPercent`, `cpLoss`, `moveAccuracy`,
  `classifyLoss`, `acplToElo`, `computeBilan`.
- Exclusions : coups du livre (`isBook`) et coups forcés (`nLegal<=1`).

## Réglages (constantes)
- `BILAN_CP_CAP` (1000) : plafond de perte.
- Mapping Elo : `3000·e^(−ACPL/120)`, borné 400–2800 (dans `acplToElo`).
- Seuils erreurs : 50 / 100 / 200 cp (dans `classifyLoss`).
- Budget worker : `BILAN_TIME_MS` (150), `BILAN_DEPTH` (5).

## Tests
`tests/bilan.spec.js` : unitaires (fonctions pures) + intégration (mat → overlay).

## Backlog (hors périmètre actuel)
- Elo persistant entre parties (localStorage).
- Estimation en direct coup par coup.
- Graphique d'évaluation / export PGN.
