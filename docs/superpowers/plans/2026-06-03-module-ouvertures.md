# Module d'entraînement aux ouvertures — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à `chess.html` un mode « Entraînement ouvertures » : le stagiaire choisit une ouverture nommée (catalogue ECO lichess) et son camp, puis drille la ligne avec correction, indices et explication IA à la demande — sans toucher au mode « Partie libre ».

**Architecture:** Le code du module vit dans une section délimitée de `chess.html` (dans l'IIFE principale, pour accéder à `legalMoves`/`applyMove`/`render`/`state`/`notation`/`sqName`/`sqIndex`). Un état `mode` (`'play'`|`'train'`) garde l'intégration : en `'play'`, comportement actuel inchangé. Les lignes proviennent d'un fichier de données `openings.json` (généré une fois par un script de dev à partir des TSV lichess via `chess.js`, puis chargé par `fetch`). L'adversaire en drill est scripté (pas le moteur).

**Tech Stack:** HTML/CSS/JS vanilla (un seul fichier livré + `openings.json`). Script de dev Node + `chess.js` (build only). Tests : Playwright.

---

## Structure des fichiers

| Fichier | Rôle | Statut |
|---|---|---|
| `chess.html` | Application + module entraînement (runtime) | **Modifié** |
| `openings.json` | Catalogue d'ouvertures (UCI), livré | **Créé** |
| `tools/build-openings.mjs` | Script de dev : TSV lichess → `openings.json` | Créé (dev) |
| `tools/openings-src/*.tsv` | TSV lichess téléchargés (source du build) | Créé (dev, gitignoré) |
| `tests/openings.spec.js` | Tests du module entraînement | Créé (dev) |

**Conventions de test :** le module expose ses fonctions internes sous `window.__trainTest` (un seul objet de namespace), pour permettre les `page.evaluate`. C'est l'unique ajout au scope global de ce module.

**Identifiant UCI d'un coup :** `uciOf(m) = sqName(m.from)+sqName(m.to)+(m.promo?m.promo.toLowerCase():'')`. `sqName` (index→case) et `sqIndex` (case→index) existent déjà dans `chess.html`.

---

## Task 0 : Données — script de build + génération de `openings.json`

**Files:**
- Create: `tools/build-openings.mjs`
- Modify: `.gitignore`
- Create: `openings.json` (généré)

- [ ] **Step 1 : Installer chess.js (dépendance de dev)**

Run :
```bash
cd /home/wims/public_html/chess
npm install --save-dev chess.js@1
```
Expected : installé sans erreur.

- [ ] **Step 2 : Ignorer les TSV source (mais pas openings.json)**

Ajouter à `/home/wims/public_html/chess/.gitignore` :
```
tools/openings-src/
```

- [ ] **Step 3 : Écrire le script de build**

Créer `/home/wims/public_html/chess/tools/build-openings.mjs` :
```js
// Génère openings.json à partir des TSV lichess chess-openings (CC0).
// Usage : node tools/build-openings.mjs
import { Chess } from 'chess.js';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';

const FILES = ['a','b','c','d','e'];
const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';
const SRC_DIR = new URL('./openings-src/', import.meta.url);

async function getTsv(letter){
  const local = new URL(`${letter}.tsv`, SRC_DIR);
  if(existsSync(local)) return readFileSync(local,'utf8');
  const res = await fetch(`${BASE}/${letter}.tsv`);
  if(!res.ok) throw new Error(`HTTP ${res.status} pour ${letter}.tsv`);
  const text = await res.text();
  mkdirSync(SRC_DIR, {recursive:true});
  writeFileSync(new URL(`${letter}.tsv`, SRC_DIR), text);
  return text;
}

function pgnToUci(pgn){
  const c = new Chess();
  c.loadPgn(pgn);                       // lève une exception si invalide
  return c.history({verbose:true}).map(m => m.from + m.to + (m.promotion||''));
}

const out = [];
let skipped = 0;
for(const letter of FILES){
  const tsv = await getTsv(letter);
  const lines = tsv.split('\n').slice(1).filter(Boolean); // enlève l'entête
  for(const line of lines){
    const [eco, name, pgn] = line.split('\t');
    if(!eco || !name || !pgn) continue;
    try {
      const uci = pgnToUci(pgn.trim());
      if(uci.length) out.push({ eco, name, uci });
    } catch(e){ skipped++; }
  }
}
out.sort((a,b)=> a.name.localeCompare(b.name));
writeFileSync(new URL('../openings.json', import.meta.url), JSON.stringify(out));
console.log(`openings.json écrit : ${out.length} ouvertures, ${skipped} ignorées.`);
```

- [ ] **Step 4 : Générer le catalogue**

Run :
```bash
cd /home/wims/public_html/chess
node tools/build-openings.mjs
```
Expected : message du type `openings.json écrit : ~3500 ouvertures, N ignorées.` (N faible).

- [ ] **Step 5 : Vérifier le contenu généré**

Run :
```bash
cd /home/wims/public_html/chess
node -e "const o=require('./openings.json');console.log('total',o.length);console.log('RuyLopez?', !!o.find(x=>x.name==='Ruy Lopez'));console.log(JSON.stringify(o.find(x=>x.name==='Ruy Lopez')))"
```
Expected : `total` ~3500 ; `RuyLopez? true` ; l'entrée Ruy Lopez a un tableau `uci` commençant par `["e2e4","e7e5","g1f3","b8c6","f1b5"]`.

- [ ] **Step 6 : Commit**

```bash
cd /home/wims/public_html/chess
git add .gitignore package.json package-lock.json tools/build-openings.mjs openings.json
git commit -m "feat(ouvertures): script de build + catalogue openings.json (lichess CC0)"
```

---

## Task 1 : État de mode + sélecteur Partie libre / Entraînement

**Files:**
- Modify: `chess.html` (HTML : sélecteur dans `.right-stack` ; conteneur `#trainPane`)
- Modify: `chess.html` (CSS : `.right-stack` en flex + styles du module)
- Modify: `chess.html` (JS : variable `mode`, fonctions `setMode`, câblage)
- Test: `tests/openings.spec.js`

- [ ] **Step 1 : Écrire le test du sélecteur de mode**

Créer `/home/wims/public_html/chess/tests/openings.spec.js` :
```js
const { test, expect } = require('@playwright/test');

test('le sélecteur de mode bascule entre partie libre et entraînement', async ({ page }) => {
  await page.goto('/chess.html');
  // Par défaut : partie libre, panneau scores visible, entraînement caché
  await expect(page.locator('#trainPane')).toBeHidden();
  await expect(page.locator('.score-pane')).toBeVisible();
  // Basculer en entraînement
  await page.locator('#modeTrain').click();
  await expect(page.locator('#trainPane')).toBeVisible();
  await expect(page.locator('.score-pane')).toBeHidden();
  // Revenir en partie libre
  await page.locator('#modePlay').click();
  await expect(page.locator('#trainPane')).toBeHidden();
  await expect(page.locator('.score-pane')).toBeVisible();
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/openings.spec.js
```
Expected : FAIL — `#modeTrain`/`#trainPane` absents.

- [ ] **Step 3 : Ajouter le HTML (sélecteur + conteneur entraînement)**

Dans `chess.html`, remplacer l'ouverture du bloc right-stack :
```html
    <div class="right-stack">
        <section class="score-pane">
```
par :
```html
    <div class="right-stack">
        <div class="mode-switch">
            <button id="modePlay" class="mode-btn active">Partie libre</button>
            <button id="modeTrain" class="mode-btn">Entraînement ouvertures</button>
        </div>
        <section class="score-pane">
```
Puis, juste avant la fermeture `</div>` du `right-stack` (la ligne `    </div>` qui suit la `</section>` du `#tutorPane`), insérer le conteneur entraînement :
```html
        <section id="trainPane" class="train-pane">
            <div id="openingPicker" class="opening-picker">
                <div class="train-title">Choisir une ouverture</div>
                <input id="openingSearch" type="search" placeholder="Rechercher une ouverture…">
                <div id="openingResults" class="opening-results"></div>
            </div>
            <div id="drillPanel" class="drill-panel hidden">
                <div class="train-title"><span id="drillName"></span> <span id="drillEco" class="drill-eco"></span></div>
                <div id="drillProgress" class="drill-progress"></div>
                <div id="drillFeedback" class="drill-feedback"></div>
                <button id="drillHintBtn" class="drill-btn">Indice</button>
                <button id="drillExplainBtn" class="drill-btn" disabled>💡 Explique cette ouverture</button>
                <div id="drillExplain" class="drill-explain"></div>
                <div class="drill-actions">
                    <button id="drillRestart" class="drill-btn">Recommencer</button>
                    <button id="drillChange" class="drill-btn">Changer d'ouverture</button>
                    <button id="drillToFree" class="drill-btn hidden">Continuer en partie libre</button>
                </div>
            </div>
        </section>
    </div>
```

- [ ] **Step 4 : Ajouter le CSS**

Dans `chess.html`, juste avant `</style>`, insérer :
```css
.right-stack{display:flex;flex-direction:column}
.right-stack .side{flex:1 1 auto}
.right-stack.train .score-pane,.right-stack.train .side,.right-stack.train #tutorPane{display:none}
.right-stack:not(.train) #trainPane{display:none}
.mode-switch{display:flex;gap:8px}
.mode-btn{flex:1;padding:8px 10px;border-radius:10px;border:1px solid rgba(120,107,96,.4);background:rgba(255,250,242,.7);cursor:pointer;font-size:13px}
.mode-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.train-pane{background:rgba(255,250,242,.88);border-radius:16px;padding:16px 18px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:10px;overflow:auto}
.train-title{font-weight:600}
#openingSearch{padding:8px 10px;border-radius:10px;border:1px solid rgba(120,107,96,.4)}
.opening-results{display:flex;flex-direction:column;gap:4px;overflow:auto;max-height:calc(var(--board) - 60px)}
.opening-row{text-align:left;padding:8px 10px;border-radius:8px;border:1px solid rgba(120,107,96,.25);background:#fff;cursor:pointer;font-size:13px}
.opening-row:hover{border-color:var(--accent)}
.opening-row .eco{color:var(--muted);font-size:11px;margin-right:6px}
.opening-row .moves{color:var(--muted);font-size:11px}
.opening-sidechoice{display:flex;gap:8px;margin-top:4px}
.drill-eco{color:var(--muted);font-weight:400;font-size:13px}
.drill-progress{font-size:13px;color:var(--muted)}
.drill-feedback{font-size:14px;min-height:1.4em}
.drill-feedback.good{color:var(--accent)}
.drill-feedback.bad{color:#b3402e}
.drill-btn{padding:8px 12px;border-radius:10px;border:1px solid rgba(120,107,96,.4);background:rgba(255,250,242,.8);cursor:pointer;font-size:13px}
.drill-btn:disabled{opacity:.45;cursor:not-allowed}
.drill-actions{display:flex;flex-wrap:wrap;gap:8px}
.drill-explain{font-size:14px;line-height:1.55;white-space:pre-wrap}
.drill-explain.error{color:#b3402e}
.hint-from{box-shadow:inset 0 0 0 4px rgba(83,107,70,.9)}
.hint-to{box-shadow:inset 0 0 0 4px rgba(83,107,70,.55)}
.square.hint-from, .square.hint-to{position:relative}
```

- [ ] **Step 5 : Ajouter l'état `mode` et `setMode` (JS)**

Dans `chess.html`, juste après le bloc `// === TUTEUR IA : état & réglages ===` (après la ligne `let lastAnalysis=null;`), insérer :
```js
// === ENTRAÎNEMENT OUVERTURES : état ===
let mode='play';          // 'play' | 'train'
let openingsData=null;    // cache du catalogue chargé
let drill=null;           // {opening, side, line:[uci], plyIndex, hintLevel}

function uciOf(m){ return sqName(m.from)+sqName(m.to)+(m.promo?m.promo.toLowerCase():''); }

function setMode(next){
  mode=next;
  const rs=document.querySelector('.right-stack');
  rs.classList.toggle('train', next==='train');
  document.getElementById('modePlay').classList.toggle('active', next==='play');
  document.getElementById('modeTrain').classList.toggle('active', next==='train');
  if(next==='play'){
    drill=null;
    startNewGame(false);
  } else {
    showOpeningPicker();
  }
}
// Stub remplacé en Task 3 :
function showOpeningPicker(){}

window.__trainTest={ getMode:()=>mode };
```

- [ ] **Step 6 : Câbler les boutons de mode**

Dans `chess.html`, dans l'IIFE `wireTutor` n'est PAS le bon endroit ; ajouter un nouveau câblage juste avant `startWorker();` (après la fermeture `})();` de `wireTutor`) :
```js
// === CÂBLAGE MODE / ENTRAÎNEMENT ===
document.getElementById('modePlay').addEventListener('click',()=>setMode('play'));
document.getElementById('modeTrain').addEventListener('click',()=>setMode('train'));
```

- [ ] **Step 7 : Lancer (succès attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/openings.spec.js tests/baseline.spec.js
```
Expected : PASS.

- [ ] **Step 8 : Commit**

```bash
cd /home/wims/public_html/chess
git add chess.html tests/openings.spec.js
git commit -m "feat(ouvertures): sélecteur de mode partie libre / entraînement"
```

---

## Task 2 : Chargement du catalogue + classiques + recherche

**Files:**
- Modify: `chess.html` (JS : `loadOpenings`, `FEATURED_OPENINGS`, `featuredOpenings`, `searchOpenings`)
- Test: `tests/openings.spec.js`

- [ ] **Step 1 : Écrire les tests**

Ajouter à la fin de `/home/wims/public_html/chess/tests/openings.spec.js` :
```js
test('loadOpenings charge le catalogue et la recherche filtre', async ({ page }) => {
  await page.goto('/chess.html');
  const n = await page.evaluate(async () => (await window.__trainTest.loadOpenings()).length);
  expect(n).toBeGreaterThan(1000);

  const found = await page.evaluate(() =>
    window.__trainTest.searchOpenings('ruy lopez').some(o => o.name === 'Ruy Lopez')
  );
  expect(found).toBe(true);

  const feat = await page.evaluate(() => window.__trainTest.featuredOpenings().map(o => o.name));
  expect(feat).toContain('Ruy Lopez');
  expect(feat.length).toBeGreaterThan(5);
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/openings.spec.js -g "loadOpenings"
```
Expected : FAIL — fonctions non définies.

- [ ] **Step 3 : Implémenter le chargement + recherche**

Dans `chess.html`, juste après `function uciOf(m){…}` (Task 1), insérer :
```js
const FEATURED_OPENINGS=['Ruy Lopez','Italian Game','Sicilian Defense','French Defense',
  'Caro-Kann Defense','Scandinavian Defense',"Queen's Gambit Declined","King's Indian Defense",
  'English Opening','Réti Opening','Slav Defense','Nimzo-Indian Defense'];

async function loadOpenings(){
  if(openingsData) return openingsData;
  const res=await fetch('openings.json');
  if(!res.ok) throw new Error('HTTP '+res.status);
  openingsData=await res.json();
  return openingsData;
}

function featuredOpenings(){
  if(!openingsData) return [];
  const byName=new Map(openingsData.map(o=>[o.name,o]));
  const out=[];
  for(const name of FEATURED_OPENINGS){
    let o=byName.get(name);
    if(!o) o=openingsData.find(x=>x.name.startsWith(name));
    if(o) out.push(o);
  }
  return out;
}

function searchOpenings(query, limit=60){
  if(!openingsData||!query) return [];
  const q=query.toLowerCase();
  const out=[];
  for(const o of openingsData){
    if(o.name.toLowerCase().includes(q)){ out.push(o); if(out.length>=limit) break; }
  }
  return out;
}
```
Puis enrichir le namespace de test — remplacer `window.__trainTest={ getMode:()=>mode };` par :
```js
window.__trainTest={ getMode:()=>mode, loadOpenings, featuredOpenings, searchOpenings };
```

- [ ] **Step 4 : Lancer (succès attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/openings.spec.js
```
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
cd /home/wims/public_html/chess
git add chess.html tests/openings.spec.js
git commit -m "feat(ouvertures): chargement du catalogue, classiques mis en avant, recherche"
```

---

## Task 3 : Sélecteur d'ouverture (liste + recherche + choix du camp)

**Files:**
- Modify: `chess.html` (JS : `showOpeningPicker`, `renderOpeningRows`, câblage recherche)
- Test: `tests/openings.spec.js`

- [ ] **Step 1 : Écrire le test**

Ajouter à la fin de `/home/wims/public_html/chess/tests/openings.spec.js` :
```js
test('le sélecteur affiche les classiques puis filtre, et propose le choix du camp', async ({ page }) => {
  await page.goto('/chess.html');
  await page.locator('#modeTrain').click();
  // Les classiques apparaissent
  await expect(page.locator('#openingResults .opening-row').first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#openingResults')).toContainText('Ruy Lopez');
  // Recherche
  await page.locator('#openingSearch').fill('sicilian');
  await expect(page.locator('#openingResults')).toContainText('Sicilian', { timeout: 5000 });
  // Sélectionner une entrée -> choix du camp
  await page.locator('#openingResults .opening-row', { hasText: 'Sicilian' }).first().click();
  await expect(page.locator('.opening-sidechoice')).toBeVisible();
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/openings.spec.js -g "sélecteur affiche"
```
Expected : FAIL — `showOpeningPicker` est un stub.

- [ ] **Step 3 : Implémenter le sélecteur (remplacer le stub)**

Dans `chess.html`, remplacer `function showOpeningPicker(){}` par :
```js
function openingMovesPreview(o){
  // aperçu en notation française des 3 premiers demi-coups
  const san=pvToSan(o.uci.slice(0,3), fromFEN(START));
  return formatPvLine(san, fromFEN(START));
}

function renderOpeningRows(list){
  const box=document.getElementById('openingResults');
  box.innerHTML='';
  for(const o of list){
    const row=document.createElement('div');
    row.className='opening-row';
    row.innerHTML=`<span class="eco">${o.eco}</span>${o.name}<div class="moves">${openingMovesPreview(o)}</div>`;
    row.addEventListener('click',()=>askSideThenStart(o,row));
    box.appendChild(row);
  }
}

function askSideThenStart(o,row){
  // retire un éventuel choix précédent
  document.querySelectorAll('.opening-sidechoice').forEach(e=>e.remove());
  const choice=document.createElement('div');
  choice.className='opening-sidechoice';
  const wb=document.createElement('button'); wb.className='drill-btn'; wb.textContent='Jouer les Blancs';
  const bb=document.createElement('button'); bb.className='drill-btn'; bb.textContent='Jouer les Noirs';
  wb.addEventListener('click',e=>{e.stopPropagation();startDrill(o,WHITE);});
  bb.addEventListener('click',e=>{e.stopPropagation();startDrill(o,BLACK);});
  choice.append(wb,bb);
  row.after(choice);
}

async function showOpeningPicker(){
  document.getElementById('openingPicker').classList.remove('hidden');
  document.getElementById('drillPanel').classList.add('hidden');
  const box=document.getElementById('openingResults');
  try{
    await loadOpenings();
  }catch(e){
    box.innerHTML='<div class="drill-feedback bad">Catalogue indisponible ('+e.message+').</div>';
    return;
  }
  renderOpeningRows(featuredOpenings());
}
// Stub remplacé en Task 4 :
function startDrill(){}
```
Puis câbler la recherche : dans le bloc `// === CÂBLAGE MODE / ENTRAÎNEMENT ===` (Task 1, Step 6), ajouter :
```js
document.getElementById('openingSearch').addEventListener('input',e=>{
  const q=e.target.value.trim();
  renderOpeningRows(q.length>=2?searchOpenings(q):featuredOpenings());
});
```

- [ ] **Step 4 : Lancer (succès attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/openings.spec.js
```
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
cd /home/wims/public_html/chess
git add chess.html tests/openings.spec.js
git commit -m "feat(ouvertures): sélecteur d'ouverture (classiques, recherche, choix du camp)"
```

---

## Task 4 : Moteur de drill (démarrage, coup juste/faux, adversaire scripté)

**Files:**
- Modify: `chess.html` (JS : `startDrill`, `drillTryMove`, `drillPlayOpponent`, `renderDrillPanel`, `drillFeedback` ; garde de mode dans `tryMove`)
- Test: `tests/openings.spec.js`

- [ ] **Step 1 : Écrire les tests du drill**

Ajouter à la fin de `/home/wims/public_html/chess/tests/openings.spec.js` :
```js
async function dragPiece(page, fromIndex, toIndex){
  const f=await page.locator(`.square[data-i="${fromIndex}"]`).boundingBox();
  const t=await page.locator(`.square[data-i="${toIndex}"]`).boundingBox();
  await page.mouse.move(f.x+f.width/2,f.y+f.height/2);
  await page.mouse.down();
  await page.mouse.move(t.x+t.width/2,t.y+t.height/2,{steps:6});
  await page.mouse.up();
}
const TEST_LINE = {eco:'C50', name:'Test Italienne', uci:['e2e4','e7e5','g1f3','b8c6','f1c4']};

test('drill Blancs : coup juste avance, coup faux est refusé', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate(async (op) => { await window.__trainTest.loadOpenings(); window.__trainTest.startDrill(op, 'w'); }, TEST_LINE);
  // Coup FAUX (a2-a3) : refusé, plyIndex inchangé
  await dragPiece(page, 48, 40); // a2 -> a3
  await page.waitForTimeout(200);
  expect(await page.evaluate(()=>window.__trainTest.getDrill().plyIndex)).toBe(0);
  await expect(page.locator('#drillFeedback')).toContainText('ligne');
  // Coup JUSTE (e2-e4) : avance ; l'adversaire répond e7-e5 -> plyIndex passe à 2
  await dragPiece(page, 52, 36); // e2 -> e4
  await page.waitForTimeout(500);
  expect(await page.evaluate(()=>window.__trainTest.getDrill().plyIndex)).toBe(2);
});

test('drill Noirs : l\'app joue d\'abord le coup blanc', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate(async (op) => { await window.__trainTest.loadOpenings(); window.__trainTest.startDrill(op, 'b'); }, TEST_LINE);
  await page.waitForTimeout(500);
  // après le coup blanc auto, c'est aux Noirs ; plyIndex == 1
  expect(await page.evaluate(()=>window.__trainTest.getDrill().plyIndex)).toBe(1);
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/openings.spec.js -g "drill"
```
Expected : FAIL — `startDrill` est un stub, `getDrill` absent.

- [ ] **Step 3 : Implémenter le moteur de drill (remplacer le stub `startDrill`)**

Dans `chess.html`, remplacer `function startDrill(){}` par :
```js
function drillFeedback(msg, kind){
  const el=document.getElementById('drillFeedback');
  el.textContent=msg||'';
  el.className='drill-feedback'+(kind?' '+kind:'');
}

function startDrill(opening, side){
  mode='train';
  drill={opening, side, line:opening.uci.slice(), plyIndex:0, hintLevel:0};
  userColor=side; botColor=opp(side);
  flipped=(userColor===BLACK);
  state=fromFEN(START);
  selected=null; lastMove=null; history=[]; gameOver=false; resigned=false;
  positionCounts=new Map(); legalCache=[];
  document.getElementById('openingPicker').classList.add('hidden');
  document.getElementById('drillPanel').classList.remove('hidden');
  render();
  renderDrillPanel();
  drillFeedback(side===WHITE?'À vous de jouer (Blancs).':'', '');
  if(side===BLACK) setTimeout(()=>drillPlayOpponent(),300);
}

function drillPlayOpponent(){
  if(!drill||drill.plyIndex>=drill.line.length) return;
  const uci=drill.line[drill.plyIndex];
  const m=legalMoves(state).find(x=>uciOf(x)===uci);
  if(!m){ drillFeedback('Ligne incohérente avec la position.','bad'); return; }
  state=applyMove(state,m,true);
  drill.plyIndex++;
  selected=null; render(); renderDrillPanel();
  if(drill.plyIndex>=drill.line.length) drillComplete();
  else drillFeedback('À vous de jouer.','');
}

function drillTryMove(from,to){
  if(!drill||drill.plyIndex>=drill.line.length) return false;
  const choices=legalCache.filter(m=>m.from===from&&m.to===to);
  if(!choices.length) return false; // coup illégal : laisser le handler nettoyer
  const expected=drill.line[drill.plyIndex];
  const m=choices.find(x=>uciOf(x)===expected)||choices[0];
  if(uciOf(m)!==expected){
    drill.hintLevel=0;
    selected=null; render();
    drillFeedback('✗ Ce n\'est pas le coup de la ligne. Réessayez.','bad');
    return true; // consommé : on ne laisse pas le handler re-render
  }
  state=applyMove(state,m,true);
  drill.plyIndex++; drill.hintLevel=0;
  selected=null; render(); renderDrillPanel();
  if(drill.plyIndex>=drill.line.length){ drillComplete(); return true; }
  drillFeedback('✓ Bien joué.','good');
  setTimeout(()=>drillPlayOpponent(),250);
  return true;
}

function renderDrillPanel(){
  if(!drill) return;
  document.getElementById('drillName').textContent=drill.opening.name;
  document.getElementById('drillEco').textContent=drill.opening.eco;
  const total=drill.line.length;
  document.getElementById('drillProgress').textContent=`Coup ${Math.min(drill.plyIndex,total)} / ${total}`;
}
// Stub remplacé en Task 5 :
function drillComplete(){ drillFeedback('✅ Ligne terminée.','good'); }
```

- [ ] **Step 4 : Brancher la garde de mode dans `tryMove`**

Dans `chess.html`, au tout début de `function tryMove(from,to){`, insérer la première ligne :
```js
function tryMove(from,to){
  if(mode==='train') return drillTryMove(from,to);
  if(state.turn!==userColor||botBusy||gameOver)return false;
```
(c.-à-d. ajouter la ligne `if(mode==='train') return drillTryMove(from,to);` juste avant la ligne existante `if(state.turn!==userColor||botBusy||gameOver)return false;`).

- [ ] **Step 5 : Exposer `getDrill` et `startDrill` pour les tests**

Dans `chess.html`, remplacer `window.__trainTest={ getMode:()=>mode, loadOpenings, featuredOpenings, searchOpenings };` par :
```js
window.__trainTest={ getMode:()=>mode, getDrill:()=>drill, loadOpenings, featuredOpenings, searchOpenings, startDrill, uciOf };
```

- [ ] **Step 6 : Lancer (succès attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/openings.spec.js tests/baseline.spec.js
```
Expected : PASS.

- [ ] **Step 7 : Commit**

```bash
cd /home/wims/public_html/chess
git add chess.html tests/openings.spec.js
git commit -m "feat(ouvertures): moteur de drill (coup juste/faux, adversaire scripté, garde de mode)"
```

---

## Task 5 : Indice, fin de ligne, actions (recommencer / changer / partie libre)

**Files:**
- Modify: `chess.html` (JS : `drillHint`, `drillComplete`, `continueInFreePlay`, câblage des boutons)
- Test: `tests/openings.spec.js`

- [ ] **Step 1 : Écrire les tests**

Ajouter à la fin de `/home/wims/public_html/chess/tests/openings.spec.js` :
```js
test('Indice surligne la pièce à jouer', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate(async (op) => { await window.__trainTest.loadOpenings(); window.__trainTest.startDrill(op, 'w'); }, TEST_LINE);
  await page.locator('#drillHintBtn').click();
  // e2 (index 52) doit recevoir la surbrillance hint-from
  await expect(page.locator('.square[data-i="52"]')).toHaveClass(/hint-from/);
});

test('fin de ligne : message de réussite + Continuer en partie libre', async ({ page }) => {
  await page.goto('/chess.html');
  // Ligne courte : 1.e4 e5 (l'app joue e5), le stagiaire (Blancs) joue e4
  const shortLine = {eco:'C20', name:'Test court', uci:['e2e4','e7e5']};
  await page.evaluate(async (op) => { await window.__trainTest.loadOpenings(); window.__trainTest.startDrill(op, 'w'); }, shortLine);
  await dragPiece(page, 52, 36); // e2 -> e4 ; l'app répond e7-e5 -> fin
  await expect(page.locator('#drillFeedback')).toContainText('terminée', { timeout: 4000 });
  await expect(page.locator('#drillToFree')).toBeVisible();
  await page.locator('#drillToFree').click();
  expect(await page.evaluate(()=>window.__trainTest.getMode())).toBe('play');
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/openings.spec.js -g "Indice|fin de ligne"
```
Expected : FAIL — bouton Indice non câblé, `#drillToFree` non révélé.

- [ ] **Step 3 : Implémenter indice + fin + actions (remplacer le stub `drillComplete`)**

Dans `chess.html`, remplacer `function drillComplete(){ drillFeedback('✅ Ligne terminée.','good'); }` par :
```js
function drillHint(){
  if(!drill||drill.plyIndex>=drill.line.length) return;
  const uci=drill.line[drill.plyIndex];
  const from=sqIndex(uci.slice(0,2)), to=sqIndex(uci.slice(2,4));
  drill.hintLevel=(drill.hintLevel||0)+1;
  document.querySelectorAll('.square').forEach(s=>s.classList.remove('hint-from','hint-to'));
  const fromEl=document.querySelector(`.square[data-i="${from}"]`); if(fromEl)fromEl.classList.add('hint-from');
  if(drill.hintLevel>=2){ const toEl=document.querySelector(`.square[data-i="${to}"]`); if(toEl)toEl.classList.add('hint-to'); }
}

function drillComplete(){
  renderDrillPanel();
  drillFeedback('✅ Ligne terminée — vous maîtrisez '+drill.opening.name+'.','good');
  document.getElementById('drillToFree').classList.remove('hidden');
}

function continueInFreePlay(){
  // bascule en mode jeu depuis la position courante, contre le bot
  mode='play';
  drill=null;
  document.querySelector('.right-stack').classList.remove('train');
  document.getElementById('modePlay').classList.add('active');
  document.getElementById('modeTrain').classList.remove('active');
  gameOver=false; botBusy=false;
  render();
  if(state.turn===botColor) setTimeout(()=>triggerBot(),200);
}
```

- [ ] **Step 4 : Câbler les boutons du drill**

Dans `chess.html`, dans le bloc `// === CÂBLAGE MODE / ENTRAÎNEMENT ===`, ajouter :
```js
document.getElementById('drillHintBtn').addEventListener('click',drillHint);
document.getElementById('drillRestart').addEventListener('click',()=>{ if(drill) startDrill(drill.opening, drill.side); });
document.getElementById('drillChange').addEventListener('click',()=>showOpeningPicker());
document.getElementById('drillToFree').addEventListener('click',continueInFreePlay);
```

- [ ] **Step 5 : Masquer le bouton « Continuer » au redémarrage**

Dans `chess.html`, dans `startDrill`, juste après `document.getElementById('drillPanel').classList.remove('hidden');`, ajouter :
```js
  document.getElementById('drillToFree').classList.add('hidden');
  document.getElementById('drillExplain').textContent='';
```

- [ ] **Step 6 : Lancer (succès attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/openings.spec.js tests/baseline.spec.js
```
Expected : PASS.

- [ ] **Step 7 : Commit**

```bash
cd /home/wims/public_html/chess
git add chess.html tests/openings.spec.js
git commit -m "feat(ouvertures): indice, fin de ligne, recommencer/changer/partie libre"
```

---

## Task 6 : « Explique cette ouverture » (API Claude à la demande)

**Files:**
- Modify: `chess.html` (JS : extraction d'un helper `claudeComplete`, `buildOpeningPrompt`, `explainOpening` ; activation du bouton ; mise à jour de `askLLM` pour réutiliser le helper)
- Test: `tests/openings.spec.js`

- [ ] **Step 1 : Écrire les tests (réseau intercepté)**

Ajouter à la fin de `/home/wims/public_html/chess/tests/openings.spec.js` :
```js
test('buildOpeningPrompt mentionne le nom et les coups', async ({ page }) => {
  await page.goto('/chess.html');
  const prompt = await page.evaluate((op) =>
    window.__trainTest.buildOpeningPrompt(op), TEST_LINE);
  expect(prompt).toContain('Test Italienne');
  expect(prompt).toContain('1.e4');
});

test('Explique cette ouverture appelle Claude et affiche la réponse', async ({ page }) => {
  await page.route('https://api.anthropic.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ content: [{ type:'text', text:'L\'Italienne vise un développement rapide.' }] })
  }));
  await page.goto('/chess.html');
  await page.evaluate(() => { localStorage.setItem('tutorApiKey','sk-ant-test'); });
  await page.reload();
  await page.evaluate(async (op) => { await window.__trainTest.loadOpenings(); window.__trainTest.startDrill(op, 'w'); }, TEST_LINE);
  await page.locator('#drillExplainBtn').click();
  await expect(page.locator('#drillExplain')).toContainText('Italienne', { timeout: 5000 });
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/openings.spec.js -g "Explique|buildOpeningPrompt"
```
Expected : FAIL — `buildOpeningPrompt` absent, bouton inactif.

- [ ] **Step 3 : Extraire un helper `claudeComplete` réutilisable**

Dans `chess.html`, repérer la fonction `askLLM` (Task 6 du tuteur). Juste AVANT `async function askLLM(){`, insérer le helper partagé :
```js
async function claudeComplete(systemText, userText){
  const {apiKey,model}=getTutorSettings();
  if(!apiKey) throw new Error('Aucune clé API configurée.');
  const res=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'content-type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify({ model, max_tokens:400, system:systemText, messages:[{role:'user',content:userText}] })
  });
  let data=null; try{ data=await res.json(); }catch(_){}
  if(!res.ok) throw new Error((data&&data.error&&data.error.message)||('HTTP '+res.status));
  return (data&&data.content&&data.content[0]&&data.content[0].text)||'(réponse vide)';
}
```
Puis remplacer le corps de `askLLM` (du `try{` jusqu'au `}catch(e){…}` inclus) par une version qui réutilise le helper :
```js
async function askLLM(){
  const out=document.getElementById('tutorLLM');
  const {apiKey}=getTutorSettings();
  if(!apiKey){ out.className='tutor-llm error'; out.textContent='Aucune clé API configurée.'; return; }
  out.className='tutor-llm'; out.textContent='Réflexion de l’IA…';
  try{
    out.textContent=await claudeComplete(
      "Tu es un entraîneur d'échecs bienveillant qui s'adresse à un débutant en français. Tu t'appuies STRICTEMENT sur l'analyse du moteur fournie ; tu n'inventes pas de coups et restes cohérent avec l'évaluation donnée.",
      buildLLMPrompt(lastAnalysis));
  }catch(e){ out.className='tutor-llm error'; out.textContent='Erreur IA : '+e.message; }
}
```

- [ ] **Step 4 : Implémenter `buildOpeningPrompt` et `explainOpening`**

Dans `chess.html`, juste après `function renderDrillPanel(){…}` (Task 4), insérer :
```js
function buildOpeningPrompt(opening){
  const san=pvToSan(opening.uci, fromFEN(START));
  const ligne=formatPvLine(san, fromFEN(START));
  return [
    "Ouverture d'échecs : « "+opening.name+" » (code ECO "+opening.eco+").",
    "Ligne : "+ligne,
    "",
    "Explique à un débutant, en 3 à 5 phrases en français : l'idée générale de cette ouverture,",
    "les plans typiques pour les deux camps, et un piège ou point d'attention courant.",
    "Reste cohérent avec la ligne ci-dessus ; n'invente pas d'autres variantes."
  ].join('\n');
}

async function explainOpening(){
  const out=document.getElementById('drillExplain');
  if(!drill) return;
  const {apiKey}=getTutorSettings();
  if(!apiKey){ out.className='drill-explain error'; out.textContent='Aucune clé API configurée (réglages du tuteur).'; return; }
  out.className='drill-explain'; out.textContent='Réflexion de l’IA…';
  try{
    out.textContent=await claudeComplete(
      "Tu es un entraîneur d'échecs bienveillant qui explique les ouvertures à un débutant, en français, de façon concise et concrète.",
      buildOpeningPrompt(drill.opening));
  }catch(e){ out.className='drill-explain error'; out.textContent='Erreur IA : '+e.message; }
}
```

- [ ] **Step 5 : Activer le bouton selon la présence d'une clé + le câbler**

Dans `chess.html`, dans `startDrill`, juste après la ligne `document.getElementById('drillExplain').textContent='';` (ajoutée en Task 5), ajouter :
```js
  document.getElementById('drillExplainBtn').disabled=!getTutorSettings().apiKey;
```
Puis, dans le bloc `// === CÂBLAGE MODE / ENTRAÎNEMENT ===`, ajouter :
```js
document.getElementById('drillExplainBtn').addEventListener('click',explainOpening);
```
Puis enrichir le namespace de test — remplacer la ligne `window.__trainTest={ getMode:()=>mode, getDrill:()=>drill, loadOpenings, featuredOpenings, searchOpenings, startDrill, uciOf };` par :
```js
window.__trainTest={ getMode:()=>mode, getDrill:()=>drill, loadOpenings, featuredOpenings, searchOpenings, startDrill, uciOf, buildOpeningPrompt };
```

- [ ] **Step 6 : Lancer (succès attendu)**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test tests/openings.spec.js tests/llm.spec.js
```
Expected : PASS (les tests du tuteur restent verts après le refactor de `askLLM`).

- [ ] **Step 7 : Commit**

```bash
cd /home/wims/public_html/chess
git add chess.html tests/openings.spec.js
git commit -m "feat(ouvertures): explication IA à la demande (helper Claude partagé avec le tuteur)"
```

---

## Task 7 : Vérification de non-régression & finalisation

**Files:**
- Test: toute la suite ; `chess.html` (vérif droits)

- [ ] **Step 1 : Lancer toute la suite**

Run :
```bash
cd /home/wims/public_html/chess
npx playwright test
```
Expected : PASS pour tous les fichiers (baseline, helpers, analysis, tutor-ui, llm, game-controls, openings).

- [ ] **Step 2 : Vérification manuelle navigateur**

Run :
```bash
cd /home/wims/public_html/chess
npx http-server -p 8123 -c-1 .
```
Ouvrir `http://127.0.0.1:8123/chess.html` et vérifier :
- Mode « Partie libre » par défaut → jeu identique à avant (tuteur inclus).
- « Entraînement ouvertures » → liste des classiques + recherche ; choisir Ruy Lopez, jouer Blancs ; coups justes acceptés, coups faux refusés, Indice surligne ; fin de ligne → « Continuer en partie libre » rebascule et le bot répond.
- Avec une clé API : « Explique cette ouverture » renvoie un texte cohérent.
- Revenir en « Partie libre » → nouvelle partie normale.

- [ ] **Step 3 : Droits du fichier livré**

Run :
```bash
ls -l /home/wims/public_html/chess/chess.html /home/wims/public_html/chess/openings.json
```
Si nécessaire (propriétaire ≠ wims) : `sudo chown wims:wims chess.html openings.json`.

- [ ] **Step 4 : Commit final**

```bash
cd /home/wims/public_html/chess
git add -A
git commit -m "test(ouvertures): suite complète verte + validation de non-régression"
```

---

## Notes de vérification (self-review effectuée)

- **Couverture de la spec :** sélecteur de mode (Task 1) ; catalogue lichess→openings.json (Task 0) ; classiques + recherche (Task 2/3) ; choix du camp (Task 3) ; drill coup juste/faux + adversaire scripté (Task 4) ; indice + fin + continuer en partie libre + recommencer/changer (Task 5) ; explication IA à la demande (Task 6) ; non-régression (Task 1/4 gardes + Task 7). ✔
- **Cohérence des types :** `drill={opening,side,line,plyIndex,hintLevel}` créé en Task 4, consommé identiquement ensuite. `uciOf` défini en Task 1. `claudeComplete(system,user)` défini en Task 6 et réutilisé par `askLLM` et `explainOpening`. `window.__trainTest` étendu de façon additive. `FEATURED_OPENINGS` utilise les noms exacts du dataset lichess (anglais). ✔
- **Pas de placeholder** dans le code livré ; les `function …(){}` sont des stubs explicitement remplacés dans une tâche ultérieure nommée.
- **Dépendance au dataset :** les tests du drill utilisent des lignes construites en dur (`TEST_LINE`, `shortLine`), donc indépendants des noms exacts ; seuls les tests « catalogue » dépendent de la présence de « Ruy Lopez » / « Sicilian » (réels dans lichess).
