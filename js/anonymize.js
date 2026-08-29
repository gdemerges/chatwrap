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

    const alias = buildAliasMap(names);
    const out = remap(stats, alias);

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

/** Deep copy with every known name — key or value — swapped for its alias. */
function remap(value, alias) {
    if (typeof value === 'string') return alias.get(value) ?? value;
    if (Array.isArray(value)) return value.map(v => remap(v, alias));
    if (value instanceof Date) return new Date(value.getTime());
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[alias.get(k) ?? k] = remap(v, alias);
        }
        return out;
    }
    return value;
}
