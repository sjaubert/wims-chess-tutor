# Tuteur IA pour l'application d'échecs — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un mode « Tuteur IA » activable à `chess.html` qui affiche en temps réel (moteur local) le statut théorique, l'évaluation et la meilleure ligne, plus un commentaire en prose à la demande via l'API Claude — et un lien de retour vers WIMS.

**Architecture:** Tout reste dans le fichier unique `chess.html`. Le Web Worker existant gagne un message `analyze` qui renvoie `{evalCp, pv, isBook}` sans jouer de coup, en réutilisant le moteur negamax. Le thread principal convertit la variante en notation française via la fonction `notation()` existante, affiche un panneau « Tuteur » greffé en surcouche, et appelle l'API Claude (`fetch` direct navigateur) sur demande. La clé API est stockée en localStorage.

**Tech Stack:** HTML/CSS/JS vanilla (un seul fichier), Web Worker via Blob, API Anthropic Messages. Tests : Playwright + un serveur statique local (scaffolding de dev sous `tests/`, non déployé — l'artefact livré reste le seul `chess.html`).

---

## Structure des fichiers

| Fichier | Rôle | Statut |
|---|---|---|
| `chess.html` | Application complète (runtime livré) | **Modifié** |
| `package.json` | Dépendances de dev (Playwright, serveur statique) | Créé (dev) |
| `playwright.config.js` | Config Playwright + serveur web local | Créé (dev) |
| `.gitignore` | Exclut `node_modules/`, les `.bin` volumineux | Créé (dev) |
| `tests/helpers.spec.js` | Tests des fonctions pures (formatEval, evalToWords, pvToSan) | Créé (dev) |
| `tests/analysis.spec.js` | Tests d'intégration de l'analyse moteur (worker) | Créé (dev) |
| `tests/tutor-ui.spec.js` | Tests d'intégration de l'UI tuteur + lien WIMS | Créé (dev) |
| `tests/llm.spec.js` | Tests de l'appel LLM avec interception réseau | Créé (dev) |

**Principe d'isolation :** les nouvelles fonctions sont de petites unités pures et testables (`formatEval`, `evalToWords`, `pvToSan`, `formatPvLine`, `getTutorSettings`, `setTutorSetting`, `analyzePosition`, `extractPV`, `positionInBook`, `askLLM`, `renderTutorPanel`, `requestAnalysis`). Le tuteur est greffé en surcouche : éteint, le jeu se comporte exactement comme avant.

**Conventions de test :** les fonctions internes de l'IIFE du thread principal sont exposées sous `window.__tutorTest` (un seul objet de namespace) uniquement pour permettre les tests `page.evaluate`. C'est le seul ajout au scope global.

---

## Task 0 : Scaffolding de dev & garde-fou de non-régression

**Files:**
- Create: `/home/wims/public_html/chess/package.json`
- Create: `/home/wims/public_html/chess/playwright.config.js`
- Create: `/home/wims/public_html/chess/.gitignore`
- Create: `/home/wims/public_html/chess/tests/baseline.spec.js`

- [ ] **Step 1 : Initialiser git et le .gitignore**

Run :
```bash
cd /home/wims/public_html/chess
git init
```

Créer `/home/wims/public_html/chess/.gitignore` :
```
node_modules/
test-results/
playwright-report/
*.bin
```

- [ ] **Step 2 : Créer package.json**

Créer `/home/wims/public_html/chess/package.json` :
```json
{
  "name": "chess-tutor",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0"
  }
}
```

- [ ] **Step 3 : Créer la config Playwright (sert le dossier en HTTP)**

Créer `/home/wims/public_html/chess/playwright.config.js` :
```js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:8123' },
  webServer: {
    command: 'npx http-server -p 8123 -c-1 .',
    url: 'http://127.0.0.1:8123/chess.html',
    reuseExistingServer: true,
    timeout: 30000
  }
});
```

- [ ] **Step 4 : Installer les dépendances**

Run :
```bash
cd /home/wims/public_html/chess
npm install
npx playwright install chromium
```
Expected : installation sans erreur ; Chromium téléchargé.

- [ ] **Step 5 : Écrire le test de référence (non-régression)**

Créer `/home/wims/public_html/chess/tests/baseline.spec.js` :
```js
const { test, expect } = require('@playwright/test');

test('le plateau affiche 64 cases et le statut initial', async ({ page }) => {
  await page.goto('/chess.html');
  await expect(page.locator('#board .square')).toHaveCount(64);
  await expect(page.locator('#status')).toContainText('Your move');
});

test('un coup humain (e2-e4) est jouable', async ({ page }) => {
  await page.goto('/chess.html');
  // Clic case e2 puis e4 (l'utilisateur joue les blancs au 1er chargement)
  await page.locator('.square[data-i="52"]').click(); // e2
  await page.locator('.square[data-i="36"]').click(); // e4
  // La case de départ e2 est désormais vide, e4 contient une pièce
  await expect(page.locator('.square[data-i="36"] .piece')).toHaveCount(1);
});
```

- [ ] **Step 6 : Lancer le test de référence**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/baseline.spec.js
```
Expected : PASS (2 tests). Ce test gardera la non-régression tout au long du plan.

- [ ] **Step 7 : Commit**

```bash
cd /home/wims/public_html/chess
git add .gitignore package.json package-lock.json playwright.config.js tests/baseline.spec.js
git commit -m "chore: scaffolding de tests Playwright + garde-fou de non-régression"
```

---

## Task 1 : Réglages du tuteur (localStorage)

**Files:**
- Modify: `chess.html` (ajout dans l'IIFE du thread principal, après la déclaration des variables `let worker=null;` ~ ligne 1117)
- Test: `tests/helpers.spec.js`

- [ ] **Step 1 : Écrire le test des réglages**

Créer `/home/wims/public_html/chess/tests/helpers.spec.js` :
```js
const { test, expect } = require('@playwright/test');

test('getTutorSettings renvoie les valeurs par défaut', async ({ page }) => {
  await page.goto('/chess.html');
  const s = await page.evaluate(() => window.__tutorTest.getTutorSettings());
  expect(s.apiKey).toBe('');
  expect(s.model).toBe('claude-haiku-4-5-20251001');
});

test('setTutorSetting persiste la clé et le modèle', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate(() => {
    window.__tutorTest.setTutorSetting('tutorApiKey', 'sk-test-123');
    window.__tutorTest.setTutorSetting('tutorModel', 'claude-sonnet-4-6');
  });
  const s = await page.evaluate(() => window.__tutorTest.getTutorSettings());
  expect(s.apiKey).toBe('sk-test-123');
  expect(s.model).toBe('claude-sonnet-4-6');
});
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/helpers.spec.js
```
Expected : FAIL — `window.__tutorTest` est `undefined`.

- [ ] **Step 3 : Implémenter les réglages + le namespace de test**

Dans `chess.html`, juste après la ligne `let bookData=null; // Uint8Array du fichier .bin Polyglot chargé` (~1118), insérer :
```js
// === TUTEUR IA : état & réglages ===
let tutorEnabled=false;          // interrupteur du tuteur
let lastAnalysis=null;           // dernier résultat d'analyse {evalCp, pv, isBook}
const TUTOR_DEFAULT_MODEL='claude-haiku-4-5-20251001';

function getTutorSettings(){
  return {
    apiKey: localStorage.getItem('tutorApiKey')||'',
    model:  localStorage.getItem('tutorModel')||TUTOR_DEFAULT_MODEL
  };
}
function setTutorSetting(key,value){
  localStorage.setItem(key,value);
}

// Exposé uniquement pour les tests automatisés
window.__tutorTest={ getTutorSettings, setTutorSetting };
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/helpers.spec.js
```
Expected : PASS (2 tests).

- [ ] **Step 5 : Commit**

```bash
cd /home/wims/public_html/chess
git add chess.html tests/helpers.spec.js
git commit -m "feat(tuteur): réglages persistants (clé API, modèle) en localStorage"
```

---

## Task 2 : Mise en forme de l'évaluation (fonctions pures)

**Files:**
- Modify: `chess.html` (après les fonctions de réglages de la Task 1)
- Test: `tests/helpers.spec.js`

- [ ] **Step 1 : Ajouter les tests de formatage**

Ajouter à la fin de `/home/wims/public_html/chess/tests/helpers.spec.js` :
```js
test('formatEval formate les centipions du point de vue des Blancs', async ({ page }) => {
  await page.goto('/chess.html');
  const r = await page.evaluate(() => ({
    plus:  window.__tutorTest.formatEval(70),
    moins: window.__tutorTest.formatEval(-130),
    zero:  window.__tutorTest.formatEval(0),
    matB:  window.__tutorTest.formatEval(999950),
    matN:  window.__tutorTest.formatEval(-999950)
  }));
  expect(r.plus).toBe('+0,7');
  expect(r.moins).toBe('−1,3'); // signe moins typographique U+2212
  expect(r.zero).toBe('0,0');
  expect(r.matB).toBe('#');
  expect(r.matN).toBe('−#');
});

test('evalToWords traduit en français', async ({ page }) => {
  await page.goto('/chess.html');
  const r = await page.evaluate(() => ({
    egal:    window.__tutorTest.evalToWords(10),
    legerB:  window.__tutorTest.evalToWords(60),
    legerN:  window.__tutorTest.evalToWords(-60),
    decisif: window.__tutorTest.evalToWords(400),
    matB:    window.__tutorTest.evalToWords(999950)
  }));
  expect(r.egal).toBe('position égale');
  expect(r.legerB).toContain('Blancs');
  expect(r.legerN).toContain('Noirs');
  expect(r.decisif).toContain('décisif');
  expect(r.matB).toContain('Mat');
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/helpers.spec.js -g "formatEval|evalToWords"
```
Expected : FAIL — `formatEval`/`evalToWords` non définis.

- [ ] **Step 3 : Implémenter formatEval et evalToWords**

Dans `chess.html`, juste après `window.__tutorTest={ getTutorSettings, setTutorSetting };`, remplacer cette ligne par le bloc suivant (qui ajoute les fonctions et enrichit le namespace) :
```js
const MATE_THRESHOLD=999000; // au-delà : il s'agit d'un mat

// cp est exprimé du point de vue des Blancs (positif = avantage blancs)
function formatEval(cp){
  if(cp>=MATE_THRESHOLD)return '#';
  if(cp<=-MATE_THRESHOLD)return '−#';
  const pawns=cp/100;
  const sign=pawns>0?'+':(pawns<0?'−':'');
  return sign+Math.abs(pawns).toFixed(1).replace('.',',');
}

function evalToWords(cp){
  if(cp>=MATE_THRESHOLD)return 'Mat pour les Blancs';
  if(cp<=-MATE_THRESHOLD)return 'Mat pour les Noirs';
  const a=Math.abs(cp);
  if(a<30)return 'position égale';
  const camp=cp>0?'Blancs':'Noirs';
  if(a<90)return 'léger avantage aux '+camp;
  if(a<250)return 'avantage aux '+camp;
  return 'avantage décisif aux '+camp;
}

// Exposé uniquement pour les tests automatisés
window.__tutorTest={ getTutorSettings, setTutorSetting, formatEval, evalToWords };
```

- [ ] **Step 4 : Lancer (succès attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/helpers.spec.js
```
Expected : PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
cd /home/wims/public_html/chess
git add chess.html tests/helpers.spec.js
git commit -m "feat(tuteur): formatage de l'évaluation (chiffré + en mots)"
```

---

## Task 3 : Analyse moteur dans le Web Worker (message `analyze`)

**Files:**
- Modify: `chess.html` (ENGINE_SRC — ajouter `positionInBook`, `extractPV`, `analyzePosition` avant `self.onmessage`, ~ligne 1078 ; étendre `self.onmessage` ~ligne 1079)
- Modify: `chess.html` (thread principal — gérer `type:'analysis'` dans `worker.onmessage`, ~ligne 1130 ; ajouter `requestAnalysis`)
- Test: `tests/analysis.spec.js`

- [ ] **Step 1 : Écrire le test d'intégration de l'analyse**

Créer `/home/wims/public_html/chess/tests/analysis.spec.js` :
```js
const { test, expect } = require('@playwright/test');

test('requestAnalysis renvoie une évaluation et une variante', async ({ page }) => {
  await page.goto('/chess.html');
  // Déclenche une analyse de la position initiale et attend le résultat
  const result = await page.evaluate(() => new Promise(resolve => {
    window.__tutorTest.onAnalysisForTest = resolve; // hook de test
    window.__tutorTest.requestAnalysis(true);       // force, même tuteur éteint
  }));
  expect(typeof result.evalCp).toBe('number');
  expect(Array.isArray(result.pv)).toBe(true);
  expect(result.pv.length).toBeGreaterThan(0);
  // Position initiale : présente dans la table d'ouvertures interne -> théorique
  expect(result.isBook).toBe(true);
  // Chaque coup de la PV est en notation UCI (ex. "e2e4")
  expect(result.pv[0]).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/analysis.spec.js
```
Expected : FAIL — `requestAnalysis` non défini.

- [ ] **Step 3 : Ajouter l'analyse côté worker (ENGINE_SRC)**

Dans `chess.html`, juste avant `self.onmessage=function(e){` (~ligne 1079), insérer :
```js
const ANALYZE_TIME_MS=700, ANALYZE_DEPTH=6;

// La position courante est-elle encore dans la théorie connue ?
function positionInBook(s,history){
  const seq=(history||[]).map(h=>h.uci||(sqName(h.from)+sqName(h.to)+(h.promo?h.promo.toLowerCase():''))).join(' ');
  if(workerBookData&&workerPolyRands){
    const hash=polyHash(s,workerPolyRands);
    if(polyLookup(hash,workerBookData).length)return true;
  }
  return !!openingBookSeqTable(seq);
}

// Variante principale par parcours de la table de transposition
function extractPV(s,firstMove,maxLen){
  const pv=[]; let cur=s, mv=firstMove, guard=0;
  while(mv&&pv.length<maxLen&&guard++<40){
    pv.push(sqName(mv.from)+sqName(mv.to)+(mv.promo?mv.promo.toLowerCase():''));
    cur=applyMove(cur,mv,false);
    const ent=tt.get(posKey(cur));
    if(!ent||!ent.best)break;
    const lm=legalMoves(cur);
    const nm=lm.find(x=>x.from===ent.best.from&&x.to===ent.best.to&&(x.promo||null)===(ent.best.promo||null));
    if(!nm)break;
    mv=nm;
  }
  return pv;
}

function analyzePosition(s,history){
  const inBook=positionInBook(s,history);
  const moves=legalMoves(s);
  if(!moves.length){
    const mated=inCheck(s,s.turn);
    const evalCp=mated?(s.turn===WHITE?-MATE:MATE):0;
    return {evalCp,pv:[],isBook:inBook,gameOver:true};
  }
  tt=new Map();deadline=performance.now()+ANALYZE_TIME_MS;
  let best=moves[0],bestScore=-Infinity;
  for(let depth=1;depth<=ANALYZE_DEPTH;depth++){
    try{
      const rootKey=posKey(s),ent=tt.get(rootKey);
      moves.sort((a,b)=>moveOrderScore(s,b,ent?.best)-moveOrderScore(s,a,ent?.best));
      let alpha=-Infinity,beta=Infinity,localBest=best,localScore=-Infinity;
      for(const m of moves){
        const sc=-negamax(applyMove(s,m,false),depth-1,-beta,-alpha,1);
        if(sc>localScore){localScore=sc;localBest=m;}
        if(sc>alpha)alpha=sc;
      }
      best=localBest;bestScore=localScore;
      if(Math.abs(bestScore)>MATE-1000)break;
    }catch(e){break;}
  }
  const evalCp=s.turn===WHITE?bestScore:-bestScore;
  const pv=extractPV(s,best,8);
  return {evalCp,pv,isBook:inBook,gameOver:false};
}
```

- [ ] **Step 4 : Extraire la table d'ouvertures interne dans une fonction réutilisable**

La table `BOOK` est aujourd'hui locale à `openingBookMove`. Pour que `positionInBook` la consulte sans dupliquer, exposer une fonction d'accès. Dans `chess.html`, à l'intérieur de `openingBookMove`, repérer la ligne `const cands=BOOK[seq];` et la remplacer par :
```js
  const cands=openingBookSeqTable(seq);
```
Puis, juste **avant** la fonction `openingBookMove` (~ligne 740), insérer la définition de la table déplacée et son accesseur :
```js
const OPENING_SEQ_TABLE=Object.freeze({/*__BOOK_TABLE__*/});
function openingBookSeqTable(seq){ return OPENING_SEQ_TABLE[seq]||null; }
```
puis, dans `openingBookMove`, supprimer le bloc `const BOOK={ ... };` (de `const BOOK={` jusqu'à son `};`) et coller son **contenu** (les paires clé/valeur, sans `const BOOK={`/`}`) à la place du marqueur `/*__BOOK_TABLE__*/` ci-dessus.

> Note d'implémentation : c'est un simple déplacement de l'objet littéral `BOOK` vers `OPENING_SEQ_TABLE` (mêmes clés/valeurs), pour qu'il soit consultable à la fois par `openingBookMove` (coup du bot) et par `positionInBook` (statut théorique). Aucune valeur n'est modifiée. Vérifier qu'après l'édition la chaîne `const BOOK=` n'apparaît plus dans le fichier.

- [ ] **Step 5 : Router le message `analyze` dans le worker**

Dans `chess.html`, dans `self.onmessage` (~ligne 1079), juste après le bloc `if(e.data&&e.data.type==='init'){ ... return; }`, insérer :
```js
  if(e.data&&e.data.type==='analyze'){
    const a=analyzePosition(e.data.state,e.data.history);
    self.postMessage({type:'analysis',...a});
    return;
  }
```

- [ ] **Step 6 : Réceptionner l'analyse côté thread principal**

Dans `chess.html`, dans `startWorker()` → `worker.onmessage` (~ligne 1130), juste après le bloc `if(e.data&&e.data.type==='bookReady'){ ... return; }`, insérer :
```js
    if(e.data&&e.data.type==='analysis'){
      lastAnalysis=e.data;
      if(window.__tutorTest&&window.__tutorTest.onAnalysisForTest){
        const cb=window.__tutorTest.onAnalysisForTest;
        window.__tutorTest.onAnalysisForTest=null;
        cb(e.data);
      }
      renderTutorPanel();
      return;
    }
```

- [ ] **Step 7 : Ajouter requestAnalysis + un renderTutorPanel temporaire**

Dans `chess.html`, juste après la fonction `setTutorSetting` (Task 1), ajouter :
```js
function requestAnalysis(force){
  if((!tutorEnabled&&!force)||!worker)return;
  worker.postMessage({type:'analyze',state,history});
}
// Implémentation complète posée en Task 5 ; stub pour l'instant.
function renderTutorPanel(){}
```
Puis enrichir le namespace de test : repérer la ligne
`window.__tutorTest={ getTutorSettings, setTutorSetting, formatEval, evalToWords };`
et la remplacer par :
```js
window.__tutorTest={ getTutorSettings, setTutorSetting, formatEval, evalToWords, requestAnalysis };
```

- [ ] **Step 8 : Lancer (succès attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/analysis.spec.js tests/baseline.spec.js
```
Expected : PASS. (Le test baseline confirme l'absence de régression après le déplacement de la table d'ouvertures.)

- [ ] **Step 9 : Commit**

```bash
cd /home/wims/public_html/chess
git add chess.html tests/analysis.spec.js
git commit -m "feat(tuteur): analyse moteur (eval, variante, théorie) via message worker analyze"
```

---

## Task 4 : Conversion de la variante en notation française (pvToSan)

**Files:**
- Modify: `chess.html` (thread principal, après `requestAnalysis`)
- Test: `tests/helpers.spec.js`

- [ ] **Step 1 : Ajouter les tests pvToSan / formatPvLine**

Ajouter à la fin de `/home/wims/public_html/chess/tests/helpers.spec.js` :
```js
test('pvToSan convertit une variante UCI en notation française', async ({ page }) => {
  await page.goto('/chess.html');
  const san = await page.evaluate(() =>
    window.__tutorTest.pvToSan(['e2e4', 'e7e5', 'g1f3'])
  );
  expect(san).toEqual(['e4', 'e5', 'Cf3']);
});

test('formatPvLine numérote les coups depuis la position initiale (Blancs au trait)', async ({ page }) => {
  await page.goto('/chess.html');
  const line = await page.evaluate(() =>
    window.__tutorTest.formatPvLine(['e4', 'e5', 'Cf3'])
  );
  expect(line).toBe('1.e4 e5 2.Cf3');
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/helpers.spec.js -g "pvToSan|formatPvLine"
```
Expected : FAIL — fonctions non définies.

- [ ] **Step 3 : Implémenter pvToSan et formatPvLine**

Dans `chess.html`, juste après la fonction `renderTutorPanel(){}` (stub de la Task 3), insérer :
```js
// Convertit une variante en UCI (depuis la position courante par défaut) en SAN français
function pvToSan(pvUci, fromState){
  let s=fromState||state;
  const out=[];
  for(const u of pvUci){
    const lm=legalMoves(s);
    const m=lm.find(x=>sqName(x.from)+sqName(x.to)+(x.promo?x.promo.toLowerCase():'')===u);
    if(!m)break;
    out.push(notation(s,m));
    s=applyMove(s,m,false);
  }
  return out;
}

// Numérote une liste de coups SAN. startState détermine le n° et le camp au trait.
function formatPvLine(sanList, startState){
  const s=startState||state;
  let moveNo=s.full, whiteToMove=(s.turn===WHITE);
  const parts=[];
  for(let i=0;i<sanList.length;i++){
    if(whiteToMove){ parts.push(moveNo+'.'+sanList[i]); }
    else{ if(i===0)parts.push(moveNo+'...'+sanList[i]); else parts.push(sanList[i]); moveNo++; }
    whiteToMove=!whiteToMove;
  }
  return parts.join(' ');
}
```
Puis enrichir le namespace de test — remplacer la ligne
`window.__tutorTest={ getTutorSettings, setTutorSetting, formatEval, evalToWords, requestAnalysis };`
par :
```js
window.__tutorTest={ getTutorSettings, setTutorSetting, formatEval, evalToWords, requestAnalysis, pvToSan, formatPvLine };
```

- [ ] **Step 4 : Lancer (succès attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/helpers.spec.js
```
Expected : PASS (6 tests).

- [ ] **Step 5 : Commit**

```bash
cd /home/wims/public_html/chess
git add chess.html tests/helpers.spec.js
git commit -m "feat(tuteur): conversion de la variante principale en notation française"
```

---

## Task 5 : Interface du tuteur (lien WIMS, interrupteur, panneau, affichage live)

**Files:**
- Modify: `chess.html` (HTML : lien WIMS + interrupteur dans `score-pane` ~ligne 440 ; nouveau `tutor-pane` dans `right-stack` ~ligne 442)
- Modify: `chess.html` (CSS : styles du tuteur, dans le `<style>` avant `</style>` ~ligne 416)
- Modify: `chess.html` (JS : `renderTutorPanel` complet ; appels `requestAnalysis` après chaque coup ; câblage de l'interrupteur)
- Test: `tests/tutor-ui.spec.js`

- [ ] **Step 1 : Écrire les tests UI**

Créer `/home/wims/public_html/chess/tests/tutor-ui.spec.js` :
```js
const { test, expect } = require('@playwright/test');

test('le lien de retour WIMS est présent et pointe vers le CGI WIMS', async ({ page }) => {
  await page.goto('/chess.html');
  const link = page.locator('#wimsHome');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/wims/wims.cgi');
});

test('le panneau tuteur est caché par défaut et apparaît quand on l\'active', async ({ page }) => {
  await page.goto('/chess.html');
  await expect(page.locator('#tutorPane')).toBeHidden();
  await page.locator('#tutorToggle').click();
  await expect(page.locator('#tutorPane')).toBeVisible();
});

test('après activation, l\'analyse de la position initiale s\'affiche', async ({ page }) => {
  await page.goto('/chess.html');
  await page.locator('#tutorToggle').click();
  // L'éval et la meilleure ligne se remplissent après l'analyse asynchrone
  await expect(page.locator('#tutorEval')).not.toBeEmpty({ timeout: 5000 });
  await expect(page.locator('#tutorLine')).toContainText('1.', { timeout: 5000 });
  await expect(page.locator('#tutorBook')).toContainText('théorique', { timeout: 5000 });
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/tutor-ui.spec.js
```
Expected : FAIL — `#wimsHome`, `#tutorToggle`, `#tutorPane` absents.

- [ ] **Step 3 : Ajouter le HTML (lien WIMS + interrupteur + panneau)**

Dans `chess.html`, remplacer le bloc `score-head` (~lignes 429-435) :
```html
            <div class="score-head">
                <div>
                    <div class="score-title">Scoreboard</div>
                    <div id="scoreboard" class="scoreline">0 - 0 - 0</div>
                </div>
                <button id="resetScores" class="reset-link">reset</button>
            </div>
```
par :
```html
            <div class="score-head">
                <div>
                    <a id="wimsHome" class="wims-home" href="/wims/wims.cgi">← Retour à WIMS</a>
                    <div class="score-title">Scoreboard</div>
                    <div id="scoreboard" class="scoreline">0 - 0 - 0</div>
                </div>
                <button id="resetScores" class="reset-link">reset</button>
            </div>
            <label class="tutor-switch">
                <input type="checkbox" id="tutorToggle">
                <span>🎓 Tuteur IA</span>
            </label>
```
Puis, juste après la fermeture `</aside>` du bloc `side` (~ligne 451), insérer le panneau tuteur :
```html
        <section id="tutorPane" class="tutor-pane hidden">
            <div class="tutor-head">
                <div class="tutor-title">Tuteur</div>
                <button id="tutorSettingsBtn" class="reset-link" title="Réglages IA">⚙︎</button>
            </div>
            <div id="tutorBook" class="tutor-book"></div>
            <div class="tutor-evalrow">
                <div class="evalbar"><div id="tutorEvalFill" class="evalbar-fill"></div></div>
                <div>
                    <div id="tutorEval" class="tutor-eval"></div>
                    <div id="tutorWords" class="tutor-words"></div>
                </div>
            </div>
            <div class="tutor-linelabel">Meilleure ligne</div>
            <div id="tutorLine" class="tutor-line"></div>
            <button id="tutorAskBtn" class="tutor-ask" disabled>✨ Avis de l'IA</button>
            <div id="tutorLLM" class="tutor-llm"></div>
            <div id="tutorSettings" class="tutor-settings hidden">
                <label>Clé API Claude
                    <input type="password" id="tutorKeyInput" placeholder="sk-ant-...">
                </label>
                <label>Modèle
                    <select id="tutorModelInput">
                        <option value="claude-haiku-4-5-20251001">Haiku (économique)</option>
                        <option value="claude-sonnet-4-6">Sonnet (qualité)</option>
                    </select>
                </label>
                <button id="tutorSaveBtn">Enregistrer</button>
                <button id="tutorTestBtn">Tester la connexion</button>
                <div id="tutorTestResult" class="tutor-testresult"></div>
                <div class="tutor-warn">La clé est stockée uniquement dans ce navigateur. À éviter sur un poste partagé.</div>
            </div>
        </section>
```

- [ ] **Step 4 : Ajouter le CSS**

Dans `chess.html`, juste avant `</style>` (~ligne 416), insérer :
```css
.wims-home{display:inline-block;margin-bottom:6px;font-size:12px;color:var(--accent);text-decoration:none}
.wims-home:hover{text-decoration:underline}
.tutor-switch{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:14px;cursor:pointer}
.tutor-pane{background:rgba(255,250,242,.88);border-radius:16px;padding:16px 18px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:10px}
.tutor-pane.hidden{display:none}
.tutor-head{display:flex;justify-content:space-between;align-items:center}
.tutor-title{font-weight:600}
.tutor-book{font-size:13px;color:var(--muted)}
.tutor-book.theory{color:var(--accent);font-weight:600}
.tutor-evalrow{display:flex;align-items:center;gap:12px}
.evalbar{position:relative;width:14px;height:90px;background:#2a2a2a;border-radius:7px;overflow:hidden}
.evalbar-fill{position:absolute;left:0;bottom:0;width:100%;background:#f5f1ea;transition:height .3s}
.tutor-eval{font-size:22px;font-weight:700}
.tutor-words{font-size:13px;color:var(--muted)}
.tutor-linelabel{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.tutor-line{font-size:14px;line-height:1.5}
.tutor-ask{padding:8px 12px;border-radius:10px;cursor:pointer}
.tutor-ask:disabled{opacity:.45;cursor:not-allowed}
.tutor-llm{font-size:14px;line-height:1.55;white-space:pre-wrap}
.tutor-llm.error{color:#b3402e}
.tutor-settings{display:flex;flex-direction:column;gap:8px;border-top:1px solid rgba(120,107,96,.25);padding-top:10px}
.tutor-settings.hidden{display:none}
.tutor-settings label{display:flex;flex-direction:column;gap:4px;font-size:13px}
.tutor-settings input,.tutor-settings select{padding:6px 8px;border-radius:8px;border:1px solid rgba(120,107,96,.4)}
.tutor-warn{font-size:11px;color:#9a7b2e}
.tutor-testresult{font-size:12px}
```

- [ ] **Step 5 : Implémenter renderTutorPanel (remplacer le stub)**

Dans `chess.html`, remplacer la ligne stub `function renderTutorPanel(){}` (posée en Task 3) par :
```js
function renderTutorPanel(){
  const pane=document.getElementById('tutorPane');
  if(!pane)return;
  pane.classList.toggle('hidden',!tutorEnabled);
  if(!tutorEnabled||!lastAnalysis)return;
  const {evalCp,pv,isBook}=lastAnalysis;
  const bookEl=document.getElementById('tutorBook');
  bookEl.textContent=isBook?'📖 Coup théorique (dans le livre)':'Hors livre';
  bookEl.className='tutor-book'+(isBook?' theory':'');
  document.getElementById('tutorEval').textContent=formatEval(evalCp);
  document.getElementById('tutorWords').textContent=evalToWords(evalCp);
  // Barre : 50% = égalité ; bornée à ±600 cp pour l'affichage
  const clamped=Math.max(-600,Math.min(600,evalCp));
  document.getElementById('tutorEvalFill').style.height=(50+clamped/12)+'%';
  const san=pvToSan(pv);
  document.getElementById('tutorLine').textContent=san.length?formatPvLine(san):'—';
}
```

- [ ] **Step 6 : Déclencher l'analyse après chaque coup et câbler l'interrupteur**

Dans `chess.html`, ajouter un appel `requestAnalysis()` aux 4 points où un coup est validé / la partie réinitialisée :

(a) `tryMove` — après `render();` qui suit `state=applyMove(state,m,true);` (~ligne 1587) :
```js
  render();
  requestAnalysis();
```
(b) `completePromo` — après `render();` (~ligne 1561) :
```js
  render();
  requestAnalysis();
```
(c) `worker.onmessage` du coup bot — dans le bloc final, après `render();` (~ligne 1143) :
```js
    render();
    requestAnalysis();
```
(d) `startNewGame` — après `render();` (~ligne 1645) :
```js
  render();
  requestAnalysis();
```

Puis, à la fin de l'IIFE du thread principal (juste avant la fermeture `})();` finale du script principal — la même IIFE ouverte ligne 1097), ajouter le câblage de l'UI :
```js
// === CÂBLAGE UI TUTEUR ===
(function wireTutor(){
  const toggle=document.getElementById('tutorToggle');
  const settingsBtn=document.getElementById('tutorSettingsBtn');
  const settings=document.getElementById('tutorSettings');
  const keyInput=document.getElementById('tutorKeyInput');
  const modelInput=document.getElementById('tutorModelInput');
  const saveBtn=document.getElementById('tutorSaveBtn');
  const askBtn=document.getElementById('tutorAskBtn');

  // Pré-remplir les réglages depuis localStorage
  const s=getTutorSettings();
  keyInput.value=s.apiKey; modelInput.value=s.model;
  function refreshAskState(){ askBtn.disabled=!getTutorSettings().apiKey; }
  refreshAskState();

  toggle.addEventListener('change',()=>{
    tutorEnabled=toggle.checked;
    renderTutorPanel();
    if(tutorEnabled)requestAnalysis();
  });
  settingsBtn.addEventListener('click',()=>settings.classList.toggle('hidden'));
  saveBtn.addEventListener('click',()=>{
    setTutorSetting('tutorApiKey',keyInput.value.trim());
    setTutorSetting('tutorModel',modelInput.value);
    refreshAskState();
    settings.classList.add('hidden');
  });
})();
```

- [ ] **Step 7 : Lancer (succès attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/tutor-ui.spec.js tests/baseline.spec.js
```
Expected : PASS.

- [ ] **Step 8 : Commit**

```bash
cd /home/wims/public_html/chess
git add chess.html tests/tutor-ui.spec.js
git commit -m "feat(tuteur): UI (lien WIMS, interrupteur, panneau, affichage live de l'analyse)"
```

---

## Task 6 : Commentaire LLM à la demande (API Claude)

**Files:**
- Modify: `chess.html` (thread principal — `buildLLMPrompt`, `askLLM` ; câblage des boutons « Avis de l'IA » et « Tester la connexion »)
- Test: `tests/llm.spec.js`

- [ ] **Step 1 : Écrire les tests LLM (réseau intercepté)**

Créer `/home/wims/public_html/chess/tests/llm.spec.js` :
```js
const { test, expect } = require('@playwright/test');

async function setKey(page){
  await page.goto('/chess.html');
  await page.evaluate(() => {
    localStorage.setItem('tutorApiKey','sk-ant-test');
    localStorage.setItem('tutorModel','claude-haiku-4-5-20251001');
  });
  await page.reload();
  await page.locator('#tutorToggle').click();
}

test('buildLLMPrompt ancre le prompt sur l\'analyse du moteur', async ({ page }) => {
  await page.goto('/chess.html');
  const prompt = await page.evaluate(() =>
    window.__tutorTest.buildLLMPrompt({ evalCp: 70, pv: ['e2e4','e7e5'], isBook: true })
  );
  expect(prompt).toContain('+0,7');
  expect(prompt).toContain('1.e4 e5');
  expect(prompt).toContain('théorique');
});

test('Avis de l\'IA : appelle l\'API Claude et affiche la réponse', async ({ page }) => {
  let captured=null;
  await page.route('https://api.anthropic.com/**', async route => {
    captured = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: [{ type:'text', text:'Bonne ouverture classique, développez vos pièces.' }] })
    });
  });
  await setKey(page);
  await page.locator('#tutorAskBtn').click();
  await expect(page.locator('#tutorLLM')).toContainText('Bonne ouverture', { timeout: 5000 });
  // Le corps envoyé contient bien l'ancrage moteur
  expect(JSON.stringify(captured)).toContain('Meilleure ligne');
});

test('Avis de l\'IA : erreur API affichée proprement', async ({ page }) => {
  await page.route('https://api.anthropic.com/**', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: { message: 'invalid x-api-key' } })
  }));
  await setKey(page);
  await page.locator('#tutorAskBtn').click();
  await expect(page.locator('#tutorLLM.error')).toContainText('invalid x-api-key', { timeout: 5000 });
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/llm.spec.js
```
Expected : FAIL — `buildLLMPrompt`/`askLLM` non définis, bouton inactif.

- [ ] **Step 3 : Implémenter buildLLMPrompt et askLLM**

Dans `chess.html`, juste après `formatPvLine` (Task 4), insérer :
```js
function buildLLMPrompt(analysis){
  const a=analysis||lastAnalysis||{evalCp:0,pv:[],isBook:false};
  const movesSan=history.map(h=>h.notation).join(' ')||'(aucun)';
  const trait=state.turn===WHITE?'aux Blancs':'aux Noirs';
  const ligne=a.pv&&a.pv.length?formatPvLine(pvToSan(a.pv)):'(aucune)';
  return [
    "Voici une partie d'échecs en cours. Analyse fournie par le moteur (fais-lui confiance) :",
    "- Coups joués : "+movesSan,
    "- Trait : "+trait,
    "- Évaluation moteur (point de vue des Blancs) : "+formatEval(a.evalCp)+" ("+evalToWords(a.evalCp)+")",
    "- Meilleure ligne : "+ligne,
    "- Position "+(a.isBook?"encore dans la théorie d'ouverture (livre)":"hors théorie connue")+".",
    "",
    "Explique au joueur débutant, en 3 à 5 phrases en français, où en est la partie et quel plan suivre.",
    "Appuie-toi sur l'évaluation et la meilleure ligne ci-dessus ; n'invente pas d'autres coups."
  ].join('\n');
}

async function askLLM(){
  const out=document.getElementById('tutorLLM');
  const {apiKey,model}=getTutorSettings();
  if(!apiKey){ out.className='tutor-llm error'; out.textContent='Aucune clé API configurée.'; return; }
  out.className='tutor-llm'; out.textContent='Réflexion de l’IA…';
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-api-key':apiKey,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body:JSON.stringify({
        model, max_tokens:400,
        system:"Tu es un entraîneur d'échecs bienveillant qui s'adresse à un débutant en français. Tu t'appuies STRICTEMENT sur l'analyse du moteur fournie ; tu n'inventes pas de coups et restes cohérent avec l'évaluation donnée.",
        messages:[{role:'user',content:buildLLMPrompt(lastAnalysis)}]
      })
    });
    const data=await res.json();
    if(!res.ok){
      out.className='tutor-llm error';
      out.textContent='Erreur IA : '+((data&&data.error&&data.error.message)||res.status);
      return;
    }
    const text=(data&&data.content&&data.content[0]&&data.content[0].text)||'(réponse vide)';
    out.className='tutor-llm'; out.textContent=text;
  }catch(e){
    out.className='tutor-llm error';
    out.textContent='Connexion impossible : '+e.message;
  }
}
```
Puis enrichir le namespace de test — remplacer la ligne `window.__tutorTest={ ... , pvToSan, formatPvLine };` par :
```js
window.__tutorTest={ getTutorSettings, setTutorSetting, formatEval, evalToWords, requestAnalysis, pvToSan, formatPvLine, buildLLMPrompt };
```

- [ ] **Step 4 : Câbler les boutons « Avis de l'IA » et « Tester la connexion »**

Dans `chess.html`, dans la fonction `wireTutor` (Task 5), juste avant sa fermeture `})();`, ajouter :
```js
  askBtn.addEventListener('click',askLLM);
  const testBtn=document.getElementById('tutorTestBtn');
  const testResult=document.getElementById('tutorTestResult');
  testBtn.addEventListener('click',async()=>{
    setTutorSetting('tutorApiKey',keyInput.value.trim());
    setTutorSetting('tutorModel',modelInput.value);
    refreshAskState();
    testResult.textContent='Test…';
    const {apiKey,model}=getTutorSettings();
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'content-type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model,max_tokens:8,messages:[{role:'user',content:'ping'}]})
      });
      testResult.textContent=res.ok?'✓ Connexion OK':'✗ Erreur '+res.status;
    }catch(e){ testResult.textContent='✗ '+e.message; }
  });
```

- [ ] **Step 5 : Lancer (succès attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/llm.spec.js
```
Expected : PASS (3 tests).

- [ ] **Step 6 : Commit**

```bash
cd /home/wims/public_html/chess
git add chess.html tests/llm.spec.js
git commit -m "feat(tuteur): commentaire en prose à la demande via l'API Claude (ancré sur le moteur)"
```

---

## Task 7 : Vérification de non-régression & validation finale

**Files:**
- Test: tous les fichiers `tests/*.spec.js`

- [ ] **Step 1 : Lancer toute la suite**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test
```
Expected : PASS pour tous les fichiers (baseline, helpers, analysis, tutor-ui, llm).

- [ ] **Step 2 : Vérification manuelle dans le navigateur**

Run :
```bash
cd /home/wims/public_html/chess
npx http-server -p 8123 -c-1 .
```
Ouvrir `http://127.0.0.1:8123/chess.html` et vérifier :
- Tuteur **éteint** par défaut → aucun panneau, jeu identique à avant.
- Clic sur le lien « ← Retour à WIMS » → tente d'aller sur `/wims/wims.cgi`.
- Activation du tuteur → éval + meilleure ligne + badge théorique se mettent à jour après chaque coup.
- Sans clé API → bouton « Avis de l'IA » grisé, le reste fonctionne.
- Avec une vraie clé API → « Tester la connexion » = OK, « Avis de l'IA » renvoie un commentaire cohérent.

- [ ] **Step 3 : Vérifier la permission du fichier livré (contexte WIMS)**

Run :
```bash
ls -l /home/wims/public_html/chess/chess.html
```
Si le fichier a été modifié par Claude Code et appartient à un autre utilisateur, corriger le propriétaire (voir mémoire « Accès système WIMS ») :
```bash
sudo chown wims:wims /home/wims/public_html/chess/chess.html
```
Expected : `chess.html` appartient à `wims:wims`.

- [ ] **Step 4 : Commit final**

```bash
cd /home/wims/public_html/chess
git add -A
git commit -m "test(tuteur): suite complète verte + validation de non-régression"
```

---

## Notes de vérification (self-review effectuée)

- **Couverture de la spec :** lien WIMS (Task 5), interrupteur + panneau (Task 5), statut théorique (Task 3 `positionInBook` + Task 5 affichage), évaluation chiffrée + en mots (Task 2 + Task 5), meilleure ligne (Task 3 PV + Task 4 SAN + Task 5), bouton « Avis de l'IA » à la demande (Task 6), réglages clé/modèle en localStorage (Task 1 + Task 5/6), appel Claude direct navigateur + gestion d'erreurs (Task 6), non-régression (Task 0 + Task 7). ✔
- **Cohérence des types :** `lastAnalysis = {evalCp:number, pv:string[] (UCI), isBook:boolean}` est produit en Task 3 et consommé identiquement en Tasks 5/6. `getTutorSettings()` renvoie `{apiKey, model}` partout. Le namespace `window.__tutorTest` est étendu de façon additive à chaque task. ✔
- **Pas de placeholder** dans le code livré ; le seul marqueur `/*__BOOK_TABLE__*/` (Task 3 Step 4) est explicitement remplacé par le contenu existant de l'objet `BOOK` dans la même étape.
