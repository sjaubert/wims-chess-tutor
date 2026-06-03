# Annuler un coup (take-back) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter, en mode « Partie libre », un bouton « ↩ Annuler » qui annule le dernier coup du joueur + la réponse du bot (répétable jusqu'au début), désactivé pendant la réflexion du bot et en fin de partie.

**Architecture:** Avant chaque coup réel (joueur et bot), on empile une photo clonée de la position dans `undoStack`. `undoMove()` dépile jusqu'à une photo où c'est le trait du joueur et la restaure (clone complet → roque/en passant/promotion gérés sans rejeu). Greffe en surcouche : la logique de jeu existante n'est pas modifiée.

**Tech Stack:** HTML/CSS/JS vanilla (`chess.html`). Tests : Playwright.

---

## Structure des fichiers

| Fichier | Rôle | Statut |
|---|---|---|
| `chess.html` | Application (bouton + mécanique d'annulation) | **Modifié** |
| `tests/undo.spec.js` | Tests de l'annulation | **Créé** |

Petites unités isolées : `pushUndoSnapshot()`, `restoreSnapshot(snap)`, `canUndo()`, `undoMove()`.

**Helper de test commun** (à mettre en tête de `tests/undo.spec.js`) :
```js
const { test, expect } = require('@playwright/test');

async function dragPiece(page, fromIndex, toIndex){
  const f=await page.locator(`.square[data-i="${fromIndex}"]`).boundingBox();
  const t=await page.locator(`.square[data-i="${toIndex}"]`).boundingBox();
  await page.mouse.move(f.x+f.width/2,f.y+f.height/2);
  await page.mouse.down();
  await page.mouse.move(t.x+t.width/2,t.y+t.height/2,{steps:6});
  await page.mouse.up();
}
async function occupied(page){
  return page.$$eval('.square .piece', els => els.map(e=>+e.closest('.square').dataset.i).sort((a,b)=>a-b));
}
```

---

## Task 1 : Bouton + annulation d'un coup complet

**Files:**
- Modify: `chess.html` (HTML bouton ; `undoStack` ; `pushUndoSnapshot`/`restoreSnapshot`/`canUndo`/`undoMove` ; empilement dans `tryMove` et la réponse bot ; reset `startNewGame` ; désactivation dans `updatePanel` ; câblage)
- Test: `tests/undo.spec.js`

- [ ] **Step 1 : Écrire le test (annuler un coup ramène au départ)**

Créer `/home/wims/public_html/chess/tests/undo.spec.js` avec le helper commun ci-dessus, puis :
```js
test('annuler un coup ramène à la position de départ et désactive le bouton', async ({ page }) => {
  await page.goto('/chess.html');
  const start = await occupied(page);
  await expect(page.locator('#undoMove')).toBeDisabled(); // rien à annuler au départ
  await dragPiece(page, 52, 36);                           // e2 -> e4 ; le bot répond
  await expect(page.locator('#undoMove')).toBeEnabled({ timeout: 5000 }); // bot a répondu, votre trait
  await page.locator('#undoMove').click();
  expect(await occupied(page)).toEqual(start);             // retour au départ
  await expect(page.locator('#undoMove')).toBeDisabled();  // plus rien à annuler
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/undo.spec.js
```
Expected : FAIL — `#undoMove` absent.

- [ ] **Step 3 : Ajouter le bouton dans les contrôles**

Dans `chess.html`, remplacer le bloc `.controls` :
```html
            <div class="controls" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <button id="newGame">New Game</button>
              <button id="resign" class="danger">Abandonner</button>
            </div>
```
par :
```html
            <div class="controls" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <button id="newGame">New Game</button>
              <button id="resign" class="danger">Abandonner</button>
              <button id="undoMove" class="secondary" style="grid-column:1/-1" disabled>↩ Annuler</button>
            </div>
```
(`class="secondary"` = fond clair + texte foncé, donc lisible.)

- [ ] **Step 4 : Déclarer `undoStack`**

Dans `chess.html`, juste après la ligne
`let state, flipped, selected, legalCache, lastMove, history, dragging, botBusy, gameOver, resigned;`
ajouter :
```js
let undoStack=[]; // pile de photos de position pour l'annulation (mode partie libre)
```

- [ ] **Step 5 : Ajouter les fonctions d'annulation**

Dans `chess.html`, juste avant `function tryMove(from,to){`, insérer :
```js
// === ANNULER (take-back, mode partie libre) ===
function pushUndoSnapshot(){
  undoStack.push({
    state: clone(state),
    lastMove: lastMove ? {from:lastMove.from, to:lastMove.to, rook: lastMove.rook?{...lastMove.rook}:undefined} : null,
    historyLen: history.length,
    positionCounts: new Map(positionCounts),
    turnAtSnapshot: state.turn
  });
}
function restoreSnapshot(snap){
  state=snap.state;
  lastMove=snap.lastMove;
  history.length=snap.historyLen;
  positionCounts=snap.positionCounts;
  selected=null; gameOver=false; botBusy=false;
}
function canUndo(){
  return mode==='play' && !botBusy && !gameOver && state.turn===userColor
      && undoStack.some(s=>s.turnAtSnapshot===userColor);
}
function undoMove(){
  if(!canUndo()) return;
  let snap=null;
  while(undoStack.length){
    snap=undoStack.pop();
    if(snap.turnAtSnapshot===userColor) break;
  }
  if(!snap || snap.turnAtSnapshot!==userColor) return;
  restoreSnapshot(snap);
  render();
  if(tutorEnabled) requestAnalysis();
}
```

- [ ] **Step 6 : Empiler avant le coup du joueur (`tryMove`) et du bot**

Dans `chess.html`, dans `tryMove`, juste avant `const m=choices[0];` (après le bloc promotion), insérer la ligne :
```js
  pushUndoSnapshot();
  const m=choices[0];
```
Puis, dans `worker.onmessage` (réponse du bot), remplacer :
```js
    const m=e.data;
    if(m)state=applyMove(state,m,true);
```
par :
```js
    const m=e.data;
    if(m){ pushUndoSnapshot(); state=applyMove(state,m,true); }
```

- [ ] **Step 7 : Réinitialiser la pile à « Nouvelle partie »**

Dans `chess.html`, dans `startNewGame`, sur la ligne
`botBusy=false;gameOver=false;scoredThisGame=false;resigned=false;`
ajouter `undoStack=[];` :
```js
  botBusy=false;gameOver=false;scoredThisGame=false;resigned=false;undoStack=[];
```

- [ ] **Step 8 : Mettre à jour l'état activé/désactivé du bouton**

Dans `chess.html`, dans `updatePanel`, juste après `updateScoreboard();`, insérer :
```js
  document.getElementById('undoMove').disabled=!canUndo();
```

- [ ] **Step 9 : Câbler le bouton**

Dans `chess.html`, près du câblage `document.getElementById('newGame').onclick=…`, ajouter :
```js
document.getElementById('undoMove').onclick=undoMove;
```

- [ ] **Step 10 : Lancer (succès attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/undo.spec.js tests/baseline.spec.js
```
Expected : PASS.

- [ ] **Step 11 : Commit**

```bash
cd /home/wims/public_html/chess
git add chess.html tests/undo.spec.js
git commit -m "feat(jeu): annuler un coup complet (take-back) en partie libre"
```

---

## Task 2 : Restauration exacte d'une position intermédiaire + double annulation + promotion

**Files:**
- Modify: `chess.html` (empilement dans `completePromo`)
- Test: `tests/undo.spec.js`

- [ ] **Step 1 : Écrire les tests**

Ajouter à la fin de `/home/wims/public_html/chess/tests/undo.spec.js` :
```js
test('annuler restaure exactement la position intermédiaire (et deux fois -> départ)', async ({ page }) => {
  await page.goto('/chess.html');
  const start = await occupied(page);
  await dragPiece(page, 52, 36); // 1) e2-e4
  await expect(page.locator('#undoMove')).toBeEnabled({ timeout: 5000 });
  const afterMove1 = await occupied(page); // position (votre trait) après le coup 1 + réponse bot
  await dragPiece(page, 51, 35); // 2) d2-d4
  await expect(page.locator('#undoMove')).toBeEnabled({ timeout: 5000 });
  await page.locator('#undoMove').click(); // annule le coup 2 -> revient à afterMove1
  expect(await occupied(page)).toEqual(afterMove1);
  await page.locator('#undoMove').click(); // annule le coup 1 -> départ
  expect(await occupied(page)).toEqual(start);
  await expect(page.locator('#undoMove')).toBeDisabled();
});
```

- [ ] **Step 2 : Lancer (échec attendu sur la promotion couverte ensuite)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/undo.spec.js -g "intermédiaire"
```
Expected : ce test PASSE déjà (la mécanique de Task 1 le couvre). On ajoute néanmoins l'empilement manquant pour le chemin de promotion ci-dessous, afin que les coups de promotion soient aussi annulables.

- [ ] **Step 3 : Empiler avant un coup de promotion (`completePromo`)**

Dans `chess.html`, dans `completePromo`, remplacer :
```js
  pendingPromo=null;
  state=applyMove(state,m,true);
```
par :
```js
  pendingPromo=null;
  pushUndoSnapshot();
  state=applyMove(state,m,true);
```

- [ ] **Step 4 : Lancer (succès attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/undo.spec.js
```
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
cd /home/wims/public_html/chess
git add chess.html tests/undo.spec.js
git commit -m "feat(jeu): annulation des coups de promotion + test de restauration exacte"
```

---

## Task 3 : États désactivés (réflexion du bot, fin de partie) + isolation du mode entraînement

**Files:**
- Modify: `chess.html` (reset `undoStack` dans `startDrill` et `continueInFreePlay`)
- Test: `tests/undo.spec.js`

- [ ] **Step 1 : Écrire les tests**

Ajouter à la fin de `/home/wims/public_html/chess/tests/undo.spec.js` :
```js
test('Annuler est désactivé pendant la réflexion du bot puis réactivé', async ({ page }) => {
  await page.goto('/chess.html');
  await dragPiece(page, 52, 36);                          // votre coup -> trait au bot
  await expect(page.locator('#undoMove')).toBeDisabled(); // bot réfléchit / trait au bot
  await expect(page.locator('#undoMove')).toBeEnabled({ timeout: 5000 }); // bot a répondu
});

test('Annuler est désactivé après la fin de partie (abandon)', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/chess.html');
  await dragPiece(page, 52, 36);
  await expect(page.locator('#undoMove')).toBeEnabled({ timeout: 5000 });
  await page.locator('#resign').click();                  // partie terminée
  await expect(page.locator('#undoMove')).toBeDisabled();
});
```

- [ ] **Step 2 : Lancer (le test « réflexion » peut déjà passer ; vérifier)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/undo.spec.js -g "désactivé"
```
Expected : les deux tests PASSENT (Task 1 couvre déjà la désactivation via `canUndo`). S'ils passent, l'étape 3 ne fait que sécuriser l'isolation avec le mode entraînement.

- [ ] **Step 3 : Vider `undoStack` à l'entrée/sortie du mode entraînement**

Dans `chess.html`, dans `startDrill`, sur la ligne
`positionCounts=new Map(); legalCache=[];`
ajouter `undoStack=[];` :
```js
  positionCounts=new Map(); legalCache=[]; undoStack=[];
```
Puis, dans `continueInFreePlay`, juste après `gameOver=false; botBusy=false;`, ajouter :
```js
  undoStack=[];
```

- [ ] **Step 4 : Lancer (succès attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/undo.spec.js
```
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
cd /home/wims/public_html/chess
git add chess.html tests/undo.spec.js
git commit -m "feat(jeu): isolation de l'annulation (vidée à l'entrée du mode entraînement)"
```

---

## Task 4 : Vérification de non-régression & finalisation

**Files:**
- Test: toute la suite

- [ ] **Step 1 : Lancer toute la suite**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test
```
Expected : PASS pour tous les fichiers (baseline, helpers, analysis, tutor-ui, llm, game-controls, openings, undo).

- [ ] **Step 2 : Vérification manuelle**

Run :
```bash
cd /home/wims/public_html/chess
npx http-server -p 8123 -c-1 .
```
Ouvrir `http://127.0.0.1:8123/chess.html` et vérifier : jouer quelques coups, « ↩ Annuler » revient à votre trait précédent et est répétable ; désactivé pendant que le bot réfléchit et après une fin de partie ; absent/inactif en mode entraînement ; « Nouvelle partie » réinitialise.

- [ ] **Step 3 : Droits du fichier**

Run :
```bash
ls -l /home/wims/public_html/chess/chess.html
```
Si nécessaire : `sudo chown wims:wims chess.html`.

- [ ] **Step 4 : Commit final éventuel**

```bash
cd /home/wims/public_html/chess
git add -A
git commit -m "test(jeu): suite complète verte avec l'annulation" || echo "rien à committer"
```

---

## Notes de vérification (self-review effectuée)

- **Couverture de la spec :** comportement « coup complet répétable » (Task 1 `undoMove` dépile jusqu'au trait joueur ; Task 2 double annulation) ; périmètre partie libre (`canUndo` teste `mode==='play'` ; Task 3 vide la pile en entraînement) ; désactivé en fin de partie et pendant la réflexion (`canUndo` : `!gameOver && state.turn===userColor` ; Task 3) ; robustesse coups spéciaux (restauration d'un clone complet ; promotion empilée en Task 2) ; rafraîchissement tuteur (`undoMove` appelle `requestAnalysis` si tuteur actif) ; reset à Nouvelle partie (Task 1 Step 7). ✔
- **Cohérence des types :** photo `{state, lastMove, historyLen, positionCounts, turnAtSnapshot}` créée par `pushUndoSnapshot` et consommée par `restoreSnapshot`/`undoMove` à l'identique. `canUndo()` utilisé par `updatePanel` (désactivation) et `undoMove` (garde). ✔
- **Pas de placeholder** ; chaque étape donne le code exact et l'ancrage précis.
- **Note :** `canUndo` exige `state.turn===userColor`, donc l'annulation n'est proposée que lorsque c'est réellement votre trait (après la réponse du bot), ce qui rend la désactivation pendant la réflexion déterministe.
