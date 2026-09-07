/**
 * The furniture both pages carry: service worker, theme toggle, language picker.
 *
 * `app.js` and `dashboard.js` are separate entry points with almost nothing in
 * common — one runs a worker and a deck, the other renders tables. But they
 * open the same way, and they had each grown their own copy of the same three
 * things: an identical service-worker registration, a theme toggle that
 * differed only in the name of its labelling function, and a language picker
 * that was duplicated to the byte. A fourth locale had to be added twice.
 *
 * The one real difference is what a theme flip has to repaint afterwards: the
 * deck must re-tint its charts, the dashboard has nothing to do. That is the
 * `onThemeChange` callback, and it is the only reason this module knows the
 * two callers are not identical.
 */
import { t, LOCALES, getLocale, setLocale } from '../i18n.js';
import { escapeHtml } from '../utils.js';

const $ = (sel) => document.querySelector(sel);

/** Register the service worker, if this browser has one. */
export function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .catch((err) => console.warn('[sw] registration failed:', err));
    });
}

/**
 * Name the theme button for what it will *do*, not what is showing — a button
 * labelled "dark mode" while dark mode is on reads as a status, not a control.
 *
 * @param {HTMLElement|null} btn
 * @param {string|undefined} theme
 */
export function labelThemeButton(btn, theme) {
    if (!btn) return;
    btn.setAttribute('aria-label', t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark'));
    btn.setAttribute('title', t(theme === 'dark' ? 'theme.light' : 'theme.dark'));
}

/**
 * Apply the saved theme and wire the toggle.
 *
 * @param {{ onThemeChange?: () => void }} [options] run after each flip — the
 *   deck uses it to re-tint charts, which are painted on canvas and cannot
 *   follow a CSS custom property.
 */
export function initTheme({ onThemeChange } = {}) {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.dataset.theme = saved;
    const btn = $('#theme-toggle');
    if (!btn) return;
    labelThemeButton(btn, saved);
    btn.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('theme', next);
        labelThemeButton(btn, next);
        onThemeChange?.();
    });
}

/**
 * The language picker.
 *
 * Options are built from `LOCALES` rather than written in the HTML, so a new
 * dictionary shows up in the menu the moment it is registered.
 */
export function initLangPicker() {
    const select = $('#lang-select');
    if (!select) return;
    select.innerHTML = Object.values(LOCALES)
        .map(l => `<option value="${l.code}">${escapeHtml(l.label)}</option>`).join('');
    select.value = getLocale();
    select.addEventListener('change', () => setLocale(select.value));
}

/**
 * Re-sync the chrome after a language change: the theme button's labels and
 * the picker's own selected value. Both pages do exactly this much before
 * going on to repaint whatever else they own.
 */
export function syncChromeLocale() {
    labelThemeButton($('#theme-toggle'), document.documentElement.dataset.theme);
    const picker = $('#lang-select');
    if (picker) picker.value = getLocale();
}
