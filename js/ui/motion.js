/**
 * One source of truth for "the user asked for less movement".
 *
 * The CSS side of this is already handled — a blanket rule collapses every
 * duration, and the slide choreography is switched off by name. Two things
 * escape CSS and have to ask in JavaScript:
 *
 *  • Chart.js draws on a canvas, where a stylesheet has no reach at all.
 *  • The deck skips its slide transition outright rather than running it at
 *    0.01ms, because the transition is what drives its cleanup timer.
 *
 * The query is resolved on every call, never captured at import: at import
 * time a test has not stubbed `matchMedia` yet, and `window` may not exist.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

/** @returns {MediaQueryList | null} */
function query() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    try { return window.matchMedia(QUERY); } catch { return null; }
}

/** @returns {boolean} */
export function prefersReducedMotion() {
    return query()?.matches ?? false;
}

/**
 * Call `fn` whenever the preference flips. Returns an unsubscribe function.
 *
 * Safari below 14 exposes only the deprecated `addListener`, and a stubbed
 * `matchMedia` often has neither — hence the feature checks rather than a
 * direct call.
 *
 * @param {(reduced: boolean) => void} fn
 * @returns {() => void}
 */
export function onMotionPreferenceChange(fn) {
    const mql = query();
    if (!mql) return () => {};
    const handler = () => fn(mql.matches);
    if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
    }
    if (typeof mql.addListener === 'function') {
        mql.addListener(handler);
        return () => mql.removeListener(handler);
    }
    return () => {};
}
