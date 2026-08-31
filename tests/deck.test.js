/**
 * The deck was the largest untested surface in the app: navigation bounds,
 * story mode, the aria plumbing and the lazy chart init all lived only in the
 * browser. It runs fine under jsdom once `matchMedia` and the chart loader are
 * stubbed, which is what this file does.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// `vendor.js` reaches for a CDN; `_charts.js` needs a real Chart.js. Neither is
// what the deck's own logic is about.
const ensureChart = vi.fn(async () => {});
vi.mock('../js/vendor.js', () => ({ ensureChart: (...a) => ensureChart(...a), preload: () => {} }));
vi.mock('../js/slides/_charts.js', () => ({ destroyAllCharts: () => {}, retintCharts: () => {} }));

const { Deck, bindNavigation } = await import('../js/deck.js');
const { setLocale } = await import('../js/i18n.js');

/** A deck of `n` slides, mounted into a fresh document. */
function makeDeck(n, { withChart = false } = {}) {
    document.body.innerHTML = `
        <div id="container"></div>
        <div id="counter"></div>
        <div id="progress"></div>
        <div id="a11y-live"></div>`;
    const deck = new Deck({
        container: document.querySelector('#container'),
        counter: document.querySelector('#counter'),
        progress: document.querySelector('#progress'),
    });
    const slides = Array.from({ length: n }, (_, i) => ({
        gradient: 'slide-gradient-1',
        html: `<div class="slide-inner"><h2>Slide ${i}</h2><canvas></canvas></div>`,
        ...(withChart ? { chart: vi.fn() } : {}),
    }));
    deck.mount(slides);
    return { deck, slides };
}

const live = () => document.querySelector('#a11y-live').textContent;
const segs = () => [...document.querySelectorAll('.progress-seg')];

/**
 * Let the slide transition finish.
 *
 * `goTo` refuses a second move while one is animating — that guard is what
 * keeps a held-down arrow key from tearing the deck apart, so the tests wait
 * it out rather than switching it off.
 */
const settle = () => vi.advanceTimersByTime(600);

/** Drain the microtask queue, for the async chart init. */
const flush = () => Promise.resolve().then(() => {}).then(() => {});

beforeEach(() => {
    vi.useFakeTimers();
    window.location.hash = '';
    setLocale('fr');
    // The deck reads this once, in the constructor.
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    // jsdom has no 2D context; the deck only forwards whatever it gets.
    window.HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}));
    ensureChart.mockClear();
});

afterEach(() => { vi.useRealTimers(); });

describe('Deck — mounting', () => {
    it('renders one slide and one tab per entry, with the first active', () => {
        const { deck } = makeDeck(4);
        expect(document.querySelectorAll('.slide')).toHaveLength(4);
        expect(segs()).toHaveLength(4);
        expect(deck.index).toBe(0);
        expect(deck.length).toBe(4);
        expect(document.querySelector('#slide-0').classList.contains('active')).toBe(true);
    });

    it('wires the tablist to the panels', () => {
        makeDeck(3);
        const [first] = segs();
        expect(first.getAttribute('role')).toBe('tab');
        expect(first.getAttribute('aria-controls')).toBe('slide-0');
        expect(document.querySelector('#slide-0').getAttribute('role')).toBe('tabpanel');
    });

    it('keeps exactly one slide out of `inert`, so hidden buttons are unreachable', () => {
        const { deck } = makeDeck(3);
        const inert = () => [...document.querySelectorAll('.slide')].map(el => el.hasAttribute('inert'));
        expect(inert()).toEqual([false, true, true]);
        deck.goTo(2, { immediate: true });
        expect(inert()).toEqual([true, true, false]);
    });

    it('gives the tablist a single tab stop that follows the current slide', () => {
        const { deck } = makeDeck(3);
        expect(segs().map(s => s.tabIndex)).toEqual([0, -1, -1]);
        deck.goTo(1, { immediate: true });
        expect(segs().map(s => s.tabIndex)).toEqual([-1, 0, -1]);
    });

    it('starts on the slide named in the hash', () => {
        window.location.hash = '#slide=2';
        const { deck } = makeDeck(5);
        expect(deck.index).toBe(2);
    });

    it('ignores a hash pointing past the end', () => {
        window.location.hash = '#slide=99';
        const { deck } = makeDeck(3);
        expect(deck.index).toBe(0);
    });

    it('clear() empties the deck', () => {
        const { deck } = makeDeck(3);
        deck.clear();
        expect(deck.length).toBe(0);
        expect(document.querySelectorAll('.slide')).toHaveLength(0);
        expect(segs()).toHaveLength(0);
    });
});

describe('Deck — navigation', () => {
    it('moves forward and back, and stops at both ends', () => {
        const { deck } = makeDeck(3);
        deck.next(); settle(); expect(deck.index).toBe(1);
        deck.next(); settle(); expect(deck.index).toBe(2);
        deck.next(); settle(); expect(deck.index).toBe(2);   // no wrap-around
        deck.prev(); settle(); expect(deck.index).toBe(1);
        deck.prev(); settle(); expect(deck.index).toBe(0);
        deck.prev(); settle(); expect(deck.index).toBe(0);
    });

    it('refuses an out-of-range index', () => {
        const { deck } = makeDeck(3);
        deck.goTo(-1); expect(deck.index).toBe(0);
        deck.goTo(9);  expect(deck.index).toBe(0);
    });

    it('ignores a second move while one is still animating', () => {
        const { deck } = makeDeck(4);
        deck.next();
        deck.next();               // swallowed: the first is still in flight
        expect(deck.index).toBe(1);
        settle();
        deck.next();
        expect(deck.index).toBe(2);
    });

    it('announces the position and updates the counter', () => {
        const { deck } = makeDeck(4);
        deck.goTo(2, { immediate: true });
        expect(document.querySelector('#counter').textContent).toBe('3 / 4');
        expect(live()).toBe('Slide 3 sur 4');
    });

    it('announces in the active language', () => {
        setLocale('en');
        const { deck } = makeDeck(4);
        deck.goTo(1, { immediate: true });
        expect(live()).toBe('Slide 2 of 4');
    });

    it('records the position in the hash, without piling up history entries', () => {
        const { deck } = makeDeck(4);
        deck.goTo(2, { immediate: true });
        expect(window.location.hash).toBe('#slide=2');
        deck.goTo(0, { immediate: true });
        expect(window.location.hash).toBe('');
    });

    it('moves focus onto the slide only when asked', () => {
        const { deck } = makeDeck(3);
        deck.goTo(1, { immediate: true });
        expect(document.activeElement).toBe(document.body);
        deck.goTo(2, { immediate: true, focus: true });
        expect(document.activeElement).toBe(document.querySelector('#slide-2'));
    });

    it('clicking a tab jumps to its slide', () => {
        const { deck } = makeDeck(5);
        segs()[3].click();
        expect(deck.index).toBe(3);
    });

    it('arrow keys inside the tablist move the selection', () => {
        const { deck } = makeDeck(4);
        const bar = document.querySelector('#progress');
        const press = (key) => {
            bar.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
            settle();
        };
        press('ArrowRight'); expect(deck.index).toBe(1);
        press('End');        expect(deck.index).toBe(3);
        press('Home');       expect(deck.index).toBe(0);
    });
});

describe('Deck — reduced motion', () => {
    it('swaps slides without animating when the user asked for less motion', () => {
        window.matchMedia = vi.fn().mockReturnValue({ matches: true });
        const { deck } = makeDeck(3);
        deck.goTo(1);
        // The animated path leaves inline styles behind; the reduced one must not.
        expect(document.querySelector('#slide-1').style.transform).toBe('');
        expect(deck.animating).toBe(false);
        expect(deck.index).toBe(1);
    });
});

describe('Deck — lazy fill', () => {
    it('writes only the slides in reach, not the whole deck', () => {
        const { deck } = makeDeck(10);
        expect([...deck.filled].sort((a, b) => a - b)).toEqual([0, 1]);
        expect(deck.elements[9].innerHTML).toBe('');
    });

    it('fills a slide as it comes into reach, and keeps the ones behind', () => {
        const { deck } = makeDeck(10);
        deck.goTo(5, { immediate: true });
        expect([...deck.filled].sort((a, b) => a - b)).toEqual([0, 1, 4, 5, 6]);
        expect(deck.elements[5].querySelector('h2').textContent).toBe('Slide 5');
    });

    it('never writes a slide twice', () => {
        const { deck, slides } = makeDeck(4);
        deck.goTo(1, { immediate: true });
        deck.goTo(0, { immediate: true });
        deck.goTo(1, { immediate: true });
        expect(deck.elements[1].querySelectorAll('h2')).toHaveLength(1);
        expect(slides).toHaveLength(4);
    });

    it('announces each slide to the host as it is filled', () => {
        document.body.innerHTML = `
            <div id="container"></div><div id="counter"></div>
            <div id="progress"></div><div id="a11y-live"></div>`;
        const ready = vi.fn();
        const deck = new Deck({
            container: document.querySelector('#container'),
            counter: document.querySelector('#counter'),
            progress: document.querySelector('#progress'),
            onSlideReady: ready,
        });
        deck.mount(Array.from({ length: 5 }, (_, i) => ({
            gradient: 'slide-gradient-1',
            html: `<div class="slide-inner"><h2>Slide ${i}</h2></div>`,
        })));
        expect(ready.mock.calls.map(c => c[0]).sort((a, b) => a - b)).toEqual([0, 1]);
        expect(ready.mock.calls[0][1]).toBe(deck.elements[0]);

        deck.goTo(3, { immediate: true });
        expect(ready.mock.calls.map(c => c[0]).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    });

    it('measures dwell time on the real text, filling the slide if needed', () => {
        const { deck } = makeDeck(6);
        expect(deck.filled.has(4)).toBe(false);
        expect(deck.storyDuration(4)).toBeGreaterThan(0);
        expect(deck.filled.has(4)).toBe(true);
    });

    it('forgets what it filled when cleared', () => {
        const { deck } = makeDeck(4);
        deck.clear();
        expect(deck.filled.size).toBe(0);
    });
});

describe('Deck — story mode', () => {
    it('advances on its own and stops at the last slide', () => {
        const { deck } = makeDeck(3);
        expect(deck.toggleStory()).toBe(true);
        expect(live()).toBe('Lecture automatique démarrée');

        vi.advanceTimersByTime(60_000);
        expect(deck.index).toBe(2);
        expect(deck.storyPlaying).toBe(false);
        expect(document.body.classList.contains('story-playing')).toBe(false);
    });

    it('toggles off and cancels its pending timer', () => {
        const { deck } = makeDeck(5);
        deck.startStory();
        expect(deck.toggleStory()).toBe(false);
        vi.advanceTimersByTime(60_000);
        expect(deck.index).toBe(0);
        expect(live()).toBe('Lecture automatique arrêtée');
    });

    it('restarts from the top when played from the last slide', () => {
        const { deck } = makeDeck(3);
        deck.goTo(2, { immediate: true });
        deck.startStory();
        expect(deck.index).toBe(0);
    });

    it('dwells longer on a slide with more to read', () => {
        const { deck } = makeDeck(2);
        deck.elements[1].querySelector('h2').textContent = 'x'.repeat(400);
        expect(deck.storyDuration(1)).toBeGreaterThan(deck.storyDuration(0));
    });

    it('caps the dwell time however long the slide is', () => {
        const { deck } = makeDeck(1);
        deck.elements[0].querySelector('h2').textContent = 'x'.repeat(100_000);
        expect(deck.storyDuration(0)).toBeLessThanOrEqual(9000);
    });

    /** Auto-play in a hidden tab burned through the deck with nobody watching. */
    describe('pausing with the tab', () => {
        const hide = (hidden) => {
            Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
        };
        afterEach(() => hide(false));

        it('pauses while the tab is hidden and resumes where it stopped', () => {
            const { deck } = makeDeck(6);
            deck.startStory();
            vi.advanceTimersByTime(5_000);
            const reached = deck.index;
            expect(reached).toBeGreaterThan(0);

            hide(true);
            expect(deck.storyPlaying).toBe(false);
            vi.advanceTimersByTime(120_000);
            expect(deck.index).toBe(reached);

            hide(false);
            expect(deck.storyPlaying).toBe(true);
            expect(deck.index).toBe(reached);
        });

        it('leaves a deliberately stopped deck stopped', () => {
            const { deck } = makeDeck(4);
            deck.startStory();
            deck.toggleStory();
            hide(true);
            hide(false);
            expect(deck.storyPlaying).toBe(false);
        });

        it('does not start playing a deck that was never playing', () => {
            const { deck } = makeDeck(4);
            hide(true);
            hide(false);
            expect(deck.storyPlaying).toBe(false);
        });
    });
});

describe('Deck — lazy charts', () => {
    it('only builds the chart of the slide on screen', async () => {
        const { slides } = makeDeck(3, { withChart: true });
        await flush();
        expect(slides[0].chart).toHaveBeenCalledTimes(1);
        expect(slides[1].chart).not.toHaveBeenCalled();
    });

    it('pre-warms the next chart on navigation, once each', async () => {
        const { deck, slides } = makeDeck(3, { withChart: true });
        await flush();
        deck.goTo(1, { immediate: true });
        await flush();
        expect(slides[1].chart).toHaveBeenCalledTimes(1);
        expect(slides[2].chart).toHaveBeenCalledTimes(1);
        expect(slides[0].chart).toHaveBeenCalledTimes(1);   // not re-initialised
    });

    it('does not re-run a chart when the slide is revisited', async () => {
        const { deck, slides } = makeDeck(3, { withChart: true });
        deck.goTo(1, { immediate: true });
        deck.goTo(0, { immediate: true });
        deck.goTo(1, { immediate: true });
        await flush();
        expect(slides[1].chart).toHaveBeenCalledTimes(1);
    });

    it('survives a chart library that will not load', async () => {
        ensureChart.mockRejectedValue(new Error('offline'));
        const { slides } = makeDeck(2, { withChart: true });
        await flush();
        expect(ensureChart).toHaveBeenCalled();
        expect(slides[0].chart).not.toHaveBeenCalled();
        ensureChart.mockReset();
        ensureChart.mockResolvedValue(undefined);
    });
});

describe('bindNavigation', () => {
    it('drives the deck from the keyboard only while the deck is on screen', () => {
        const { deck } = makeDeck(4);
        let active = true;
        bindNavigation(deck, () => active);

        const press = (key, target = document.body) => {
            target.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
            settle();
        };

        press('ArrowRight'); expect(deck.index).toBe(1);
        press('End');        expect(deck.index).toBe(3);
        press('ArrowLeft');  expect(deck.index).toBe(2);
        press('Home');       expect(deck.index).toBe(0);

        active = false;
        press('ArrowRight'); expect(deck.index).toBe(0);
    });

    it('leaves the arrows alone while typing in a field', () => {
        const { deck } = makeDeck(4);
        bindNavigation(deck, () => true);
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(deck.index).toBe(0);
    });

    it('swipes horizontally, and ignores a vertical drag', () => {
        const { deck } = makeDeck(4);
        bindNavigation(deck, () => true);
        const container = deck.refs.container;

        const swipe = (fromX, toX, fromY = 0, toY = 0) => {
            container.dispatchEvent(Object.assign(
                new window.Event('touchstart', { bubbles: true }),
                { touches: [{ clientX: fromX, clientY: fromY }] }));
            container.dispatchEvent(Object.assign(
                new window.Event('touchend', { bubbles: true }),
                { changedTouches: [{ clientX: toX, clientY: toY }] }));
            settle();
        };

        swipe(300, 100);              // left → next
        expect(deck.index).toBe(1);
        swipe(100, 300);              // right → previous
        expect(deck.index).toBe(0);
        swipe(100, 110);              // too short
        expect(deck.index).toBe(0);
        swipe(100, 40, 0, 400);       // mostly vertical
        expect(deck.index).toBe(0);
    });
});
