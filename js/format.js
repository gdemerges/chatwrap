/**
 * Locale-aware formatting.
 *
 * Kept apart from `utils.js` on purpose: `utils.js` is imported by `stats.js`
 * and therefore by the worker, and the worker has no business loading the UI
 * dictionaries. Everything here reads the current locale, so it belongs to the
 * page, not to the computation.
 */

import { intlLocale, t, tList } from './i18n.js';

/** "1 234 567" / "1,234,567" */
export function fmt(n) {
    return Number(n).toLocaleString(intlLocale());
}

/**
 * "3,0" / "3.0" — a figure with a fixed number of decimals.
 *
 * `stats.js` hands over `toFixed` strings ("46.1"), which carry a dot whatever
 * the language. Anything that isn't a number (a forged share link) is shown
 * as it came, rather than as "NaN".
 */
export function fmtDecimal(n, digits = 1) {
    const x = Number(n);
    if (!Number.isFinite(x)) return String(n ?? '');
    return x.toLocaleString(intlLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** A duration in minutes, as "45 min" / "2h 10min". */
export function fmtTime(minutes) {
    if (minutes < 60) return t('format.minutes', { n: Math.round(minutes) });
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? t('format.hoursMinutes', { h, m }) : t('format.hours', { h });
}

/** "15 mars 2024" / "15 March 2024" */
export function fmtDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "15 mars" — same day, without the year. */
export function fmtDayMonth(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long' });
}

/** "14:30" */
export function fmtClock(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' });
}

/** An hour of the day: "14h" in French, "14:00" in English. */
export function fmtHour(h) {
    return t('format.hour', { h });
}

/** The seven weekday names, Monday first — the order of `stats.weekday`. */
export function dayNames() {
    return tList('days');
}

/**
 * The name of a weekday by index, Monday = 0.
 * @param {number} index
 */
export function dayName(index) {
    return dayNames()[index] ?? '';
}

/**
 * The busiest weekday of a stats payload.
 *
 * `peakDayIndex` is the current shape; `peakDay` is the French string older
 * payloads carry, and a share link minted before the translation still has to
 * render — so it is used as-is rather than dropped.
 */
export function peakDayName(stats) {
    if (typeof stats.peakDayIndex === 'number') return dayName(stats.peakDayIndex);
    return stats.peakDay || '';
}

/** "mars 24" — the compact label used along a chart axis. */
export function monthShort(key) {
    const [y, m] = String(key).split('-');
    return new Date(Number(y), Number(m) - 1)
        .toLocaleDateString(intlLocale(), { month: 'short', year: '2-digit' });
}

/** "mars 2024" — the long form used in prose. */
export function monthLong(key) {
    const [y, m] = String(key).split('-');
    return new Date(Number(y), Number(m) - 1)
        .toLocaleDateString(intlLocale(), { month: 'long', year: 'numeric' });
}

/** "mars 2024" in the dashboard's tighter tables. */
export function monthMedium(key) {
    const [y, m] = String(key).split('-');
    return new Date(Number(y), Number(m) - 1)
        .toLocaleDateString(intlLocale(), { month: 'short', year: 'numeric' });
}

/**
 * Drop the markup from a translated string.
 *
 * Several sentences carry `<strong>` for the slide and are reused verbatim on
 * the exported image, where canvas draws text and nothing else. Keeping one
 * translation and stripping the tags beats maintaining two.
 */
export function stripTags(html) {
    return String(html).replace(/<[^>]+>/g, '');
}
