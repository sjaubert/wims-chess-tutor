# Approfondissement Sicilien — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note environnement :** les sous-agents n'ont PAS la permission Bash sur ce serveur. Le
> contrôleur exécute les commandes (`node`, `npx playwright`, `git`). La Tâche 2 nécessite un
> accès réseau (API lichess) au premier lancement ; relancer avec le sandbox réseau autorisé
> si besoin.

**Goal:** Ajouter 4 leçons curées profondes (Najdorf, Dragon, Sveshnikov, Classique, côté Noir, ~16 plis) extraites de l'explorateur lichess *masters*, et grouper le catalogue d'ouvertures par famille.

**Architecture:** Un script Node d'extraction (`build-sicilian-lessons.mjs`) part de la ligne nommée dans `openings.json` et la prolonge en suivant le coup le plus joué (base masters, avec cache disque), produisant un brouillon de lignes. Les commentaires français sont rédigés à la main puis fusionnés dans `lessons.json` (schéma inchangé) et validés par `validate-lessons.js`. Le picker du catalogue (`chess.html` + `index.html`) groupe ses résultats par famille via un helper pur `familyOf`.

**Tech Stack:** Node ESM (`fetch` natif, `node:test`), chess.js (validateur existant), Playwright (tests UI), HTML/JS vanilla.

---

## Référence : schéma `lessons.json`

```
{ id, name, category:'mainline'|'trap', eco, side:'w'|'b', uci:[...], comments:[...], summary }
```
Contrainte dure : `uci.length === comments.length`. Validé par `tools/validate-lessons.js`.

## Référence : ancres vérifiées dans `openings.json`

| id | anchorName (nom lichess exact) | eco | plis ancre |
|----|--------------------------------|-----|-----------|
| `sicilian-najdorf` | `Sicilian Defense: Najdorf Variation` | B90 | 10 |
| `sicilian-dragon` | `Sicilian Defense: Dragon Variation` | B70/B72 | 10-11 |
| `sicilian-classical` | `Sicilian Defense: Classical Variation` | B56/B58 | 10-11 |
| `sicilian-sveshnikov` | `Sicilian Defense: Lasker-Pelikan Variation, Sveshnikov Variation` | B33 | 16 |

---

## Fichiers touchés

- **Créer** `tools/build-sicilian-lessons.mjs` — extraction (helpers purs + `main`).
- **Créer** `tools/build-sicilian-lessons.test.mjs` — tests `node:test` des helpers purs.
- **Créer** `tools/sicilian-src/` (cache disque, généré ; ajouter `.gitkeep`).
- **Générer** `tools/sicilian-draft.json` — brouillon des 4 lignes (commité comme trace).
- **Modifier** `lessons.json` — `sicilian-najdorf` mis à jour sur place + 3 nouvelles entrées.
- **Modifier** `chess.html` et `index.html` (identiques) — `familyOf`, `renderOpeningRows`, CSS `.opening-fam`, ajout de `familyOf` à `window.__trainTest`.
- **Créer** `tests/sicilian.spec.js` — données des 4 leçons + groupement catalogue.
- **Modifier** `docs/OUVERTURES.md` — pipeline d'extraction + 4 leçons.

---

## Task 1: Helpers d'extraction (script + tests node)

**Files:**
- Create: `tools/build-sicilian-lessons.mjs`
- Test: `tools/build-sicilian-lessons.test.mjs`

- [ ] **Step 1: Écrire les tests qui échouent**

`tools/build-sicilian-lessons.test.mjs` :
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickAnchor, extendLine, TARGETS } from './build-sicilian-lessons.mjs';

test('TARGETS couvre les 4 variantes, toutes côté Noir', () => {
  assert.equal(TARGETS.length, 4);
  assert.deepEqual(TARGETS.map(t => t.id).sort(),
    ['sicilian-classical','sicilian-dragon','sicilian-najdorf','sicilian-sveshnikov']);
  assert.ok(TARGETS.every(t => t.side === 'b'));
});

test('pickAnchor prend la séquence la plus longue ≤ maxPlies parmi les homonymes', () => {
  const openings = [
    { name: 'X', eco: 'B1', uci: ['e2e4','c7c5'] },
    { name: 'X', eco: 'B2', uci: ['e2e4','c7c5','g1f3','d7d6'] },
    { name: 'Y', eco: 'C1', uci: ['d2d4'] },
  ];
  const a = pickAnchor(openings, 'X', 16);
  assert.equal(a.uci.length, 4);
  assert.equal(a.eco, 'B2');
});

test('pickAnchor ignore les ancres plus longues que maxPlies', () => {
  const openings = [
    { name: 'X', eco: 'B1', uci: ['e2e4','c7c5'] },
    { name: 'X', eco: 'B2', uci: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4'] },
  ];
  const a = pickAnchor(openings, 'X', 4);
  assert.equal(a.uci.length, 2);
});

test('pickAnchor lève une erreur si le nom est introuvable', () => {
  assert.throws(() => pickAnchor([], 'Absent', 16), /introuvable/);
});

test('extendLine suit moves[0] jusqu’à maxPlies', async () => {
  const fakeFetch = async (uci) => ({ moves: [{ uci: 'm' + uci.length }] });
  const out = await extendLine(['a','b'], 5, fakeFetch);
  assert.deepEqual(out, ['a','b','m2','m3','m4']);
});

test('extendLine s’arrête si plus de coups maîtres', async () => {
  const fakeFetch = async (uci) => (uci.length < 3 ? { moves: [{ uci: 'x' }] } : { moves: [] });
  const out = await extendLine(['a','b'], 16, fakeFetch);
  assert.deepEqual(out, ['a','b','x']);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `node --test tools/build-sicilian-lessons.test.mjs`
Expected: FAIL (`Cannot find module './build-sicilian-lessons.mjs'` ou export manquant).

- [ ] **Step 3: Écrire l'implémentation minimale (helpers purs + squelette main)**

`tools/build-sicilian-lessons.mjs` :
```js
// Extrait les lignes principales siciliennes depuis l'explorateur lichess masters,
// en partant de la ligne nommée dans openings.json. Produit tools/sicilian-draft.json
// (sans commentaires). Usage : node tools/build-sicilian-lessons.mjs
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';

export const TARGETS = [
  { id: 'sicilian-najdorf',    side: 'b', anchorName: 'Sicilian Defense: Najdorf Variation' },
  { id: 'sicilian-dragon',     side: 'b', anchorName: 'Sicilian Defense: Dragon Variation' },
  { id: 'sicilian-classical',  side: 'b', anchorName: 'Sicilian Defense: Classical Variation' },
  { id: 'sicilian-sveshnikov', side: 'b', anchorName: 'Sicilian Defense: Lasker-Pelikan Variation, Sveshnikov Variation' },
];

const MAX_PLIES = 16;
const DELAY_MS = 300;

// Choisit l'entrée homonyme dont la séquence est la plus longue sans dépasser maxPlies.
export function pickAnchor(openings, anchorName, maxPlies) {
  const cands = openings.filter(o => o.name === anchorName);
  if (!cands.length) throw new Error('Ancre introuvable : ' + anchorName);
  const ok = cands.filter(o => o.uci.length <= maxPlies);
  const pool = ok.length ? ok : cands;
  return pool.reduce((a, b) => (b.uci.length > a.uci.length ? b : a));
}

// Prolonge uci en suivant moves[0] fourni par fetchPlay(uciArray) -> { moves:[{uci}] }.
export async function extendLine(uci, maxPlies, fetchPlay) {
  let line = uci.slice();
  while (line.length < maxPlies) {
    const data = await fetchPlay(line);
    if (!data || !Array.isArray(data.moves) || data.moves.length === 0) break;
    line = [...line, data.moves[0].uci];
  }
  return line;
}

// fetchPlay réel : cache disque puis API masters, avec délai de politesse.
function makeRealFetchPlay(cacheDir) {
  return async (uci) => {
    const key = uci.join('_') || 'start';
    const file = new URL(`${key}.json`, cacheDir);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
    const url = `https://explorer.lichess.org/masters?play=${uci.join(',')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
    const data = await res.json();
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(file, JSON.stringify(data));
    await new Promise(r => setTimeout(r, DELAY_MS));
    return data;
  };
}

async function main() {
  const openings = JSON.parse(readFileSync(new URL('../openings.json', import.meta.url), 'utf8'));
  const cacheDir = new URL('./sicilian-src/', import.meta.url);
  const fetchPlay = makeRealFetchPlay(cacheDir);
  const out = [];
  for (const t of TARGETS) {
    const anchor = pickAnchor(openings, t.anchorName, MAX_PLIES);
    const uci = await extendLine(anchor.uci.slice(), MAX_PLIES, fetchPlay);
    out.push({ id: t.id, name: t.anchorName, eco: anchor.eco, side: t.side, uci, depthReached: uci.length });
    console.log(`${t.id} : ${uci.length} plis — ${uci.join(' ')}`);
  }
  writeFileSync(new URL('./sicilian-draft.json', import.meta.url), JSON.stringify(out, null, 1));
  console.log(`sicilian-draft.json écrit : ${out.length} leçons.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `node --test tools/build-sicilian-lessons.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/build-sicilian-lessons.mjs tools/build-sicilian-lessons.test.mjs
git commit -m "feat(tools): script d'extraction des lignes siciliennes (helpers + tests)"
```

---

## Task 2: Extraction des 4 lignes (réseau)

**Files:**
- Create: `tools/sicilian-src/.gitkeep`
- Generate: `tools/sicilian-draft.json`

- [ ] **Step 1: Lancer l'extraction**

Run: `node tools/build-sicilian-lessons.mjs`
Expected (sortie console) : 4 lignes loggées, chacune ~16 plis (≥ 14), p. ex.
`sicilian-najdorf : 16 plis — e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6 ...`
Le fichier `tools/sicilian-draft.json` est créé et `tools/sicilian-src/` se remplit.

> Si le réseau est bloqué (sandbox), relancer la commande avec l'accès réseau autorisé.
> Après un premier passage réussi, le cache `sicilian-src/` rend les relances hors-ligne.

- [ ] **Step 2: Vérifier le brouillon**

Run: `node -e "const d=require('./tools/sicilian-draft.json'); console.log(d.map(x=>x.id+':'+x.uci.length)); if(d.length!==4||d.some(x=>x.uci.length<14))process.exit(1)"`
Expected: affiche 4 ids avec longueurs ≥ 14, code de sortie 0.

- [ ] **Step 3: Commit (brouillon + cache comme trace reproductible)**

```bash
touch tools/sicilian-src/.gitkeep
git add tools/sicilian-draft.json tools/sicilian-src
git commit -m "build(tools): lignes siciliennes extraites (brouillon + cache masters)"
```

---

## Task 3: Rédiger et fusionner les 4 leçons dans `lessons.json`

**Files:**
- Modify: `lessons.json`

> **Tâche de contenu (jugement humain).** Les coups proviennent de `sicilian-draft.json`
> (Tâche 2) ; impossible de figer ici les chaînes exactes des plis profonds avant extraction.
> La règle dure : pour chaque leçon, `comments.length === uci.length`, un commentaire
> français pédagogique par demi-coup. Style attendu = celui de la Najdorf existante (concis,
> explique l'idée du coup). Le validateur (Tâche 4) garantit la conformité.

- [ ] **Step 1: Mettre à jour `sicilian-najdorf` sur place**

Remplacer la valeur `uci` de l'entrée existante `sicilian-najdorf` par la ligne à 16 plis du
brouillon, et **étendre `comments`** d'autant (conserver les 10 commentaires actuels pour les
10 premiers plis, en ajouter pour les plis supplémentaires). Ne PAS créer de nouvelle entrée
(id en double interdit). Exemple des 10 premiers (déjà présents) :
```
uci[0..9]   = e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6
comments[9] = "Coup clé de la Najdorf : prépare ...e5/...b5 et prive le Blanc de b5."
```
Rédiger les commentaires des plis 11→16 d'après les coups extraits (p. ex. 6.Fe3/6.Fg5/6.Fe2
selon la sortie masters).

- [ ] **Step 2: Ajouter les 3 nouvelles entrées**

Ajouter au tableau `lessons.json` trois objets `category:'mainline'`, `side:'b'`, en reprenant
`name`/`eco`/`uci` du brouillon et en rédigeant `comments` (1 par pli) + `summary` :
```json
{ "id": "sicilian-dragon", "name": "Défense sicilienne, variante du Dragon",
  "category": "mainline", "eco": "B72", "side": "b",
  "uci": [ "...depuis le brouillon..." ],
  "comments": [ "...un par demi-coup..." ],
  "summary": "Le fou g7 vise la grande diagonale ; jeu tranchant aile contre aile." }
```
Idem `sicilian-sveshnikov` (id, name « Défense sicilienne, variante Sveshnikov ») et
`sicilian-classical` (name « Défense sicilienne, variante Classique »). Les `name` français
sont libres ; `id`/`eco`/`uci` viennent du brouillon.

- [ ] **Step 3: Vérifier la longueur coups/commentaires (garde-fou rapide)**

Run: `node -e "const L=require('./lessons.json'); for(const id of ['sicilian-najdorf','sicilian-dragon','sicilian-sveshnikov','sicilian-classical']){const l=L.find(x=>x.id===id); if(!l){console.error('manque '+id);process.exit(1)} if(l.uci.length!==l.comments.length){console.error('désalignement '+id);process.exit(1)} if(l.uci.length<14){console.error('trop court '+id);process.exit(1)} console.log(id, l.uci.length+' plis OK')}"`
Expected: 4 lignes « ... plis OK », code de sortie 0.

- [ ] **Step 4: Commit**

```bash
git add lessons.json
git commit -m "content(lessons): 4 lignes siciliennes profondes commentées (Najdorf/Dragon/Sveshnikov/Classique)"
```

---

## Task 4: Test de validation des leçons

**Files:**
- Create: `tests/sicilian.spec.js`

- [ ] **Step 1: Écrire le test qui échoue (données des leçons)**

`tests/sicilian.spec.js` :
```js
const { test, expect } = require('@playwright/test');
const { validateLessons } = require('../tools/validate-lessons.js');
const lessons = require('../lessons.json');

const IDS = ['sicilian-najdorf','sicilian-dragon','sicilian-sveshnikov','sicilian-classical'];

test('lessons.json reste valide après ajout des siciliennes', () => {
  const errors = validateLessons(lessons);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('les 4 leçons siciliennes sont présentes, profondes et côté Noir', () => {
  for (const id of IDS) {
    const l = lessons.find(x => x.id === id);
    expect(l, `leçon manquante : ${id}`).toBeTruthy();
    expect(l.category).toBe('mainline');
    expect(l.side).toBe('b');
    expect(l.uci.length).toBeGreaterThanOrEqual(14);
    expect(l.uci.length).toBe(l.comments.length);
  }
});
```

- [ ] **Step 2: Lancer le test**

Run: `npx playwright test tests/sicilian.spec.js`
Expected: les 2 tests PASS (si le contenu de la Tâche 3 est correct). Si FAIL, corriger
`lessons.json` jusqu'au vert (ne pas modifier le test).

- [ ] **Step 3: Commit**

```bash
git add tests/sicilian.spec.js
git commit -m "test(sicilian): valide les 4 leçons curées (profondeur, côté, alignement)"
```

---

## Task 5: Groupement du catalogue par famille

**Files:**
- Modify: `chess.html` (et copie identique `index.html`)
- Modify: `tests/sicilian.spec.js`

- [ ] **Step 1: Ajouter le test de groupement (échoue)**

Ajouter à `tests/sicilian.spec.js` :
```js
test('le catalogue groupe les résultats par famille (en-tête repliable)', async ({ page }) => {
  await page.goto('/chess.html');
  await page.locator('#modeTrain').click();
  const search = page.locator('#openingSearch');
  await search.fill('sicil');
  // un en-tête de famille au moins, contenant "Sicilian Defense"
  const fams = page.locator('#openingResults details.opening-fam > summary');
  await expect(fams.first()).toBeVisible();
  await expect(page.locator('#openingResults details.opening-fam > summary',
    { hasText: 'Sicilian Defense' }).first()).toBeVisible();
  // les variantes sont des lignes sous l'en-tête
  await expect(page.locator('#openingResults details.opening-fam .opening-row').first()).toBeVisible();
});

test('familyOf isole le texte avant le deux-points', async ({ page }) => {
  await page.goto('/chess.html');
  const r = await page.evaluate(() => [
    window.__trainTest.familyOf('Sicilian Defense: Najdorf Variation'),
    window.__trainTest.familyOf('Sicilian Defense'),
  ]);
  expect(r[0]).toBe('Sicilian Defense');
  expect(r[1]).toBe('Sicilian Defense');
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `npx playwright test tests/sicilian.spec.js -g "famille|familyOf"`
Expected: FAIL (`familyOf` indéfini ; pas de `details.opening-fam`).

- [ ] **Step 3: Implémenter `familyOf` + grouper dans `renderOpeningRows` (chess.html)**

Remplacer la fonction `renderOpeningRows` (chess.html, ~ligne 1619) par :
```js
function familyOf(name){ const i=name.indexOf(':'); return i<0?name:name.slice(0,i).trim(); }

function renderOpeningRows(list){
  const box=document.getElementById('openingResults');
  box.innerHTML='';
  const groups=new Map();
  for(const o of list){
    const fam=familyOf(o.name);
    if(!groups.has(fam)) groups.set(fam,[]);
    groups.get(fam).push(o);
  }
  for(const [fam, items] of groups){
    const det=document.createElement('details');
    det.className='opening-fam'; det.open=true;
    const sum=document.createElement('summary');
    sum.textContent=`${fam} (${items.length})`;
    det.appendChild(sum);
    for(const o of items){
      const row=document.createElement('div');
      row.className='opening-row';
      row.innerHTML=`<span class="eco">${o.eco}</span>${o.name}<div class="moves">${openingMovesPreview(o)}</div>`;
      row.addEventListener('click',()=>askSideThenStart(o,row));
      det.appendChild(row);
    }
    box.appendChild(det);
  }
}
```

- [ ] **Step 4: Exposer `familyOf` sur le seam de test (chess.html)**

Dans l'objet `window.__trainTest={...}` (~ligne 1919), ajouter `familyOf` à la liste :
```js
  openingToLesson, startDrill, startStudy, studyStep, studyJumpTo, playFromHere, uciOf, buildOpeningPrompt, familyOf };
```

- [ ] **Step 5: Ajouter le CSS de l'en-tête (chess.html)**

Après la règle `.opening-row .moves{...}` (~ligne 511), ajouter :
```css
.opening-fam>summary{cursor:pointer;font-weight:600;font-size:12px;color:var(--accent);padding:4px 2px;list-style:none}
.opening-fam>summary::-webkit-details-marker{display:none}
.opening-fam>summary::before{content:'▸ ';color:var(--muted)}
.opening-fam[open]>summary::before{content:'▾ '}
.opening-fam{display:flex;flex-direction:column;gap:4px}
```

- [ ] **Step 6: Répliquer les 3 éditions à l'identique dans `index.html`**

Appliquer Steps 3, 4, 5 mot pour mot à `index.html`.
Run: `diff -q chess.html index.html`
Expected: aucune sortie (fichiers identiques).

- [ ] **Step 7: Lancer les tests de la tâche**

Run: `npx playwright test tests/sicilian.spec.js`
Expected: les 4 tests du fichier PASS.

- [ ] **Step 8: Commit**

```bash
git add chess.html index.html tests/sicilian.spec.js
git commit -m "feat(catalogue): groupe les résultats d'ouvertures par famille (en-tête repliable)"
```

---

## Task 6: Documentation + non-régression

**Files:**
- Modify: `docs/OUVERTURES.md`

- [ ] **Step 1: Documenter le pipeline et les leçons**

Ajouter à `docs/OUVERTURES.md` une section « Approfondissement Sicilien » : les 4 leçons
curées (ids `sicilian-najdorf` mis à jour, `sicilian-dragon`, `sicilian-sveshnikov`,
`sicilian-classical`), le script `tools/build-sicilian-lessons.mjs` (ancre depuis
`openings.json` → extension via explorateur lichess masters → cache `tools/sicilian-src/` →
`sicilian-draft.json` → commentaires manuels → `lessons.json`), et le groupement du catalogue
par famille (`familyOf`, en-têtes `details.opening-fam`). Mentionner les tests
`tests/sicilian.spec.js` et la commande `node --test tools/build-sicilian-lessons.test.mjs`.

- [ ] **Step 2: Suite complète + validateur**

Run: `node tools/validate-lessons.js && node --test tools/build-sicilian-lessons.test.mjs && npx playwright test`
Expected: validateur OK, 6 tests node PASS, suite Playwright entièrement verte (baseline 67 + nouveaux).

- [ ] **Step 3: Vérifier la synchro des deux fichiers**

Run: `diff -q chess.html index.html`
Expected: aucune sortie.

- [ ] **Step 4: Commit**

```bash
git add docs/OUVERTURES.md
git commit -m "docs(ouvertures): pipeline d'extraction sicilien + groupement catalogue"
```

---

## Critères d'acceptation (rappel du spec)

1. `node tools/build-sicilian-lessons.mjs` produit `sicilian-draft.json` (4 lignes ≥ 14 plis), réexécutable hors-ligne via cache. *(Tâches 1-2)*
2. `lessons.json` contient les 4 leçons commentées ; `node tools/validate-lessons.js` sans erreur. *(Tâches 3-4)*
3. Le catalogue groupe par famille ; variantes siciliennes sous un en-tête unique. *(Tâche 5)*
4. `npx playwright test` vert (baseline + nouveaux). *(Tâche 6)*
5. `diff -q chess.html index.html` sans différence. *(Tâches 5-6)*
