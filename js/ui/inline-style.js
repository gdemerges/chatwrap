/**
 * Dynamic styles without `'unsafe-inline'`.
 *
 * Slide templates need per-render values — a person's colour, a bar's width —
 * that no stylesheet can know in advance. Writing them as `style="…"` inside an
 * HTML string is exactly what a strict `style-src` refuses: the browser blocks
 * the *attribute*, however the string got there.
 *
 * The CSSOM is not covered by that rule, so templates write `data-css="…"`
 * instead and this module moves the value across with `el.style.cssText`. A
 * `MutationObserver` does it for everything that is ever inserted — deck,
 * dashboard, dialogs — so no call site has to remember. Observer callbacks are
 * microtasks: they run before the browser paints, so nothing flashes unstyled.
 */

const SELECTOR = '[data-css]';

function apply(el) {
    const css = el.getAttribute('data-css');
    el.removeAttribute('data-css');
    if (css) el.style.cssText += `;${css}`;
}

/** Convert every `data-css` under `root` (and `root` itself) into a live style. */
export function applyInlineStyles(root = document) {
    if (root.matches?.(SELECTOR)) apply(root);
    root.querySelectorAll?.(SELECTOR).forEach(apply);
}

/**
 * Convert what is there now and everything added later.
 *
 * @returns {() => void} stop watching
 */
export function watchInlineStyles(root = document.documentElement) {
    applyInlineStyles(root);
    const observer = new MutationObserver((records) => {
        for (const r of records) r.addedNodes.forEach((n) => {
            if (n.nodeType === 1) applyInlineStyles(n);
        });
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
}
