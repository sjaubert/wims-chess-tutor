# Bilan de niveau & Elo estimé — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note environnement :** ici les sous-agents n'ont pas la permission Bash. Le contrôleur exécute les tests et les commits.

**Goal:** Afficher, en fin de partie classique, un bilan estimant pour chaque camp un Elo indicatif, une précision % et le compte des bourdes/erreurs/imprécisions, à partir de la qualité des coups.

**Architecture:** Le thread principal reconstruit les positions de la partie et les envoie au Web Worker, qui évalue chaque position (budget léger dédié) et renvoie pour chacune `{evalCp, isBook, nLegal}`. Un module pur côté principal (`computeBilan` + helpers) transforme ces évaluations en indicateurs par camp. Une UI overlay (calquée sur la boîte de promotion) affiche le bilan en fin de partie.

**Tech Stack:** HTML/CSS/JS vanilla dans un fichier unique (`chess.html`), Web Worker via Blob, tests Playwright (`tests/`).

**Référence :** `docs/superpowers/specs/2026-06-04-bilan-niveau-elo-design.md`

---

## Structure des fichiers

- **Modifier** `chess.html` :
  - *Worker* (`ENGINE_SRC`, ~l.589–1276) : constantes `BILAN_TIME_MS`/`BILAN_DEPTH`, `analyzePosition` paramétrable, branche `bilan` dans `self.onmessage`.
  - *Thread principal* (IIFE, ~l.1281+) : helpers purs (`winPercent`, `cpLoss`, `moveAccuracy`, `classifyLoss`, `acplToElo`), `computeBilan`, seam `window.__bilanTest`, `buildBilanPositions`/`requestBilan`/`maybeRequestBilan`, gestion des messages worker `bilanProgress`/`bilanResult`, rendu overlay, reset dans `startNewGame`.
  - *Markup* : overlay `#bilanOverlay` après `#promoOverlay` (~l.585).
  - *CSS* : styles `.bilan-*` près des styles `.promo-*` (~l.365).
- **Créer** `tests/bilan.spec.js` : tests unitaires (fonctions pures) + intégration (fin de partie).
- **Créer** `docs/BILAN.md` : note de maintenance.

---

## Task 1 : Fonctions pures de scoring + seam de test

**Files:**
- Modify: `chess.html` (IIFE principale, juste après `function uciOf(...)`, ~l.1315)
- Modify: `chess.html` (zone des seams, près de `window.__gameTest=...`, ~l.1531)
- Test: `tests/bilan.spec.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `tests/bilan.spec.js` :

```js
const { test, expect } = require('@playwright/test');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, '..', 'chess.html');

async function bilanApi(page) {
  await page.goto(url);
  await page.waitForSelector('.square .piece');
  await page.waitForFunction(() => !!window.__bilanTest);
}

test('winPercent : 0 cp ≈ 50 %, gros avantage ≈ 100 %', async ({ page }) => {
  await bilanApi(page);
  const r = await page.evaluate(() => ({
    zero: window.__bilanTest.winPercent(0),
    big: window.__bilanTest.winPercent(2000),
    neg: window.__bilanTest.winPercent(-2000),
  }));
  expect(Math.round(r.zero)).toBe(50);
  expect(r.big).toBeGreaterThan(95);
  expect(r.neg).toBeLessThan(5);
});

test('cpLoss : jamais négatif, plafonné, point de vue du camp', async ({ page }) => {
  await bilanApi(page);
  const r = await page.evaluate(() => ({
    drop: window.__bilanTest.cpLoss(100, -50, 1000),
    improved: window.__bilanTest.cpLoss(-50, 50, 1000),
    capped: window.__bilanTest.cpLoss(1000000, 50, 1000),
  }));
  expect(r.drop).toBe(150);
  expect(r.improved).toBe(0);
  expect(r.capped).toBe(1000);
});

test('classifyLoss : respecte les seuils 50/100/200', async ({ page }) => {
  await bilanApi(page);
  const r = await page.evaluate(() => [49, 50, 100, 200].map(window.__bilanTest.classifyLoss));
  expect(r).toEqual(['ok', 'inaccuracy', 'mistake', 'blunder']);
});

test('acplToElo : décroissant et borné 400–2800', async ({ page }) => {
  await bilanApi(page);
  const r = await page.evaluate(() => ({
    perfect: window.__bilanTest.acplToElo(0),
    awful: window.__bilanTest.acplToElo(800),
    a: window.__bilanTest.acplToElo(10),
    b: window.__bilanTest.acplToElo(100),
    c: window.__bilanTest.acplToElo(300),
  }));
  expect(r.perfect).toBe(2800);
  expect(r.awful).toBe(400);
  expect(r.a).toBeGreaterThan(r.b);
  expect(r.b).toBeGreaterThan(r.c);
});

test('moveAccuracy : delta nul ≈ 100, gros delta faible', async ({ page }) => {
  await bilanApi(page);
  const r = await page.evaluate(() => ({
    perfect: window.__bilanTest.moveAccuracy(0),
    bad: window.__bilanTest.moveAccuracy(50),
  }));
  expect(Math.round(r.perfect)).toBe(100);
  expect(r.bad).toBeLessThan(30);
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run: `npx playwright test tests/bilan.spec.js`
Expected: FAIL — `window.__bilanTest` est `undefined` (timeout sur `waitForFunction`).

- [ ] **Step 3 : Implémenter les fonctions pures**

Dans `chess.html`, juste après la ligne `function uciOf(m){ return sqName(m.from)+sqName(m.to)+(m.promo?m.promo.toLowerCase():''); }` (~l.1315), insérer :

```js
// === BILAN DE NIVEAU (fonctions pures, testables) ===========================
// Toutes les évaluations sont en centipions, du point de vue du camp concerné.
const BILAN_CP_CAP = 1000; // plafonne les pertes (neutralise les scores de mat)

function winPercent(cp){ // cp du point de vue du camp -> % de victoire (0..100)
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
function cpLoss(evalBeforeCamp, evalAfterCamp, cap=BILAN_CP_CAP){
  return Math.max(0, Math.min(evalBeforeCamp - evalAfterCamp, cap));
}
function moveAccuracy(deltaWinPct){ // précision d'un coup (formule type lichess)
  const d = Math.max(0, deltaWinPct);
  return Math.max(0, Math.min(103.1668 * Math.exp(-0.04354 * d) - 3.1669, 100));
}
function classifyLoss(loss){
  if(loss >= 200) return 'blunder';
  if(loss >= 100) return 'mistake';
  if(loss >= 50)  return 'inaccuracy';
  return 'ok';
}
function acplToElo(acpl){
  return Math.max(400, Math.min(Math.round(3000 * Math.exp(-acpl / 120)), 2800));
}
```

- [ ] **Step 4 : Exposer le seam de test**

Juste après le bloc `window.__gameTest={ ... };` (~l.1531), insérer :

```js
window.__bilanTest = { winPercent, cpLoss, moveAccuracy, classifyLoss, acplToElo, lastResult: null };
```

- [ ] **Step 5 : Lancer les tests pour vérifier le succès**

Run: `npx playwright test tests/bilan.spec.js`
Expected: PASS (5 tests).

- [ ] **Step 6 : Commit**

```bash
git add chess.html tests/bilan.spec.js
git commit -m "feat(bilan): fonctions pures de scoring (winPercent, cpLoss, Elo, précision)"
```

---

## Task 2 : Agrégateur `computeBilan`

**Files:**
- Modify: `chess.html` (après `acplToElo`, dans le bloc BILAN ~l.1325)
- Modify: `chess.html` (seam `window.__bilanTest`)
- Test: `tests/bilan.spec.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à `tests/bilan.spec.js` :

```js
test('computeBilan : pertes et compteurs par camp', async ({ page }) => {
  await bilanApi(page);
  const r = await page.evaluate(() => {
    const history = [{ by: 'w', uci: 'e2e4' }, { by: 'b', uci: 'e7e5' }];
    const records = [
      { evalCp: 20, isBook: false, nLegal: 20 },   // P0 (blanc au trait)
      { evalCp: -200, isBook: false, nLegal: 20 },  // P1 (noir au trait)
      { evalCp: 10, isBook: false, nLegal: 20 },    // P2
    ];
    return window.__bilanTest.computeBilan(history, records);
  });
  expect(r.white.counted).toBe(1);
  expect(r.white.blunders).toBe(1);     // 20 -> -200 = perte 220 (blanc)
  expect(r.black.counted).toBe(1);
  expect(r.black.blunders).toBe(1);     // 200 -> -10 = perte 210 (noir)
  expect(r.white.elo).toBeGreaterThanOrEqual(400);
  expect(r.white.elo).toBeLessThanOrEqual(2800);
});

test('computeBilan : exclut coups du livre et coups forcés', async ({ page }) => {
  await bilanApi(page);
  const r = await page.evaluate(() => {
    const history = [{ by: 'w', uci: 'e2e4' }, { by: 'b', uci: 'e7e5' }];
    const records = [
      { evalCp: 20, isBook: true, nLegal: 20 },     // coup blanc = théorie -> exclu
      { evalCp: -200, isBook: false, nLegal: 1 },   // coup noir = forcé -> exclu
      { evalCp: 10, isBook: false, nLegal: 20 },
    ];
    return window.__bilanTest.computeBilan(history, records);
  });
  expect(r.white.counted).toBe(0);
  expect(r.white.elo).toBeNull();
  expect(r.black.counted).toBe(0);
  expect(r.black.accuracy).toBeNull();
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run: `npx playwright test tests/bilan.spec.js -g computeBilan`
Expected: FAIL — `window.__bilanTest.computeBilan is not a function`.

- [ ] **Step 3 : Implémenter `computeBilan`**

Dans `chess.html`, à la fin du bloc BILAN (juste après `function acplToElo(...)`), insérer :

```js
function summarizeBilan(a){
  const counted = a.losses.length;
  if(!counted) return { counted:0, elo:null, accuracy:null, acpl:null, blunders:0, mistakes:0, inaccuracies:0 };
  const acpl = a.losses.reduce((s,x)=>s+x,0)/counted;
  const accuracy = a.accs.reduce((s,x)=>s+x,0)/counted;
  return { counted, acpl, elo:acplToElo(acpl), accuracy, blunders:a.blunders, mistakes:a.mistakes, inaccuracies:a.inaccuracies };
}
// history : [{by,uci,...}] (N coups). records : [{evalCp,isBook,nLegal}] (N+1 positions).
function computeBilan(history, records, opts={}){
  const cap = opts.cap != null ? opts.cap : BILAN_CP_CAP;
  const acc = {
    w:{ losses:[], accs:[], blunders:0, mistakes:0, inaccuracies:0 },
    b:{ losses:[], accs:[], blunders:0, mistakes:0, inaccuracies:0 },
  };
  for(let i=0;i<history.length;i++){
    const rec = records[i], next = records[i+1];
    if(!rec || !next) continue;
    if(rec.isBook) continue;        // coup théorique (livre)
    if(rec.nLegal <= 1) continue;   // coup forcé
    const by = history[i].by;       // 'w' ou 'b' = camp au trait en Pi
    const sign = by === 'w' ? 1 : -1;
    const before = sign * rec.evalCp;
    const after  = sign * next.evalCp;
    const loss = cpLoss(before, after, cap);
    const A = by === 'w' ? acc.w : acc.b;
    A.losses.push(loss);
    A.accs.push(moveAccuracy(winPercent(before) - winPercent(after)));
    const c = classifyLoss(loss);
    if(c === 'blunder') A.blunders++;
    else if(c === 'mistake') A.mistakes++;
    else if(c === 'inaccuracy') A.inaccuracies++;
  }
  return { white: summarizeBilan(acc.w), black: summarizeBilan(acc.b) };
}
```

- [ ] **Step 4 : Ajouter `computeBilan` au seam**

Modifier la ligne du seam (Task 1, Step 4) pour devenir :

```js
window.__bilanTest = { winPercent, cpLoss, moveAccuracy, classifyLoss, acplToElo, computeBilan, lastResult: null };
```

- [ ] **Step 5 : Lancer pour vérifier le succès**

Run: `npx playwright test tests/bilan.spec.js`
Expected: PASS (7 tests).

- [ ] **Step 6 : Commit**

```bash
git add chess.html tests/bilan.spec.js
git commit -m "feat(bilan): agrégateur computeBilan (ACPL, Elo, précision, compteurs)"
```

---

## Task 3 : Évaluation des positions dans le worker

**Files:**
- Modify: `chess.html` (`ENGINE_SRC` : constantes ~l.1203 ; `analyzePosition` ~l.1227 ; `self.onmessage` ~l.1256)

- [ ] **Step 1 : Ajouter les constantes de budget bilan**

Après la ligne `const ANALYZE_TIME_MS=700, ANALYZE_DEPTH=6;` (~l.1203), insérer :

```js
const BILAN_TIME_MS=150, BILAN_DEPTH=5; // budget léger pour l'analyse post-partie
```

- [ ] **Step 2 : Rendre `analyzePosition` paramétrable (sans régression)**

Dans `analyzePosition`, remplacer l'en-tête et la ligne du deadline.

Remplacer :

```js
function analyzePosition(s,history){
```
par :
```js
function analyzePosition(s,history,opts){
  const timeMs=(opts&&opts.timeMs)||ANALYZE_TIME_MS;
  const maxDepth=(opts&&opts.depth)||ANALYZE_DEPTH;
```

Remplacer :

```js
  tt=new Map();deadline=performance.now()+ANALYZE_TIME_MS;
  for(let depth=1;depth<=ANALYZE_DEPTH;depth++){
```
par :
```js
  tt=new Map();deadline=performance.now()+timeMs;
  for(let depth=1;depth<=maxDepth;depth++){
```

(L'appel existant `analyzePosition(e.data.state,e.data.history)` reste valide : sans `opts`, il garde le budget par défaut.)

- [ ] **Step 3 : Ajouter la branche `bilan` dans `self.onmessage`**

Dans `self.onmessage` du worker, juste avant la ligne `const{state,history}=e.data;` (~l.1270), insérer :

```js
  if(e.data&&e.data.type==='bilan'){
    const {states,moves}=e.data;
    const records=[];
    for(let i=0;i<states.length;i++){
      const hist=moves.slice(0,i).map(u=>({uci:u}));
      const a=analyzePosition(states[i],hist,{timeMs:BILAN_TIME_MS,depth:BILAN_DEPTH});
      records.push({evalCp:a.evalCp,isBook:positionInBook(states[i],hist),nLegal:legalMoves(states[i]).length});
      self.postMessage({type:'bilanProgress',done:i+1,total:states.length});
    }
    self.postMessage({type:'bilanResult',records});
    return;
  }
```

- [ ] **Step 4 : Vérifier la non-régression (suite complète)**

Run: `npx playwright test`
Expected: PASS (suite existante inchangée — le worker répond toujours `analyze`/bot ; la branche `bilan` n'est pas encore appelée).

- [ ] **Step 5 : Commit**

```bash
git add chess.html
git commit -m "feat(bilan): le worker évalue chaque position (budget léger, isBook, nLegal)"
```

---

## Task 4 : Déclenchement, messages et overlay UI

**Files:**
- Modify: `chess.html` (markup après `#promoOverlay` ~l.585 ; CSS `.bilan-*` ~l.365 ; main thread : flags, `buildBilanPositions`/`requestBilan`/`maybeRequestBilan`, handlers worker ~l.1683, `updatePanel` ~l.2034, `startNewGame` ~l.2215)
- Test: `tests/bilan.spec.js`

- [ ] **Step 1 : Écrire le test d'intégration (échec attendu)**

Ajouter à `tests/bilan.spec.js` :

```js
test('le bilan s’affiche en fin de partie (mat) pour les deux camps', async ({ page }) => {
  await page.goto(url);
  await page.waitForSelector('.square .piece');
  await page.waitForFunction(() => !!window.__bilanTest);
  // Mat du berger inversé (Fool's mate) : 1.f3 e5 2.g4 Qh4#
  await page.evaluate(() => ['f2f3','e7e5','g2g4','d8h4'].forEach(u => window.__gameTest.playUci(u)));
  await page.waitForSelector('#bilanOverlay:not(.hidden)', { timeout: 30000 });
  const txt = await page.$eval('#bilanBody', el => el.textContent);
  expect(txt).toMatch(/Vous/);
  expect(txt).toMatch(/Ordinateur/);
  // Fermeture
  await page.click('#bilanClose');
  await expect(page.locator('#bilanOverlay')).toHaveClass(/hidden/);
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run: `npx playwright test tests/bilan.spec.js -g "fin de partie"`
Expected: FAIL — `#bilanOverlay` n'existe pas (timeout).

- [ ] **Step 3 : Ajouter le markup de l'overlay**

Après le bloc `#promoOverlay` (qui se termine l.585 par `</div>` puis ligne vide avant `<script>`), insérer :

```html
<div id="bilanOverlay" class="promo-overlay hidden">
    <div class="promo-dialog bilan-dialog">
        <div class="promo-title">Bilan de la partie</div>
        <div id="bilanBody" class="bilan-body"></div>
        <div class="bilan-note">Estimation indicative, calculée sur une seule partie.</div>
        <button id="bilanClose" class="bilan-close">Fermer</button>
    </div>
</div>
```

- [ ] **Step 4 : Ajouter le CSS**

Après le bloc `.promo-choices button { ... }` (~l.365), insérer :

```css
        .bilan-dialog { min-width: 340px; max-width: 440px }
        .bilan-body { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; text-align: left }
        .bilan-col { background: white; border: 1px solid rgba(93,61,33,.14); border-radius: 16px; padding: 14px 16px }
        .bilan-col-title { font-weight: 900; text-transform: uppercase; letter-spacing: .06em; font-size: 12px; color: var(--muted); margin-bottom: 8px }
        .bilan-elo { font-size: 30px; font-weight: 950; letter-spacing: -.03em }
        .bilan-elo-lbl { font-size: 12px; font-weight: 700; color: var(--muted) }
        .bilan-acc { font-size: 14px; font-weight: 750; margin: 4px 0 8px }
        .bilan-errs { list-style: none; margin: 0; padding: 0; font-size: 13px; line-height: 1.6 }
        .bilan-empty { color: var(--muted); font-size: 13px }
        .bilan-progress { grid-column: 1/-1; text-align: center; font-weight: 700; padding: 24px 0 }
        .bilan-note { font-size: 11px; color: var(--muted); margin: 16px 0 14px }
        .bilan-close { padding: 8px 18px; border-radius: 10px; cursor: pointer }
```

- [ ] **Step 5 : Ajouter état, construction des positions et déclenchement**

Dans la zone des déclarations d'état (juste après `let undoStack=[];` ~l.1298), insérer :

```js
let bilanPending=false, bilanShown=false; // bilan de fin de partie (une fois par partie)
```

Dans le bloc BILAN (après `function computeBilan(...)`), insérer :

```js
function buildBilanPositions(){
  const states=[]; const moves=[];
  let s=fromFEN(START);
  states.push(clone(s));
  for(const h of history){
    const mv=legalMoves(s).find(m=>uciOf(m)===h.uci);
    if(!mv) break;
    s=applyMove(s,mv,false);
    states.push(clone(s));
    moves.push(h.uci);
  }
  return {states,moves};
}
function showBilanProgress(done,total){
  document.getElementById('bilanBody').innerHTML=`<div class="bilan-progress">Analyse de la partie… ${done}/${total}</div>`;
  document.getElementById('bilanOverlay').classList.remove('hidden');
}
function bilanColHtml(title,c){
  if(!c||!c.counted)
    return `<div class="bilan-col"><div class="bilan-col-title">${title}</div><div class="bilan-empty">Estimation indisponible (partie trop courte ou théorique).</div></div>`;
  return `<div class="bilan-col">
    <div class="bilan-col-title">${title}</div>
    <div class="bilan-elo">${c.elo}<span class="bilan-elo-lbl"> Elo est.</span></div>
    <div class="bilan-acc">Précision ${Math.round(c.accuracy)}%</div>
    <ul class="bilan-errs">
      <li>Bourdes : ${c.blunders}</li>
      <li>Erreurs : ${c.mistakes}</li>
      <li>Imprécisions : ${c.inaccuracies}</li>
    </ul></div>`;
}
function renderBilan(result){
  const mine = userColor===WHITE ? result.white : result.black;
  const theirs = userColor===WHITE ? result.black : result.white;
  document.getElementById('bilanBody').innerHTML = bilanColHtml('Vous',mine) + bilanColHtml('Ordinateur',theirs);
  document.getElementById('bilanOverlay').classList.remove('hidden');
}
function requestBilan(){
  if(bilanPending||bilanShown||!worker||history.length<1) return;
  bilanPending=true;
  const {states,moves}=buildBilanPositions();
  showBilanProgress(0,states.length);
  worker.postMessage({type:'bilan',states,moves});
}
function maybeRequestBilan(){
  if(mode==='play' && gameOver && !bilanShown && !bilanPending) requestBilan();
}
```

- [ ] **Step 6 : Brancher les messages worker**

Dans `worker.onmessage` (main thread, ~l.1683), juste après le bloc `if(e.data&&e.data.type==='analysis'){ ... return; }` (se termine ~l.1701), insérer :

```js
    if(e.data&&e.data.type==='bilanProgress'){ showBilanProgress(e.data.done,e.data.total); return; }
    if(e.data&&e.data.type==='bilanResult'){
      bilanPending=false; bilanShown=true;
      const result=computeBilan(history,e.data.records);
      if(window.__bilanTest) window.__bilanTest.lastResult=result;
      renderBilan(result);
      return;
    }
```

- [ ] **Step 7 : Déclencher en fin de partie + bouton Fermer**

Dans `updatePanel`, à la toute fin de la fonction (après `movesEl.scrollTop=movesEl.scrollHeight;` ~l.2034), insérer :

```js
  maybeRequestBilan();
```

Dans le bloc d'initialisation des écouteurs (près des autres `addEventListener`, après le handler du toggle tuteur ~l.2338), ajouter :

```js
  document.getElementById('bilanClose').addEventListener('click',()=>{
    document.getElementById('bilanOverlay').classList.add('hidden');
  });
```

- [ ] **Step 8 : Réinitialiser à « Nouvelle partie »**

Dans `startNewGame`, après `promoOverlay.classList.add('hidden');` (~l.2215), insérer :

```js
  document.getElementById('bilanOverlay').classList.add('hidden');
  bilanPending=false; bilanShown=false;
```

- [ ] **Step 9 : Lancer le test d'intégration**

Run: `npx playwright test tests/bilan.spec.js -g "fin de partie"`
Expected: PASS.

- [ ] **Step 10 : Lancer la suite complète (non-régression)**

Run: `npx playwright test`
Expected: PASS (suite existante + nouveaux tests bilan).

- [ ] **Step 11 : Commit**

```bash
git add chess.html tests/bilan.spec.js
git commit -m "feat(bilan): overlay de fin de partie (Elo, précision, erreurs) + déclenchement"
```

---

## Task 5 : Documentation de maintenance

**Files:**
- Create: `docs/BILAN.md`

- [ ] **Step 1 : Écrire la doc**

Créer `docs/BILAN.md` :

```markdown
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
```

- [ ] **Step 2 : Commit**

```bash
git add docs/BILAN.md
git commit -m "docs(bilan): note de maintenance"
```

---

## Auto-revue (couverture de la spec)

- **§3.1 Évaluations** → Task 3 (worker, budget dédié, une éval/position). ✓
- **§3.2 Perte par coup** (plafond, inversion de signe) → Task 1 (`cpLoss`) + Task 2 (signe via `by`). ✓
- **§3.3 Exclusions** (livre, coups forcés) → Task 2 (`isBook`, `nLegal<=1`) + Task 3 (renvoi `isBook`/`nLegal`). ✓
- **§3.4 Indicateurs** (ACPL, Elo, précision, compteurs, cas « — ») → Task 1 + Task 2 (`summarizeBilan` renvoie `null` si `counted===0`). ✓
- **§4.1 Module pur + seam** → Task 1/2 (`window.__bilanTest`). ✓
- **§4.2 Worker** (message `bilan`, progression) → Task 3. ✓
- **§4.3 UI** (overlay 2 colonnes, progression, mention indicative, fermeture, scoreboard intact) → Task 4. ✓
- **§5 Tests** (unitaires + intégration mat + non-régression) → Task 1/2/4 + runs `npx playwright test`. ✓
- **§6 YAGNI** (pas de persistant/direct/entraînement/graph/IA) → respecté (Task 4 gate `mode==='play'`). ✓

Cohérence des types : `records[i]={evalCp,isBook,nLegal}` produit en Task 3, consommé en Task 2 ; `computeBilan(history,records)` renvoie `{white,black}` chacun `{counted,acpl,elo,accuracy,blunders,mistakes,inaccuracies}`, consommé par `renderBilan`/`bilanColHtml` en Task 4. Seam `window.__bilanTest` étendu en Task 1 puis Task 2. ✓
