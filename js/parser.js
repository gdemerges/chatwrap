/**
 * WhatsApp Chat Parser
 *
 * WhatsApp exports vary by platform *and* by phone locale. Rather than one
 * regex per locale, two shapes cover every known export:
 *
 *   iOS      [<date>, <time>] Author: body
 *   Android  <date>, <time> - Author: body
 *
 * with a permissive <date>/<time> and the day/month order *inferred from the
 * file* instead of guessed from the separator — that guess used to mangle
 * European exports with a two-digit year (12/03/24 read as December 3rd).
 *
 * Everything WhatsApp writes in the user's language (media placeholders,
 * system notices, deletion tombstones, poll headers) lives in
 * `js/lang/chat-locales.js`.
 *
 * The parser is a **stream**: `createStreamParser()` takes the file in chunks
 * and never holds the whole text. `parse(text)` is the same machine fed in one
 * go, kept for tests and for anything that already has a string.
 */

import {
    SYSTEM_AUTHORS, SYSTEM_KEYWORDS, MEDIA_PATTERNS, EDITED_PATTERNS,
    DELETED_PATTERNS, POLL_PREFIXES, REACTION_RE,
} from './lang/chat-locales.js';

const DATE = String.raw`\d{1,4}[/.\-]\d{1,2}[/.\-]\d{2,4}`;
// Optional seconds; AM/PM optionally dotted and preceded by a regular or
// narrow no-break space (iOS uses U+202F in recent versions).
const TIME = String.raw`\d{1,2}[:.]\d{2}(?::\d{2})?(?:[\s  ]*[APap]\.?[Mm]\.?)?`;
// WhatsApp's own separator is a hyphen, but exports that have been through a
// text editor or a mail client come back with an en or em dash.
const DASH = String.raw`[-–—]`;

const PATTERNS = [
    // iOS: [12/03/2024, 14:30:00] Alice: hello   (comma optional)
    new RegExp(String.raw`^\[(${DATE}),?[\s  ]+(${TIME})\]\s*([^:]+):\s(.+)$`),
    // Android: 12/03/2024, 14:30 - Alice: hello  (comma optional, dashes tolerated)
    new RegExp(String.raw`^(${DATE}),?[\s  ]+(${TIME})\s*${DASH}\s*([^:]+):\s(.+)$`),
];

/** A line that starts a message but has no author (system notice). */
const SYSTEM_LINE_PATTERNS = [
    new RegExp(String.raw`^\[(${DATE}),?[\s  ]+(${TIME})\]\s*(.+)$`),
    new RegExp(String.raw`^(${DATE}),?[\s  ]+(${TIME})\s*${DASH}\s*(.+)$`),
];

/**
 * Bidirectional and zero-width controls WhatsApp sprinkles through the file.
 *
 * U+200D (ZWJ) and U+FE0F are deliberately absent: they are what holds a
 * multi-codepoint emoji together, and stripping them would shatter 👩‍👩‍👧 into
 * three separate people.
 */
const INVISIBLE_RE = /[​‎‏؜‪-‮⁦-⁩﻿]/g;

/** Lines buffered before the format is decided. */
const DETECT_WINDOW = 200;
/** Date/time tokens sampled before settling the day/month order. */
const ORDER_SAMPLE = 2000;

/**
 * Detect which regex pattern matches this file.
 * Requires ≥3 matches in the sample to avoid false positives.
 */
export function detectPattern(lines) {
    const sampleSize = Math.min(DETECT_WINDOW, lines.length);
    const threshold = Math.max(1, Math.min(3, Math.floor(sampleSize / 3)));
    let best = null;
    let bestScore = 0;
    for (const pattern of PATTERNS) {
        let matches = 0;
        for (let i = 0; i < sampleSize; i++) {
            if (pattern.test(lines[i])) matches++;
        }
        if (matches >= threshold && matches > bestScore) {
            best = pattern;
            bestScore = matches;
        }
    }
    return best;
}

/**
 * Infer whether dates are day-first (rest of the world) or month-first (US).
 *
 * Decided by evidence, in order:
 *   1. a first component > 12  → day-first
 *   2. a second component > 12 → month-first
 *   3. AM/PM clock             → month-first (US convention)
 *   4. otherwise               → day-first (WhatsApp's default outside the US)
 *
 * @returns {'dmy' | 'mdy'}
 */
export function inferDateOrder(dateStrings, timeStrings = []) {
    for (const ds of dateStrings) {
        const parts = ds.split(/[/.\-]/);
        if (parts.length !== 3) continue;
        const a = parseInt(parts[0], 10);
        const b = parseInt(parts[1], 10);
        if (parts[0].length === 4) return 'dmy'; // YYYY-MM-DD, handled separately
        if (a > 12) return 'dmy';
        if (b > 12) return 'mdy';
    }
    if (timeStrings.some(t => /[APap]\.?[Mm]/.test(t))) return 'mdy';
    return 'dmy';
}

/**
 * @param {string} dateStr
 * @param {string} timeStr
 * @param {'dmy'|'mdy'} [order]
 */
export function parseDate(dateStr, timeStr, order = 'dmy') {
    const parts = dateStr.split(/[/.\-]/);
    if (parts.length !== 3) return new Date(NaN);

    let year, month, day;
    if (parts[0].length === 4) {
        [year, month, day] = parts;               // ISO-ish: YYYY-MM-DD
    } else if (order === 'mdy') {
        [month, day, year] = parts;
    } else {
        [day, month, year] = parts;
    }
    if (year.length === 2) year = '20' + year;

    const time = normalizeTime(timeStr);
    if (!time) return new Date(NaN);

    return new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        time.h, time.m, time.s,
    );
}

/** "2:30 PM" / "14.30" / "14:30:05" → { h, m, s } */
function normalizeTime(timeStr) {
    const t = String(timeStr).replace(/[  ]/g, ' ').trim();
    const ampm = t.match(/([APap])\.?[Mm]\.?\s*$/);
    const clock = t.replace(/[APap]\.?[Mm]\.?\s*$/, '').trim().split(/[:.]/);
    if (clock.length < 2) return null;

    let h = parseInt(clock[0], 10);
    const m = parseInt(clock[1], 10);
    const s = clock[2] ? parseInt(clock[2], 10) : 0;
    if ([h, m, s].some(Number.isNaN)) return null;

    if (ampm) {
        const isPM = ampm[1].toLowerCase() === 'p';
        if (isPM && h !== 12) h += 12;
        if (!isPM && h === 12) h = 0;
    }
    if (h > 23 || m > 59 || s > 59) return null;
    return { h, m, s };
}

export function cleanLine(line) {
    return line.replace(/^[‎‏​‌‍‪-‮⁦-⁩﻿\r]+/, '')
               .replace(/\r$/, '');
}

/** Drop bidi/zero-width noise from anywhere in a string, emoji glue excepted. */
export function stripInvisible(str) {
    return str.replace(INVISIBLE_RE, '');
}

function matchesAny(haystackLower, needles) {
    return needles.some(n => haystackLower.includes(n));
}

function isSystemText(text) {
    // iOS writes « l’icône » with a typographic apostrophe; the keywords use '.
    return matchesAny(text.toLowerCase().replace(/[’‘]/g, "'"), SYSTEM_KEYWORDS);
}

/**
 * A notice WhatsApp filed under an author.
 *
 * iOS dates and signs its group events like messages — and signs them with
 * the *group's* name when nobody in particular did it (the encryption notice,
 * « X vous a ajouté·e »), which made the group show up as a participant.
 * Such a body starts with U+200E. Media placeholders do too, so the mark alone
 * is not enough: the text must also read as a notice.
 */
function isAuthoredNotice(body) {
    return /^[\u200e\u200f]/.test(body) && isSystemText(body);
}

/** Keep the date/time scaffolding, drop the human content. */
function redact(line) {
    const head = line.slice(0, 40);
    return head.replace(/[\p{L}\p{M}]{2,}/gu, 'xxx') + (line.length > 40 ? '…' : '');
}

/**
 * Incremental parser.
 *
 * Feed it the file in whatever chunks arrive; it buffers only a partial line
 * and the first `DETECT_WINDOW` lines (needed to decide the format). The full
 * text is never held, which is what keeps a 50 MB export from peaking at three
 * copies of itself — the string, the array of lines, and the records.
 *
 * Diagnostics are accumulated as the file goes past, so a rejected file can be
 * explained without a second pass over it.
 *
 * @returns {{
 *   push: (chunk: string) => void,
 *   end: (options?: { year?: number }) => import('./types.d.ts').Message[],
 *   diagnostics: () => import('./types.d.ts').ParseDiagnostics,
 * }}
 */
export function createStreamParser() {
    /** @type {RegExp | null} */
    let pattern = null;
    /** @type {RegExp | null} */
    let systemPattern = null;
    let detected = false;

    let tail = '';                  // partial line across chunk boundaries
    /** @type {string[]} */
    const head = [];                // lines held back until the format is known

    /** @type {any[]} */
    const records = [];
    /** @type {any} */
    let current = null;

    const dateSamples = [];
    const timeSamples = [];

    // Diagnostics, gathered on the fly.
    let totalLines = 0;
    let matched = 0;
    let inspected = 0;
    const samples = [];

    function decide() {
        pattern = detectPattern(head);
        systemPattern = pattern ? SYSTEM_LINE_PATTERNS[PATTERNS.indexOf(pattern)] : null;
        detected = true;
        for (const line of head) consume(line);
        head.length = 0;
    }

    // Blank lines are structural, not content: counting them would inflate
    // "lines read" and fill the sample list with empty strings.
    function note(line, isMatch) {
        if (line.trim() === '') return;
        totalLines++;
        if (inspected >= DETECT_WINDOW) return;
        inspected++;
        if (isMatch) matched++;
        else if (samples.length < 3) samples.push(redact(line));
    }

    function consume(line) {
        const m = pattern && line.match(pattern);
        note(line, Boolean(m));
        if (m) {
            if (current) records.push(current);
            const [, dateStr, timeStr, author, body] = m;
            if (dateSamples.length < ORDER_SAMPLE) {
                dateSamples.push(dateStr);
                timeSamples.push(timeStr);
            }
            current = {
                dateStr,
                timeStr,
                author: normalizeAuthor(author),
                message: stripInvisible(body),
                isNotice: isAuthoredNotice(body),
            };
            return;
        }
        // An author-less dated line is a system notice — it must break the
        // current message rather than be appended to it as a continuation.
        const sys = systemPattern && line.match(systemPattern);
        if (sys && isSystemText(sys[3])) {
            if (current) { records.push(current); current = null; }
            return;
        }
        if (current) current.message += '\n' + stripInvisible(cleanLine(line));
    }

    function feed(raw) {
        const line = cleanLine(raw);
        if (!detected) {
            head.push(line);
            if (head.length >= DETECT_WINDOW) decide();
            return;
        }
        consume(line);
    }

    function diagnostics() {
        return { totalLines, matched, detected: Boolean(pattern), samples: [...samples] };
    }

    return {
        push(chunk) {
            const text = tail + chunk;
            const lines = text.split('\n');
            tail = lines.pop() ?? '';
            for (const line of lines) feed(line);
        },

        end(options = {}) {
            if (tail !== '') { feed(tail); tail = ''; }
            if (!detected) decide();
            if (current) { records.push(current); current = null; }

            if (!pattern) {
                throw withDiagnostics(
                    new Error("Format de fichier non reconnu."),
                    'unknownFormat',
                    diagnostics(),
                );
            }

            const order = inferDateOrder(dateSamples, timeSamples);
            /** @type {any[]} */
            const out = [];
            let valid = 0;
            for (const r of records) {
                const datetime = parseDate(r.dateStr, r.timeStr, order);
                if (isNaN(datetime.getTime())) continue;
                valid++;
                if (options.year && datetime.getFullYear() !== options.year) continue;
                out.push(annotate(r, datetime));
            }

            // Guard against a locale/format mismatch: if lines matched the
            // layout but none yielded a valid date, fail loudly rather than
            // returning nothing.
            if (records.length > 0 && valid === 0) {
                throw withDiagnostics(
                    new Error("Les dates du fichier n'ont pas pu être interprétées."),
                    'unreadableDates',
                    diagnostics(),
                );
            }

            records.length = 0;
            return out.filter(r => !r.isSystem);
        },

        diagnostics,
    };
}

/**
 * Errors cross a worker boundary, and the worker has no business knowing which
 * language the page is in. Each one carries a stable `code` the UI translates;
 * the message itself stays readable for anything that logs it raw.
 */
function withDiagnostics(err, code, diagnostics) {
    /** @type {any} */ (err).code = code;
    /** @type {any} */ (err).diagnostics = diagnostics;
    return err;
}

/** Turn a raw record into a fully classified message. */
function annotate(r, datetime) {
    const message = r.message;
    const lower = message.toLowerCase();
    const trimmed = lower.trimStart();

    const isDeleted = matchesAny(lower, DELETED_PATTERNS);
    const rx = message.match(REACTION_RE);

    return {
        datetime,
        author: r.author,
        // A deleted message left a tombstone, not a sentence: keeping the
        // placeholder text would put "this message was deleted" at the top of
        // the word cloud and stretch the author's average message length.
        message: isDeleted ? '' : message,
        msgLen: isDeleted ? 0 : message.length,
        isSystem: r.isNotice || SYSTEM_AUTHORS.includes(r.author),
        isMedia: !isDeleted && matchesAny(lower, MEDIA_PATTERNS),
        isEdited: matchesAny(lower, EDITED_PATTERNS),
        isDeleted,
        isPoll: POLL_PREFIXES.some(p => trimmed.startsWith(p)),
        isReaction: Boolean(rx),
        ...(rx ? { reactionEmoji: rx[1] } : {}),
    };
}

/**
 * Parse chat text into structured messages.
 * @param {string} text
 * @param {{ year?: number }} [options]
 * @returns {import('./types.d.ts').Message[]}
 */
export function parse(text, options = {}) {
    const stream = createStreamParser();
    stream.push(text);
    return stream.end(options);
}

/**
 * Inspect a file that failed to parse, so the UI can explain *why*.
 * The returned sample lines are truncated and stripped of anything after the
 * first colon — enough to recognise a format, not enough to leak a message.
 * @returns {import('./types.d.ts').ParseDiagnostics}
 */
export function diagnose(text) {
    const stream = createStreamParser();
    stream.push(text);
    try { stream.end(); } catch { /* diagnosing a failure is the point */ }
    return stream.diagnostics();
}

function normalizeAuthor(raw) {
    return stripInvisible(raw)
        .replace(/^~\s*/, '')   // group members show as "~Nickname"
        .replace(/\s+/g, ' ')
        .trim();
}
