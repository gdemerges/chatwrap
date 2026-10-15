/**
 * Pin one conversation, then compare the next one to it.
 *
 * The maths is `compareYears` in `stats.js` (pure, any two stats objects).
 * What is kept in localStorage is a **digest**, not the stats: exactly the
 * fields `compareYears` reads, plus a name and a date — a couple of kilobytes
 * instead of hundreds, and it survives loading the second file.
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
        // A malformed digest is treated as absent rather than letting
        // `compareYears` throw halfway through building the deck.
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
