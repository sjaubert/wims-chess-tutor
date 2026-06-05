# Conception — Extension du catalogue de pièges

Date : 2026-06-05
Auteur : S. Jaubert + Claude Code

## Objectif

Étendre le contenu pédagogique de l'application d'échecs en ajoutant **+13 à +15 pièges
d'ouverture** à `lessons.json` (catégorie `trap`), pour passer de 11 à ~24-26 pièges. Les
ouvertures (`mainline`) restent inchangées (~11).

Registre retenu (décidé en brainstorming) :
- **Pièges d'ouverture nommés** (classiques célèbres),
- **Gambits piquants fréquents en ligne**.

Hors périmètre : mats-modèles / miniatures (étouffé, Boden, cadeau grec, partie de l'Opéra).

## Contrainte & principe de qualité

`lichess.org` / `explorer.lichess.org` restent **bloqués par le pare-feu** du serveur (cf.
`reference_system_access`). Les lignes sont donc saisies depuis la **théorie standard
documentée**, puis **vérifiées localement par chess.js**. On ne retient que des pièges à
**conclusion forcée et nette** : soit échec et mat, soit gain de matériel non ambigu. Un
piège « de mémoire » dont la réfutation n'est pas franche (ex. piège Mortimer, gain seulement
« avec initiative ») est **écarté**.

## Schéma (inchangé)

Chaque piège est un objet du tableau `lessons.json` :

```json
{
  "id": "kebab-case",
  "name": "Nom français",
  "category": "trap",
  "eco": "X00",
  "side": "w" | "b",      // camp qui DÉCLENCHE/EXPLOITE le piège (celui qu'on entraîne)
  "uci": ["e2e4", ...],   // ligne complète jusqu'à la punition
  "comments": ["...", ...],// 1 commentaire FR par demi-coup (même longueur que uci)
  "trapPly": 8,            // index 0-based du coup-gaffe de l'adversaire
  "summary": "Résumé FR du motif.",
  "refutation": "Phrase FR décrivant la punition."
}
```

`side` = le camp dont on apprend le piège (celui qui gagne). `trapPly` pointe le **coup fautif
de l'adversaire** qui déclenche la punition.

## Harnais de vérification (nouveau)

Script `tools/verify-traps.mjs` (Node + chess.js, exécutable `node --test` ou en CLI) :

1. Rejoue la séquence `uci` de chaque leçon `category: "trap"` ; échoue si un coup est illégal.
2. Champ `expect` interne au script (table id → `"mate"` | `{material: <gain en pions, du
   point de vue de `side`>}`) :
   - `"mate"` : assert `chess.isCheckmate()` en position finale.
   - `{material}` : assert que le bilan matériel final (barème P=1,C=B=3,T=5,D=9) donne au
     camp `side` au moins le gain attendu.
3. Vérifie `comments.length === uci.length` et `0 <= trapPly < uci.length`.

Ce harnais est la **source de vérité** : la liste finale = les pièges qui passent. Les
candidats qui échouent sont remplacés par la réserve, jusqu'à atteindre 13-15.

## Pool de candidats

### Vague A — pièges d'ouverture nommés

| id | Nom FR | Famille (ECO) | side | Conclusion attendue |
|----|--------|---------------|------|---------------------|
| `noahs-ark-trap` | Piège de l'Arche de Noé | Espagnole (C77) | b | gain du fou b3 (≈ +3) |
| `budapest-smothered` | Mat étouffé du Budapest | Gambit Budapest (A52) | b | mat (…Cd3#) |
| `siberian-trap` | Piège sibérien | Sicilienne Smith-Morra (B21) | b | mat (…Dh2#) |
| `magnus-smith-trap` | Piège Magnus Smith | Sicilienne Dragon (B73) | w | gain matériel net |
| `tarrasch-rl-trap` | Piège Tarrasch | Espagnole ouverte (C80) | w | gain de pièce |
| `fishing-pole-trap` | Piège de la canne à pêche | Espagnole/Berlin (C65) | b | mat / gain décisif |

### Vague B — gambits piquants en ligne

| id | Nom FR | Famille (ECO) | side | Conclusion attendue |
|----|--------|---------------|------|---------------------|
| `halosar-trap` | Piège Halosar | Blackmar-Diemer (D00) | w | gain matériel / attaque décisive (assert matériel) |
| `tennison-queen-trap` | Piège de la dame (Tennison) | Gambit Tennison (A06) | w | gain de la dame |
| `owen-defense-trap` | Piège de la défense Owen | Défense Owen (B00) | w | mat |
| `danish-gambit-trap` | Piège du gambit danois | Gambit danois (C21) | w | gain de pièce |
| `cochrane-gambit` | Gambit Cochrane | Petroff (C42) | w | (sacrifice ; assert légalité seule, pas de gain forcé) |

### Réserve (si un candidat échoue à la vérif)

| id | Nom FR | Famille | side | Conclusion |
|----|--------|---------|------|-----------|
| `marshall-qga-trap` | Piège Marshall | Gambit Dame accepté (D20) | w | gain de pièce |
| `latvian-gambit-trap` | Piège du gambit lettonien | Gambit lettonien (C40) | b/w | gain net |
| `vienna-gambit-trap` | Piège du gambit viennois | Gambit viennois (C29) | w | gain net |
| `monticelli-trap` | Piège Monticelli | Ouest-indienne/Bogo (E11) | w | gain de pièce |
| `blackmar-diemer-trap` | Piège Blackmar-Diemer (variante) | BDG (D00) | w | attaque décisive |

Note : `cochrane-gambit` est un **sacrifice positionnel** sans gain forcé ; on l'inclut comme
« gambit piquant » avec vérification de **légalité seule** (pas d'assertion mat/matériel). Si
l'on préfère n'avoir que des pièges à punition forcée, on le déplace en réserve.

## Format pédagogique

- Profondeur : jusqu'au coup-gaffe **+ 1 à 2 coups de punition** (mat ou prise décisive).
- `comments` : un commentaire FR par demi-coup, ton aligné sur l'existant (concis, explique
  le plan ; au `trapPly`, le commentaire signale la gaffe).
- `summary` : 1 phrase situant l'ouverture et le motif.
- `refutation` : 1 phrase décrivant la punition (réutilise le champ déjà présent sur les
  pièges existants type `legal-mate`).

## Intégration & tests

- Aucun changement de code applicatif : le picker groupe déjà les pièges sous `#lessonTraps`
  et le catalogue par famille via `familyOf`. Les nouvelles entrées apparaissent
  automatiquement.
- `tools/validate-lessons.js` (déjà existant) garde la légalité + l'alignement
  commentaires/coups pour **toutes** les leçons.
- Nouveau `tools/verify-traps.mjs` : vérif renforcée (mat / matériel) décrite ci-dessus.
- Nouvelle spec Playwright `tests/traps.spec.js` :
  - tous les pièges ont `category:"trap"`, `trapPly` dans les bornes, `refutation` non vide ;
  - le nombre de pièges est passé de 11 à ≥ 24 ;
  - les nouveaux `id` sont présents et chargeables par le picker (`__trainTest`).
- **Baseline complète** `npx playwright test` maintenue verte (71 → ~74 tests).

## Critères d'acceptation

1. `lessons.json` contient 13 à 15 nouveaux pièges valides (total pièges ≥ 24).
2. `node tools/validate-lessons.js` : OK.
3. `node tools/verify-traps.mjs` : OK (toutes assertions mat/matériel passent).
4. `npx playwright test` : 100 % vert.
5. Commit unique poussé sur `origin/main`.
