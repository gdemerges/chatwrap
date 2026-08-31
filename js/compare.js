/**
 * Pin one conversation, then compare the next one to it.
 *
 * The year-over-year comparison already existed, and `compareYears` in
 * `stats.js` is pure: it takes two stats objects and says how the first
 * differs from the second. It never cared that they came from the same file —
 * that was only ever how it happened to be called. So comparing two different
 * conversations needs no new maths, just somewhere to keep the first one.
 *
 * What is kept is a **digest**, not the stats: exactly the eight fields
 * `compareYears` reads, plus a name and a date. A full stats object for a busy
 * group runs to hundreds of kilobytes — daily counts, heatmap, per-person
 * monthly series — and none of it is used here. The digest is a couple of
 * kilobytes and fits comfortably in localStorage, which is where it has to
 * live: the whole point is that it survives loading the second file.
 *
 * The name is the file name the user chose, and it never leaves the device —
 * it is not in the share payload and not in any analytics event.
 */

const PINNED_KEY = 'ww-pinned';

/**
 * The fields `compareYears` reads, and nothing else.
 * @param {any} stats
 */
function digest(stats) {
    return {
        totalMessages: stats.totalMessages,
        totalDays: stats.totalDays,
        avgPerDay: stats.avgPerDay,
        totalMedia: stats.totalMedia,
        avgMsgLen: stats.avgMsgLen,
        emojis: { total: stats.emojis?.total || 0 },
        streak: { max: stats.streak?.max || 0 },
        // Trimmed: the words slide only shows six on each side, and the whole
        // point of a digest is that it stays small.
        topWords: (stats.topWords || []).slice(0, 30),
    };
}

/**
 * @param {any} stats
 * @param {string} name Label shown next to the comparison — a file name.
 * @returns {boolean} false if storage refused the write.
 */
export function pinConversation(stats, name) {
    if (!stats) return false;
    try {
        localStorage.setItem(PINNED_KEY, JSON.stringify({
            name: String(name || '').slice(0, 120),
            savedAt: Date.now(),
            digest: digest(stats),
        }));
        return true;
    } catch (err) {
        console.warn('[compare] could not pin:', err);
        return false;
    }
}

/**
 * @returns {{ name: string, savedAt: number, digest: any } | null}
 */
export function getPinned() {
    try {
        const raw = localStorage.getItem(PINNED_KEY);
        if (!raw) return null;
        const pinned = JSON.parse(raw);
        // A digest written by an older version may be missing fields
        // `compareYears` indexes into; treat anything unexpected as absent
        // rather than letting it throw halfway through building the deck.
        if (!pinned?.digest || typeof pinned.digest.totalMessages !== 'number') return null;
        return pinned;
    } catch (err) {
        console.warn('[compare] could not read the pin:', err);
        return null;
    }
}

export function clearPinned() {
    try {
        localStorage.removeItem(PINNED_KEY);
    } catch { /* nothing to clear, then */ }
}

/**
 * Is the pinned conversation the same one we are looking at?
 *
 * Compared on the numbers rather than on the name, because the name is a file
 * name: re-exporting the same chat gives a different one, and analysing a
 * different period of the same file gives the same one. Two conversations that
 * agree on the message count, the span *and* the average are the same
 * conversation for the purposes of "there is nothing to compare here".
 */
export function isSameConversation(stats, pinned) {
    if (!stats || !pinned) return false;
    const d = pinned.digest;
    return d.totalMessages === stats.totalMessages
        && d.totalDays === stats.totalDays
        && String(d.avgPerDay) === String(stats.avgPerDay);
}
