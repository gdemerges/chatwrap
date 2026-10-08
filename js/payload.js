/**
 * Shared serialization for stats payloads (sessionStorage + #share URL).
 * Never include raw message bodies — only metadata.
 */

/**
 * ISO string for a date, or null when it is missing or unparseable. Without
 * this guard, one bad date makes toISOString() throw and the whole share link
 * fails. null is kept as null on the way back: `new Date(null)` would revive
 * it as 1970.
 */
function isoOrNull(value) {
    if (value == null) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function serializeStats(stats) {
    const s = JSON.parse(JSON.stringify(stats));
    s.startDate = isoOrNull(stats.startDate);
    s.endDate = isoOrNull(stats.endDate);
    if (s.firstMessage?.datetime) {
        s.firstMessage.datetime = isoOrNull(stats.firstMessage.datetime);
        delete s.firstMessage.message;
    }
    if (s.longestMessage?.datetime) {
        s.longestMessage.datetime = isoOrNull(stats.longestMessage.datetime);
        delete s.longestMessage.message;
    }
    if (s.ghosting?.longest) {
        s.ghosting.longest = s.ghosting.longest.map(g => ({ ...g, when: isoOrNull(g.when) }));
    }
    return s;
}

export function rehydrateDates(stats) {
    if (typeof stats.startDate === 'string') stats.startDate = new Date(stats.startDate);
    if (typeof stats.endDate === 'string') stats.endDate = new Date(stats.endDate);
    if (stats.firstMessage?.datetime && typeof stats.firstMessage.datetime === 'string') {
        stats.firstMessage.datetime = new Date(stats.firstMessage.datetime);
    }
    if (stats.longestMessage?.datetime && typeof stats.longestMessage.datetime === 'string') {
        stats.longestMessage.datetime = new Date(stats.longestMessage.datetime);
    }
    if (stats.ghosting?.longest) {
        stats.ghosting.longest = stats.ghosting.longest.map(g => ({
            ...g,
            when: g.when == null || g.when instanceof Date ? g.when : new Date(g.when),
        }));
    }
    return stats;
}

/**
 * Neutralize HTML in a payload received via a #share URL.
 * That payload is attacker-controlled: fields the UI assumes numeric
 * (avgPerDay, streak.max, percent…) are interpolated without escaping, so a
 * forged link could inject markup. Stripping <, > and " from every string
 * (keys included) closes element and attribute injection wholesale, without
 * having to whitelist each field.
 */
export function sanitizeShared(value) {
    if (typeof value === 'string') return value.replace(/[<>"]/g, '');
    if (Array.isArray(value)) return value.map(sanitizeShared);
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[sanitizeShared(k)] = sanitizeShared(v);
        return out;
    }
    return value;
}

// Conservative bound: some messaging apps / older clients mangle or clip
// URLs well before typical browser limits. Fields are dropped heaviest-first
// until the compressed link fits, or there's nothing left to trim.
const SHARE_URL_SAFE_LENGTH = 6000;
const TRIMMABLE_FIELDS = ['monthlyPerPerson', 'topWordsPerPerson', 'uniqueWordsPerPerson', 'monthly', 'topWords', 'heatmap'];

/**
 * @returns {{ url: string, truncated: boolean }}
 */
export function buildShareURL(stats, comparison, opts = {}) {
    const s = serializeStats(stats);
    if (opts.dropDaily) delete s.daily;

    const build = () => window.location.origin + window.location.pathname
        + '#share=' + LZString.compressToEncodedURIComponent(JSON.stringify({ s, c: comparison }));

    let url = build();
    let truncated = false;
    for (const field of TRIMMABLE_FIELDS) {
        if (url.length <= SHARE_URL_SAFE_LENGTH) break;
        if (!(field in s)) continue;
        delete s[field];
        truncated = true;
        url = build();
    }

    return { url, truncated };
}
