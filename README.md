# Chatwrap

Chatwrap analyse tes conversations WhatsApp et en fait une rétrospective animée — directement
dans ton navigateur, sans aucun envoi de données.

> Chatwrap est un projet indépendant, sans lien avec WhatsApp ni avec Meta. Le nom WhatsApp
> n'est mentionné que pour décrire les fichiers d'export que l'outil sait lire.

## Fonctionnalités

- **Analyse complète** : messages, médias, emojis, mots, temps de réponse, liens partagés…
- **Récit en chapitres** : détection automatique des périodes où le rythme de la conversation a changé
- **Profils** : une carte d'identité par participant (heure fétiche, emoji signature, mot exclusif, site favori)
- **Graphe d'interactions** : qui répond à qui, en diagramme d'accords
- **~30 slides animées** : classements, graphiques, heatmaps, anecdotes
- **Lecture automatique** : mode story avec barre de progression, comme sur Instagram
- **Export image** : chaque slide s'enregistre en PNG 1080×1920, prêt à publier
- **Poster imprimable** : le récapitulatif en A3 ou A4 haute résolution, prêt pour l'imprimeur
- **Anonymisation** : les prénoms peuvent être remplacés par des initiales avant tout partage
- **Période libre** : une année, tout l'historique, ou une plage de dates au choix
- **Dashboard** : vue tableau détaillée, filtre par participant, export CSV / JSON
- **Analyse de sentiment** : par emojis et vocabulaire par défaut, par IA locale en option
- **Interface multilingue** : français, anglais, espagnol, allemand, portugais, italien et néerlandais — détectés depuis le navigateur, changeables à tout moment
- **100% client-side** : aucune donnée n'est envoyée à un serveur
- **Multi-format** : exports iOS et Android, en français, anglais, espagnol, allemand, portugais, italien et néerlandais

## Utilisation

### 1. Exporter ta conversation WhatsApp

Dans WhatsApp :
- Ouvre la conversation ou le groupe
- Appuie sur les **trois points** (Android) ou le nom du contact (iOS)
- **Exporter la discussion** → **Sans les médias**

### 2. Charger le fichier

Glisse le fichier `.txt` ou `.zip` dans la zone d'upload, puis choisis la période à analyser.

Pas de fichier sous la main ? Le bouton **« Voir un exemple »** (ou l'URL `index.html#demo`)
génère une conversation fictive pour explorer le site.

### 3. Explorer les résultats

| Action | Comment |
|---|---|
| Slide suivante / précédente | flèches à l'écran, **← →**, swipe, molette |
| Première / dernière slide | **Début** / **Fin** |
| Lecture automatique | **Espace**, ou le bouton *Lecture auto* |
| Aller à une slide | clic sur la barre de progression en haut |
| Partager | bouton *Partager* : image de la slide, image du récap, poster, ou lien |
| Changer de langue | le sélecteur en bas à droite, à côté du thème |

### 4. Imprimer le poster

Le bouton *Partager → Poster à imprimer* génère un PNG destiné à l'impression :

| Format | Dimensions | Résolution |
|---|---|---|
| A3 | 2923 × 4134 px | 250 dpi |
| A4 | 2480 × 3508 px | 300 dpi |

Le fichier se dépose tel quel chez n'importe quel imprimeur. Deux détails utiles :

- **Marges** : le contenu reste à ~17 mm des bords, donc au-delà de toute zone de rognage
  courante. Le fond est un dégradé plein cadre : pas besoin d'ajouter du fond perdu.
- **Colorimétrie** : le PNG est en sRGB (un canvas ne produit pas de CMJN). Les imprimeurs
  convertissent, mais les violets saturés peuvent légèrement s'assombrir.

L'A3 est volontairement à 250 dpi plutôt que 300 : à 300 dpi, l'image dépasse la taille de
canvas qu'iOS accepte d'allouer — et iOS échoue *silencieusement*, en rendant une image
vide. À distance de bras sur un mur, l'écart est invisible.

## Vie privée

Rien ne quitte l'appareil : le fichier est lu **en flux**, parsé et analysé dans un Web
Worker, et les résultats sont mis en cache dans IndexedDB. Le texte complet de la
conversation n'existe à aucun moment en entier en mémoire — ce qui évite aussi qu'un export
de 50 Mo fasse tuer l'onglet sur un téléphone.

Deux nuances à connaître :

- **Le partage par lien** encode les statistiques dans le fragment d'URL. Un fragment n'est
  jamais transmis au serveur, mais il finit dans l'historique du navigateur et dans les logs
  de l'application où il est collé. L'anonymisation des prénoms est donc activée par défaut
  pour les liens.
- **L'analyse de sentiment par IA** est optionnelle et désactivée par défaut : l'activer
  télécharge les modèles depuis un CDN (~50 Mo). Sans elle, l'ambiance est déduite localement
  des réactions emoji et d'un lexique — aucun téléchargement.

## Configuration du déploiement

Tout est optionnel et **vide par défaut** : le site ne fait aucune requête sortante tant que
`js/config.js` n'est pas renseigné. Un fork ne se met donc jamais à téléphoner tout seul.

### Cagnotte

```js
export const TIP_JAR_URL = 'https://ko-fi.com/ton-compte';
```

Le lien de soutien n'apparaît que si cette valeur est renseignée.

### Mesure d'audience

```js
export const ANALYTICS = {
    provider: 'plausible',              // ou 'umami'
    host: 'https://stats.exemple.fr',   // ton instance auto-hébergée
    site: 'exemple.fr',                 // domaine (Plausible) ou id (Umami)
};
```

⚠️ **Il faut aussi ajouter `host` à `connect-src`** dans la CSP de `index.html` *et* de
`dashboard.html`, sinon toutes les requêtes sont bloquées et le compteur n'enregistre rien.

Ce qui est envoyé, et rien d'autre : le nom de l'événement (`pageview`, `analysis`, `poster`,
`share_link`, `share_image`, `export`, `export_data`, `pin_conversation`, `dashboard`,
`parse_error`) et quelques
propriétés techniques (format du poster, format de l'export de données, lien anonymisé ou non). **Aucune valeur issue d'une conversation** —
ni le nombre de messages, ni le nombre de participants. L'URL est réduite à son chemin : le
fragment `#share=…` contient les statistiques et ne doit jamais atteindre un endpoint.

Le compteur respecte Do Not Track, Global Privacy Control et un refus local, et la note de
confidentialité de la page d'accueil s'adapte automatiquement à l'état réel.

## Lancer en local

Aucun outil de build nécessaire. Il suffit d'un serveur web statique :

```bash
python -m http.server 8000    # ou : npx http-server
```

Puis ouvre [http://localhost:8000](http://localhost:8000).

```bash
npm test          # Vitest
npm run lint      # ESLint
npm run typecheck # tsc --noEmit sur les modules typés en JSDoc
```

## Structure du projet

```
site/
├── index.html / dashboard.html
├── sw.js                  # service worker (stale-while-revalidate)
├── fonts/                 # Space Grotesk auto-hébergé (OFL)
├── icons/                 # icônes PWA, dont une variante maskable
├── css/
└── js/
    ├── app.js             # orchestration : import, worker, écrans
    ├── deck.js            # navigation entre slides, mode story
    ├── worker.js          # parse + stats + cache, hors du thread principal
    ├── parser.js          # parseur des exports WhatsApp
    ├── stats.js           # calcul des statistiques
    ├── export-image.js    # rendu canvas des images partageables
    ├── anonymize.js       # remplacement des prénoms par des initiales
    ├── i18n.js            # langue de l'interface, t(), traduction du HTML statique
    ├── compare.js         # épingle une conversation pour comparer la suivante
    ├── export-data.js     # export des stats en JSON / CSV
    ├── format.js          # nombres, dates, heures et jours selon la langue
    ├── demo.js            # conversation d'exemple générée
    ├── vendor.js          # chargement paresseux des scripts CDN
    ├── lang/              # dictionnaires : ui/ (interface), chat-locales (exports)
    ├── slides/            # une slide par fichier
    └── ui/                # dialogues, toasts, partage, URL
```

## Stack technique

- **Vanilla JS / HTML / CSS** — pas de framework, pas d'étape de build
- **[Chart.js](https://www.chartjs.org/)**, **[LZ-String](https://pieroxy.net/blog/pages/lz-string/index.html)**, **[JSZip](https://stuk.github.io/jszip/)** — chargés à la demande depuis un CDN, épinglés par version et vérifiés par SRI
- **[transformers.js](https://huggingface.co/docs/transformers.js)** — uniquement si l'analyse IA est activée
- **Space Grotesk** — auto-hébergée, aucune requête vers Google Fonts

## Langues

### De l'interface

Français, anglais, espagnol, allemand, portugais, italien et néerlandais — les sept que le
parseur sait déjà lire. La langue est choisie au premier chargement dans l'ordre suivant :
préférence enregistrée, puis `navigator.languages`, puis français. Le sélecteur en bas à
droite la change à chaud — le deck est reconstruit sur la slide en cours, sans recalcul.

Ajouter une langue tient en trois gestes : copier `js/lang/ui/fr.js`, le traduire, l'inscrire
dans `LOCALES` (`js/i18n.js`). Les tests refusent un dictionnaire dont les clés ou les
paramètres `{nom}` ont dérivé du français.

### Des exports lus

| Format | Exemple |
|--------|---------|
| iOS | `[12/03/2024, 14:30:00] Alice: Bonjour` |
| Android | `12/03/2024, 14:30 - Alice: Bonjour` |
| Android US | `03/12/24, 2:30 PM - Alice: Hello` |
| Android DE | `12.03.2024, 14.30 - Anna: Hallo` |

Les libellés que WhatsApp écrit lui-même (« image absente », « ce message a été supprimé »,
l'en-tête d'un sondage, la notice de chiffrement) sont reconnus en **français, anglais,
espagnol, allemand, portugais, italien et néerlandais** — voir `js/lang/chat-locales.js`.

L'ordre jour/mois est déduit du fichier entier, pas du séparateur : un export européen avec
année sur deux chiffres (`12/03/24`) n'est plus lu comme du mois-en-premier.

### De la conversation analysée

La langue du chat est déduite des mots eux-mêmes (`detectLanguage`, `js/lang/stopwords.js`)
et pilote les mots vides retirés du nuage de vocabulaire. Les mêmes sept langues sont
couvertes : avant, tout était scoré contre le français, et le top mots d'une conversation
espagnole était `que, de, la, y`. Les mots sont découpés avec `\p{L}` plutôt qu'avec une
plage de lettres françaises — `años` se coupait en `a` + `os`, `straße` en `stra` + `e`.
