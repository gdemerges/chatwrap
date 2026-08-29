/**
 * Service worker for the app shell.
 *
 * Two caching strategies, because the two kinds of asset have opposite needs:
 *
 *  • Same-origin app files live at unversioned URLs (`js/app.js`), so a pure
 *    cache-first policy pinned every visitor to whatever code was cached on
 *    their first visit until CACHE_NAME was bumped by hand. They are served
 *    stale-while-revalidate instead: instant from cache, refreshed in the
 *    background, so the next load has the new version.
 *
 *  • CDN scripts are version-pinned in their URL (chart.js@4.4.7), so a new
 *    version is a new URL and therefore a cache miss. Cache-first forever is
 *    correct — and saves a needless revalidation round-trip.
 *
 * ML model weights (huggingface.co) are left alone: hundreds of megabytes,
 * already cached internally by transformers.js.
 */
const CACHE_NAME = 'ww-shell-v8';

const SHELL_ASSETS = [
    'index.html',
    'dashboard.html',
    'manifest.json',
    'favicon.svg',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'fonts/space-grotesk-latin.woff2',
    'fonts/space-grotesk-latin-ext.woff2',
    'css/style.css',
    'css/dashboard.css',
    'js/app.js',
    'js/dashboard.js',
    'js/deck.js',
    'js/worker.js',
    'js/parser.js',
    'js/stats.js',
    'js/payload.js',
    'js/cache.js',
    'js/utils.js',
    'js/format.js',
    'js/i18n.js',
    'js/vendor.js',
    'js/anonymize.js',
    'js/analytics.js',
    'js/config.js',
    'js/demo.js',
    'js/export-image.js',
    'js/export-presets.js',
    'js/ui/toast.js',
    'js/ui/dialog.js',
    'js/ui/period.js',
    'js/ui/share.js',
    'js/ui/hash.js',
    'js/slides/index.js',
    'js/slides/_constants.js',
    'js/slides/_helpers.js',
    'js/slides/_charts.js',
    'js/slides/_card.js',
    'js/slides/overview.js',
    'js/slides/ranking.js',
    'js/slides/time.js',
    'js/slides/words.js',
    'js/slides/emojis.js',
    'js/slides/media.js',
    'js/slides/links.js',
    'js/slides/relationships.js',
    'js/slides/sentiment.js',
    'js/slides/duo.js',
    'js/slides/chapters.js',
    'js/slides/network.js',
    'js/slides/profiles.js',
    'js/slides/_day-why.js',
    'js/lang/stopwords.js',
    'js/lang/chat-locales.js',
    'js/lang/ui/fr.js',
    'js/lang/ui/en.js',
    'js/lang/sentiment.js',
    'js/worker/sentiment-ml.js',
    'js/worker/sentiment-config.js',
    'js/worker/sentiment-aggregates.js',
    'js/worker/day-context.js',
];

const CDN_ASSETS = [
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js',
    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // Shell assets must all land; a CDN hiccup shouldn't fail the install.
        await cache.addAll(SHELL_ASSETS);
        await Promise.allSettled(CDN_ASSETS.map((url) => cache.add(url)));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.hostname === 'huggingface.co') return;

    const sameOrigin = url.origin === self.location.origin;
    event.respondWith(sameOrigin ? staleWhileRevalidate(request) : cacheFirst(request));
});

async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    const network = fetch(request)
        .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
        })
        .catch(() => null);

    if (cached) return cached;
    const fresh = await network;
    if (fresh) return fresh;
    // Offline and never cached: fall back to the shell for a navigation, so a
    // deep link doesn't produce a browser error page.
    if (request.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
    }
    return Response.error();
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
}
