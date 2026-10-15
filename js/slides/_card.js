/**
 * Helpers for the `card` descriptor a slide attaches to describe itself to the
 * image exporter (`js/export-image.js`).
 *
 * A card is plain data — no HTML, no DOM — so the exported image is laid out
 * for its format (story or poster) rather than being a screenshot of a slide.
 */
import { CHART_COLORS } from './_constants.js';

/**
 * @param {Array<[string, any]>} entries
 * @param {(entry: [string, any]) => number} valueFn
 * @param {(entry: [string, any]) => string} labelFn
 */
export function barsFrom(entries, valueFn, labelFn, limit = 8) {
    const slice = entries.slice(0, limit);
    const max = slice.reduce((m, e) => Math.max(m, valueFn(e)), 0) || 1;
    return slice.map((entry, i) => ({
        label: entry[0],
        value: labelFn(entry),
        ratio: valueFn(entry) / max,
        color: CHART_COLORS[i % CHART_COLORS.length],
    }));
}
