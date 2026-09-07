# CLAUDE.md

Le projet s'appelle **Chatwrap**. Il lit des exports WhatsApp mais n'a aucun lien avec
WhatsApp ni Meta : ne jamais réintroduire « WhatsApp » dans un nom de produit, un titre ou
un nom de fichier exporté — uniquement dans une phrase descriptive (« tes conversations
WhatsApp »). Les clés de stockage internes (`ww-*`, base `wa-wrapped`) restent inchangées :
elles ne sont visibles de personne, et les renommer invaliderait les préférences et le cache
des utilisateurs existants sans rien apporter.

## Stack
Vanilla JS ES modules, HTML, CSS — pas de framework, pas de build step.
Vitest pour les tests, ESLint pour le lint.

## Règles

- Pas de dépendances npm runtime (Chart.js, LZ-String, JSZip chargés depuis un CDN)
- Les scripts CDN sont chargés **paresseusement** via `js/vendor.js`, jamais par une balise
  `<script>` dans le HTML : rien de tout cela n'est nécessaire pour peindre l'écran d'accueil
- Tout le traitement reste côté client — aucun appel réseau avec des données utilisateur
- Modules ES natifs : `import`/`export`, jamais `require`
- Lancer les tests : `npm test` — les faire passer avant tout commit
  (Vitest ; les tests d'interface tournent sous jsdom via `@vitest-environment jsdom`)
- Lancer les tests de bout en bout : `npm run test:e2e` (Playwright, Chromium).
  jsdom n'a **ni Web Worker ni canvas** : le worker, Chart.js et l'export d'image
  ne sont exercés pour de vrai que là. `npx playwright install chromium` une fois.
- Lancer le lint : `npm run lint`, et les types : `npm run typecheck`
- Serveur local : `python -m http.server 8000` (aucun outil de build)
- `index.html#demo` charge une conversation fictive — pratique pour tester sans export réel

## Fichiers clés

| Fichier | Rôle |
|---|---|
| `js/app.js` | Orchestration : import de fichier, worker, écrans |
| `js/deck.js` | Navigation entre slides, mode lecture automatique |
| `js/worker.js` | Web Worker : lit le fichier **en flux**, parse, calcule, met en cache |
| `js/parser.js` | Parsing des exports WhatsApp (iOS / Android, 9 langues) |
| `js/i18n.js` | Langue de l'interface : `t()`, `setLocale`, traduction du HTML statique |
| `js/format.js` | Nombres, dates, heures, jours — tout ce qui dépend de la langue |
| `js/stats.js` | Calcul de toutes les statistiques |
| `js/slides/` | Une slide par fichier ; `index.js` compose le deck |
| `js/export-image.js` | Rendu canvas des images partageables (story et poster) |
| `js/export-presets.js` | Formats de sortie, calcul dpi→pixels, carte du poster |
| `js/anonymize.js` | Remplacement des prénoms par des initiales |
| `js/export-data.js` | Export des stats en JSON / CSV (partage **et** dashboard) |
| `js/compare.js` | Épingle une conversation pour comparer la suivante (digest en localStorage) |
| `js/vendor.js` | Chargement paresseux des scripts CDN (SRI épinglé) |
| `js/config.js` | Cagnotte et mesure d'audience — vide par défaut |
| `js/analytics.js` | Compteur d'usage anonyme, inerte tant que non configuré |
| `js/ui/` | Dialogues, toasts, feuille de partage, gestion du hash |
| `js/ui/chrome.js` | Mobilier commun aux deux pages : service worker, thème, sélecteur de langue |
| `js/dashboard.js` | Vue tableau de bord |
| `js/lang/ui/` | Dictionnaires d'interface (9 langues) — `fr.js` fait référence |
| `js/lang/chat-locales.js` | Libellés que WhatsApp écrit dans le fichier (médias, notices…) |
| `js/lang/` | Données de langue (stopwords, sentiment) |
| `tests/` | Tests Vitest — voir les fixtures pour les formats de chat supportés |
| `e2e/` | Tests Playwright — worker, Chart.js et canvas dans un vrai navigateur |

## Conventions à respecter

- **Une slide** est un objet `{ gradient, html, card?, chart? }`.
  - `gradient` vient de `THEME` dans `js/slides/_constants.js` : la couleur suit la section du
    deck, elle n'est pas distribuée à la ronde.
  - `card` est la description en données pures pour l'export image. Toute slide qui porte un
    chiffre marquant devrait en avoir une.
  - `chart` reçoit `(ctx, slideEl)` et doit passer par `makeChart` de `js/slides/_charts.js`,
    jamais `new Chart` : le registre gère la destruction et la recoloration au changement de
    thème. Les couleurs de thème s'écrivent `'var(--token)'` dans la config.
- **L'export image** est dessiné en *unités de design* : la largeur vaut toujours 1080, le
  preset fixe l'échelle et le rapport d'aspect. Ne jamais coder une taille en pixels réels —
  un poster A3 est le même code de dessin qu'une story. Tout nouveau format doit rester sous
  `MAX_CANVAS_PIXELS` (iOS rend une image vide, sans erreur, au-delà).
- **Le worker garde les messages** ; le thread principal ne détient jamais le texte du chat.
- **La mesure d'audience** ne transmet jamais rien qui vienne d'une conversation, pas même un
  compte agrégé, et jamais l'URL complète (le fragment `#share=` contient les statistiques).
  Un nouvel événement se déclare dans `js/analytics.js` et se documente dans le README.
- **Le partage par lien** doit rester anonymisable : toute nouvelle statistique portant un nom
  de personne doit survivre au parcours générique de `anonymize.js` (clé *ou* valeur).
- **Aucun texte visible en dur.** Toute chaîne affichée passe par `t('clé')`, et la clé naît
  dans `js/lang/ui/fr.js` avant d'être traduite dans les huit autres. Le HTML statique s'annote `data-i18n`,
  `data-i18n-html` (quand la phrase contient un `<strong>`) ou `data-i18n-attr`. Les tests
  échouent sur une clé manquante, une clé en trop, ou un `{paramètre}` perdu en traduction.
- **Rien de localisé ne monte *ni* ne descend dans le worker.** `stats.js` ne produit que des
  données — `peakDayIndex`, pas « Mardi ». Une erreur qui doit être lue par un humain traverse
  la frontière sous forme de `code` (`err.code = 'tooFewMessages'`), que la page traduit. La
  **progression** suit la même règle : le worker poste `{ code, params }` (clé sous `loading.`),
  jamais une phrase. Un test échoue si un `progress()` contient une espace.
- **Le parseur ne suppose jamais la langue** : les libellés WhatsApp se déclarent dans
  `js/lang/chat-locales.js`, et `MEDIA_BY_TYPE` sert à la fois à reconnaître un média et à le
  ranger dans sa catégorie.
- **Les statistiques de mots non plus.** La langue du chat vient de `detectLanguage`
  (`js/lang/stopwords.js`), qui couvre les mêmes neuf langues, et les mots se découpent avec
  `WORD_CHARS_RE` (`\p{L}`) — jamais une plage de lettres écrite à la main, qui coupait
  `años` en `a` + `os`.
- **Le deck se remplit au fur et à mesure.** `mount` crée les éléments vides ; `fill` y écrit
  le HTML quand la slide arrive à portée (n ± 1). Ce qui doit toucher le balisage d'une slide
  passe par `onSlideReady`, pas par un `querySelector` après `mount`.

## Formats de chat supportés
Détails dans `js/parser.js`. L'ordre jour/mois est **déduit du fichier** (`inferDateOrder`),
pas devine à partir du séparateur.
