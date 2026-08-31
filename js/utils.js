/**
 * Shared helpers with no locale and no DOM: escaping and date keys.
 *
 * The formatters used to live here too, but `stats.js` imports this module and
 * runs inside the worker — pulling the UI dictionaries in with it. Anything
 * that reads the current language is in `js/format.js` instead.
 */

export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Local YYYY-MM-DD key — avoids toISOString UTC shift that made late-evening
 * messages count against the wrong day in non-UTC timezones.
 */
export function localDayKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function localMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Return `messages` in chronological order, without copying when it already is.
 *
 * `compute` used to open with `[...messages].sort(...)` unconditionally: a full
 * copy of the array plus an O(n log n) sort, paid twice per analysis (once for
 * the selection, once for the comparison baseline) — on an export with half a
 * million messages that is two pointless copies of a very large array. A
 * WhatsApp export is written in order, so the check below almost always walks
 * the array once and hands back the very same reference.
 *
 * @template {{ datetime: Date }} T
 * @param {T[]} messages
 * @returns {T[]}
 */
export function ensureChronological(messages) {
    for (let i = 1; i < messages.length; i++) {
        if (messages[i].datetime.getTime() < messages[i - 1].datetime.getTime()) {
            return [...messages].sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
        }
    }
    return messages;
}

/**
 * Index of the first message at or after `time`, in a chronologically sorted
 * array. `messages.length` when there is none.
 *
 * @param {{ datetime: Date }[]} messages
 * @param {number} time epoch milliseconds
 */
export function lowerBound(messages, time) {
    let lo = 0;
    let hi = messages.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (messages[mid].datetime.getTime() < time) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

/**
 * The slice of a sorted array covering `[from, to)`, in epoch milliseconds.
 *
 * Selecting a year used to be `all.filter(m => m.datetime.getFullYear() === y)`,
 * which walks every message and allocates a fresh array — and it ran three
 * times per analysis (selection, previous year, previous window). Sorted input
 * makes both ends a binary search.
 *
 * @template {{ datetime: Date }} T
 * @param {T[]} messages
 * @returns {T[]}
 */
export function sliceByTime(messages, from, to) {
    const start = lowerBound(messages, from);
    const end = lowerBound(messages, to);
    return start === 0 && end === messages.length ? messages : messages.slice(start, end);
}
