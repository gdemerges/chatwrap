/**
 * Worker entry.
 *
 * The worker owns the heavy data end-to-end: it reads the file, parses it,
 * keeps the parsed messages, hits the IndexedDB cache and computes the stats.
 * The main thread never holds the chat text.
 *
 * Protocol
 *   → { kind: 'load', blob }              ← { kind: 'years', years, yearCounts, bounds }
 *   → { kind: 'stats', year, range, ai }  ← { kind: 'stats', stats, comparison, cached }
 *   → { kind: 'reset' }                   (drops the retained parse)
 *   ←  { kind: 'progress', code, params? }   (key under `loading.`, never a sentence)
 *   ←  { kind: 'error', message, code, diagnostics? }   (page translates `code`)
 */

import { createStreamParser } from './parser.js';
import { compute, compareYears } from './stats.js';
import { computeSentimentML } from './worker/sentiment-ml.js';
import { createHasher, getCached, setCached } from './cache.js';
import { ensureChronological, sliceByTime } from './utils.js';

/** @type {import('./types.d.ts').Message[] | null} */
let messages = null;
/** Hash of the loaded file — the cache-key prefix for every derived result. */
let fileHash = null;

const post = (msg) => self.postMessage(msg);

/** Tag an error with a stable code the UI can translate. @see js/parser.js */
const coded = (err, code) => Object.assign(err, { code });
/**
 * Progress crosses the worker boundary as a key, never as a sentence: the
 * worker names the step, the page words it.
 *
 * @param {string} code  key under `loading.` in the UI dictionaries
 * @param {Record<string, string|number>} [params]
 */
const progress = (code, params) => post({ kind: 'progress', code, params });

self.onmessage = async (e) => {
    const msg = e.data || {};
    try {
        switch (msg.kind) {
            case 'load':   await handleLoad(msg); break;
            case 'stats':  await handleStats(msg); break;
            case 'reset':  messages = null; fileHash = null; break;
            default: throw new Error(`Message worker inconnu: ${msg.kind}`);
        }
    } catch (err) {
        post({
            kind: 'error',
            message: err.message,
            code: err.code || null,
            diagnostics: err.diagnostics || null,
        });
    }
};

/**
 * Read, fingerprint and parse the export in one pass over the byte stream.
 *
 * Never holds more than one chunk plus the parser's own buffers — a full
 * `blob.text()` copy gets the tab killed on a phone for large exports.
 */
async function handleLoad({ blob }) {
    progress('readingPct', { pct: 0 });

    const parser = createStreamParser();
    const hasher = createHasher();

    for await (const { chunk, done } of readChunks(blob)) {
        hasher.push(chunk);
        parser.push(chunk);
        progress('readingPct', { pct: done });
    }

    progress('parsing');
    fileHash = await hasher.digest();
    // Sorted once, here, and never again: every selection below is a binary
    // search on this order, and `compute` recognises it and skips its own sort.
    messages = ensureChronological(parser.end());

    if (messages.length === 0) {
        const err = new Error('Aucun message exploitable dans ce fichier.');
        err.code = 'noMessages';
        err.diagnostics = parser.diagnostics(); // lets the error screen say *why*
        throw err;
    }

    const yearCounts = {};
    for (const m of messages) {
        const y = m.datetime.getFullYear();
        yearCounts[y] = (yearCounts[y] || 0) + 1;
    }
    const years = Object.keys(yearCounts).map(Number).sort((a, b) => b - a);

    post({
        kind: 'years',
        years,
        yearCounts,
        bounds: {
            from: messages[0].datetime.toISOString(),
            to: messages[messages.length - 1].datetime.toISOString(),
        },
    });
}

async function handleStats({ year = null, range = null, ai = false }) {
    if (!messages) throw coded(new Error('Aucun fichier chargé.'), 'noFile');

    const selection = selectMessages(messages, year, range);
    if (selection.length < 5) throw coded(new Error('Trop peu de messages sur cette période.'), 'tooFewMessages');

    const cacheKey = `${fileHash}|y=${year}|r=${range ? range.from + '_' + range.to : ''}|ai=${ai ? 1 : 0}`;
    const cached = await getCached(cacheKey);
    if (cached) {
        progress('restoring');
        post({ kind: 'stats', stats: cached.stats, comparison: cached.comparison, cached: true });
        return;
    }

    progress('computing');
    const stats = compute(selection);
    const comparison = buildComparison(messages, stats, year, range);

    stats.sentiment = await computeSentimentML(selection, stats.lang, progress, { useML: ai });

    setCached(cacheKey, { stats, comparison });
    post({ kind: 'stats', stats, comparison, cached: false });
}

/**
 * Yield decoded chunks of a blob along with progress, falling back to a single
 * chunk where streams are unavailable (older Safari).
 *
 * @param {Blob} blob
 */
async function* readChunks(blob) {
    if (typeof blob.stream !== 'function') {
        yield { chunk: await blob.text(), done: 100 };
        return;
    }
    // Decoding is driven by hand rather than through TextDecoderStream so the
    // *byte* count stays available — the only figure that maps to the file
    // size the user sees.
    const reader = blob.stream().getReader();
    const decoder = new TextDecoder('utf-8');
    const total = blob.size || 1;
    let read = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            read += value.byteLength;
            const chunk = decoder.decode(value, { stream: true });
            if (chunk) yield { chunk, done: Math.min(99, Math.round((read / total) * 100)) };
        }
    } finally {
        reader.releaseLock();
    }
    const rest = decoder.decode();
    if (rest) yield { chunk: rest, done: 100 };
}

/**
 * Filter by explicit date range if given, else by year, else everything.
 *
 * `messages` is chronological, so both ends are a binary search rather than a
 * full scan. Year bounds use the local-time constructor to match
 * `getFullYear()`, which built the year list.
 */
function selectMessages(all, year, range) {
    if (range) {
        const from = new Date(range.from).getTime();
        // The range is inclusive at both ends; `sliceByTime` is half-open.
        return sliceByTime(all, from, new Date(range.to).getTime() + 1);
    }
    if (year != null) {
        return sliceByTime(all, new Date(year, 0, 1).getTime(), new Date(year + 1, 0, 1).getTime());
    }
    return all;
}

/**
 * Comparison baseline: the previous calendar year, or — for a custom range —
 * the window of equal length immediately before it.
 */
function buildComparison(all, stats, year, range) {
    let previous;
    if (range) {
        const from = new Date(range.from).getTime();
        const span = new Date(range.to).getTime() - from;
        previous = sliceByTime(all, from - span - 1, from);
    } else if (year != null) {
        previous = sliceByTime(all, new Date(year - 1, 0, 1).getTime(), new Date(year, 0, 1).getTime());
    } else {
        return null;
    }
    if (previous.length < 20) return null;
    return compareYears(stats, compute(previous));
}
