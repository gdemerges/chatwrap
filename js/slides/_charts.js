/**
 * Chart.js instance registry.
 *
 * Two problems this solves:
 *  1. Leaks — slides are torn down with `innerHTML = ''` on every year switch
 *     and every new analysis, but Chart.js keeps its instances registered
 *     (holding the detached canvas and its data). They must be destroyed.
 *  2. Theming — Chart.js draws on canvas and cannot resolve `var(--token)`.
 *     Colors were therefore resolved once, at chart creation, and stayed
 *     frozen when the user flipped the theme.
 *
 * `makeChart` accepts `var(--token)` strings anywhere in the config, resolves
 * them at build time, and keeps the untouched config so every chart can be
 * re-tinted in place when the theme changes.
 */

import { prefersReducedMotion } from '../ui/motion.js';

const VAR_RE = /^var\(\s*(--[\w-]+)\s*\)$/;

/** @type {Set<{ chart: any, raw: any }>} */
const registry = new Set();

/** Resolve a CSS custom property to its concrete value. */
export function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

/** Deep-copy a config, replacing every `var(--x)` string with its current value. */
function resolveTokens(value) {
    if (typeof value === 'string') {
        const m = value.match(VAR_RE);
        return m ? cssVar(m[1]) : value;
    }
    if (Array.isArray(value)) return value.map(resolveTokens);
    // Typed arrays / Dates / functions are passed through untouched.
    if (value && typeof value === 'object' && value.constructor === Object) {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = resolveTokens(v);
        return out;
    }
    return value;
}

/**
 * Create a chart and register it for teardown + re-theming.
 * @param {CanvasRenderingContext2D|HTMLCanvasElement} ctx
 * @param {any} config Chart.js config; may contain `var(--token)` color strings.
 */
export function makeChart(ctx, config) {
    const chart = new window.Chart(ctx, stillIfAsked(resolveTokens(config)));
    registry.add({ chart, raw: config });
    return chart;
}

/**
 * Draw the chart in its final state instead of growing into it.
 *
 * A canvas is the one surface `prefers-reduced-motion` cannot reach from CSS,
 * so every chart kept its default one-second grow-in — bars rising and lines
 * drawing themselves — for users who had asked the whole page to hold still.
 * Chart.js takes `false` for both the initial animation and the per-property
 * ones; setting only `animation` leaves the latter running.
 */
function stillIfAsked(config) {
    if (!prefersReducedMotion()) return config;
    return { ...config, options: { ...config.options, animation: false, animations: false } };
}

/** Destroy every live chart. Call before wiping the slide container. */
export function destroyAllCharts() {
    for (const entry of registry) {
        try { entry.chart.destroy(); } catch { /* already gone */ }
    }
    registry.clear();
}

/**
 * Re-resolve every `var(--token)` in each live chart's options and redraw.
 * Datasets are left alone: their colors are the fixed CHART_COLORS palette,
 * which is deliberately theme-independent.
 */
export function retintCharts() {
    for (const entry of registry) {
        const { chart, raw } = entry;
        if (!raw.options) continue;
        // Re-applying the raw options would hand the animation flags back,
        // so a theme flip re-armed the grow-in that `makeChart` had removed.
        Object.assign(chart.options, stillIfAsked({ options: resolveTokens(raw.options) }).options);
        try { chart.update('none'); } catch { /* detached */ }
    }
}
