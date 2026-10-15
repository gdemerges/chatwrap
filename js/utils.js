/**
 * Shared helpers with no locale and no DOM: escaping, date keys, sorted-array
 * slicing. Imported by the worker, so nothing here may import the UI
 * dictionaries — language-dependent formatting lives in `js/format.js`.
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
 * Local YYYY-MM-DD key. Never `toISOString`: its UTC shift moves late-evening
 * messages to the wrong day outside UTC.
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
 * An export is written in order, so this almost always walks the array once
 * and returns the same reference — no copy, no sort, even on huge chats.
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
 * Both ends are a binary search; returns `messages` itself when the range
 * covers it all.
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

/**
 * The chat inside an exported ZIP.
 *
 * An export "with media" may carry attached `.txt` files next to the chat.
 * iOS always names the chat `_chat.txt`; Android names it after the contact,
 * in the phone's language, so there the largest `.txt` wins.
 *
 * @template {{ name: string, dir: boolean, _data?: { uncompressedSize?: number } }} T
 * @param {T[]} entries  JSZip file objects
 * @returns {T | undefined}
 */
export function pickChatEntry(entries) {
    const texts = entries.filter(f => !f.dir && f.name.toLowerCase().endsWith('.txt'));
    const ios = texts.find(f => f.name.split('/').pop() === '_chat.txt');
    if (ios) return ios;
    const size = (f) => f._data?.uncompressedSize ?? 0;
    return texts.reduce((best, f) => (!best || size(f) > size(best) ? f : best), undefined);
}
