# Chatwrap

Chatwrap turns your WhatsApp conversations into an animated recap — right in your browser,
with nothing ever sent anywhere.

> Chatwrap is an independent project with no affiliation to WhatsApp or Meta. WhatsApp is
> only mentioned to describe the export files the tool can read.

## Features

- **Full analysis**: messages, media, emojis, words, response times, shared links…
- **Chapter-based story**: automatically detects periods where the conversation's rhythm changed
- **Profiles**: an identity card per participant (favorite hour, signature emoji, exclusive word, favorite site)
- **Interaction graph**: who replies to whom, as a chord diagram
- **~30 animated slides**: rankings, charts, heatmaps, fun facts
- **Auto-play**: story mode with a progress bar, like Instagram
- **Image export**: every slide saves as a 1080×1920 PNG, ready to post
- **Printable poster**: the recap in high-resolution A3 or A4, ready for the printer
- **Anonymization**: first names can be replaced with initials before sharing
- **Flexible period**: a single year, the full history, or any date range you pick
- **Dashboard**: a detailed table view, filterable by participant, with CSV / JSON export
- **Sentiment analysis**: by emojis and vocabulary by default, or via local AI as an option
- **Multilingual interface**: French, English, Spanish, German, Portuguese, Italian, Dutch, Indonesian and Turkish — detected from the browser, switchable at any time
- **100% client-side**: no data is ever sent to a server
- **Multi-format**: iOS and Android exports, in French, English, Spanish, German, Portuguese, Italian, Dutch, Indonesian and Turkish

## Usage

### 1. Export your WhatsApp conversation

In WhatsApp:
- Open the conversation or group
- Tap the **three dots** (Android) or the contact's name (iOS)
- **Export chat** → **Without media**

### 2. Load the file

Drag the `.txt` or `.zip` file into the upload area, then pick the period to analyze.

Don't have a file handy? The **"See an example"** button (or the `index.html#demo` URL)
generates a fictional conversation to explore the site with.

### 3. Explore the results

| Action | How |
|---|---|
| Next / previous slide | on-screen arrows, **← →**, swipe, scroll wheel |
| First / last slide | **Start** / **End** |
| Auto-play | **Space**, or the *Auto-play* button |
| Jump to a slide | click on the progress bar at the top |
| Share | *Share* button: slide image, recap image, poster, or link |
| Change language | the selector at the bottom right, next to the theme |

### 4. Print the poster

The *Share → Printable poster* button generates a PNG meant for printing:

| Format | Dimensions | Resolution |
|---|---|---|
| A3 | 2923 × 4134 px | 250 dpi |
| A4 | 2480 × 3508 px | 300 dpi |

The file can be dropped as-is at any print shop. Two useful details:

- **Margins**: content stays ~17 mm from the edges, clear of any common trim zone. The
  background is a full-bleed gradient, so there's no need to add bleed.
- **Color**: the PNG is in sRGB (a canvas can't produce CMYK). Print shops convert it, but
  saturated purples may darken slightly.

A3 is intentionally rendered at 250 dpi instead of 300: at 300 dpi the image exceeds the
canvas size iOS is willing to allocate — and iOS fails *silently*, rendering a blank image.
At arm's length on a wall, the difference is invisible.

## Tests

```bash
npm test          # Vitest — 393 unit and integration tests, under jsdom
npm run test:e2e  # Playwright — the real user journey in Chromium
npm run lint
npm run typecheck
```

jsdom has neither a Web Worker nor canvas, so the three pieces that carry the product —
the worker, Chart.js, and image export — are only exercised by the Playwright suite. It
notably checks that a rendered A4 poster is **opaque almost everywhere**: an oversized
canvas returns a blank image on iOS with no error, and a blank poster looks just like a
successful one until someone opens the PNG.

First run: `npx playwright install chromium`.

## Privacy

Nothing leaves the device: the file is read **as a stream**, parsed and analyzed in a Web
Worker, and the results are cached in IndexedDB. The full text of the conversation never
exists in memory all at once — which also keeps a 50 MB export from getting the tab killed
on a phone.

Two nuances worth knowing:

- **Link sharing** encodes the stats in the URL fragment. A fragment is never sent to a
  server, but it does end up in browser history and in the logs of whatever app it's pasted
  into. First-name anonymization is therefore on by default for links.
- **AI sentiment analysis** is optional and off by default: enabling it downloads models
  from a CDN (~50 MB). Without it, mood is inferred locally from emoji reactions and a
  lexicon — no download.

## Deployment configuration

Everything is optional and **empty by default**: the site makes no outgoing request until
`js/config.js` is filled in. A fork therefore never starts phoning home on its own.

### Tip jar

```js
export const TIP_JAR_URL = 'https://ko-fi.com/your-account';
```

The support link only appears once this value is set.

### Audience measurement

```js
export const ANALYTICS = {
    provider: 'plausible',              // or 'umami'
    host: 'https://stats.example.com',  // your self-hosted instance
    site: 'example.com',                // domain (Plausible) or id (Umami)
};
```

⚠️ **You also need to add `host` to `connect-src`** in the CSP of `index.html` *and*
`dashboard.html`, otherwise every request is blocked and the counter records nothing.

What gets sent, and nothing else: the event name (`pageview`, `analysis`, `poster`,
`share_link`, `share_image`, `export`, `export_data`, `pin_conversation`, `dashboard`,
`parse_error`) and a few technical properties (poster format, data export format, whether
the link was anonymized). **No value derived from a conversation** — not the message count,
not the participant count. The URL is trimmed to its path: the `#share=…` fragment holds the
stats and must never reach an endpoint.

The counter respects Do Not Track, Global Privacy Control, and a local opt-out, and the home
page's privacy notice adapts automatically to the actual state.

## Running locally

No build tool needed. Just a static web server:

```bash
python -m http.server 8000    # or: npx http-server
```

Then open [http://localhost:8000](http://localhost:8000).

```bash
npm test          # Vitest
npm run lint      # ESLint
npm run typecheck # tsc --noEmit over the JSDoc-typed modules
```

## Project structure

```
site/
├── index.html / dashboard.html
├── sw.js                  # service worker (stale-while-revalidate)
├── fonts/                 # self-hosted Space Grotesk (OFL)
├── icons/                 # PWA icons, including a maskable variant
├── css/
└── js/
    ├── app.js             # orchestration: import, worker, screens
    ├── deck.js            # slide navigation, story mode
    ├── worker.js          # parse + stats + cache, off the main thread
    ├── parser.js          # WhatsApp export parser
    ├── stats.js           # statistics computation
    ├── export-image.js    # canvas rendering of shareable images
    ├── anonymize.js       # replacing first names with initials
    ├── i18n.js            # interface language, t(), static HTML translation
    ├── compare.js         # pins a conversation to compare the next one against
    ├── export-data.js     # exporting stats as JSON / CSV
    ├── format.js          # numbers, dates, times and days, per language
    ├── demo.js            # generated sample conversation
    ├── vendor.js          # lazy loading of CDN scripts
    ├── lang/              # dictionaries: ui/ (interface), chat-locales (exports)
    ├── slides/            # one slide per file
    └── ui/                # dialogs, toasts, sharing, URL
                           #   chrome.js: theme + language, shared by both pages
                           #   motion.js: prefers-reduced-motion, outside CSS's reach
```

`tests/` (Vitest) and `e2e/` (Playwright) live at the repo root and are not deployed.

## Tech stack

- **Vanilla JS / HTML / CSS** — no framework, no build step
- **[Chart.js](https://www.chartjs.org/)**, **[LZ-String](https://pieroxy.net/blog/pages/lz-string/index.html)**, **[JSZip](https://stuk.github.io/jszip/)** — loaded on demand from a CDN, version-pinned and SRI-verified
- **[transformers.js](https://huggingface.co/docs/transformers.js)** — only if AI analysis is enabled
- **Space Grotesk** — self-hosted, no request to Google Fonts

## Languages

### Interface

French, English, Spanish, German, Portuguese, Italian, Dutch, Indonesian and Turkish — the
same nine the parser already reads. The language is picked on first load in this order:
saved preference, then `navigator.languages`, then French. The selector at the bottom right
switches it live — the deck is rebuilt at the current slide, with no recomputation.

Adding a language takes three steps: copy `js/lang/ui/fr.js`, translate it, register it in
`LOCALES` (`js/i18n.js`). The tests reject a dictionary whose keys or `{name}` parameters
have drifted from the French one.

### Parsed exports

| Format | Example |
|--------|---------|
| iOS | `[12/03/2024, 14:30:00] Alice: Bonjour` |
| Android | `12/03/2024, 14:30 - Alice: Bonjour` |
| Android US | `03/12/24, 2:30 PM - Alice: Hello` |
| Android DE | `12.03.2024, 14.30 - Anna: Hallo` |
| Android ID | `12/03/2024, 14.30 - Sari: Selamat pagi` |

The labels WhatsApp itself writes ("missing image", "this message was deleted", a poll
header, the encryption notice) are recognized in **French, English, Spanish, German,
Portuguese, Italian, Dutch, Indonesian and Turkish** — see `js/lang/chat-locales.js`.

Day/month order is inferred from the whole file, not from the separator: a European export
with a two-digit year (`12/03/24`) is no longer read as month-first.

### Analyzed conversation

The chat's language is inferred from the words themselves (`detectLanguage`,
`js/lang/stopwords.js`) and drives which stopwords are removed from the word cloud. The
same nine languages are covered: previously everything was scored against French, and the
top words of a Spanish conversation came out as `que, de, la, y`. Words are split using
`\p{L}` rather than a hand-written letter range — `años` used to split into `a` + `os`,
`straße` into `stra` + `e`.
