# Tuteur IA — Documentation de maintenance

Document destiné à quiconque (humain ou IA) doit **maintenir ou améliorer** le mode
« Tuteur IA » de l'application d'échecs. Il décrit l'architecture, où se trouve chaque
morceau, comment tester, les décisions de conception, et la liste des améliorations
possibles.

- **Fichier livré (runtime) :** `chess.html` (fichier HTML unique, JS vanilla + Web Worker).
- **Spec d'origine :** `docs/superpowers/specs/2026-06-03-tuteur-ia-echecs-design.md`
- **Plan d'implémentation :** `docs/superpowers/plans/2026-06-03-tuteur-ia-echecs.md`
- **Tests (dev, non déployés) :** `tests/*.spec.js` (Playwright)
- **Branche git :** `main` (dépôt local, pas de remote). Ajouté le 2026-06-03.

> Règle d'or : **tuteur éteint = application strictement identique à l'origine.** Toute
> évolution doit préserver cette non-régression (cf. `tests/baseline.spec.js`).

---

## 1. Comportement

- Interrupteur **« 🎓 Tuteur IA »** (`#tutorToggle`), éteint par défaut.
- Allumé → panneau `#tutorPane` mis à jour **après chaque coup** :
  - Badge théorique (`#tutorBook`) : « 📖 Coup théorique (dans le livre) » ou « Hors livre ».
  - Évaluation (`#tutorEval` chiffré, `#tutorWords` en mots) + barre (`#tutorEvalFill`).
  - Meilleure ligne (`#tutorLine`) en notation française.
  - Bouton **« ✨ Avis de l'IA »** (`#tutorAskBtn`) : commentaire en prose **à la demande**
    via l'API Claude. Grisé tant qu'aucune clé API n'est saisie.
- Réglages (roue `#tutorSettingsBtn` → `#tutorSettings`) : clé API, modèle, test de connexion.
- Lien **« ← Retour à WIMS »** (`#wimsHome`) → `/wims/wims.cgi`.

---

## 2. Architecture & flux de données

```
Coup joué (humain ou bot)
   └─ render() puis requestAnalysis()            [thread principal]
        └─ worker.postMessage({type:'analyze', state, history})
             └─ analyzePosition()                [Web Worker]
                  ├─ positionInBook()  → isBook
                  ├─ recherche negamax → evalCp (POV Blancs)
                  └─ extractPV()       → pv (coups UCI)
             └─ postMessage({type:'analysis', evalCp, pv, isBook, fromState})
        └─ worker.onmessage → lastAnalysis = données ; renderTutorPanel()
             ├─ formatEval / evalToWords  → éval affichée
             └─ pvToSan(pv, fromState) + formatPvLine → meilleure ligne en français

Bouton « Avis de l'IA »
   └─ askLLM() → fetch api.anthropic.com (clé localStorage)
        avec buildLLMPrompt(lastAnalysis)  → texte affiché dans #tutorLLM
```

Le moteur, le livre Polyglot et la recherche **existaient déjà** ; le tuteur réutilise
`openingBookMove`, `negamax`, `legalMoves`, `applyMove`, `notation`, etc.

---

## 3. Où se trouve quoi dans `chess.html`

Le code est repérable par les bannières `// === TUTEUR IA` et par les noms de fonctions
ci-dessous (préférer une recherche par nom : les numéros de ligne bougent).

### 3a. Côté Web Worker (dans la chaîne `ENGINE_SRC`, avant `self.onmessage`)
- `ANALYZE_TIME_MS` (700), `ANALYZE_DEPTH` (6) : budget de l'analyse.
- `positionInBook(s, history)` : `openingBookMove(...) !== null` (vrai si la position a une
  continuation dans le livre Polyglot ou la table interne).
- `extractPV(s, firstMove, maxLen)` : reconstruit la variante principale en parcourant la
  table de transposition `tt`, en **revalidant chaque coup** via `legalMoves` (ne peut donc
  pas émettre de coup illégal). Borne de sécurité `guard < 40`.
- `analyzePosition(s, history)` : lance la recherche (itérative, comme `bestBotMove`), renvoie
  `{evalCp, pv, isBook, gameOver}`. **`evalCp` est toujours du point de vue des Blancs**
  (`s.turn===WHITE ? bestScore : -bestScore`).
- Routage : branche `if(e.data.type==='analyze')` dans `self.onmessage`, qui poste
  `{type:'analysis', ...a, fromState:e.data.state}`. Le `fromState` permet de rejouer la
  variante sur la position analysée (robuste si l'état courant a avancé).

### 3b. Côté thread principal (dans l'IIFE `(() => { … })()`)
- État : `tutorEnabled`, `lastAnalysis`, `TUTOR_DEFAULT_MODEL` (placés après `let bookData`).
- Réglages : `getTutorSettings()` → `{apiKey, model}` ; `setTutorSetting(key,value)`.
  Clés localStorage : **`tutorApiKey`**, **`tutorModel`**.
- `requestAnalysis(force)` : no-op si `!tutorEnabled && !force` ou worker absent.
- Réception : branche `if(e.data.type==='analysis')` dans `worker.onmessage` (range
  `lastAnalysis`, déclenche le hook de test `onAnalysisForTest`, appelle `renderTutorPanel`).
- Formatage : `MATE_THRESHOLD` (999000), `formatEval(cp)` (`+0,7`, `−1,3`, `0,0`, `#`, `−#`,
  signe moins typographique U+2212), `evalToWords(cp)`.
- Notation française : `SAN_FR={N:'C',B:'F',R:'T',Q:'D',K:'R'}`, `toFrenchSAN(san)`
  (remplace `/[NBRQK]/g` ; sans collision car les lettres de fichier sont minuscules),
  `pvToSan(pvUci, fromState)`, `formatPvLine(sanList, startState)`.
- Affichage : `renderTutorPanel()` (utilise `lastAnalysis.fromState`).
- LLM : `buildLLMPrompt(analysis)` (ancre FEN-libre : coups joués en SAN français, trait,
  éval + mots, meilleure ligne, statut théorique), `askLLM()` (fetch Anthropic).
- Câblage UI : IIFE `wireTutor()` (juste avant `startWorker()`).
- Hook de test : `window.__tutorTest = { … }` (voir §5).
- Appels à `requestAnalysis()` : dans `tryMove`, `completePromo`, le handler de réponse du
  bot (`worker.onmessage`), et `startNewGame`.

### 3c. HTML & CSS
- HTML : lien + interrupteur insérés dans `.score-head` ; panneau `#tutorPane` ajouté dans
  `.right-stack` après `</aside>`.
- CSS : bloc de règles `.wims-home … .tutor-testresult` inséré avant `</style>`.

---

## 4. Appel à l'API Claude

- Endpoint : `POST https://api.anthropic.com/v1/messages`.
- En-têtes : `x-api-key`, `anthropic-version: 2023-06-01`,
  **`anthropic-dangerous-direct-browser-access: true`** (indispensable pour autoriser
  l'appel direct depuis le navigateur, contourne le CORS).
- Corps : `{ model, max_tokens:400, system, messages:[{role:'user', content: buildLLMPrompt(...)}] }`.
- Modèles proposés (menu `#tutorModelInput`) : `claude-haiku-4-5-20251001` (défaut, économique),
  `claude-sonnet-4-6` (qualité). **À mettre à jour quand de nouveaux modèles sortent.**
- Sécurité : la clé est stockée en localStorage du navigateur de l'utilisateur, transmise
  uniquement à `api.anthropic.com`. Avertissement affiché : éviter sur un poste partagé.
  (Choix produit assumé : « chaque utilisateur sa clé, sans serveur ».)
- Gestion d'erreurs : parse JSON protégé (corps non-JSON toléré), message distinct via la
  classe `.error` ; la partie n'est jamais cassée par un échec d'appel.

---

## 5. Tests

```bash
cd /home/wims/public_html/chess
npx playwright test            # toute la suite (16 tests)
npx playwright test tests/helpers.spec.js   # un fichier
```

- `baseline.spec.js` : **garde-fou de non-régression** (plateau, coup humain). À garder vert.
- `helpers.spec.js` : fonctions pures (réglages, `formatEval`, `evalToWords`, `pvToSan`,
  `formatPvLine`).
- `analysis.spec.js` : aller-retour réel avec le worker (`requestAnalysis`).
- `tutor-ui.spec.js` : lien WIMS, interrupteur, affichage, **test « live » bout-en-bout**.
- `llm.spec.js` : `buildLLMPrompt` + appel Claude **intercepté** (`page.route`) + cas d'erreur.

**Pièges connus :**
- Le plateau fonctionne au **glisser-déposer** (pointerdown→move→up). Un simple `click()`
  Playwright **ne déplace pas** les pièces → utiliser le helper `dragPiece(page, from, to)`
  (indices de cases 0=a8 … 63=h1 ; ex. e2=52, e4=36).
- Tester via le serveur HTTP (config Playwright), pas `file://` : le Web Worker est créé
  depuis un Blob et l'app charge `Performance.bin` par `fetch`.
- `window.__tutorTest` expose les fonctions internes pour permettre `page.evaluate(...)`
  (dont `fromFEN` pour construire des positions de test, ex. désambiguïsation SAN).
  Hook `onAnalysisForTest` : callback résolu à la prochaine réponse d'analyse.

---

## 6. Décisions de conception (rappel)

| Sujet | Décision |
|---|---|
| Type d'IA | Hybride : moteur local (base, gratuit, hors-ligne) + LLM optionnel |
| Connexion LLM | Chaque utilisateur colle **sa** clé API ; stockée en localStorage ; appel direct |
| Déclenchement LLM | **À la demande** (bouton), pas automatique à chaque coup |
| Fournisseur | **Claude (Anthropic) uniquement** |
| Périmètre | Tout dans `chess.html`, aucun serveur, aucun nouveau fichier runtime |
| Lien retour | `/wims/wims.cgi` |
| Latence bot tuteur allumé | **Laissée telle quelle** (~0,7 s ajoutés) — choix utilisateur |

---

## 7. Backlog d'améliorations (issu de la relecture de code)

Aucun bug bloquant. Pistes classées :

1. **Latence du bot quand le tuteur est allumé** (~700 ms) : l'analyse et la recherche du
   bot partagent le même worker (FIFO), l'analyse passe avant. *Décision actuelle : laisser
   tel quel.* Alternatives si besoin : réduire `ANALYZE_TIME_MS` ; n'analyser qu'au tour de
   l'humain ; réutiliser la recherche du bot pour l'éval ; ou un 2ᵉ worker dédié à l'analyse.
2. ~~**Désambiguïsation SAN**~~ — **FAIT** (2026-06-03). `notation()` ajoute désormais le
   départ minimal (colonne, sinon rangée, sinon case complète) : `Cbd2`, `T1a2`. Profite
   aussi à l'historique des coups. Tests dans `helpers.spec.js`.
3. **Distance de mat** : `formatEval` affiche `#` sans « mat en N ». `analyzePosition`
   pourrait renvoyer la distance (à partir de `MATE - |score|`).
4. **Badge théorique en bord de livre** : `positionInBook` teste s'il existe une
   *continuation* ; la dernière position d'une ligne connue est donc marquée « Hors livre ».
   Légèrement conservateur. Acceptable.
5. **Throttle / supersession des analyses** : des coups rapides empilent des analyses de
   700 ms sur le worker. Ajouter un drapeau « analyse en cours » + supersession si gênant.
6. **`window.__tutorTest` en production** : utile pour les tests, inoffensif, mais c'est une
   couture de test livrée. Optionnel : la conditionner à `?test=1`.
7. **Isolation du code** : `chess.html` a grossi (~330 lignes). Si le tuteur grossit encore,
   regrouper tout le code tuteur du thread principal en un bloc unique clairement délimité.

---

## 8. Tâches de maintenance courantes

- **Mettre à jour les modèles Claude** : éditer les `<option>` de `#tutorModelInput` et la
  constante `TUTOR_DEFAULT_MODEL`.
- **Changer l'URL de retour WIMS** : attribut `href` de `#wimsHome`.
- **Régler la profondeur/temps d'analyse** : `ANALYZE_TIME_MS`, `ANALYZE_DEPTH` (worker).
- **Ajuster les seuils des mots d'évaluation** : `evalToWords` (30 / 90 / 250 cp).
- **Droits fichier après édition** : si modifié par un autre utilisateur, `sudo chown
  wims:wims chess.html` (voir mémoire « Accès système WIMS »).
- Après toute modif : `npx playwright test` doit rester **16/16 vert** (dont la baseline).
