/**
 * Why *this* day stood out.
 *
 * The mood slides used to name a date and a temperature — « 12 février,
 * ambiance tendue » — and stop there, which is a number without a story. This
 * module reconstructs the shape of a notable day: how much was said, by whom,
 * at what hour, after how long a silence, around which words, and whether the
 * replies dragged. Everything here is *data only* — no localised string ever
 * leaves the worker (see CLAUDE.md).
 *
 * Only the handful of days the deck actually shows are profiled; the rest of
 * the conversation is walked once to provide the baseline those days are
 * compared against.
 */

import { localDayKey } from '../utils.js';
import { stopwordsFor, WORD_CHARS_RE } from '../lang/stopwords.js';

const EMOJI_RE = /\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*/gu;
const WORD_RE = WORD_CHARS_RE;
const URL_RE = /https?:\/\/\S+/g;

/** Gaps longer than this are a new conversation, not a slow reply. */
const REPLY_MAX_MIN = 360;
/** A single very late reply should not dominate the day's average. */
const REPLY_CAP_MIN = 120;
const MIN_REPLIES = 4;
/** A word said once is an accident, not a topic. */
const MIN_KEYWORD_HITS = 3;
const MAX_KEYWORDS = 3;

/**
 * @param {import('../types.d.ts').Message[]} messages Chronological.
 * @param {string} lang Detected chat language — drives the stopword list.
 * @param {Iterable<string>} dates Day keys (`YYYY-MM-DD`) to profile.
 * @returns {Record<string, any>} Context per day key; days with too little
 *   material simply get fewer fields.
 */
export function buildDayContexts(messages, lang, dates) {
    const targets = new Set(dates);
    if (targets.size === 0 || !messages || messages.length === 0) return {};

    const stopwords = stopwordsFor(lang);
    const dayCounts = new Map();
    const globalWords = new Map();
    /** Per-target accumulators, created lazily. */
    const days = new Map();

    let totalWords = 0;
    let globalGapSum = 0;
    let globalGapCount = 0;
    let prev = null;

    const dayOf = key => {
        let d = days.get(key);
        if (!d) {
            d = {
                messages: 0,
                byAuthor: new Map(),
                hours: new Array(24).fill(0),
                words: new Map(),
                emojis: new Map(),
                media: 0,
                questions: 0,
                longest: 0,
                wordTotal: 0,
                gapSum: 0,
                gapCount: 0,
            };
            days.set(key, d);
        }
        return d;
    };

    for (const m of messages) {
        if (m.isReaction || !m.datetime) continue;
        const key = localDayKey(m.datetime);
        dayCounts.set(key, (dayCounts.get(key) || 0) + 1);

        const tracked = targets.has(key) ? dayOf(key) : null;

        if (prev && prev.author !== m.author) {
            const gap = (m.datetime.getTime() - prev.datetime.getTime()) / 60000;
            if (gap >= 0 && gap <= REPLY_MAX_MIN) {
                const capped = Math.min(gap, REPLY_CAP_MIN);
                globalGapSum += capped;
                globalGapCount++;
                if (tracked) { tracked.gapSum += capped; tracked.gapCount++; }
            }
        }
        prev = m;

        if (tracked) {
            tracked.messages++;
            tracked.byAuthor.set(m.author, (tracked.byAuthor.get(m.author) || 0) + 1);
            tracked.hours[m.datetime.getHours()]++;
            if (m.isMedia) tracked.media++;
            if (m.msgLen > tracked.longest) tracked.longest = m.msgLen;
            if (!m.isMedia && !m.isDeleted && m.message.includes('?')) tracked.questions++;
        }

        if (m.isMedia || m.isDeleted || !m.message) continue;

        const cleaned = m.message.toLowerCase().replace(URL_RE, '');
        for (const raw of cleaned.match(WORD_RE) || []) {
            // « j'ai », « qu'elle » — the elided article carries no subject.
            // A word cloud can absorb one such token; three keywords cannot.
            const w = raw.slice(raw.lastIndexOf("'") + 1);
            if (w.length <= 2 || stopwords.has(w)) continue;
            globalWords.set(w, (globalWords.get(w) || 0) + 1);
            totalWords++;
            if (tracked) {
                tracked.words.set(w, (tracked.words.get(w) || 0) + 1);
                tracked.wordTotal++;
            }
        }
        if (tracked) {
            for (const e of m.message.match(EMOJI_RE) || []) {
                tracked.emojis.set(e, (tracked.emojis.get(e) || 0) + 1);
            }
        }
    }

    const activeDays = [...dayCounts.keys()].sort();
    const median = medianOf([...dayCounts.values()]);
    const globalGap = globalGapCount >= MIN_REPLIES ? globalGapSum / globalGapCount : null;

    const out = {};
    for (const [key, d] of days) {
        if (d.messages === 0) continue;
        const idx = activeDays.indexOf(key);
        const top = [...d.byAuthor.entries()].sort((a, b) => b[1] - a[1])[0];
        const peakHour = d.hours.indexOf(Math.max(...d.hours));
        const night = d.hours.slice(0, 5).reduce((s, n) => s + n, 0);
        const dayGap = d.gapCount >= MIN_REPLIES ? d.gapSum / d.gapCount : null;

        out[key] = {
            messages: d.messages,
            volumeRatio: median > 0 ? round2(d.messages / median) : null,
            topAuthor: top && d.byAuthor.size > 1
                ? { author: top[0], share: round2(top[1] / d.messages) }
                : null,
            participants: d.byAuthor.size,
            peakHour,
            peakHourShare: round2(d.hours[peakHour] / d.messages),
            nightShare: round2(night / d.messages),
            questionShare: round2(d.questions / d.messages),
            mediaShare: round2(d.media / d.messages),
            longestMessage: d.longest,
            replyRatio: (dayGap != null && globalGap) ? round2(dayGap / globalGap) : null,
            silenceBefore: idx > 0 ? daysBetween(activeDays[idx - 1], key) - 1 : 0,
            silenceAfter: idx >= 0 && idx < activeDays.length - 1
                ? daysBetween(key, activeDays[idx + 1]) - 1
                : 0,
            keywords: pickKeywords(d, globalWords, totalWords),
            emojis: [...d.emojis.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e),
        };
    }
    return out;
}

/**
 * Words the day over-used compared with the *rest* of the conversation.
 *
 * Raw frequency would return « ok » and « demain » every single time; what
 * makes a day legible is the word that is unusually present in it. The day
 * itself is excluded from the baseline it is measured against — otherwise a
 * day big enough to be notable drags the average towards its own vocabulary
 * and every lift collapses back to 1.
 */
function pickKeywords(day, globalWords, totalWords) {
    const restTotal = totalWords - day.wordTotal;
    if (day.wordTotal < 20 || restTotal <= 0) return [];
    const scored = [];
    for (const [w, n] of day.words) {
        if (n < MIN_KEYWORD_HITS) continue;
        const rest = (globalWords.get(w) ?? n) - n;
        // Additive smoothing: a word seen nowhere else is remarkable, not
        // infinitely remarkable.
        const baseRate = (rest + 0.5) / (restTotal + 1);
        const lift = (n / day.wordTotal) / baseRate;
        if (lift < 1.5) continue;
        scored.push([w, lift * Math.log1p(n)]);
    }
    return scored.sort((a, b) => b[1] - a[1]).slice(0, MAX_KEYWORDS).map(([w]) => w);
}

function medianOf(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Whole days between two `YYYY-MM-DD` keys, DST-proof. */
function daysBetween(a, b) {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function round2(n) {
    return Math.round(n * 100) / 100;
}
