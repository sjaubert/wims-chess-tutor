# Bilan de niveau & Elo estimé — Spécification

**Date :** 2026-06-04
**Fichier cible :** `/home/wims/public_html/chess/chess.html`
**Demandeur :** S. Jaubert

## 1. Objectif

À la **fin d'une partie classique** (mode « Partie libre »), afficher un **bilan de niveau**
estimant, **pour chacun des deux camps** (le joueur et l'ordinateur), un **Elo indicatif**, un
**pourcentage de précision**, et le **compte des bourdes / erreurs / imprécisions** — à partir
de la qualité des coups joués (perte en centipions par rapport au meilleur coup du moteur).

> **Cadre assumé :** un Elo calculé sur **une seule partie** est une **estimation indicative**,
> pas un classement officiel (qui se construit sur de nombreuses parties). Le bilan l'affiche
> explicitement.

## 2. Décisions de conception (validées)

| Sujet | Choix |
|---|---|
| Type d'estimation | **Par partie**, fondée sur la qualité des coups (pas de classement persistant) |
| Cibles | **Les deux camps** (joueur ET bot), même méthode |
| Moment | **En fin de partie** (mat, abandon, pat/nulle). Indépendant du Tuteur IA (marche allumé ou éteint) |
| Contenu | Elo estimé **+** précision % **+** compteurs bourdes / erreurs / imprécisions, par camp |
| Méthode d'obtention | **Analyse post-partie** dans le worker (approche A) |

## 3. Méthode de calcul

### 3.1 Évaluations
On rejoue l'historique pour obtenir la suite des positions `P₀ … P_N` (N = nombre de demi-coups).
Le worker évalue **chaque position une seule fois** : `eval(Pᵢ)` en centipions, **du point de
vue du camp au trait**, jeu optimal supposé (réutilise `analyzePosition`). Budget d'analyse
**modéré et fixe** par position (rapide ; constante dédiée, ex. profondeur réduite / temps court),
distinct du budget du Tuteur.

### 3.2 Perte par coup (centipawn loss)
Pour le coup menant de `Pᵢ` à `Pᵢ₊₁`, joué par le camp au trait en `Pᵢ` :

```
perte = clamp( evalCamp(Pᵢ) − evalCamp(Pᵢ₊₁), 0, CP_CAP )
```

où `evalCamp(X)` est l'éval **du point de vue du camp qui jouait en Pᵢ** (on inverse le signe
si nécessaire entre les deux positions, car le trait change). `CP_CAP` (ex. 1000) neutralise les
scores de mat.

### 3.3 Coups exclus
Sont **exclus** du calcul (ni perte, ni compteur) :
- les coups **dans le livre d'ouvertures / théorie** (`positionInBook`) — comme lichess ;
- les coups **forcés** (une seule réponse légale en `Pᵢ`).

### 3.4 Indicateurs par camp (sur ses coups retenus)
- **ACPL** = moyenne des pertes.
- **Elo estimé** = mapping décroissant, borné, de l'ACPL :
  `elo = clamp( round( 3000 · e^(−ACPL/120) ), 400, 2800 )`.
  Constantes (`3000`, `120`, bornes) **ajustables** ; libellé « estimation indicative ».
- **Précision %** = formule de type lichess :
  - centipions → % de victoire : `win% = 50 + 50·( 2/(1+e^(−0.00368208·cp)) − 1 )` ;
  - précision d'un coup = `clamp( 103.1668·e^(−0.04354·Δwin%) − 3.1669, 0, 100 )`
    où `Δwin%` est la baisse de % de victoire du point de vue du camp ;
  - précision du camp = moyenne sur ses coups retenus.
- **Compteurs** par seuils de perte (centipions, **ajustables**) :
  - imprécision : `50 ≤ perte < 100`
  - erreur : `100 ≤ perte < 200`
  - bourde : `perte ≥ 200`

Cas limite : si un camp n'a **aucun coup retenu** (partie 100 % théorique / très courte), on
affiche « — » (pas d'estimation) plutôt qu'un chiffre trompeur.

## 4. Architecture & unités

### 4.1 Module pur (sans DOM, testable)
Fonctions isolées, exposées sur `window.__bilanTest` :
- `cpLoss(evalBeforeCamp, evalAfterCamp, cap)` → perte plafonnée.
- `winPercent(cp)` → % de victoire.
- `moveAccuracy(deltaWinPct)` → précision d'un coup (0–100).
- `classifyLoss(perte)` → `'blunder' | 'mistake' | 'inaccuracy' | 'ok'`.
- `acplToElo(acpl)` → Elo estimé borné.
- `computeBilan(history, evals, opts)` → `{ white:{elo,accuracy,acpl,blunders,mistakes,inaccuracies,counted}, black:{…} }`.
  Gère l'exclusion livre/coups forcés et l'inversion de signe entre positions.

### 4.2 Worker
Nouveau message `{ type:'bilan', positions:[…] }` → évalue chaque position au budget dédié,
**poste la progression** (`{type:'bilanProgress', done, total}`) puis le résultat
(`{type:'bilanResult', evals:[…]}`). N'altère pas le flux d'analyse du Tuteur.

### 4.3 UI
- Déclenchement : à la **fin de partie** en mode `play` (mat, abandon, nulle/pat), on lance le
  calcul du bilan.
- Pendant le calcul : indicateur **« Analyse de la partie… x/y »**.
- Affichage : panneau **« Bilan de la partie »** en **overlay** (style cohérent avec la boîte de
  promotion `promo-overlay`), **deux colonnes** : **Vous** / **Ordinateur**. Chaque colonne :
  Elo estimé, précision %, et bourdes / erreurs / imprécisions. Mention en pied :
  « estimation indicative sur une seule partie ». Bouton **Fermer**.
- Le bilan n'interfère pas avec le scoreboard existant (W-L-D) ni avec « Nouvelle partie ».

## 5. Tests (Playwright — garder la baseline verte)

**Unitaires** (via `window.__bilanTest`) :
- `cpLoss` plafonne et ne descend jamais sous 0 ; gère l'inversion de signe.
- `acplToElo` est **monotone décroissant** et borné (ACPL 0 → ~2800 ; ACPL élevé → ~400).
- `classifyLoss` respecte les seuils (49→ok, 50→imprécision, 100→erreur, 200→bourde).
- `winPercent` / `moveAccuracy` : valeurs aux bornes plausibles (éval nulle → ~50 % ; gros
  avantage → proche 100 %).
- `computeBilan` : exclut les coups du livre et les coups forcés ; compteurs cohérents sur un
  historique fabriqué.

**Intégration** :
- Jouer une courte partie jusqu'au **mat**, vérifier que l'overlay **« Bilan de la partie »**
  apparaît, avec un Elo dans les bornes et des compteurs cohérents pour les deux camps.
- **Non-régression** : jeu normal, mode entraînement, Tuteur, annuler — suite existante verte.

## 6. Hors périmètre (YAGNI)

- Pas de **classement Elo persistant** entre parties (pourra venir dans une v2).
- Pas d'estimation **en direct** coup par coup (uniquement en fin de partie).
- Pas de bilan en **mode entraînement** (drills).
- Pas de graphique d'évaluation ni d'export PGN.
- Pas de commentaire IA dans le bilan (le Tuteur le fournit déjà à la demande).
