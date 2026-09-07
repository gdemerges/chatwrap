/**
 * Reduced motion, on the two surfaces CSS cannot reach.
 *
 * The stylesheet already collapses every duration and switches the slide
 * choreography off by name, so this covers only what a stylesheet has no say
 * over: a chart drawn on a canvas, and the deck's decision to swap slides
 * outright instead of transitioning between them.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** Install a `matchMedia` that answers `reduce` and can be flipped later. */
function stubMatchMedia(initial) {
    let matches = initial;
    const listeners = new Set();
    window.matchMedia = vi.fn(() => ({
        get matches() { return matches; },
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: (_, fn) => listeners.add(fn),
        removeEventListener: (_, fn) => listeners.delete(fn),
    }));
    return (next) => { matches = next; listeners.forEach(fn => fn({ matches: next })); };
}

/** Fresh module graph, so `motion.js` re-reads the stub above. */
async function loadCharts() {
    vi.resetModules();
    return import('../js/slides/_charts.js');
}

let created;

beforeEach(() => {
    created = [];
    window.Chart = class {
        constructor(ctx, config) { created.push(config); this.options = config.options || {}; }
        destroy() {}
        update() {}
    };
});

afterEach(() => { delete window.Chart; });

describe('charts under reduced motion', () => {
    it('draws in the final state instead of growing in', async () => {
        stubMatchMedia(true);
        const { makeChart } = await loadCharts();
        makeChart({}, { type: 'bar', options: { responsive: true } });
        expect(created[0].options.animation).toBe(false);
        // `animation: false` alone leaves the per-property animations running.
        expect(created[0].options.animations).toBe(false);
        // Unrelated options survive the merge.
        expect(created[0].options.responsive).toBe(true);
    });

    it('leaves the animation alone when nothing was asked for', async () => {
        stubMatchMedia(false);
        const { makeChart } = await loadCharts();
        makeChart({}, { type: 'bar', options: { responsive: true } });
        expect(created[0].options.animation).toBeUndefined();
    });

    it('keeps the chart still across a theme flip', async () => {
        stubMatchMedia(true);
        const { makeChart, retintCharts } = await loadCharts();
        // The guard only earns its place for a config that asks for an
        // animation itself: `retintCharts` re-applies the *raw* options, so
        // anything spelled out there comes back. No slide does this today —
        // which is exactly why it would go unnoticed when one starts.
        const chart = makeChart({}, {
            type: 'bar',
            options: { responsive: true, animation: { duration: 1000 } },
        });
        expect(chart.options.animation).toBe(false);
        retintCharts();
        expect(chart.options.animation).toBe(false);
    });
});

describe('the motion preference is live', () => {
    it('follows a mid-session flip', async () => {
        const flip = stubMatchMedia(false);
        vi.resetModules();
        const { prefersReducedMotion, onMotionPreferenceChange } = await import('../js/ui/motion.js');
        const seen = [];
        onMotionPreferenceChange(v => seen.push(v));
        expect(prefersReducedMotion()).toBe(false);
        flip(true);
        expect(seen).toEqual([true]);
        expect(prefersReducedMotion()).toBe(true);
    });

    it('survives a browser with no matchMedia at all', async () => {
        // @ts-expect-error deliberately removing the API
        delete window.matchMedia;
        vi.resetModules();
        const { prefersReducedMotion, onMotionPreferenceChange } = await import('../js/ui/motion.js');
        expect(prefersReducedMotion()).toBe(false);
        expect(() => onMotionPreferenceChange(() => {})()).not.toThrow();
    });
});
