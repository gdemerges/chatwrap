/**
 * Replace every participant name in a stats object with a stable alias.
 *
 * Sharing a Wrapped means handing someone a payload that names real people —
 * and, for a link, putting those names in a URL that ends up in browser
 * history, chat logs and link previews. This pass is what makes a share safe
 * to post publicly.
 *
 * Names appear as object *values* (ranking, profiles, ghosting…) and as object
 * *keys* (perPerson, monthlyPerPerson…), so the whole tree is walked and both
 * are remapped. That is deliberately blunt: a targeted field list would rot the
 * first time a new stat is added.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** "Léana" → "leana": what a word and a name are compared on. */
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * @param {string[]} names Ranked names — the alias order follows the ranking,
 *   so "A." is always the most active participant.
 * @returns {Map<string, string>}
 */
export function buildAliasMap(names) {
    const map = new Map();
    names.forEach((name, i) => {
        const letter = ALPHABET[i % ALPHABET.length];
        const suffix = i >= ALPHABET.length ? String(Math.floor(i / ALPHABET.length) + 1) : '';
        map.set(name, `${letter}${suffix}.`);
    });
    return map;
}

/**
 * Every alias, reachable from a name *or* from one of its parts.
 *
 * A group calls its members by their first name, so words that are part of a
 * name must go too. Words are compared accent- and case-folded, and a word
 * that is part of a name becomes that person's alias.
 * A common word that happens to be a first name (« rose ») goes too: the
 * cost of a missing word is lower than the cost of a name.
 *
 * @param {string[]} names
 */
function aliasLookup(names) {
    const exact = buildAliasMap(names);
    const parts = new Map();
    for (const [name, alias] of exact) {
        for (const part of fold(name).split(/[^\p{L}]+/u)) {
            if (part.length >= 3 && !parts.has(part)) parts.set(part, alias);
        }
    }
    return {
        get: (/** @type {string} */ s) => exact.get(s) ?? parts.get(fold(s)),
    };
}

/**
 * @param {any} stats
 * @param {{ words?: boolean }} [options] `words: true` also drops the
 *   vocabulary clouds — a signature word can identify someone as surely as
 *   their name.
 * @returns {any} A new stats object; the input is left untouched.
 */
export function anonymizeStats(stats, options = {}) {
    if (!stats) return stats;
    const names = (stats.ranking || []).map(([name]) => name);
    if (names.length === 0) return stats;

    const out = remap(stats, aliasLookup(names));

    if (options.words) {
        out.topWords = [];
        out.topWordsPerPerson = {};
        out.uniqueWordsPerPerson = {};
        for (const profile of out.profiles || []) profile.signatureWord = null;
        // The words a notable day turned on are vocabulary too — « déménagement »
        // on a dated day narrows a person down as surely as a signature word.
        for (const day of [...(out.sentiment?.bestDays || []), ...(out.sentiment?.worstDays || [])]) {
            if (day.context) day.context.keywords = [];
        }
    }
    return out;
}

/**
 * The comparison that travels with a share: its appeared / disappeared words
 * are vocabulary like any other.
 *
 * @param {any} comparison
 * @param {any} stats the stats whose ranking names the people
 * @param {{ words?: boolean }} [options]
 */
export function anonymizeComparison(comparison, stats, options = {}) {
    if (!comparison) return comparison;
    const names = (stats?.ranking || []).map(([name]) => name);
    const out = names.length ? remap(comparison, aliasLookup(names)) : remap(comparison, new Map());
    if (options.words) {
        out.appeared = [];
        out.disappeared = [];
    }
    return out;
}

/** Deep copy with every known name — key or value — swapped for its alias. */
function remap(value, alias) {
    if (typeof value === 'string') return alias.get(value) ?? value;
    if (Array.isArray(value)) return value.map(v => remap(v, alias));
    if (value instanceof Date) return new Date(value.getTime());
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            // A forged `__proto__` key must not replace the copy's prototype.
            if (k === '__proto__') continue;
            out[alias.get(k) ?? k] = remap(v, alias);
        }
        return out;
    }
    return value;
}
