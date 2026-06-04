# Tuteur d'ouvertures — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer le module « Entraînement ouvertures » en un tuteur 3 phases — Étude (défilement commenté), Restitution (indices progressifs 4 niveaux), Partie (bascule « jouer à partir d'ici ») — avec une bibliothèque curée de leçons (ouvertures essentielles + pièges célèbres) en plus du catalogue ECO existant.

**Architecture :** Tout vit dans `chess.html` (HTML unique, JS vanilla + Web Worker). On **réutilise** le moteur de restitution existant (`drill`) en l'enrichissant (commentaires, 4 niveaux d'indice, compteur d'essais), on **ajoute** une phase Étude (`study`) et un picker enrichi (groupes de leçons curées + catalogue). Le contenu curé est un nouveau fichier `lessons.json` validé hors-ligne par `tools/validate-lessons.js` (chess.js). La garde `if(mode==='train')` reste le seul point d'entrée du tuteur → partie libre inchangée.

**Tech Stack :** HTML/CSS/JS vanilla, Web Worker, Playwright (`tests/*.spec.js`), Node + chess.js (validation données, dev uniquement).

**Convention dépôt :** travail directement sur `main`, commits au fil de l'eau, `npx playwright test` doit rester vert. Pas de worktree (convention du projet).

---

## Structure des fichiers

| Fichier | Rôle | Action |
|---------|------|--------|
| `lessons.json` | Bibliothèque curée (mainlines + pièges), schéma unique. | **Créer** |
| `tools/validate-lessons.js` | Validateur CommonJS (export `validateLessons`) + CLI. Rejoue chaque ligne avec chess.js, vérifie schéma. | **Créer** |
| `tests/lessons-data.spec.js` | Valide `lessons.json` livré via `validateLessons`. | **Créer** |
| `tests/study.spec.js` | Phase Étude : défilement, commentaire, encart piège, saut. | **Créer** |
| `tests/recall.spec.js` | Phase Restitution : 4 niveaux d'indice, progression, succès. | **Créer** |
| `tests/handoff.spec.js` | Bascule « Jouer à partir d'ici ». | **Créer** |
| `chess.html` | État + loaders + picker + étude + restitution enrichie + bascule + HTML/CSS + seam. | **Modifier** |
| `tests/openings.spec.js` | Adapter 2 tests « catalogue » au nouveau flux (catalogue → Étude). | **Modifier** |
| `docs/OUVERTURES.md` | Doc de maintenance mise à jour. | **Modifier** |

---

## Task 1 : Validateur de données + schéma `lessons.json`

**Files:**
- Create: `tools/validate-lessons.js`
- Create: `lessons.json` (graine : 1 mainline + 1 piège, contenu complet en Task 8)
- Test: `tests/lessons-data.spec.js`

- [ ] **Step 1 : Écrire le validateur (CommonJS, testable + CLI)**

Create `tools/validate-lessons.js` :

```js
// Valide lessons.json : lignes légales (chess.js) + conformité de schéma.
// Usage CLI : node tools/validate-lessons.js
const { Chess } = require('chess.js');

const SIDES = ['w', 'b'];
const CATS = ['mainline', 'trap'];

// uci "e2e4"/"e7e8q" -> {from,to,promotion?}
function uciToMove(u) {
  return { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined };
}

// Renvoie un tableau d'erreurs (vide = OK).
function validateLessons(lessons) {
  const errors = [];
  if (!Array.isArray(lessons)) return ['lessons.json doit être un tableau'];
  const ids = new Set();
  lessons.forEach((l, i) => {
    const tag = `leçon[${i}] (${l && l.id ? l.id : '??'})`;
    if (!l || typeof l !== 'object') { errors.push(`${tag} : pas un objet`); return; }
    for (const f of ['id', 'name', 'category', 'side', 'uci', 'comments', 'summary']) {
      if (l[f] == null) errors.push(`${tag} : champ obligatoire manquant « ${f} »`);
    }
    if (l.id != null) {
      if (ids.has(l.id)) errors.push(`${tag} : id en double`);
      ids.add(l.id);
    }
    if (l.category != null && !CATS.includes(l.category)) errors.push(`${tag} : category invalide`);
    if (l.side != null && !SIDES.includes(l.side)) errors.push(`${tag} : side invalide`);
    if (Array.isArray(l.uci) && Array.isArray(l.comments) && l.uci.length !== l.comments.length)
      errors.push(`${tag} : comments.length (${l.comments.length}) != uci.length (${l.uci.length})`);
    if (l.category === 'trap') {
      if (typeof l.trapPly !== 'number' || l.trapPly < 0 || (Array.isArray(l.uci) && l.trapPly >= l.uci.length))
        errors.push(`${tag} : trapPly invalide pour un piège`);
    }
    if (Array.isArray(l.uci)) {
      const c = new Chess();
      l.uci.forEach((u, k) => {
        try {
          const mv = c.move(uciToMove(u));
          if (!mv) errors.push(`${tag} : coup illégal à l'index ${k} (${u})`);
        } catch (e) {
          errors.push(`${tag} : coup illégal à l'index ${k} (${u})`);
        }
      });
    }
  });
  return errors;
}

module.exports = { validateLessons };

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const file = path.join(__dirname, '..', 'lessons.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const errs = validateLessons(data);
  if (errs.length) { console.error(`✗ ${errs.length} erreur(s) :\n` + errs.join('\n')); process.exit(1); }
  console.log(`✓ lessons.json valide : ${data.length} leçon(s).`);
}
```

- [ ] **Step 2 : Créer la graine `lessons.json`**

Create `lessons.json` (contenu complet ajouté en Task 8 ; graine valide ici) :

```json
[
  {
    "id": "italian-giuoco-piano",
    "name": "Partie italienne (Giuoco Piano)",
    "category": "mainline",
    "eco": "C50",
    "side": "w",
    "uci": ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "c2c3", "g8f6", "d2d3", "d7d6"],
    "comments": [
      "Occupe le centre et libère le fou f1 et la dame.",
      "Réponse symétrique classique.",
      "Développe le cavalier et attaque e5.",
      "Défend e5 et développe une pièce.",
      "Le fou vise la case sensible f7.",
      "Le fou noir vise f2, miroir du plan blanc.",
      "Prépare d4 en soutenant le centre.",
      "Développe et contre-attaque e4.",
      "Soutient e4 et ouvre le fou c1 ; jeu posé.",
      "Position solide : les deux camps ont fini le petit centre."
    ],
    "summary": "L'une des plus vieilles ouvertures : développement rapide, pression sur f7, plan de poussée d4."
  },
  {
    "id": "legal-mate",
    "name": "Mat de Légal",
    "category": "trap",
    "eco": "C41",
    "side": "w",
    "trapPly": 8,
    "uci": ["e2e4", "e7e5", "g1f3", "d7d6", "f1c4", "c8g4", "b1c3", "g7g6", "f3e5", "g4d1", "c4f7", "e8e7", "c3d5"],
    "comments": [
      "Ouvre le centre.",
      "Défense Philidor.",
      "Attaque e5.",
      "Défend e5 mais enferme le fou f8.",
      "Le fou sort et vise f7.",
      "Clouage apparent du cavalier f3 sur la dame.",
      "Développe ; le piège se met en place.",
      "Noir affaiblit son roque.",
      "⚠ Le piège : le cavalier prend en e5 et « abandonne » la dame !",
      "Noir prend la dame… erreur fatale.",
      "Échec : le fou prend f7.",
      "Le roi est forcé de sortir.",
      "Et le cavalier en d5 délivre le mat : sacrifice de dame réussi."
    ],
    "summary": "Sacrifice de dame célèbre : si Noir prend en d1 après Cxe5, Blanc mate par Fxf7+ et Cd5#.",
    "refutation": "Si Noir ne prend pas la dame (…dxe5 au lieu de …Fxd1), Blanc a juste sacrifié sa dame : il faut donc que l'adversaire « morde » au piège."
  }
]
```

- [ ] **Step 3 : Écrire le test de données (échoue d'abord)**

Create `tests/lessons-data.spec.js` :

```js
const { test, expect } = require('@playwright/test');
const { validateLessons } = require('../tools/validate-lessons.js');
const lessons = require('../lessons.json');

test('lessons.json respecte le schéma et ne contient que des coups légaux', () => {
  const errors = validateLessons(lessons);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('validateLessons détecte un coup illégal', () => {
  const bad = [{ id: 'x', name: 'X', category: 'mainline', side: 'w', uci: ['e2e5'], comments: [''], summary: 's' }];
  expect(validateLessons(bad).length).toBeGreaterThan(0);
});

test('validateLessons détecte un désalignement commentaires/coups', () => {
  const bad = [{ id: 'x', name: 'X', category: 'mainline', side: 'w', uci: ['e2e4', 'e7e5'], comments: ['un seul'], summary: 's' }];
  expect(validateLessons(bad).some(e => /comments/.test(e))).toBe(true);
});
```

- [ ] **Step 4 : Lancer les tests**

Run: `npx playwright test tests/lessons-data.spec.js`
Expected: PASS (3 tests). Si échec « coup illégal », corriger la graine.

- [ ] **Step 5 : Vérifier la CLI**

Run: `node tools/validate-lessons.js`
Expected: `✓ lessons.json valide : 2 leçon(s).`

- [ ] **Step 6 : Commit**

```bash
git add tools/validate-lessons.js lessons.json tests/lessons-data.spec.js
git commit -m "feat(lessons): schéma + validateur de données curées (chess.js)"
```

---

## Task 2 : Chargement des leçons (`loadLessons`, `featuredLessons`, `searchLessons`)

**Files:**
- Modify: `chess.html` (état + fonctions, près de `loadOpenings`/`searchOpenings`, ~lignes 1374-1517 et seam ~1697)
- Test: `tests/recall.spec.js` (créé ici, complété plus tard)

- [ ] **Step 1 : Écrire le test (échoue d'abord)**

Create `tests/recall.spec.js` :

```js
const { test, expect } = require('@playwright/test');

test('loadLessons charge la bibliothèque curée et expose 2 catégories', async ({ page }) => {
  await page.goto('/chess.html');
  const data = await page.evaluate(async () => await window.__trainTest.loadLessons());
  expect(Array.isArray(data)).toBe(true);
  expect(data.length).toBeGreaterThan(1);
  const cats = await page.evaluate(() => window.__trainTest.featuredLessons().map(g => g.category));
  expect(cats).toContain('mainline');
  expect(cats).toContain('trap');
});

test('searchLessons filtre par nom', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate(async () => await window.__trainTest.loadLessons());
  const hit = await page.evaluate(() => window.__trainTest.searchLessons('légal').length);
  expect(hit).toBeGreaterThan(0);
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run: `npx playwright test tests/recall.spec.js`
Expected: FAIL (`window.__trainTest.loadLessons is not a function`).

- [ ] **Step 3 : Ajouter l'état**

In `chess.html`, après la ligne `let openingsData=null;    // cache du catalogue chargé` (~1376), ajouter :

```js
let lessonsData=null;     // cache lessons.json (bibliothèque curée)
let study=null;           // {lesson, ply} curseur de la phase Étude
let phase='recall';       // 'study' | 'recall' (au sein du mode train)
```

- [ ] **Step 4 : Ajouter les loaders**

In `chess.html`, juste après la fonction `searchOpenings` (~ligne 1517), ajouter :

```js
async function loadLessons(){
  if(lessonsData) return lessonsData;
  const res=await fetch('lessons.json');
  if(!res.ok) throw new Error('HTTP '+res.status);
  lessonsData=await res.json();
  return lessonsData;
}
function featuredLessons(){
  return lessonsData ? lessonsData.slice() : [];
}
function searchLessons(query){
  if(!lessonsData||!query) return [];
  const q=query.toLowerCase();
  return lessonsData.filter(l=>l.name.toLowerCase().includes(q));
}
// Convertit une entrée du catalogue ECO en leçon (sans commentaires).
function openingToLesson(o, side){
  return { id:'cat:'+o.eco+':'+o.name, name:o.name, eco:o.eco||'', category:'mainline',
           side, uci:o.uci.slice(), comments:o.uci.map(()=> ''), summary:'', trapPly:null };
}
```

- [ ] **Step 5 : Étendre le seam de test**

In `chess.html`, remplacer la ligne du seam (~1697) :

```js
window.__trainTest={ getMode:()=>mode, getDrill:()=>drill, loadOpenings, featuredOpenings, searchOpenings, startDrill, uciOf, buildOpeningPrompt };
```

par (on n'expose ici que ce qui existe à ce stade ; le seam sera étendu aux Tasks 5 et 7) :

```js
window.__trainTest={ getMode:()=>mode, getPhase:()=>phase, getDrill:()=>drill, getStudy:()=>study,
  loadOpenings, featuredOpenings, searchOpenings, loadLessons, featuredLessons, searchLessons,
  openingToLesson, startDrill, uciOf, buildOpeningPrompt };
```

> `getStudy` renvoie la variable `study` (déjà déclarée à `null` au Step 3), donc sûre. On n'ajoute `startStudy`/`studyStep`/`playFromHere` au seam que lorsqu'ils existeront (Tasks 5 et 7), pour éviter une `ReferenceError` à la création de l'objet.

- [ ] **Step 6 : Lancer les tests**

Run: `npx playwright test tests/recall.spec.js`
Expected: PASS (les 2 tests de chargement).

- [ ] **Step 7 : Commit**

```bash
git add chess.html tests/recall.spec.js
git commit -m "feat(lessons): chargement/recherche de la bibliothèque curée + adapter catalogue"
```

---

## Task 3 : Enrichir la restitution — commentaires + compteur d'essais

**Files:**
- Modify: `chess.html` (`startDrill` ~1580, `drillTryMove` ~1614, état `drill`)

- [ ] **Step 1 : Écrire le test (échoue d'abord)**

Append to `tests/recall.spec.js` :

```js
const LESSON = { id:'t-leg', name:'Test Légal', category:'trap', eco:'C41', side:'w', trapPly:2,
  uci:['e2e4','e7e5','g1f3'], comments:['idée 1','idée 2','idée 3'], summary:'s' };

async function dragPiece(page, fromIndex, toIndex){
  const f=await page.locator(`.square[data-i="${fromIndex}"]`).boundingBox();
  const t=await page.locator(`.square[data-i="${toIndex}"]`).boundingBox();
  await page.mouse.move(f.x+f.width/2,f.y+f.height/2);
  await page.mouse.down();
  await page.mouse.move(t.x+t.width/2,t.y+t.height/2,{steps:6});
  await page.mouse.up();
}

test('un coup faux incrémente le compteur d\'essais', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startDrill(l,'w'), LESSON);
  await dragPiece(page, 48, 40); // a2-a3 (FAUX)
  await page.waitForTimeout(150);
  expect(await page.evaluate(()=>window.__trainTest.getDrill().wrongTries)).toBe(1);
  expect(await page.evaluate(()=>window.__trainTest.getDrill().plyIndex)).toBe(0);
});

module.exports = { LESSON, dragPiece };
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run: `npx playwright test tests/recall.spec.js -g "compteur"`
Expected: FAIL (`wrongTries` est `undefined`).

- [ ] **Step 3 : Ajouter `wrongTries` à l'init du drill**

In `chess.html`, dans `startDrill`, remplacer :

```js
  drill={opening, side, line:opening.uci.slice(), plyIndex:0, hintLevel:0};
```

par :

```js
  drill={opening, side, line:opening.uci.slice(), plyIndex:0, hintLevel:0, wrongTries:0};
```

- [ ] **Step 4 : Compter les essais ratés dans `drillTryMove`**

In `chess.html`, dans `drillTryMove`, remplacer le bloc du coup faux :

```js
  if(uciOf(m)!==expected){
    drill.hintLevel=0;
    selected=null; render();
    drillFeedback('✗ Ce n\'est pas le coup de la ligne. Réessayez.','bad');
    return true; // consommé : on ne laisse pas le handler re-render
  }
```

par :

```js
  if(uciOf(m)!==expected){
    drill.wrongTries=(drill.wrongTries||0)+1;
    selected=null; render();
    if(drill.wrongTries>=3){
      drillFeedback('✗ Toujours pas — voici un indice.','bad');
      drillHint();
    } else {
      drillFeedback('✗ Ce n\'est pas le coup de la ligne. Réessayez.','bad');
    }
    return true; // consommé : on ne laisse pas le handler re-render
  }
```

In `chess.html`, dans `drillTryMove`, sur le coup juste, remplacer :

```js
  state=applyMove(state,m,true);
  drill.plyIndex++; drill.hintLevel=0;
```

par :

```js
  state=applyMove(state,m,true);
  drill.plyIndex++; drill.hintLevel=0; drill.wrongTries=0;
```

- [ ] **Step 5 : Lancer les tests**

Run: `npx playwright test tests/recall.spec.js`
Expected: PASS (chargement + compteur).

- [ ] **Step 6 : Commit**

```bash
git add chess.html tests/recall.spec.js
git commit -m "feat(recall): compteur d'essais ratés + indice auto après 3 échecs"
```

---

## Task 4 : Indices progressifs à 4 niveaux

**Files:**
- Modify: `chess.html` (`drillHint` ~1669, HTML `#drillFeedback`/zone indice)
- Test: `tests/recall.spec.js`

- [ ] **Step 1 : Écrire le test (échoue d'abord)**

Append to `tests/recall.spec.js` :

```js
test('indices progressifs : mot -> pièce -> case -> coup joué', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startDrill(l,'w'), LESSON);
  // Niveau 1 : idée en mots
  await page.locator('#drillHintBtn').click();
  await expect(page.locator('#drillHintText')).toContainText('idée 1');
  expect(await page.evaluate(()=>window.__trainTest.getDrill().hintLevel)).toBe(1);
  // Niveau 2 : surligne la pièce (e2 = index 52)
  await page.locator('#drillHintBtn').click();
  await expect(page.locator('.square[data-i="52"]')).toHaveClass(/hint-from/);
  // Niveau 3 : surligne la case d'arrivée (e4 = index 36)
  await page.locator('#drillHintBtn').click();
  await expect(page.locator('.square[data-i="36"]')).toHaveClass(/hint-to/);
  // Niveau 4 : joue le coup -> plyIndex avance (e4 puis réponse e5)
  await page.locator('#drillHintBtn').click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(()=>window.__trainTest.getDrill().plyIndex)).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run: `npx playwright test tests/recall.spec.js -g "progressifs"`
Expected: FAIL (`#drillHintText` introuvable).

- [ ] **Step 3 : Ajouter la zone de texte d'indice dans le HTML**

In `chess.html`, dans `#drillPanel`, après la ligne `<div id="drillFeedback" class="drill-feedback"></div>` (~602), ajouter :

```html
                <div id="drillHintText" class="drill-hinttext"></div>
```

- [ ] **Step 4 : CSS de la zone d'indice**

In `chess.html`, après la règle `.drill-feedback.bad{color:#b3402e}` (~501), ajouter :

```css
.drill-hinttext{font-size:13px;color:var(--accent);min-height:1.2em;font-style:italic}
```

- [ ] **Step 5 : Réécrire `drillHint` en 4 niveaux**

In `chess.html`, remplacer toute la fonction `drillHint` :

```js
function drillHint(){
  if(!drill||drill.plyIndex>=drill.line.length) return;
  const uci=drill.line[drill.plyIndex];
  const from=sqIndex(uci.slice(0,2)), to=sqIndex(uci.slice(2,4));
  drill.hintLevel=Math.min(4,(drill.hintLevel||0)+1);
  document.querySelectorAll('.square').forEach(s=>s.classList.remove('hint-from','hint-to'));
  const hintTextEl=document.getElementById('drillHintText');
  // Niveau 1 : idée en mots (commentaire du coup, sinon message générique).
  if(drill.hintLevel>=1){
    const idea=(drill.opening.comments&&drill.opening.comments[drill.plyIndex])||'Cherchez le meilleur développement.';
    hintTextEl.textContent='💡 '+idea;
  }
  // Niveau 2 : surligne la pièce.
  if(drill.hintLevel>=2){ const fromEl=document.querySelector(`.square[data-i="${from}"]`); if(fromEl)fromEl.classList.add('hint-from'); }
  // Niveau 3 : surligne la case d'arrivée.
  if(drill.hintLevel>=3){ const toEl=document.querySelector(`.square[data-i="${to}"]`); if(toEl)toEl.classList.add('hint-to'); }
  // Niveau 4 : joue le coup à la place du stagiaire.
  if(drill.hintLevel>=4){
    const m=legalCache.find(x=>uciOf(x)===uci)||legalMoves(state).find(x=>uciOf(x)===uci);
    if(m){
      state=applyMove(state,m,true);
      drill.plyIndex++; drill.hintLevel=0; drill.wrongTries=0;
      selected=null; render(); renderDrillPanel();
      hintTextEl.textContent='';
      if(drill.plyIndex>=drill.line.length){ drillComplete(); return; }
      drillFeedback('Coup joué pour vous. À vous ensuite.','');
      setTimeout(()=>drillPlayOpponent(),250);
    }
  }
}
```

- [ ] **Step 6 : Réinitialiser le texte d'indice au changement de coup**

In `chess.html`, dans `drillTryMove`, sur le coup juste, après `drill.plyIndex++; drill.hintLevel=0; drill.wrongTries=0;` ajouter :

```js
    document.getElementById('drillHintText').textContent='';
```

In `chess.html`, dans `startDrill`, après `renderDrillPanel();` (~1597), ajouter :

```js
  document.getElementById('drillHintText').textContent='';
```

- [ ] **Step 7 : Lancer les tests**

Run: `npx playwright test tests/recall.spec.js`
Expected: PASS. Puis vérifier la non-régression de l'indice existant :
Run: `npx playwright test tests/openings.spec.js -g "Indice"`
Expected: PASS (le niveau 1 ne surligne plus la pièce ; ce test attend `hint-from`). **Si ce test échoue**, le mettre à jour : cliquer deux fois sur `#drillHintBtn` avant d'attendre `hint-from` (niveau 2). Appliquer ce changement dans `tests/openings.spec.js` test « Indice surligne la pièce à jouer » :

```js
  await page.locator('#drillHintBtn').click(); // niveau 1 (mots)
  await page.locator('#drillHintBtn').click(); // niveau 2 (pièce)
  await expect(page.locator('.square[data-i="52"]')).toHaveClass(/hint-from/);
```

- [ ] **Step 8 : Commit**

```bash
git add chess.html tests/recall.spec.js tests/openings.spec.js
git commit -m "feat(recall): indices progressifs à 4 niveaux (mot/pièce/case/coup)"
```

---

## Task 5 : Phase Étude (défilement commenté + encart piège)

**Files:**
- Modify: `chess.html` (HTML `#trainPane` ~593, CSS, nouvelles fonctions étude, câblage ~2557)
- Test: `tests/study.spec.js`

- [ ] **Step 1 : Écrire le test (échoue d'abord)**

Create `tests/study.spec.js` :

```js
const { test, expect } = require('@playwright/test');

const LESSON = { id:'t-leg', name:'Test Légal', category:'trap', eco:'C41', side:'w', trapPly:2,
  uci:['e2e4','e7e5','g1f3'], comments:['Ouvre le centre.','Réponse classique.','⚠ Le piège.'], summary:'résumé' };

test('startStudy ouvre le panneau d\'étude au coup 0', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startStudy(l), LESSON);
  await expect(page.locator('#studyPanel')).toBeVisible();
  await expect(page.locator('#studyName')).toHaveText('Test Légal');
  expect(await page.evaluate(()=>window.__trainTest.getStudy().ply)).toBe(0);
});

test('avancer déplace les pièces et affiche le commentaire', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startStudy(l), LESSON);
  await page.locator('#studyNext').click();
  expect(await page.evaluate(()=>window.__trainTest.getStudy().ply)).toBe(1);
  await expect(page.locator('#studyComment')).toContainText('Ouvre le centre');
  // e2 (52) vide, e4 (36) occupée après 1.e4
  expect(await page.locator('.square[data-i="52"] .piece').count()).toBe(0);
  expect(await page.locator('.square[data-i="36"] .piece').count()).toBe(1);
});

test('l\'encart piège apparaît au trapPly', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startStudy(l), LESSON);
  await page.locator('#studyNext').click(); // ply 1
  await expect(page.locator('#studyTrap')).toBeHidden();
  await page.locator('#studyNext').click(); // ply 2 -> dernier coup = uci[1], pas encore le piège
  await page.locator('#studyNext').click(); // ply 3 -> dernier coup = uci[2] (index 2 = trapPly)
  await expect(page.locator('#studyTrap')).toBeVisible();
  await expect(page.locator('#studyTrap')).toContainText('piège');
});

test('reculer revient en arrière', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startStudy(l), LESSON);
  await page.locator('#studyNext').click();
  await page.locator('#studyNext').click();
  await page.locator('#studyPrev').click();
  expect(await page.evaluate(()=>window.__trainTest.getStudy().ply)).toBe(1);
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run: `npx playwright test tests/study.spec.js`
Expected: FAIL (`startStudy` indéfini / `#studyPanel` absent).

- [ ] **Step 3 : Ajouter le HTML du panneau d'étude**

In `chess.html`, dans `#trainPane`, après la fermeture de `#drillPanel` (`</div>` de la ligne ~611, juste avant `</section>` ~612), insérer :

```html
            <div id="studyPanel" class="study-panel hidden">
                <div class="train-title"><span id="studyName"></span> <span id="studyEco" class="drill-eco"></span></div>
                <div id="studyProgress" class="drill-progress"></div>
                <div id="studyComment" class="study-comment"></div>
                <div id="studyTrap" class="study-trap hidden"></div>
                <div class="study-controls">
                    <button id="studyFirst" class="drill-btn" title="Début">⏮</button>
                    <button id="studyPrev" class="drill-btn" title="Précédent">◀</button>
                    <button id="studyAutoplay" class="drill-btn" title="Lecture auto">▶</button>
                    <button id="studyNext" class="drill-btn" title="Suivant">▶▌</button>
                    <button id="studyLast" class="drill-btn" title="Fin">⏭</button>
                </div>
                <div id="studyMoves" class="study-moves"></div>
                <div class="drill-actions">
                    <button id="studyToRecall" class="drill-btn">🎯 M'exercer</button>
                    <button id="studyToPlay" class="drill-btn">♟ Jouer à partir d'ici</button>
                    <button id="studyChange" class="drill-btn">Changer de leçon</button>
                </div>
            </div>
```

- [ ] **Step 4 : Ajouter le CSS de l'étude**

In `chess.html`, après la règle `.drill-hinttext{...}` (ajoutée en Task 4), ajouter :

```css
.study-comment{font-size:14px;line-height:1.5;min-height:2.6em}
.study-trap{font-size:13px;line-height:1.5;background:rgba(179,64,46,.1);border:1px solid rgba(179,64,46,.5);color:#8a2f20;border-radius:10px;padding:8px 10px}
.study-controls{display:flex;gap:6px}
.study-controls .drill-btn{flex:1;padding:6px 4px;font-size:15px}
.study-moves{display:flex;flex-wrap:wrap;gap:4px;max-height:120px;overflow:auto}
.study-move{font-size:12px;padding:3px 6px;border-radius:6px;border:1px solid rgba(120,107,96,.25);background:#fff;cursor:pointer}
.study-move.current{background:var(--accent);color:#fff;border-color:var(--accent)}
.right-stack.train.study #drillPanel,.right-stack.train.study #openingPicker{display:none}
```

- [ ] **Step 5 : Ajouter les fonctions de la phase Étude**

In `chess.html`, juste avant `window.__trainTest=` (~1697), ajouter :

```js
// === PHASE ÉTUDE =============================================================
function studyApplyTo(ply){
  state=fromFEN(START);
  for(let i=0;i<ply;i++){
    const m=legalMoves(state).find(x=>uciOf(x)===study.lesson.uci[i]);
    if(!m) break;
    state=applyMove(state,m,false);
  }
  if(ply>0){ const u=study.lesson.uci[ply-1]; lastMove={from:sqIndex(u.slice(0,2)),to:sqIndex(u.slice(2,4))}; }
  else lastMove=null;
  selected=null; legalCache=[];
}
function startStudy(lesson){
  studyAutoStop();
  mode='train'; phase='study'; study={lesson, ply:0}; drill=null;
  userColor=lesson.side; botColor=opp(lesson.side); flipped=(userColor===BLACK);
  const rs=document.querySelector('.right-stack');
  rs.classList.add('train','study');
  document.getElementById('modePlay').classList.remove('active');
  document.getElementById('modeTrain').classList.add('active');
  document.getElementById('openingPicker').classList.add('hidden');
  document.getElementById('drillPanel').classList.add('hidden');
  document.getElementById('studyPanel').classList.remove('hidden');
  history=[]; gameOver=false; resigned=false; positionCounts=new Map(); undoStack=[];
  studyApplyTo(0); render(); renderStudyPanel();
}
function studyStep(d){
  if(!study) return;
  const total=study.lesson.uci.length;
  study.ply=Math.max(0,Math.min(total,study.ply+d));
  studyApplyTo(study.ply); render(); renderStudyPanel();
}
function studyJumpTo(ply){
  if(!study) return;
  study.ply=Math.max(0,Math.min(study.lesson.uci.length,ply));
  studyApplyTo(study.ply); render(); renderStudyPanel();
}
let studyTimer=null;
function studyAutoStop(){ if(studyTimer){ clearInterval(studyTimer); studyTimer=null; const b=document.getElementById('studyAutoplay'); if(b)b.textContent='▶'; } }
function studyAutoplay(){
  if(studyTimer){ studyAutoStop(); return; }
  const b=document.getElementById('studyAutoplay'); if(b)b.textContent='⏸';
  studyTimer=setInterval(()=>{
    if(!study||study.ply>=study.lesson.uci.length){ studyAutoStop(); return; }
    studyStep(1);
  },1100);
}
function renderStudyPanel(){
  if(!study) return;
  const L=study.lesson, total=L.uci.length, ply=study.ply;
  document.getElementById('studyName').textContent=L.name;
  document.getElementById('studyEco').textContent=L.eco||'';
  document.getElementById('studyProgress').textContent=`Coup ${ply} / ${total}`;
  const comment = ply>0 ? (L.comments[ply-1]||'') : (L.summary||'Cliquez sur ▶▌ pour dérouler la leçon.');
  document.getElementById('studyComment').textContent=comment;
  const trapEl=document.getElementById('studyTrap');
  if(L.category==='trap' && ply>0 && (ply-1)===L.trapPly){
    trapEl.textContent='⚠ Piège : '+(L.refutation||L.summary||'');
    trapEl.classList.remove('hidden');
  } else { trapEl.classList.add('hidden'); }
  // liste de coups cliquable (notation française)
  const san=pvToSan(L.uci, fromFEN(START));
  const box=document.getElementById('studyMoves'); box.innerHTML='';
  san.forEach((mv,i)=>{
    const b=document.createElement('button');
    b.className='study-move'+((i+1)===ply?' current':'');
    b.textContent=(i%2===0?(Math.floor(i/2)+1)+'.':'')+mv;
    b.addEventListener('click',()=>studyJumpTo(i+1));
    box.appendChild(b);
  });
}
```

> `pvToSan(uci, state)` renvoie un tableau de coups SAN français (déjà utilisé par `openingMovesPreview`). On l'utilise ici pour la liste cliquable.

Puis étendre le seam : in `chess.html`, dans l'objet `window.__trainTest`, ajouter `startStudy, studyStep` (et `studyJumpTo`) à la liste exposée :

```js
window.__trainTest={ getMode:()=>mode, getPhase:()=>phase, getDrill:()=>drill, getStudy:()=>study,
  loadOpenings, featuredOpenings, searchOpenings, loadLessons, featuredLessons, searchLessons,
  openingToLesson, startDrill, startStudy, studyStep, studyJumpTo, uciOf, buildOpeningPrompt };
```

- [ ] **Step 6 : Câbler les boutons d'étude**

In `chess.html`, dans la section `// === CÂBLAGE MODE / ENTRAÎNEMENT ===` (après la ligne `drillExplainBtn` ~2568), ajouter :

```js
document.getElementById('studyFirst').addEventListener('click',()=>studyJumpTo(0));
document.getElementById('studyPrev').addEventListener('click',()=>studyStep(-1));
document.getElementById('studyNext').addEventListener('click',()=>studyStep(1));
document.getElementById('studyLast').addEventListener('click',()=>{ if(study) studyJumpTo(study.lesson.uci.length); });
document.getElementById('studyAutoplay').addEventListener('click',studyAutoplay);
document.getElementById('studyChange').addEventListener('click',()=>{ studyAutoStop(); showOpeningPicker(); });
document.getElementById('studyToRecall').addEventListener('click',()=>{ if(study){ studyAutoStop(); startDrill(study.lesson, study.lesson.side); } });
document.getElementById('studyToPlay').addEventListener('click',()=>{ studyAutoStop(); playFromHere(); });
```

- [ ] **Step 7 : Masquer la classe `study` quand on quitte l'étude**

In `chess.html`, dans `startDrill`, après `mode='train';` (~1581), ajouter :

```js
  phase='recall'; studyAutoStop();
  document.querySelector('.right-stack').classList.remove('study');
  document.getElementById('studyPanel').classList.add('hidden');
```

In `chess.html`, dans `setMode`, au début (après `mode=next;` ~1520), ajouter :

```js
  studyAutoStop();
  document.querySelector('.right-stack').classList.remove('study');
  document.getElementById('studyPanel').classList.add('hidden');
```

- [ ] **Step 8 : Lancer les tests**

Run: `npx playwright test tests/study.spec.js`
Expected: PASS (4 tests).

- [ ] **Step 9 : Commit**

```bash
git add chess.html tests/study.spec.js
git commit -m "feat(study): phase Étude (défilement commenté, encart piège, liste cliquable)"
```

---

## Task 6 : Picker enrichi (groupes de leçons curées + catalogue)

**Files:**
- Modify: `chess.html` (HTML `#openingPicker` ~594, `showOpeningPicker` ~1562, `askSideThenStart` ~1550, nouvelles fonctions de rendu, câblage)
- Test: `tests/study.spec.js`

- [ ] **Step 1 : Écrire le test (échoue d'abord)**

Append to `tests/study.spec.js` :

```js
test('le picker liste les leçons curées (ouvertures + pièges)', async ({ page }) => {
  await page.goto('/chess.html');
  await page.locator('#modeTrain').click();
  await expect(page.locator('#lessonMainlines .opening-row').first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#lessonTraps')).toContainText('Légal', { timeout: 5000 });
});

test('cliquer une leçon curée ouvre directement l\'Étude', async ({ page }) => {
  await page.goto('/chess.html');
  await page.locator('#modeTrain').click();
  await page.locator('#lessonTraps .opening-row', { hasText: 'Légal' }).first().click();
  await expect(page.locator('#studyPanel')).toBeVisible();
  await expect(page.locator('#studyName')).toContainText('Légal');
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run: `npx playwright test tests/study.spec.js -g "picker|curée"`
Expected: FAIL (`#lessonMainlines` absent).

- [ ] **Step 3 : Ajouter le HTML des groupes de leçons**

In `chess.html`, dans `#openingPicker`, remplacer son contenu actuel :

```html
            <div id="openingPicker" class="opening-picker">
                <div class="train-title">Choisir une ouverture</div>
                <input id="openingSearch" type="search" placeholder="Rechercher une ouverture…">
                <div id="openingResults" class="opening-results"></div>
            </div>
```

par :

```html
            <div id="openingPicker" class="opening-picker">
                <div class="train-title">Leçons — ouvertures essentielles</div>
                <div id="lessonMainlines" class="opening-results"></div>
                <div class="train-title">Leçons — pièges classiques</div>
                <div id="lessonTraps" class="opening-results"></div>
                <div class="train-title">Catalogue complet</div>
                <input id="openingSearch" type="search" placeholder="Rechercher une ouverture…">
                <div id="openingResults" class="opening-results"></div>
            </div>
```

- [ ] **Step 4 : Rendre les groupes de leçons**

In `chess.html`, après la fonction `renderOpeningRows` (~1548), ajouter :

```js
function renderLessonRows(list, boxId){
  const box=document.getElementById(boxId);
  box.innerHTML='';
  for(const l of list){
    const row=document.createElement('div');
    row.className='opening-row';
    const side=l.side===WHITE?'Blancs':'Noirs';
    row.innerHTML=`<span class="eco">${l.eco||''}</span>${l.name}<div class="moves">${side} — ${l.uci.length} demi-coups</div>`;
    row.addEventListener('click',()=>startStudy(l));
    box.appendChild(row);
  }
}
function renderLessonGroups(){
  const all=featuredLessons();
  renderLessonRows(all.filter(l=>l.category==='mainline'),'lessonMainlines');
  renderLessonRows(all.filter(l=>l.category==='trap'),'lessonTraps');
}
```

- [ ] **Step 5 : Charger les leçons dans `showOpeningPicker`**

In `chess.html`, remplacer la fonction `showOpeningPicker` :

```js
async function showOpeningPicker(){
  studyAutoStop();
  const rs=document.querySelector('.right-stack');
  rs.classList.add('train'); rs.classList.remove('study');
  mode='train';
  document.getElementById('modePlay').classList.remove('active');
  document.getElementById('modeTrain').classList.add('active');
  document.getElementById('openingPicker').classList.remove('hidden');
  document.getElementById('drillPanel').classList.add('hidden');
  document.getElementById('studyPanel').classList.add('hidden');
  const box=document.getElementById('openingResults');
  try{
    await Promise.all([loadOpenings(), loadLessons()]);
  }catch(e){
    box.innerHTML='<div class="drill-feedback bad">Données indisponibles ('+e.message+').</div>';
    return;
  }
  renderLessonGroups();
  renderOpeningRows(featuredOpenings());
}
```

- [ ] **Step 6 : Catalogue → Étude (via choix du camp)**

In `chess.html`, remplacer dans `askSideThenStart` les deux lignes des handlers :

```js
  wb.addEventListener('click',e=>{e.stopPropagation();startDrill(o,WHITE);});
  bb.addEventListener('click',e=>{e.stopPropagation();startDrill(o,BLACK);});
```

par :

```js
  wb.addEventListener('click',e=>{e.stopPropagation();startStudy(openingToLesson(o,WHITE));});
  bb.addEventListener('click',e=>{e.stopPropagation();startStudy(openingToLesson(o,BLACK));});
```

- [ ] **Step 7 : Lancer les tests + adapter le parcours catalogue**

Run: `npx playwright test tests/study.spec.js`
Expected: PASS.

Run: `npx playwright test tests/openings.spec.js -g "parcours réel"`
Expected: FAIL (le clic catalogue ouvre désormais l'Étude, pas le drill). Mettre à jour ce test dans `tests/openings.spec.js` :

```js
test('parcours réel : choisir Ruy Lopez via l\'UI ouvre l\'Étude puis l\'exercice', async ({ page }) => {
  await page.goto('/chess.html');
  await page.locator('#modeTrain').click();
  const row = page.locator('#openingResults .opening-row', { hasText: 'Ruy Lopez' }).first();
  await expect(row).toBeVisible({ timeout: 5000 });
  await row.click();
  await page.locator('.opening-sidechoice button', { hasText: 'Blancs' }).click();
  await expect(page.locator('#studyName')).toHaveText('Ruy Lopez');
  await page.locator('#studyToRecall').click();
  await expect(page.locator('#drillName')).toHaveText('Ruy Lopez');
});
```

- [ ] **Step 8 : Lancer toute la suite ouvertures/étude/recall**

Run: `npx playwright test tests/openings.spec.js tests/study.spec.js tests/recall.spec.js`
Expected: PASS.

- [ ] **Step 9 : Commit**

```bash
git add chess.html tests/study.spec.js tests/openings.spec.js
git commit -m "feat(picker): groupes de leçons curées + catalogue, catalogue->Étude"
```

---

## Task 7 : Bascule « Jouer à partir d'ici » (`playFromHere`)

**Files:**
- Modify: `chess.html` (nouvelle fonction `playFromHere`, boutons recall, `continueInFreePlay` ~1685, câblage)
- Test: `tests/handoff.spec.js`

- [ ] **Step 1 : Écrire le test (échoue d'abord)**

Create `tests/handoff.spec.js` :

```js
const { test, expect } = require('@playwright/test');

const LESSON = { id:'t-it', name:'Test Italienne', category:'mainline', eco:'C50', side:'w',
  uci:['e2e4','e7e5','g1f3','b8c6','f1c4'], comments:['','','','',''], summary:'s' };

test('depuis l\'Étude, « Jouer à partir d\'ici » passe en partie libre à la position courante', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startStudy(l), LESSON);
  await page.evaluate(()=>{ window.__trainTest.studyStep(1); window.__trainTest.studyStep(1); }); // 1.e4 e5
  await page.evaluate(()=>window.__trainTest.playFromHere());
  expect(await page.evaluate(()=>window.__trainTest.getMode())).toBe('play');
  await expect(page.locator('#trainPane')).toBeHidden();
  // e4 (36) toujours occupé, e2 (52) vide -> on a bien repris la position
  expect(await page.locator('.square[data-i="36"] .piece').count()).toBe(1);
  expect(await page.locator('.square[data-i="52"] .piece').count()).toBe(0);
});

test('depuis la Restitution, « Jouer à partir d\'ici » bascule en partie', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startDrill(l,'w'), LESSON);
  await page.locator('#drillToPlay').click();
  expect(await page.evaluate(()=>window.__trainTest.getMode())).toBe('play');
  await expect(page.locator('.score-pane')).toBeVisible();
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run: `npx playwright test tests/handoff.spec.js`
Expected: FAIL (`playFromHere` indéfini / `#drillToPlay` absent).

- [ ] **Step 3 : Ajouter `playFromHere` et généraliser `continueInFreePlay`**

In `chess.html`, remplacer la fonction `continueInFreePlay` :

```js
function playFromHere(){
  studyAutoStop();
  mode='play'; phase='recall';
  drill=null; study=null;
  const rs=document.querySelector('.right-stack');
  rs.classList.remove('train','study');
  document.getElementById('modePlay').classList.add('active');
  document.getElementById('modeTrain').classList.remove('active');
  document.getElementById('studyPanel').classList.add('hidden');
  // La position courante (state) devient le point de départ d'une partie libre.
  gameOver=false; resigned=false; botBusy=false; selected=null;
  history=[]; undoStack=[]; bilanShown=false; bilanPending=false;
  positionCounts=new Map(); positionCounts.set(positionKey(state),1);
  render();
  if(state.turn===botColor) setTimeout(()=>triggerBot(),200);
}
// Conservé pour compat : le bouton de fin de drill réutilise la bascule.
function continueInFreePlay(){ playFromHere(); }
```

Puis étendre le seam : in `chess.html`, ajouter `playFromHere` à la liste exposée par `window.__trainTest` :

```js
window.__trainTest={ getMode:()=>mode, getPhase:()=>phase, getDrill:()=>drill, getStudy:()=>study,
  loadOpenings, featuredOpenings, searchOpenings, loadLessons, featuredLessons, searchLessons,
  openingToLesson, startDrill, startStudy, studyStep, studyJumpTo, playFromHere, uciOf, buildOpeningPrompt };
```

> Vérifier le nom exact de la fonction de clé de position utilisée par la triple répétition (`positionCounts`). Repère : `grep -n "positionCounts.set\|function positionKey\|function posKey" chess.html`. Si la fonction s'appelle `posKey`, remplacer `positionKey(state)` par `posKey(state)` ci-dessus.

- [ ] **Step 4 : Ajouter le bouton « Jouer à partir d'ici » au panneau de restitution**

In `chess.html`, dans `#drillPanel`, dans le bloc `.drill-actions`, après la ligne `#drillToFree` (~609), ajouter :

```html
                    <button id="drillToPlay" class="drill-btn">♟ Jouer à partir d'ici</button>
```

- [ ] **Step 5 : Câbler le bouton**

In `chess.html`, dans la section câblage, après `drillToFree` (~2567), ajouter :

```js
document.getElementById('drillToPlay').addEventListener('click',playFromHere);
```

- [ ] **Step 6 : Lancer les tests**

Run: `npx playwright test tests/handoff.spec.js`
Expected: PASS (2 tests).

- [ ] **Step 7 : Non-régression complète**

Run: `npx playwright test`
Expected: PASS (toute la suite, baseline incluse).

- [ ] **Step 8 : Commit**

```bash
git add chess.html tests/handoff.spec.js
git commit -m "feat(handoff): « Jouer à partir d'ici » depuis l'Étude et la Restitution"
```

---

## Task 8 : Rédiger le contenu curé complet (`lessons.json`)

**Files:**
- Modify: `lessons.json`

> Travail de **données** : rédaction à la main, validée automatiquement. Chaque leçon respecte le schéma de la Task 1 ; `comments.length === uci.length` ; coups en UCI ; `trapPly` pour les pièges. Rédiger des commentaires courts (≤ ~90 caractères), concrets, en français.

- [ ] **Step 1 : Rédiger les ~15-20 ouvertures essentielles**

Ajouter à `lessons.json` (`category:"mainline"`), ~8-12 demi-coups chacune, parmi :
Ruy Lopez (Espagnole), Partie italienne, Sicilienne Najdorf, Sicilienne Dragon, Défense française, Caro-Kann, Défense scandinave, Gambit Dame refusé, Gambit Dame accepté, Défense est-indienne, Défense nimzo-indienne, Ouverture anglaise, Système de Londres, Défense Petroff, Partie écossaise, Partie viennoise.

- [ ] **Step 2 : Rédiger les ~30 pièges classiques**

Ajouter à `lessons.json` (`category:"trap"`, `trapPly` défini), parmi :
Mat de Légal, Fried Liver (attaque du cavalier sur f7), Fishing Pole, Blackburne-Shilling, Gambit Englund (piège …Db4+/Cd6#), Piège de Lasker, Noah's Ark, Elephant Trap (Cambridge Springs), Halloween Gambit, Stafford Gambit (pièges courants), Mat du berger et sa parade, Mat de l'imbécile, Piège Mortimer, Würzburger Trap, Magnus Smith Trap, Tarrasch Trap (Espagnole ouverte), Piège Lolli (mat du berger renforcé), Piège de Kieninger, Mat de Boden (motif), Mat de l'épaulette (motif), etc. (≥ 25 livrées).

- [ ] **Step 3 : Valider après chaque ajout**

Run: `node tools/validate-lessons.js`
Expected: `✓ lessons.json valide : N leçon(s).` — corriger toute erreur (coup illégal, désalignement, trapPly hors borne) avant de continuer.

- [ ] **Step 4 : Lancer le test de données**

Run: `npx playwright test tests/lessons-data.spec.js`
Expected: PASS.

- [ ] **Step 5 : Vérification visuelle rapide (manuelle)**

Lancer l'app, mode Entraînement, ouvrir 2-3 leçons en Étude, dérouler, vérifier que les commentaires s'affichent et que l'encart piège apparaît au bon coup. (Captures via le script de screenshot du dépôt si besoin.)

- [ ] **Step 6 : Commit**

```bash
git add lessons.json
git commit -m "content(lessons): bibliothèque curée (ouvertures essentielles + pièges)"
```

---

## Task 9 : Documentation de maintenance

**Files:**
- Modify: `docs/OUVERTURES.md`

- [ ] **Step 1 : Mettre à jour `docs/OUVERTURES.md`**

Réécrire la doc pour refléter le tuteur 3 phases. Sections à couvrir (contenu réel, pas de placeholder) :

- **Vue d'ensemble** : 3 phases (Étude / Restitution / Partie) + bibliothèque curée `lessons.json` + catalogue ECO `openings.json` conservé.
- **Données** : schéma `lessons.json` (tableau exact de la Task 1), validateur `tools/validate-lessons.js` (CLI `node tools/validate-lessons.js` + export `validateLessons` rejoué par `tests/lessons-data.spec.js`). `openings.json`/`build-openings.mjs` inchangés.
- **Carte du code** (`chess.html`) :
  - État : `mode`('play'|'train'), `phase`('study'|'recall'), `lesson`/`study`, `drill` (moteur de restitution), `lessonsData`/`openingsData`.
  - Données : `loadLessons`, `featuredLessons`, `searchLessons`, `openingToLesson` ; `loadOpenings`, `featuredOpenings`, `searchOpenings`.
  - Picker : `showOpeningPicker`, `renderLessonGroups`, `renderLessonRows`, `renderOpeningRows`, `askSideThenStart`.
  - Étude : `startStudy`, `studyStep`, `studyJumpTo`, `studyAutoplay`/`studyAutoStop`, `studyApplyTo`, `renderStudyPanel`.
  - Restitution : `startDrill`, `drillTryMove`, `drillPlayOpponent`, `drillHint` (4 niveaux), `drillComplete`, `renderDrillPanel`, `drillFeedback`.
  - Bascule : `playFromHere` (+ alias `continueInFreePlay`).
- **HTML/CSS** : `#openingPicker` (groupes `#lessonMainlines`/`#lessonTraps` + catalogue), `#studyPanel`, `#drillPanel` ; classe `.right-stack.train.study` masquant picker/drill.
- **Seam de test** : `window.__trainTest` (liste à jour des fonctions exposées).
- **Tests** : `tests/lessons-data.spec.js`, `tests/study.spec.js`, `tests/recall.spec.js`, `tests/handoff.spec.js`, `tests/openings.spec.js`.
- **Backlog** : suivi de progression (statut par leçon, révision espacée Anki), transpositions, explication Claude rebranchée sur les leçons curées, regroupement par famille ECO, révision aléatoire.

- [ ] **Step 2 : Commit**

```bash
git add docs/OUVERTURES.md
git commit -m "docs(ouvertures): maintenance du tuteur 3 phases"
```

---

## Task 10 : Vérification finale & mémoire

**Files:** (aucune modif code ; vérif + mémoire)

- [ ] **Step 1 : Suite complète verte**

Run: `npx playwright test`
Expected: PASS (toutes les suites, baseline incluse).

- [ ] **Step 2 : Validation données**

Run: `node tools/validate-lessons.js`
Expected: `✓ lessons.json valide : N leçon(s).`

- [ ] **Step 3 : Pousser**

```bash
git push origin main
```

- [ ] **Step 4 : Mémoire**

Mettre à jour `/home/wims/.claude/projects/-home-wims/memory/project_chess_tutor.md` : section « Tuteur d'ouvertures 3 phases » (Étude/Restitution/Partie, `lessons.json`, validateur, indices 4 niveaux, `playFromHere`) + mention `docs/OUVERTURES.md` à jour. Mettre à jour la ligne d'index dans `MEMORY.md` si besoin.

---

## Auto-revue (couverture du spec)

- **§3 Données `lessons.json`** → Tasks 1, 8 (schéma, validateur, contenu).
- **§4.1 Sélecteur (groupes + catalogue)** → Task 6.
- **§4.2 Phase Étude (défilement, commentaire, encart piège, liste cliquable, M'exercer, Jouer ici)** → Task 5 (+ boutons câblés Tasks 5/7).
- **§4.3 Phase Restitution (indices 4 niveaux, faux refusé, essais, progression, fin)** → Tasks 3, 4 (progression = `renderDrillPanel` existant ; fin = `drillComplete` existant).
- **§4.4 Bascule « Jouer à partir d'ici »** → Task 7.
- **§5 Architecture/unités/seam** → Tasks 2-7 (réutilise `drill`, ajoute `study`).
- **§6 Tests (validation données, étude, restitution, bascule, catalogue, baseline)** → Tasks 1,4,5,6,7 + non-régression Task 7/10.
- **§7 Doc** → Task 9.
- **§8 Backlog** → consigné en Task 9.

Note d'écart assumé : la phase Restitution est portée par le moteur `drill` existant (renommage évité, DRY) ; les ids HTML restent `#drillPanel`/`#drill*`. La progression et la complétion réutilisent `renderDrillPanel`/`drillComplete` déjà en place. La barre de progression visuelle riche du spec est rendue comme compteur textuel « Coup X / N » (existant) ; une barre graphique reste possible en backlog si souhaité.
