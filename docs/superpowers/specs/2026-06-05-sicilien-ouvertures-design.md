# Spec — Approfondissement Sicilien du module ouvertures

**Date :** 2026-06-05
**Statut :** validé (design approuvé), prêt pour plan d'implémentation
**Module concerné :** entraînement / tuteur d'ouvertures (`chess.html` + copie identique `index.html`)

## 1. Objectif

Enrichir le module ouvertures sur trois axes décidés avec l'utilisateur :

1. **Leçons curées (pédagogie)** — ajouter 4 leçons commentées en français pour les
   grandes réponses noires à la Sicilienne Ouverte.
2. **Profondeur des lignes** — lignes principales d'environ **16 plis** (8 coups par camp),
   au lieu des ~10 plis actuels.
3. **Navigation du catalogue** — grouper les résultats de recherche par famille pour
   retrouver facilement une variante parmi les ~404 entrées siciliennes.

L'axe « bot adversaire plus fort via livre `.bin` » est **explicitement écarté** : un livre
Polyglot `.bin` ne porte ni nom de variante ni commentaire et ne sert qu'au moteur.

## 2. Périmètre

### Dans le périmètre
- 4 leçons curées : **Najdorf, Dragon, Sveshnikov, Classique**, côté **Noir** (`side:'b'`),
  catégorie `mainline`.
- Un script d'extraction reproductible des lignes principales (source faisant autorité :
  explorateur lichess base *masters*).
- Rédaction humaine des commentaires français.
- Groupement par famille dans le picker du catalogue.
- Tests Playwright correspondants.

### Hors périmètre (YAGNI)
- Structure d'arbre / branches (les leçons restent des lignes linéaires uniques).
- Version côté Blanc (« jouer contre la Sicilienne »).
- Livre Polyglot `.bin` / renforcement du bot.
- Panneau « familles vedettes » distinct (le groupement par famille suffit).

## 3. Décisions de conception (figées)

| Sujet | Décision |
|-------|----------|
| Couverture | Najdorf, Dragon, Sveshnikov, Classique |
| Côté drillé | Noir (la défense) ; le bot joue les coups blancs scriptés |
| Profondeur | ~16 plis (8 coups/camp), arrêt anticipé si l'explorateur n'a plus de données maîtres |
| Source des lignes | Explorateur lichess **masters**, en suivant le coup le plus joué |
| Production | Approche A : script d'extraction au build, commentaires rédigés à la main ensuite |
| Schéma `lessons.json` | **Inchangé** (`{id,name,category,eco,side,uci,comments,summary}`, `uci.length===comments.length`) |
| Catalogue | Même lot ; groupement par famille (texte avant le `:`) |

## 4. Ancres des 4 variantes (vérifiées dans `openings.json`)

Le script part de la ligne **nommée** (qui garantit qu'on est dans la bonne variante) puis
la prolonge.

| Leçon | `anchorName` (nom lichess exact) | ECO | Plis ancre | Action |
|-------|----------------------------------|-----|-----------|--------|
| Najdorf | `Sicilian Defense: Najdorf Variation` | B90 | 10 | prolonger → 16 |
| Dragon | `Sicilian Defense: Dragon Variation` | B70/B72 | 10-11 | prolonger → 16 |
| Classique | `Sicilian Defense: Classical Variation` | B56/B58 | 10-11 | prolonger → 16 |
| Sveshnikov | `Sicilian Defense: Lasker-Pelikan Variation, Sveshnikov Variation` | B33 | 16 | utiliser tel quel (extension nulle ou légère) |

> Note Sveshnikov : la Sveshnikov moderne est classée par lichess sous *Lasker-Pelikan*.
> Sa ligne nommée fait déjà 16 plis (…Cdb5 d6 Fg5 a6 Ca3 b5). Si plusieurs entrées portent
> le même nom, le script retient celle dont la séquence est la plus longue ≤ 16 plis.

## 5. Composants

### 5.1 `tools/build-sicilian-lessons.mjs` (nouveau)

Script Node ESM, même style que `tools/build-openings.mjs`.

**Config en tête** : tableau des 4 cibles `{ id, side:'b', anchorName }`.

**Algorithme, pour chaque cible :**
1. Charger `openings.json`, trouver l'entrée dont `name === anchorName`. Si plusieurs,
   prendre la séquence `uci` la plus longue sans dépasser 16 plis. Récupérer `uci` (ancre)
   et `eco`. Erreur explicite si introuvable.
2. Tant que la ligne courante fait < 16 plis :
   - Interroger `https://explorer.lichess.org/masters?play=<uci joints par des virgules>`.
   - Lire `moves` (trié par popularité). Si vide → **arrêt** (profondeur atteinte = longueur
     courante).
   - Ajouter `moves[0].uci` à la ligne.
3. Émettre `{ id, name: anchorName, eco, side:'b', uci, depthReached: uci.length }`.

**Cache disque** : chaque réponse API est mise en cache dans
`tools/sicilian-src/<clé>.json` où `<clé>` est la séquence `play` (assainie ou hachée).
Au lancement, si le fichier existe, on lit le cache au lieu d'appeler le réseau → les
réexécutions sont hors-ligne et déterministes.

**Politesse réseau** : requêtes séquentielles, délai ~300 ms entre deux appels réseau
(pas pour les hits de cache). Sur HTTP non-OK, lever une erreur claire (avec l'URL).

**Sortie** : `tools/sicilian-draft.json` = tableau des 4 objets ci-dessus, **sans
`comments` ni `summary`**. Log final : pour chaque leçon, `depthReached` et la ligne en UCI.

Le script **ne modifie pas** `lessons.json` (séparation extraction / rédaction).

### 5.2 Étape de rédaction (manuelle)

À partir de `sicilian-draft.json`, l'auteur (assistant) rédige pour chaque leçon :
- `comments` : un commentaire français par demi-coup, `comments.length === uci.length`.
- `summary` : une phrase de synthèse de l'idée de la variante.

Puis fusionne les 4 entrées complètes (`category:'mainline'`) dans `lessons.json`.

**Identifiants** (pour éviter tout doublon d'`id`, interdit par le validateur) :
- `sicilian-najdorf` — **entrée existante mise à jour sur place** (uci prolongé à 16 plis,
  commentaires complétés en conséquence), pas une nouvelle entrée.
- `sicilian-dragon`, `sicilian-sveshnikov`, `sicilian-classical` — **nouvelles entrées**.

### 5.3 `tools/validate-lessons.js` (existant, inchangé)

Porte de qualité exécutée après fusion : vérifie tableau, champs obligatoires, `id` unique,
`category`/`side` valides, **légalité chess.js de chaque ligne**, et
`uci.length === comments.length`.

### 5.4 Groupement du catalogue — `chess.html` + `index.html`

Dans le rendu des résultats de recherche du catalogue (picker des ouvertures) :
- Calculer la **famille** d'une entrée = portion du `name` **avant le premier `:`**
  (ex. `Sicilian Defense: Najdorf Variation` → famille `Sicilian Defense`). Sans `:`, la
  famille est le nom entier.
- Regrouper les résultats sous un **en-tête de famille repliable** ; les variantes de la
  famille sont listées sous l'en-tête.
- Les 4 leçons curées restent listées en tête via le groupe existant `#lessonMainlines`
  (le groupement par famille concerne le **catalogue**, pas les leçons curées).
- `chess.html` et `index.html` doivent rester **identiques** (`diff -q`).

## 6. Flux de données

```
openings.json (ancre nommée)
        │
        ▼
build-sicilian-lessons.mjs ──► API lichess masters (extension, coup le plus joué)
        │                              │
        │                              ▼
        │                        tools/sicilian-src/ (cache disque)
        ▼
tools/sicilian-draft.json (lignes, sans commentaires)
        │
        ▼  (+ commentaires FR rédigés à la main)
lessons.json ──► validate-lessons.js (légalité + schéma)
        │
        ▼
loadLessons() à l'exécution ──► picker (groupe #lessonMainlines)
```

## 7. Tests (Playwright)

**`tests/sicilian.spec.js` (nouveau) :**
- Les 4 leçons (`sicilian-najdorf` mise à jour + dragon + sveshnikov + classique) se
  chargent via `loadLessons`/`__trainTest`.
- Chacune : `category==='mainline'`, `side==='b'`, `uci.length >= 14`,
  `uci.length === comments.length`.

**Groupement catalogue :**
- Une recherche « sicil » dans le catalogue affiche au moins un en-tête de famille
  « Sicilian Defense » (ou son libellé affiché) regroupant plusieurs variantes.

**Baseline :** la suite existante (67 tests) reste verte ; `validate-lessons.js` passe.

## 8. Critères d'acceptation

1. `node tools/build-sicilian-lessons.mjs` produit `sicilian-draft.json` avec 4 lignes,
   chacune ≥ 14 plis, réexécutable hors-ligne grâce au cache.
2. `lessons.json` contient les 4 leçons siciliennes complètes et commentées ; `node
   tools/validate-lessons.js` ne renvoie aucune erreur.
3. Le catalogue groupe ses résultats par famille ; les variantes siciliennes sont
   regroupées sous un en-tête unique.
4. `npx playwright test` est vert (baseline + nouveaux tests).
5. `diff -q chess.html index.html` ne renvoie aucune différence.

## 9. Risques et limites

- **Profondeur variable** : sur certaines variantes l'explorateur masters peut manquer de
  données vers le 16e pli ; le script s'arrête proprement et `depthReached` peut être < 16.
  Le test exige ≥ 14 plis, pas exactement 16.
- **Justesse théorique** : la ligne suivie est « la plus jouée en parties de maîtres », pas
  « la meilleure selon un moteur ». Choix assumé (reproductible et défendable). Relecture
  humaine des commentaires avant publication.
- **Dépendance réseau au premier build** : nécessaire une seule fois ; le cache
  `sicilian-src/` rend ensuite le build hors-ligne.

## 10. Documentation à mettre à jour

- `docs/OUVERTURES.md` : mention des 4 leçons siciliennes et du script
  `build-sicilian-lessons.mjs` (pipeline d'extraction + cache).
- Mémoire projet (`project_chess_tutor.md`) après livraison.
