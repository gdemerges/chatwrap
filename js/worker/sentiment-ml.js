import { COMPLIMENT, INSULT } from '../lang/sentiment.js';
import {
    SENTIMENT_MODEL, IRONY_MODEL, SENTIMENT_REVISION, IRONY_REVISION,
    SAMPLE_PER_AUTHOR_GPU, SAMPLE_PER_AUTHOR_CPU, MAX_TOTAL_GPU, MAX_TOTAL_CPU,
    MIN_CHARS, MAX_CHARS, BATCH_GPU, BATCH_CPU, STRONG, IRONY_FLIP_WEIGHT,
    EMOJI_POLARITY, lexicalSarcasm,
} from './sentiment-config.js';
import { newAggregator, buildResult } from './sentiment-aggregates.js';
import { buildDayContexts } from './day-context.js';

const TRANSFORMERS_DIST = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2/dist/';

/**
 * Everything executed from the CDN is checked against a pinned hash, like the
 * scripts in `js/vendor.js`. This code runs next to the chat text, so it is
 * the last place to trust whatever jsDelivr happens to serve.
 *
 * A dynamic `import()` cannot carry an `integrity` attribute, so each file is
 * fetched with one — the browser rejects a mismatch — and imported from a
 * blob URL. The ONNX runtime would otherwise fetch its own glue script and
 * WebAssembly from the CDN, unchecked; handing it verified blob URLs through
 * `wasmPaths` closes that gap too.
 */
const SRI = {
    lib: {
        file: 'transformers.min.js',
        integrity: 'sha384-G1EJHfr5gbjkceaa8ZspGjLIAgIIb0/8KUzIEo6hAgAtJ4R2EKhcfp35K2Yziqq/',
        type: 'text/javascript',
    },
    ortMjs: {
        file: 'ort-wasm-simd-threaded.jsep.mjs',
        integrity: 'sha384-7GJqH5vc83Yt7VHwrMXTM8bNCrt/e/8eCtok8zlB2u5dwqmhzSakzCkQWrfYGRN4',
        type: 'text/javascript',
    },
    ortWasm: {
        file: 'ort-wasm-simd-threaded.jsep.wasm',
        integrity: 'sha384-u/bDsx39c+wt0LbHmOCydxt4fyiig3118hQgOTfOvrfkgScM4hRo2IwTtlxyoI02',
        type: 'application/wasm',
    },
};

async function verifiedBlobUrl({ file, integrity, type }) {
    const res = await fetch(TRANSFORMERS_DIST + file, { integrity, mode: 'cors' });
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    const blob = new Blob([await res.arrayBuffer()], { type });
    return URL.createObjectURL(blob);
}

/**
 * transformers.js is imported lazily: a static import pulled the library over
 * the network as soon as the worker booted, even for users who never turn the
 * AI analysis on.
 */
let _transformers = null;
async function getPipeline() {
    if (!_transformers) {
        _transformers = (async () => {
            const [lib, mjs, wasm] = await Promise.all(
                [SRI.lib, SRI.ortMjs, SRI.ortWasm].map(verifiedBlobUrl));
            const mod = await import(/* @vite-ignore */ lib);
            mod.env.allowLocalModels = false;
            mod.env.backends.onnx.wasm.wasmPaths = { mjs, wasm };
            return mod;
        })();
        // A network failure must not poison every later attempt.
        _transformers.catch(() => { _transformers = null; });
    }
    return (await _transformers).pipeline;
}

let _sentClassifier = null;
let _ironyClassifier = null;
let _device = null;

async function detectDevice() {
    if (_device) return _device;
    const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
    if (hasWebGPU) {
        // No usable GPU is reported as a `null` adapter, not as an exception —
        // treating that as WebGPU sent blocklisted GPUs and headless browsers
        // to a backend that could not start, and the AI analysis was dropped.
        try {
            if (await navigator.gpu.requestAdapter()) { _device = 'webgpu'; return _device; }
        } catch { /* fall through */ }
    }
    _device = 'wasm';
    return _device;
}

async function loadSentiment(device, onProgress) {
    if (_sentClassifier) return _sentClassifier;
    const pipeline = await getPipeline();
    _sentClassifier = await pipeline('text-classification', SENTIMENT_MODEL, {
        revision: SENTIMENT_REVISION,
        device,
        dtype: device === 'webgpu' ? 'fp32' : 'q8',
        progress_callback: (info) => {
            if (info.status === 'progress' && typeof info.progress === 'number') {
                onProgress('sentimentModel', { pct: Math.round(info.progress) });
            }
        },
    });
    return _sentClassifier;
}

async function loadIrony(device, onProgress) {
    if (_ironyClassifier === false) return null;
    if (_ironyClassifier) return _ironyClassifier;
    try {
        const pipeline = await getPipeline();
        _ironyClassifier = await pipeline('text-classification', IRONY_MODEL, {
            revision: IRONY_REVISION,
            device,
            dtype: device === 'webgpu' ? 'fp32' : 'q8',
            progress_callback: (info) => {
                if (info.status === 'progress' && typeof info.progress === 'number') {
                    onProgress('ironyModel', { pct: Math.round(info.progress) });
                }
            },
        });
        return _ironyClassifier;
    } catch (err) {
        console.warn('Irony model unavailable, using lexical fallback:', err);
        _ironyClassifier = false;
        return null;
    }
}

/**
 * Pick up to `n` items from an array of {text, dt, prevAuthor},
 * biased toward longer messages, spread across 3 timeline thirds.
 */
function selectSample(items, n) {
    if (items.length <= n) return items.slice();
    const third = Math.ceil(items.length / 3);
    const buckets = [
        items.slice(0, third),
        items.slice(third, third * 2),
        items.slice(third * 2),
    ].map(b => [...b].sort((a, b) => b.text.length - a.text.length));
    const out = [];
    let i = 0;
    while (out.length < n) {
        let added = false;
        for (const b of buckets) {
            if (i < b.length && out.length < n) { out.push(b[i]); added = true; }
        }
        if (!added) break;
        i++;
    }
    return out;
}

function polarityFromScores(scores) {
    if (!scores) return 0;
    let flat;
    if (Array.isArray(scores)) {
        flat = (scores.length > 0 && Array.isArray(scores[0])) ? scores[0] : scores;
    } else if (typeof scores === 'object' && 'label' in scores) {
        flat = [scores];
    } else {
        return 0;
    }
    let pos = 0, neg = 0;
    for (const item of flat) {
        if (!item || typeof item.label !== 'string') continue;
        const l = item.label.toLowerCase();
        const s = Number(item.score) || 0;
        if (l === 'label_2' || l.startsWith('pos')) pos = Math.max(pos, s);
        else if (l === 'label_0' || l.startsWith('neg')) neg = Math.max(neg, s);
    }
    return pos - neg;
}

function isIrony(scores) {
    if (!scores) return false;
    const flat = Array.isArray(scores) && Array.isArray(scores[0]) ? scores[0]
               : Array.isArray(scores) ? scores : [scores];
    for (const item of flat) {
        if (!item || typeof item.label !== 'string') continue;
        const l = item.label.toLowerCase();
        if ((l === 'irony' || l === 'label_1') && (Number(item.score) || 0) > 0.6) return true;
    }
    return false;
}

async function classifyBatched(classifier, texts, batchSize, topK, mapFn, onProgressTick) {
    const out = new Array(texts.length);
    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        let results;
        try {
            results = await classifier(batch, { top_k: topK });
        } catch {
            results = [];
            for (const t of batch) {
                try { results.push(await classifier(t, { top_k: topK })); }
                catch { results.push(null); }
            }
        }
        for (let j = 0; j < batch.length; j++) {
            const r = results[j];
            out[i + j] = r ? mapFn(r) : null;
        }
        onProgressTick(batch.length);
    }
    return out;
}

/**
 * @param {any[]} messages
 * @param {string} lang
 * @param {(code: string, params?: Record<string, string|number>) => void} onProgress
 * @param {{ useML?: boolean }} [options] `useML: false` keeps everything local:
 *   reaction polarity and the compliment/insult lexicon still run, but the
 *   ~50 MB of transformer weights are never fetched. Opt-in by design — on a
 *   phone that download is the single most expensive thing the app can do.
 */
export async function computeSentimentML(messages, lang, onProgress, options = {}) {
    const useML = options.useML !== false;
    const byAuthor = {};
    const categorical = {};
    const reactionStats = {};
    const agg = newAggregator();

    let prevTurnAuthor = null;

    for (const m of messages) {
        if (m.isReaction) {
            const pol = EMOJI_POLARITY[m.reactionEmoji];
            if (typeof pol === 'number') {
                const reactor = m.author;
                const target  = prevTurnAuthor;
                const sent     = (reactionStats[reactor] ??= { sent: { sum: 0, count: 0 }, received: { sum: 0, count: 0 } }).sent;
                sent.sum += pol; sent.count++;
                if (target && target !== reactor) {
                    const rec = (reactionStats[target] ??= { sent: { sum: 0, count: 0 }, received: { sum: 0, count: 0 } }).received;
                    rec.sum += pol; rec.count++;
                }
                agg.addEvent(reactor, m.datetime, pol, (target && target !== reactor) ? target : null);
            }
            continue;
        }
        if (!m.message) continue;

        if (!m.isMedia) {
            const cat = categorical[m.author] ??= { compliment: 0, insult: 0, words: 0 };
            for (const w of m.message.toLowerCase().split(/\s+/)) {
                if (COMPLIMENT.has(w)) cat.compliment++;
                if (INSULT.has(w)) cat.insult++;
                cat.words++;
            }
            if (m.message.length >= MIN_CHARS) {
                (byAuthor[m.author] ??= []).push({
                    text: m.message,
                    dt: m.datetime,
                    prevAuthor: prevTurnAuthor !== m.author ? prevTurnAuthor : null,
                });
            }
        }
        prevTurnAuthor = m.author;
    }

    const authors = Object.keys(byAuthor);
    const reactionAuthors = Object.keys(reactionStats);
    const allAuthors = Array.from(new Set([...authors, ...reactionAuthors]));

    if (authors.length === 0 || !useML) {
        return buildResult(allAuthors, categorical, {}, reactionStats,
            withDayContexts(agg.finalize(), messages, lang), { mlEnabled: false, device: null });
    }

    onProgress('detectingDevice');
    const device = await detectDevice();

    const samplePerAuthor = device === 'webgpu' ? SAMPLE_PER_AUTHOR_GPU : SAMPLE_PER_AUTHOR_CPU;
    const maxTotal       = device === 'webgpu' ? MAX_TOTAL_GPU       : MAX_TOTAL_CPU;
    const batchSize      = device === 'webgpu' ? BATCH_GPU           : BATCH_CPU;
    const budgetPerAuthor = Math.max(10, Math.min(samplePerAuthor, Math.floor(maxTotal / authors.length)));

    let sentClassifier;
    try {
        sentClassifier = await loadSentiment(device, onProgress);
    } catch (err) {
        console.error(`[sentiment] model failed on ${device}:`, err);
        // The user sees a plain sentence; the console keeps the detail.
        onProgress('sentimentFallback');
        return buildResult(allAuthors, categorical, {}, reactionStats,
            withDayContexts(agg.finalize(), messages, lang), { mlEnabled: false, device, error: String(err) });
    }

    let ironyClassifier = null;
    if (lang === 'en') ironyClassifier = await loadIrony(device, onProgress);

    const samples = {};
    let totalSamples = 0;
    for (const author of authors) {
        samples[author] = selectSample(byAuthor[author], budgetPerAuthor)
            .map(item => ({ ...item, text: item.text.slice(0, MAX_CHARS) }));
        totalSamples += samples[author].length;
    }

    const totalSteps = totalSamples * (ironyClassifier ? 2 : 1);
    let done = 0;
    const tick = (n) => {
        done += n;
        onProgress('sentimentPct', { pct: Math.round(done / totalSteps * 100) });
    };

    const polarity = {};

    for (const author of authors) {
        const items = samples[author];
        const texts = items.map(item => item.text);

        const polarities = await classifyBatched(sentClassifier, texts, batchSize, 3, polarityFromScores, tick);

        let ironyFlags = null;
        if (ironyClassifier) {
            ironyFlags = await classifyBatched(ironyClassifier, texts, batchSize, 2, isIrony, tick);
        }

        let pos = 0, neg = 0, strongPos = 0, strongNeg = 0;
        let count = 0, sumNorm = 0, sumAbs = 0, sumSq = 0;
        let sarcasmHits = 0;

        for (let i = 0; i < items.length; i++) {
            let norm = polarities[i];
            if (norm == null) continue;

            const ironyML = ironyFlags ? ironyFlags[i] : false;
            const ironyLex = lexicalSarcasm(items[i].text);
            if ((ironyML || ironyLex) && norm > 0.2) {
                norm = -norm * IRONY_FLIP_WEIGHT;
                sarcasmHits++;
            }

            if (norm > 0) pos += norm; else neg += -norm;
            if (norm >= STRONG) strongPos++;
            if (norm <= -STRONG) strongNeg++;
            sumNorm += norm;
            sumAbs  += Math.abs(norm);
            sumSq   += norm * norm;
            count++;

            agg.addEvent(author, items[i].dt, norm, items[i].prevAuthor);
        }

        const mean   = count > 0 ? sumNorm / count : 0;
        const stdDev = count > 1 ? Math.sqrt(Math.max(0, sumSq / count - mean * mean)) : 0;
        polarity[author] = {
            pos, neg, strongPos, strongNeg, count, sarcasmHits,
            mean, stdDev,
            intensity: count > 0 ? sumAbs / count : 0,
        };
    }

    return buildResult(allAuthors, categorical, polarity, reactionStats,
        withDayContexts(agg.finalize(), messages, lang),
        { mlEnabled: true, device, ironyModel: !!ironyClassifier });
}

/**
 * Attach the « why » to the days the deck will show.
 *
 * A date and a temperature explain nothing on their own, so each notable day
 * is profiled against the rest of the conversation — volume, who held the
 * floor, the hour it peaked, the silence around it, the words it turned on.
 * Only the shown days are profiled: the cost is one extra pass, never a
 * per-day index of the whole archive.
 */
function withDayContexts(aggregates, messages, lang) {
    const days = [...(aggregates.bestDays ?? []), ...(aggregates.worstDays ?? [])];
    if (days.length === 0) return aggregates;
    const contexts = buildDayContexts(messages, lang, days.map(d => d.date));
    for (const day of days) {
        const ctx = contexts[day.date];
        if (ctx) day.context = ctx;
    }
    return aggregates;
}
