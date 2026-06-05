# Extension du catalogue de pièges — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter +13 à 15 pièges d'ouverture vérifiés à `lessons.json` (total pièges ≥ 24), sans changement de code applicatif.

**Architecture:** Un harnais `tools/verify-traps.mjs` (chess.js) sert d'oracle : pour chaque piège il rejoue la ligne UCI et asserte soit l'échec et mat, soit un gain matériel net du point de vue de `side`. On n'ajoute que des pièges qui passent l'oracle (mat ou prise décisive sans reprise) ; les pièges « pièce emprisonnée » (gain différé, non vérifiable sur une ligne unique) sont exclus. Chaque ligne candidate est vérifiée et, si elle échoue, corrigée via chess.js ou remplacée par la réserve.

**Tech Stack:** Node.js (ESM pour le harnais, CommonJS pour `validate-lessons.js` existant), chess.js (déjà installé), Playwright (suite existante).

---

## Structure des fichiers

- **Modifier** `lessons.json` — ajout des objets `category:"trap"` (schéma inchangé).
- **Créer** `tools/verify-traps.mjs` — oracle de vérification (mat / matériel), exécutable CLI + table `EXPECT`.
- **Créer** `tests/traps.spec.js` — assertions Playwright (compte, métadonnées, chargeabilité picker).
- **Modifier** `docs/OUVERTURES.md` — mention du nouvel oracle et du compte de pièges.

Pas de modification de `chess.html` : le picker groupe déjà les pièges sous `#lessonTraps` et le catalogue par famille (`familyOf`), les nouvelles entrées sont absorbées automatiquement.

## Conventions de contenu (rappel spec)

Schéma par piège : `{id,name,category:"trap",eco,side,uci,comments,trapPly,summary,refutation}`.
- `side` = camp qui exploite le piège (celui qui gagne).
- `trapPly` = index 0-based du coup-gaffe de l'adversaire.
- `comments` : un par demi-coup (même longueur que `uci`), ton concis aligné sur l'existant ; au `trapPly`, le commentaire signale la gaffe ; au dernier coup, il décrit la punition.
- `refutation` : 1 phrase décrivant la punition.

---

## Task 1 : Oracle de vérification `tools/verify-traps.mjs`

**Files:**
- Create: `tools/verify-traps.mjs`

- [ ] **Step 1 : Écrire l'oracle**

```javascript
// Oracle des pièges : rejoue chaque ligne `trap` de lessons.json et vérifie
// la conclusion attendue (mat ou gain matériel net du camp `side`).
// Usage : node tools/verify-traps.mjs
import { Chess } from 'chess.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LESSONS = JSON.parse(readFileSync(join(__dirname, '..', 'lessons.json'), 'utf8'));

// Conclusion attendue par id de piège :
//   'mate'                  -> la position finale doit être échec et mat
//   { material: n }         -> `side` doit mener d'au moins n points (P1 C3 F3 T5 D9)
// Les pièges absents de EXPECT ne sont PAS vérifiés par l'oracle (legacy).
export const EXPECT = {
  // --- ajoutés tâche par tâche ci-dessous ---
};

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function uciToMove(u) {
  return { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined };
}

// bilan matériel du point de vue de `side` (positif = `side` mène)
function materialLead(chess, side) {
  let w = 0, b = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      if (sq.color === 'w') w += VAL[sq.type]; else b += VAL[sq.type];
    }
  }
  return side === 'w' ? w - b : b - w;
}

export function verifyTraps(lessons, expect = EXPECT) {
  const errors = [];
  for (const l of lessons) {
    if (l.category !== 'trap') continue;
    const exp = expect[l.id];
    if (exp == null) continue; // non couvert par l'oracle
    const c = new Chess();
    let illegal = false;
    l.uci.forEach((u, k) => {
      try { if (!c.move(uciToMove(u))) { errors.push(`${l.id}: coup illégal index ${k} (${u})`); illegal = true; } }
      catch { errors.push(`${l.id}: coup illégal index ${k} (${u})`); illegal = true; }
    });
    if (illegal) continue;
    if (exp === 'mate') {
      if (!c.isCheckmate()) errors.push(`${l.id}: la position finale n'est PAS échec et mat (attendu 'mate')`);
    } else if (exp && typeof exp.material === 'number') {
      const lead = materialLead(c, l.side);
      if (lead < exp.material) errors.push(`${l.id}: gain matériel ${lead} < attendu ${exp.material} (côté ${l.side})`);
    }
  }
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errs = verifyTraps(LESSONS);
  if (errs.length) { console.error(`✗ ${errs.length} erreur(s) :\n` + errs.join('\n')); process.exit(1); }
  const n = Object.keys(EXPECT).length;
  console.log(`✓ oracle des pièges : ${n} piège(s) vérifié(s).`);
}
```

- [ ] **Step 2 : Lancer l'oracle (EXPECT vide → 0 vérifié, doit passer)**

Run: `node tools/verify-traps.mjs`
Expected: `✓ oracle des pièges : 0 piège(s) vérifié(s).`

- [ ] **Step 3 : Commit**

```bash
git add tools/verify-traps.mjs
git commit -m "test(pieges): oracle chess.js (mat/materiel) pour les pieges"
```

---

## Task 2 : Pièges « mat forcé » de référence (3 entrées vérifiées)

Ces trois lignes ont été raisonnées et sont sûres. Les ajouter à `lessons.json` (avant la
parenthèse fermante `]`, après le dernier piège existant) et à `EXPECT`.

**Files:**
- Modify: `lessons.json`
- Modify: `tools/verify-traps.mjs` (table `EXPECT`)

- [ ] **Step 1 : Ajouter `budapest-smothered` à `lessons.json`**

```json
{
  "id": "budapest-smothered",
  "name": "Mat étouffé du Budapest (piège Kieninger)",
  "category": "trap",
  "eco": "A52",
  "side": "b",
  "uci": ["d2d4","g8f6","c2c4","e7e5","d4e5","f6g4","c1f4","b8c6","g1f3","f8b4","b1d2","d8e7","a2a3","g4e5","a3b4","e5d3"],
  "comments": [
    "Le Blanc prend le centre.",
    "Développe et surveille e4/d5.",
    "Gambit Dame : le Blanc élargit son centre.",
    "Gambit Budapest : Noir frappe d4 au lieu de le défendre.",
    "Le Blanc accepte le pion.",
    "Le cavalier file récupérer le pion e5.",
    "Le Blanc défend e5 et développe le fou.",
    "Développe et ajoute la pression sur e5.",
    "Soutient encore e5 et développe.",
    "Échec : Noir cloue et gêne le développement blanc.",
    "Le Blanc intercale le cavalier pour parer l'échec.",
    "La dame vise e5 et prépare une surprise sur la colonne e.",
    "La gaffe : le Blanc gagne le fou, mais la colonne e va devenir fatale.",
    "Le cavalier reprend en e5 et lorgne d3.",
    "Le Blanc empoche le fou b4 sans voir le coup suivant.",
    "Cd3# : mat étouffé ! exd3 est illégal (clouage de la dame e7 sur le roi) et le roi est emmuré par ses pièces."
  ],
  "trapPly": 14,
  "summary": "Le gambit Budapest tend ce mat étouffé célèbre : après axb4??, …Cd3# car le pion e2 est cloué sur la colonne e.",
  "refutation": "…Cd3# : le pion e2 ne peut reprendre (il découvrirait la dame e7 sur le roi e1) et le roi blanc est étouffé par ses propres pièces."
}
```

- [ ] **Step 2 : Ajouter `siberian-trap` à `lessons.json`**

```json
{
  "id": "siberian-trap",
  "name": "Piège sibérien",
  "category": "trap",
  "eco": "B21",
  "side": "b",
  "uci": ["e2e4","c7c5","d2d4","c5d4","c2c3","d4c3","b1c3","b8c6","g1f3","e7e6","f1c4","d8c7","e1g1","g8f6","d1e2","f6g4","h2h3","c6d4","f3d4","c7h2"],
  "comments": [
    "1.e4 : ouverture au centre.",
    "La Sicilienne.",
    "Gambit Smith-Morra : le Blanc offre un pion pour l'avance de développement.",
    "Noir accepte.",
    "Le Blanc propose un second pion.",
    "Noir prend encore.",
    "Deux pions de retard, mais un développement rapide.",
    "Noir développe.",
    "Développe et contrôle e5/d4.",
    "Ouvre le fou f8 et solidifie d5/f5.",
    "Le fou typique du Morra, braqué sur f7.",
    "Coup clé : la dame se poste sur la diagonale b8-h2.",
    "Le Blanc roque.",
    "Développe et attaque e4.",
    "Défend e4… mais déserte la défense de h2.",
    "Le cavalier saute en g4 : il vise h2 et f2.",
    "La gaffe : chasser le cavalier ouvre les vannes.",
    "Coup de tonnerre : le cavalier attaque la dame e2 et déloge le défenseur f3.",
    "Le Blanc prend le cavalier…",
    "…Dh2# ! Le cavalier g4 garde h2 et le roi est mat."
  ],
  "trapPly": 16,
  "summary": "Dans le gambit Smith-Morra, le plan …Dc7/…Cg4 tend le piège sibérien : après h3?? Cd4! puis …Dh2#.",
  "refutation": "…Cd4! détourne le cavalier f3 ; après Cxd4, …Dh2# est gardé par le cavalier g4 et le roi g1 est mat."
}
```

- [ ] **Step 3 : Ajouter `owen-defense-trap` à `lessons.json`**

```json
{
  "id": "owen-defense-trap",
  "name": "Piège de la défense Owen",
  "category": "trap",
  "eco": "B00",
  "side": "w",
  "uci": ["e2e4","b7b6","d2d4","c8b7","f1d3","f7f5","e4f5","b7g2","d1h5","g7g6","f5g6","g8f6","g6h7","f6h5","d3g6"],
  "comments": [
    "Le Blanc occupe le centre.",
    "Défense Owen : Noir prépare le fianchetto dame.",
    "Le Blanc renforce son centre.",
    "Le fou b7 vise la grande diagonale et e4.",
    "Le Blanc défend e4 et développe.",
    "La gaffe : …f5?? affaiblit fatalement la diagonale h5-e8.",
    "Le Blanc prend le pion f5.",
    "Noir s'empare du pion g2, croyant gagner du matériel.",
    "Échec ! La dame frappe sur la diagonale affaiblie.",
    "Noir intercale le pion (forcé).",
    "Le Blanc prend en passant l'occasion et ouvre les lignes.",
    "Noir attaque la dame h5.",
    "gxh7+ : échec à la découverte, la dame redonne échec.",
    "Noir doit capturer la dame…",
    "Fg6# : le fou mate, le roi noir est étouffé par ses pions e7/d7 et son fou f8."
  ],
  "trapPly": 5,
  "summary": "Contre 3…f5??, le Blanc sacrifie pour ouvrir la diagonale h5-e8 et mate par Fg6#.",
  "refutation": "Dh5+ puis, après l'échec à la découverte gxh7+ et …Cxh5, Fg6# : le roi e8 est emmuré par ses propres pions et fou."
}
```

- [ ] **Step 4 : Renseigner `EXPECT` dans `tools/verify-traps.mjs`**

Remplacer le bloc `export const EXPECT = { ... };` par :

```javascript
export const EXPECT = {
  'budapest-smothered': 'mate',
  'siberian-trap': 'mate',
  'owen-defense-trap': 'mate',
};
```

- [ ] **Step 5 : Vérifier légalité + oracle**

Run: `node tools/validate-lessons.js && node tools/verify-traps.mjs`
Expected: `✓ lessons.json valide : 25 leçon(s).` puis `✓ oracle des pièges : 3 piège(s) vérifié(s).`
Si un `mate` échoue : corriger la ligne UCI via chess.js (rejouer coup par coup, vérifier `isCheckmate()`) avant de continuer. Ne pas passer à la suite tant que ce n'est pas vert.

- [ ] **Step 6 : Commit**

```bash
git add lessons.json tools/verify-traps.mjs
git commit -m "content(pieges): 3 mats forces verifies (Budapest, siberien, Owen)"
```

---

## Task 3 : Piège « gain de dame » Tennison (1 entrée vérifiée)

**Files:**
- Modify: `lessons.json`, `tools/verify-traps.mjs`

- [ ] **Step 1 : Ajouter `tennison-queen-trap` à `lessons.json`**

```json
{
  "id": "tennison-queen-trap",
  "name": "Piège de la dame (gambit Tennison)",
  "category": "trap",
  "eco": "A06",
  "side": "w",
  "uci": ["e2e4","d7d5","g1f3","d5e4","f3g5","g8f6","d2d3","e4d3","f1d3","h7h6","g5f7","e8f7","d3g6","f7g6","d1d8"],
  "comments": [
    "1.e4.",
    "Réponse Scandinave/Tennison : Noir rend la pareille au centre.",
    "Gambit Tennison : le cavalier va récupérer le pion.",
    "Noir prend le pion e4.",
    "Le cavalier saute en g5, visant f7 et e4.",
    "Noir développe et attaque… mais néglige f7.",
    "Le Blanc rouvre la diagonale du fou.",
    "Noir prend le pion d3.",
    "Le fou reprend, braqué sur la diagonale b1-h7.",
    "Noir chasse le cavalier g5.",
    "Cxf7 ! Le cavalier prend le pion et fourchette dame et tour.",
    "Le roi reprend le cavalier (sinon la dame tombe).",
    "Fg6+ ! Sacrifice d'attraction du fou.",
    "La gaffe : …Rxg6?? attire le roi et abandonne la dame.",
    "Dxd8 : le Blanc gagne la dame (pour deux pièces), gain décisif."
  ],
  "trapPly": 13,
  "summary": "Dans le gambit Tennison, Cxf7! puis Fg6+ attire le roi ; après …Rxg6??, Dxd8 rafle la dame.",
  "refutation": "Cxf7 fourchette D+T ; après …Rxf7 Fg6+ …Rxg6?? Dxd8 gagne la dame contre deux pièces."
}
```

- [ ] **Step 2 : Ajouter à `EXPECT`**

```javascript
  'tennison-queen-trap': { material: 2 },
```

- [ ] **Step 3 : Vérifier**

Run: `node tools/validate-lessons.js && node tools/verify-traps.mjs`
Expected: 26 leçon(s) ; 4 piège(s) vérifié(s).
Si le gain matériel est < 2 : vérifier que la dame est bien capturée sans reprise immédiate ; corriger la ligne via chess.js.

- [ ] **Step 4 : Commit**

```bash
git add lessons.json tools/verify-traps.mjs
git commit -m "content(pieges): piege de la dame du gambit Tennison"
```

---

## Task 4 : Pièges nommés supplémentaires — boucle d'authoring vérifiée

Objectif : porter le total de pièges à **24-26** (donc +9 à 11 pièges en plus des 4 ci-dessus,
ou moins si certains ne se vérifient pas — on s'arrête dès qu'on a 13-15 pièges ajoutés au
total, qualité d'abord).

Pour CHAQUE piège candidat ci-dessous : (a) écrire l'entrée dans `lessons.json` avec une ligne
UCI candidate, (b) ajouter sa clé à `EXPECT`, (c) lancer `node tools/verify-traps.mjs`, (d) si
échec, rejouer la ligne coup par coup en chess.js pour la corriger (reconstruire depuis la
théorie standard de l'ouverture), ou la remplacer par un candidat de réserve, jusqu'au vert.

Candidats (registre : pièges nommés + gambits piquants), avec conclusion visée et `EXPECT` :

| id | Nom FR | ECO | side | EXPECT | Motif de la punition |
|----|--------|-----|------|--------|----------------------|
| `lolli-trap` | Piège de Lolli | C57 | w | `mate` | Deux-Cavaliers, …d5? puis sac sur f7 et mat |
| `legal-style-damiano` | Variante Damiano (mat) | C40 | w | `mate` | Cxe5 fxe5 Dh5+ et mat de la dame |
| `blackburne-ruy` | Piège Blackburne (Espagnole) | C65 | b | `mate` | …Cd4 et …Dg5/…Dxg2 mat |
| `cambridge-springs-trap` | Piège de Cambridge Springs | D52 | b | `{material:2}` | …dxc4 / …Cxd5 gagne une pièce sur la dame d2 |
| `elephant-gambit-trap` | Piège du gambit éléphant | C40 | b | `{material:2}` | …e4 / …Dxd5 gagne du matériel |
| `halosar-trap` | Piège Halosar | D00 | w | `{material:2}` | Blackmar-Diemer, Dxd4?? Fe3 + O-O-O gagne |
| `danish-gambit-trap` | Piège du gambit danois | C21 | w | `{material:2}` | acceptation gourmande, Fxf7+/Dxd8 |
| `latvian-gambit-trap` | Piège du gambit lettonien | C40 | w | `mate` | …f5? Cxe5 puis Dh5+ et mat |
| `vienna-gambit-trap` | Piège du gambit viennois | C29 | w | `{material:2}` | …d5? exf6/Dh5+ gagne |
| `marshall-qga-trap` | Piège Marshall (GDA) | D20 | w | `{material:2}` | …b5? a4 et le pion c4/b5 tombe |

Règles de la boucle :
- **Conclusion forcée obligatoire.** Si un candidat ne donne pas un mat (`isCheckmate()`) ou
  un gain matériel net **sans reprise** (le camp adverse ne reprend pas au coup suivant),
  l'écarter. Pas de piège « pièce emprisonnée » (gain différé) : non vérifiable sur ligne unique.
- **Profondeur** : jusqu'au coup-gaffe (`trapPly`) + 1-2 coups de punition.
- **Commentaires** : suivre le gabarit des entrées de la Task 2 (un par demi-coup, gaffe
  signalée au `trapPly`, punition au dernier coup).
- S'arrêter dès **13-15 nouveaux pièges** vérifiés au total (Tasks 2+3+4).

- [ ] **Step 1 : Ajouter les candidats un par un, en vérifiant après chacun**

Pour chaque ligne ajoutée :
Run: `node tools/verify-traps.mjs`
Expected: aucun nouvel échec (le compteur de pièges vérifiés augmente de 1).

- [ ] **Step 2 : Vérification globale légalité + oracle**

Run: `node tools/validate-lessons.js && node tools/verify-traps.mjs`
Expected: `✓ lessons.json valide : <34-36> leçon(s).` et oracle 100 % vert.

- [ ] **Step 3 : Commit**

```bash
git add lessons.json tools/verify-traps.mjs
git commit -m "content(pieges): pieges nommes et gambits supplementaires verifies"
```

---

## Task 5 : Spec Playwright `tests/traps.spec.js`

**Files:**
- Create: `tests/traps.spec.js`

- [ ] **Step 1 : Écrire le test**

```javascript
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const LESSONS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lessons.json'), 'utf8'));
const TRAPS = LESSONS.filter((l) => l.category === 'trap');

test('le catalogue compte au moins 24 pièges', () => {
  expect(TRAPS.length).toBeGreaterThanOrEqual(24);
});

test('chaque piège a trapPly dans les bornes et une réfutation', () => {
  for (const l of TRAPS) {
    expect(typeof l.trapPly, `${l.id}: trapPly`).toBe('number');
    expect(l.trapPly, `${l.id}: trapPly >=0`).toBeGreaterThanOrEqual(0);
    expect(l.trapPly, `${l.id}: trapPly < uci.length`).toBeLessThan(l.uci.length);
    expect((l.refutation || '').length, `${l.id}: refutation non vide`).toBeGreaterThan(0);
    expect(l.comments.length, `${l.id}: comments alignés`).toBe(l.uci.length);
  }
});

test('les nouveaux pièges sont chargeables par le picker', async ({ page }) => {
  await page.goto('/chess.html');
  const ids = await page.evaluate(() => Object.keys(window.__trainTest?.lessonsById || {}));
  for (const id of ['budapest-smothered', 'siberian-trap', 'owen-defense-trap', 'tennison-queen-trap']) {
    expect(ids, `picker connaît ${id}`).toContain(id);
  }
});
```

- [ ] **Step 2 : Vérifier le seam `__trainTest` exposé par chess.html**

Run: `grep -n "lessonsById\|__trainTest" chess.html | head`
Expected: une entrée exposant les leçons par id sur `window.__trainTest`.
Si `lessonsById` n'existe pas, adapter le test pour lire la structure réellement exposée
(ex. `window.__trainTest.lessons` puis mapper `.id`), sans modifier `chess.html`.

- [ ] **Step 3 : Lancer la spec**

Run: `npx playwright test tests/traps.spec.js`
Expected: 3 passed.

- [ ] **Step 4 : Commit**

```bash
git add tests/traps.spec.js
git commit -m "test(pieges): spec Playwright (compte, metadonnees, picker)"
```

---

## Task 6 : Baseline complète, permissions, doc

**Files:**
- Modify: `docs/OUVERTURES.md`

- [ ] **Step 1 : Lancer toute la suite**

Run: `npx playwright test`
Expected: 100 % vert (≈ 74 tests).

- [ ] **Step 2 : Documenter l'oracle dans `docs/OUVERTURES.md`**

Ajouter une sous-section « Vérification des pièges » : rôle de `tools/verify-traps.mjs`
(oracle chess.js mat/matériel, table `EXPECT`), commande `node tools/verify-traps.mjs`, et
nouveau compte de pièges.

- [ ] **Step 3 : Corriger les permissions des fichiers créés**

```bash
echo "$WIMSPASS" | sudo -S chown wims:wims tools/verify-traps.mjs tests/traps.spec.js
```
(`$WIMSPASS` = mot de passe `wims` ; cf. `reference_system_access`.)

- [ ] **Step 4 : Commit + push**

```bash
git add docs/OUVERTURES.md
git commit -m "docs(ouvertures): oracle de verification des pieges + nouveau compte"
git push origin main
```

- [ ] **Step 5 : Mettre à jour la mémoire**

Mettre à jour `project_chess_tutor.md` : le backlog « étendre le contenu » est avancé (pièges
portés à 24-26 via oracle `verify-traps.mjs`).

---

## Notes d'exécution

- **Bash réservé au contrôleur** : les sous-agents ne peuvent pas lancer `node`/`npx`/`git`
  ici (cf. `reference_subagent_bash`). L'exécution inline par le contrôleur est le mode
  attendu pour ce plan.
- **Oracle = source de vérité** : tout piège qui n'atteint pas un mat ou un gain matériel net
  vérifiable est écarté, pas « rattrapé » par un commentaire optimiste. Mieux vaut 13 pièges
  béton que 15 bancals.
