/**
 * Statistics computation from parsed WhatsApp messages.
 * Single-pass where possible.
 */

import { localDayKey, localMonthKey, ensureChronological } from './utils.js';
import { stopwordsFor, detectLanguage, WORD_CHARS_RE } from './lang/stopwords.js';
import { MEDIA_BY_TYPE } from './lang/chat-locales.js';

const EMOJI_RE = /\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*/gu;
// Word shape, stopwords and language detection all live in lang/stopwords.js:
// a French-only character range used to cut every other alphabet in half.
const WORD_RE = WORD_CHARS_RE;
const URL_RE = /https?:\/\/\S+/g;
const URL_TEST_RE = /https?:\/\/\S+/;
const HTML_STRIP_RE = /<[^>]+>/g;
const GHOST_THRESHOLD_MIN = 60 * 24; // 24h = ghosted

/** Tag an error with a stable code the UI can translate. @see js/parser.js */
function coded(err, code) {
    /** @type {any} */ (err).code = code;
    return err;
}

/**
 * @param {import('./types.d.ts').Message[]} messages
 * @returns {import('./types.d.ts').Stats}
 */
export function compute(messages) {
    if (!messages || messages.length === 0) {
        throw coded(new Error('Aucun message à analyser'), 'noMessages');
    }

    // Ensure chronological order — without copying when it already is, which
    // is every real export.
    messages = ensureChronological(messages);

    const stats = initAccumulators();

    // Language detection on a sample before the loop
    const sample = messages.slice(0, 500).map(m => m.message).join(' ');
    stats.lang = detectLanguage(sample);
    const stopwords = stopwordsFor(stats.lang);

    let prev = null;
    let prevDayKey = null;
    let longestMsg = null;

    for (const m of messages) {
        const author = m.author;

        // --- Reactions: tallied separately, never counted as messages ---
        // A reaction line ("a réagi ❤️ à …") is not a message: counting it
        // would inflate totals, pollute word frequencies with the reaction
        // body, and double-count its emoji against the general emoji stats.
        if (m.isReaction) {
            stats.reactions.total++;
            stats.reactions.perAuthor[author] = (stats.reactions.perAuthor[author] || 0) + 1;
            const e = m.reactionEmoji;
            if (e) stats.reactions.perEmoji[e] = (stats.reactions.perEmoji[e] || 0) + 1;
            continue;
        }

        const person = stats.perPerson[author] ||= newPerson();

        // --- Deleted messages ---
        // The tombstone is not a message anyone wrote. It still happened, so
        // it counts towards the totals and the timeline, but everything
        // content-derived below (words, emojis, length, links) skips it — the
        // parser has already blanked its body.
        if (m.isDeleted) { stats.totalDeleted++; person.deleted++; }

        // --- Counts & lengths ---
        stats.totalMessages++;
        stats.totalChars += m.msgLen;
        person.count++;
        person.totalChars += m.msgLen;

        if (m.isMedia) {
            stats.totalMedia++;
            person.media++;
            bucketMediaType(stats.mediaTypes, m.message);
        } else if (m.isDeleted) {
            // no text to mine, and no length worth averaging
        } else {
            stats.textCount++;
            stats.textChars += m.msgLen;
            person.textCount++;
            person.textChars += m.msgLen;

            if (!longestMsg || m.msgLen > longestMsg.msgLen) longestMsg = m;

            // Word counts
            const cleaned = m.message.toLowerCase().replace(URL_RE, '').replace(HTML_STRIP_RE, '');
            const words = cleaned.match(WORD_RE) || [];
            for (const w of words) {
                if (w.length <= 2 || stopwords.has(w)) continue;
                stats.wordFreq[w] = (stats.wordFreq[w] || 0) + 1;
                const entry = stats.wordAuthors[w];
                if (!entry) {
                    stats.wordAuthors[w] = { authors: new Set([author]), count: 1 };
                } else {
                    entry.authors.add(author);
                    entry.count++;
                }
                (person.wordFreq[w] ||= 0);
                person.wordFreq[w]++;
            }
        }

        if (m.isEdited) { stats.totalEdited++; person.edited++; }

        if (URL_TEST_RE.test(m.message)) {
            stats.totalLinks++;
            person.links++;
            for (const domain of extractDomains(m.message)) {
                stats.domainFreq[domain] = (stats.domainFreq[domain] || 0) + 1;
                person.domainFreq[domain] = (person.domainFreq[domain] || 0) + 1;
            }
        }

        // --- Emojis ---
        const emojis = m.message.match(EMOJI_RE) || [];
        for (const e of emojis) {
            stats.emojiFreq[e] = (stats.emojiFreq[e] || 0) + 1;
            stats.totalEmojis++;
            person.emojis++;
            person.emojiFreq[e] = (person.emojiFreq[e] || 0) + 1;
        }

        // --- Time buckets ---
        const dt = m.datetime;
        const hour = dt.getHours();
        const day = (dt.getDay() + 6) % 7; // 0=Monday
        stats.hourly[hour]++;
        stats.weekday[day]++;
        stats.heatmap[day][hour]++;
        person.hourly[hour]++;

        if (hour < 5) person.nightMsgs++;
        else if (hour < 8) person.morningMsgs++;

        const dayKey = localDayKey(dt);
        stats.daily[dayKey] = (stats.daily[dayKey] || 0) + 1;
        const monthKey = localMonthKey(dt);
        stats.monthly[monthKey] = (stats.monthly[monthKey] || 0) + 1;
        stats.monthlyPerPerson[author] ||= {};
        stats.monthlyPerPerson[author][monthKey] = (stats.monthlyPerPerson[author][monthKey] || 0) + 1;

        // --- Initiator of the day ---
        if (dayKey !== prevDayKey) {
            stats.initiator[author] = (stats.initiator[author] || 0) + 1;
            prevDayKey = dayKey;
        }

        // --- Response time & ghosting ---
        if (prev) {
            const diffMin = (dt.getTime() - prev.datetime.getTime()) / 60000;
            if (prev.author !== author && diffMin > 0) {
                if (diffMin < 1440) {
                    person.responseTimes.push(diffMin);
                    // Directed reply edge: `author` answered `prev.author`.
                    // Only replies within the day count, so a new conversation
                    // opened a week later isn't read as an answer.
                    const edges = stats.replyMatrix[author] ||= {};
                    edges[prev.author] = (edges[prev.author] || 0) + 1;
                }
                // Ghost breaker: ≥24h silence then different person speaks
                if (diffMin >= GHOST_THRESHOLD_MIN) {
                    stats.ghosts.push({
                        silenced: prev.author,
                        revived: author,
                        minutes: diffMin,
                        when: dt,
                    });
                }
            }
        }
        prev = m;

        if (!stats.firstMessage) stats.firstMessage = m;
    }

    stats.longestMessage = longestMsg
        ? { author: longestMsg.author, datetime: longestMsg.datetime, msgLen: longestMsg.msgLen }
        : { author: '', datetime: null, msgLen: 0 };
    if (stats.firstMessage) {
        stats.firstMessage = {
            author: stats.firstMessage.author,
            datetime: stats.firstMessage.datetime,
        };
    }

    return finalize(stats, messages);
}

function initAccumulators() {
    return /** @type {any} */ ({
        totalMessages: 0,
        totalChars: 0,
        textCount: 0,
        textChars: 0,
        totalMedia: 0,
        totalEdited: 0,
        totalDeleted: 0,
        totalLinks: 0,
        totalEmojis: 0,
        perPerson: {},
        mediaTypes: { images: 0, gifs: 0, stickers: 0, videos: 0, audio: 0, documents: 0, links: 0 },
        hourly: new Array(24).fill(0),
        weekday: new Array(7).fill(0),
        heatmap: Array.from({ length: 7 }, () => new Array(24).fill(0)),
        daily: {},
        monthly: {},
        monthlyPerPerson: {},
        emojiFreq: {},
        wordFreq: {},
        wordAuthors: {}, // word → {authors: Set, count}
        domainFreq: {},
        replyMatrix: {}, // responder → { respondedTo: count }
        reactions: { total: 0, perAuthor: {}, perEmoji: {} },
        ghosts: [],
        initiator: {},
        firstMessage: null,
    });
}

function newPerson() {
    return {
        count: 0,
        textCount: 0,
        totalChars: 0,
        textChars: 0,
        media: 0,
        edited: 0,
        deleted: 0,
        links: 0,
        emojis: 0,
        nightMsgs: 0,
        morningMsgs: 0,
        responseTimes: [],
        wordFreq: {},
        emojiFreq: {},
        domainFreq: {},
        hourly: new Array(24).fill(0),
    };
}

/**
 * Attribute a media placeholder to its type, in every supported language.
 *
 * `other` is skipped on purpose: "<Médias omis>" says a file was there, not
 * what it was, so it counts in the total and in no bucket.
 */
const MEDIA_BUCKETS = Object.entries(MEDIA_BY_TYPE).filter(([type]) => type !== 'other');

function bucketMediaType(mediaTypes, msg) {
    const lower = msg.toLowerCase();
    for (const [type, needles] of MEDIA_BUCKETS) {
        if (needles.some(n => lower.includes(n))) { mediaTypes[type]++; return; }
    }
}

function finalize(acc, messages) {
    // messages are sorted chronologically in compute()
    const startDate = new Date(messages[0].datetime);
    const endDate = new Date(messages[messages.length - 1].datetime);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1;

    // Per-person derived metrics
    const perPerson = {};
    for (const [author, p] of Object.entries(acc.perPerson)) {
        perPerson[author] = {
            count: p.count,
            percent: ((p.count / acc.totalMessages) * 100).toFixed(1),
            media: p.media,
            edited: p.edited,
            deleted: p.deleted,
            emojis: p.emojis,
            links: p.links,
            totalChars: p.totalChars,
            avgLen: p.textCount > 0 ? Math.round(p.textChars / p.textCount) : 0,
            nightMsgs: p.nightMsgs,
            morningMsgs: p.morningMsgs,
            avgResponseMin: p.responseTimes.length
                ? Math.round(p.responseTimes.reduce((s, t) => s + t, 0) / p.responseTimes.length)
                : null,
            peakHour: p.hourly.indexOf(Math.max(...p.hourly)),
            topEmoji: topEntry(p.emojiFreq),
            topDomain: topEntry(p.domainFreq),
            _wordFreq: p.wordFreq, // kept internally, stripped before share
        };
    }

    const ranking = Object.entries(perPerson).sort((a, b) => b[1].count - a[1].count);

    // Media totals
    acc.mediaTypes.links = acc.totalLinks;

    // Top words (global)
    const topWords = Object.entries(acc.wordFreq)
        .sort((a, b) => b[1] - a[1]).slice(0, 30);

    // Top words per top-5 person
    const topWordsPerPerson = {};
    for (const [author] of ranking.slice(0, 5)) {
        const pf = perPerson[author]?._wordFreq || {};
        topWordsPerPerson[author] = Object.entries(pf).sort((a, b) => b[1] - a[1]).slice(0, 10);
    }

    // Unique vocabulary per person (signature lexicale)
    const uniqueWordsPerPerson = {};
    for (const [word, { authors, count }] of Object.entries(acc.wordAuthors)) {
        if (count < 3) continue; // noise floor
        if (authors.size !== 1) continue;
        const owner = [...authors][0];
        (uniqueWordsPerPerson[owner] ||= []).push([word, count]);
    }
    for (const author of Object.keys(uniqueWordsPerPerson)) {
        uniqueWordsPerPerson[author].sort((a, b) => b[1] - a[1]);
        uniqueWordsPerPerson[author] = uniqueWordsPerPerson[author].slice(0, 15);
    }

    // Emojis
    const emojiEntries = Object.entries(acc.emojiFreq).sort((a, b) => b[1] - a[1]);
    const emojisPerPerson = Object.entries(perPerson)
        .map(([name, p]) => [name, p.emojis])
        .sort((a, b) => b[1] - a[1]);

    // Response stats
    const responseEntries = Object.entries(perPerson)
        .filter(([, p]) => p.avgResponseMin != null)
        .map(([name, p]) => [name, p.avgResponseMin])
        .sort((a, b) => a[1] - b[1]);

    const responseStats = responseEntries.length
        ? {
            fastest: responseEntries[0],
            slowest: responseEntries[responseEntries.length - 1],
            all: responseEntries,
        }
        : null;

    // Most active day
    const dailyEntries = Object.entries(acc.daily).sort((a, b) => b[1] - a[1]);
    const mostActiveDay = dailyEntries[0] || ['N/A', 0];

    // Peak hour/day
    const peakHour = acc.hourly.indexOf(Math.max(...acc.hourly));
    // Stored as an index, not a name: the label is the UI's business, and a
    // stats payload that hard-codes "Mardi" cannot be shown in English.
    const peakDayIndex = acc.weekday.indexOf(Math.max(...acc.weekday));

    // Night owl / early bird
    const nightOwlE = Object.entries(perPerson).map(([n, p]) => [n, p.nightMsgs])
        .filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
    const earlyBirdE = Object.entries(perPerson).map(([n, p]) => [n, p.morningMsgs])
        .filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);

    // Streak
    const streak = computeStreak(acc.daily);

    // Initiator ranking
    const initiatorRanking = Object.entries(acc.initiator).sort((a, b) => b[1] - a[1]);

    // Ghosting: top silences + revival rates
    const ghostsSorted = [...acc.ghosts].sort((a, b) => b.minutes - a.minutes);
    const ghostInitiator = {}; // who revives most often
    const ghostSilenced = {};  // whose last message goes longest unanswered
    for (const g of acc.ghosts) {
        ghostInitiator[g.revived] = (ghostInitiator[g.revived] || 0) + 1;
        ghostSilenced[g.silenced] = (ghostSilenced[g.silenced] || 0) + 1;
    }

    // Compatibility (for 2-person conversations)
    const compatibility = ranking.length === 2
        ? computeCompatibility(perPerson, ranking, acc)
        : null;

    const topDomains = Object.entries(acc.domainFreq)
        .sort((a, b) => b[1] - a[1]).slice(0, 12);

    const interactions = buildInteractions(acc.replyMatrix);
    const chapters = computeChapters(acc.monthly, totalDays);
    const profiles = buildProfiles(perPerson, ranking, acc, uniqueWordsPerPerson);

    const result = {
        lang: acc.lang,
        startDate,
        endDate,
        totalDays,
        totalMessages: acc.totalMessages,
        avgPerDay: (acc.totalMessages / totalDays).toFixed(1),
        totalChars: acc.totalChars,
        totalMedia: acc.totalMedia,
        totalEdited: acc.totalEdited,
        totalDeleted: acc.totalDeleted,
        totalLinks: acc.totalLinks,
        avgMsgLen: acc.textCount > 0 ? Math.round(acc.textChars / acc.textCount) : 0,
        participants: Object.keys(perPerson).length,
        perPerson,
        ranking,
        hourly: acc.hourly,
        weekday: acc.weekday,
        heatmap: acc.heatmap,
        daily: acc.daily,
        monthly: acc.monthly,
        monthlyPerPerson: acc.monthlyPerPerson,
        peakHour,
        peakDayIndex,
        mostActiveDay,
        topWords,
        topWordsPerPerson,
        uniqueWordsPerPerson,
        emojis: {
            total: acc.totalEmojis,
            unique: Object.keys(acc.emojiFreq).length,
            top: emojiEntries.slice(0, 15),
            perPerson: emojisPerPerson,
        },
        mediaTypes: acc.mediaTypes,
        responseStats,
        longestMessage: acc.longestMessage,
        streak,
        firstMessage: acc.firstMessage,
        nightOwl: nightOwlE[0] || null,
        earlyBird: earlyBirdE[0] || null,
        reactions: {
            total: acc.reactions.total,
            topEmojis: Object.entries(acc.reactions.perEmoji).sort((a, b) => b[1] - a[1]).slice(0, 10),
            perAuthor: Object.entries(acc.reactions.perAuthor).sort((a, b) => b[1] - a[1]),
        },
        initiator: initiatorRanking,
        ghosting: {
            count: acc.ghosts.length,
            longest: ghostsSorted.slice(0, 5),
            revivers: Object.entries(ghostInitiator).sort((a, b) => b[1] - a[1]),
            silenced: Object.entries(ghostSilenced).sort((a, b) => b[1] - a[1]),
        },
        topDomains,
        interactions,
        chapters,
        profiles,
        sentiment: null,
        compatibility,
    };

    return stripInternal(result);
}

/** Highest-count entry of a frequency map, or null. */
function topEntry(freq) {
    let best = null;
    for (const [k, v] of Object.entries(freq)) {
        if (!best || v > best[1]) best = [k, v];
    }
    return best;
}

/**
 * Registrable-ish domain of every URL in a message.
 * `www.` is dropped so youtube.com and www.youtube.com are one bucket;
 * deeper subdomains are kept (they carry meaning: maps.google.com).
 */
function extractDomains(message) {
    const out = [];
    const urls = message.match(URL_RE) || [];
    for (const raw of urls) {
        const m = raw.match(/^https?:\/\/([^/?#\s]+)/i);
        if (!m) continue;
        const host = m[1].toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '');
        if (host) out.push(host);
    }
    return out;
}

/**
 * Turn the directed reply matrix into a symmetric edge list plus, for each
 * person, who they answer most. This is the group-chat counterpart of the
 * two-person compatibility score: it says who actually talks *to whom*.
 */
function buildInteractions(replyMatrix) {
    const pairTotals = new Map();
    const closest = {};

    for (const [responder, targets] of Object.entries(replyMatrix)) {
        let best = null;
        for (const [target, count] of Object.entries(targets)) {
            if (!best || count > best[1]) best = [target, count];
            const key = [responder, target].sort().join('\u0000');
            pairTotals.set(key, (pairTotals.get(key) || 0) + count);
        }
        if (best) closest[responder] = { author: best[0], count: best[1] };
    }

    const pairs = [...pairTotals.entries()]
        .map(([key, count]) => {
            const [a, b] = key.split('\u0000');
            return { a, b, count };
        })
        .sort((x, y) => y.count - x.count);

    return { pairs: pairs.slice(0, 20), closest, matrix: replyMatrix };
}

/**
 * Split the conversation into chapters of comparable intensity.
 *
 * Months are walked in order; a chapter ends when two consecutive months
 * deviate from the running mean by more than CHAPTER_SHIFT in the same
 * direction — a single quiet August shouldn't cut the story in two.
 */
const CHAPTER_SHIFT = 0.6;
const MIN_CHAPTER_MONTHS = 2;

function computeChapters(monthly, totalDays) {
    const months = Object.keys(monthly).sort();
    if (months.length < 4) return [];

    const overallMean = months.reduce((s, m) => s + monthly[m], 0) / months.length;
    const segments = [];
    let current = { months: [months[0]], sum: monthly[months[0]] };

    for (let i = 1; i < months.length; i++) {
        const value = monthly[months[i]];
        const mean = current.sum / current.months.length;
        const deviation = mean > 0 ? (value - mean) / mean : 0;
        const next = months[i + 1] != null ? monthly[months[i + 1]] : null;
        const nextDeviation = next != null && mean > 0 ? (next - mean) / mean : deviation;
        const sustained = Math.abs(deviation) > CHAPTER_SHIFT &&
                          Math.sign(deviation) === Math.sign(nextDeviation) &&
                          Math.abs(nextDeviation) > CHAPTER_SHIFT / 2;

        if (sustained && current.months.length >= MIN_CHAPTER_MONTHS) {
            segments.push(current);
            current = { months: [months[i]], sum: value };
        } else {
            current.months.push(months[i]);
            current.sum += value;
        }
    }
    segments.push(current);
    if (segments.length < 2) return [];

    return segments.map((seg) => {
        const mean = seg.sum / seg.months.length;
        const ratio = overallMean > 0 ? mean / overallMean : 1;
        return {
            from: seg.months[0],
            to: seg.months[seg.months.length - 1],
            months: seg.months.length,
            total: seg.sum,
            avgPerMonth: Math.round(mean),
            intensity: ratio >= 1.35 ? 'high' : ratio <= 0.65 ? 'low' : 'steady',
            ratio: Math.round(ratio * 100) / 100,
        };
    }).filter(() => totalDays > 0);
}

/**
 * A compact identity card per participant, assembled from figures already
 * computed above — no extra pass over the messages.
 */
function buildProfiles(perPerson, ranking, acc, uniqueWords) {
    return ranking.map(([name, p]) => ({
        name,
        count: p.count,
        percent: p.percent,
        avgLen: p.avgLen,
        peakHour: p.peakHour,
        emojis: p.emojis,
        topEmoji: p.topEmoji,
        media: p.media,
        links: p.links,
        topDomain: p.topDomain,
        avgResponseMin: p.avgResponseMin,
        initiations: acc.initiator[name] || 0,
        // A word only this person uses is far more telling than their most
        // frequent one — which, in a group, is usually the same for everybody.
        signatureWord: uniqueWords?.[name]?.[0] || (p._wordFreq && topEntry(p._wordFreq)) || null,
        nightMsgs: p.nightMsgs,
        morningMsgs: p.morningMsgs,
    }));
}

function stripInternal(stats) {
    for (const p of Object.values(stats.perPerson)) delete p._wordFreq;
    return stats;
}

function computeStreak(daily) {
    const dates = Object.keys(daily).sort();
    if (dates.length === 0) return { max: 0 };
    let maxStreak = 1;
    let cur = 1;
    for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1]);
        const curr = new Date(dates[i]);
        const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000);
        if (diff === 1) { cur++; maxStreak = Math.max(maxStreak, cur); }
        else cur = 1;
    }
    return { max: maxStreak };
}

/**
 * Compatibility score for a 2-person chat.
 * Combines hour-pattern overlap, message-length similarity, and reciprocity.
 * Returns 0–100.
 */
function computeCompatibility(perPerson, ranking, acc) {
    const [a, b] = ranking.map(r => r[0]);

    // Message-length similarity (1 = identical)
    const la = perPerson[a].avgLen || 1;
    const lb = perPerson[b].avgLen || 1;
    const lenSim = 1 - Math.abs(la - lb) / Math.max(la, lb);

    // 3. Volume balance (1 = 50/50)
    const ca = perPerson[a].count;
    const cb = perPerson[b].count;
    const balance = 1 - Math.abs(ca - cb) / (ca + cb);

    // 4. Reciprocity: close response times on both sides
    const rtA = perPerson[a].avgResponseMin ?? 60;
    const rtB = perPerson[b].avgResponseMin ?? 60;
    const rtMax = Math.max(rtA, rtB, 1);
    const rtMin = Math.min(rtA, rtB, 1);
    const rtSim = rtMin / rtMax;

    // 5. Low ghost rate bonus: fewer 24h+ silences relative to days
    const days = Object.keys(acc.daily).length || 1;
    const ghostRate = acc.ghosts.length / days;
    const ghostScore = Math.max(0, 1 - ghostRate * 2);

    const score = (lenSim * 0.2 + balance * 0.3 + rtSim * 0.3 + ghostScore * 0.2) * 100;

    return {
        score: Math.round(score),
        components: {
            lengthSimilarity: Math.round(lenSim * 100),
            volumeBalance: Math.round(balance * 100),
            reciprocity: Math.round(rtSim * 100),
            consistency: Math.round(ghostScore * 100),
        },
    };
}

/**
 * Compare two stats objects (year N vs N-1).
 * Returns deltas for a handful of key metrics.
 * @param {import('./types.d.ts').Stats | null} current
 * @param {import('./types.d.ts').Stats | null} previous
 * @returns {import('./types.d.ts').YearComparison | null}
 */
export function compareYears(current, previous) {
    if (!current || !previous) return null;
    const pct = (a, b) => b === 0 ? null : Math.round(((a - b) / b) * 100);

    // Words that appeared / disappeared between the two top-30 lists.
    const curWords = new Map(current.topWords || []);
    const prevWords = new Map(previous.topWords || []);
    const appeared = [...curWords.entries()]
        .filter(([w]) => !prevWords.has(w))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
    const disappeared = [...prevWords.entries()]
        .filter(([w]) => !curWords.has(w))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

    return {
        messages: { current: current.totalMessages, previous: previous.totalMessages, pct: pct(current.totalMessages, previous.totalMessages) },
        days: { current: current.totalDays, previous: previous.totalDays },
        avgPerDay: { current: +current.avgPerDay, previous: +previous.avgPerDay, pct: pct(+current.avgPerDay, +previous.avgPerDay) },
        emojis: { current: current.emojis.total, previous: previous.emojis.total, pct: pct(current.emojis.total, previous.emojis.total) },
        media: { current: current.totalMedia, previous: previous.totalMedia, pct: pct(current.totalMedia, previous.totalMedia) },
        avgMsgLen: { current: current.avgMsgLen, previous: previous.avgMsgLen, pct: pct(current.avgMsgLen, previous.avgMsgLen) },
        streak: { current: current.streak.max, previous: previous.streak.max, pct: pct(current.streak.max, previous.streak.max) },
        appeared,
        disappeared,
    };
}
