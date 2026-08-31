/**
 * The slide deck: mounting, navigation, story mode and lazy chart init.
 *
 * Pulled out of app.js, which had grown to own file loading, worker plumbing,
 * dialogs, sharing *and* the deck. Nothing here knows where the stats came
 * from — it takes built slides and shows them.
 */
import { ensureChart } from './vendor.js';
import { destroyAllCharts, retintCharts } from './slides/_charts.js';
import { announce } from './ui/toast.js';
import { readHash, writeSlide } from './ui/hash.js';
import { t } from './i18n.js';

const TRANSITION_MS = 500;
const STORY_BASE_MS = 4600;
const STORY_MAX_MS = 9000;

/**
 * Show or hide a slide from assistive tech *and* from the tab order.
 *
 * `aria-hidden` alone was not enough: the buttons on the recap slide stayed
 * focusable while the slide was off-screen, so tabbing from the toolbar landed
 * on controls nobody could see.
 */
function setActive(el, active) {
    el.setAttribute('aria-hidden', String(!active));
    if (active) el.removeAttribute('inert');
    else el.setAttribute('inert', '');
}

export class Deck {
    /**
     * @param {{ container: HTMLElement, counter: HTMLElement,
     *           progress: HTMLElement, onSlideChange?: (i: number) => void,
     *           onSlideReady?: (i: number, el: HTMLElement) => void }} refs
     */
    constructor(refs) {
        this.refs = refs;
        this.slides = [];
        this.elements = [];
        this.index = 0;
        this.animating = false;
        this.chartsReady = new Set();
        this.filled = new Set();
        this.storyTimer = null;
        this.storyPlaying = false;
        this.storyPausedByHide = false;
        this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
        this.bindVisibility();
    }

    /**
     * Auto-play used to keep running in a hidden tab: switch away for two
     * minutes and you came back to the last slide, having watched none of it.
     * The deck pauses when the tab goes away and picks up where it left off —
     * but only if *it* was the one that paused, so a deliberate stop stays
     * stopped.
     */
    bindVisibility() {
        if (typeof document === 'undefined' || !document.addEventListener) return;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (!this.storyPlaying) return;
                this.storyPausedByHide = true;
                this.stopStory();
            } else if (this.storyPausedByHide) {
                this.storyPausedByHide = false;
                if (this.length) this.startStory({ fromCurrent: true });
            }
        });
    }

    get current() { return this.slides[this.index] || null; }
    get length() { return this.slides.length; }

    /** @param {import('./types.d.ts').Slide[]} slides */
    mount(slides) {
        this.stopStory();
        destroyAllCharts();
        this.chartsReady.clear();
        this.slides = slides;
        this.elements = [];
        this.index = 0;

        const { container, progress } = this.refs;
        container.innerHTML = '';
        progress.innerHTML = '';

        this.filled.clear();

        const frag = document.createDocumentFragment();
        slides.forEach((slide, i) => {
            const el = document.createElement('div');
            el.className = `slide ${slide.gradient}${i === 0 ? ' active' : ''}`;
            // Body deliberately left empty here — see `fill`. Parsing thirty
            // slides' worth of HTML up front was the single longest task
            // between "analysis done" and the first slide on a phone.
            el.dataset.index = String(i);
            el.id = `slide-${i}`;
            // tabpanel rather than a bare group: the progress bar above is a
            // real tablist, and pairing the two is what lets a screen reader
            // announce "slide 4 of 30" as a position rather than as a heading.
            el.setAttribute('role', 'tabpanel');
            el.setAttribute('aria-roledescription', 'slide');
            // Its own name rather than the tab's: the tab reads "go to slide 4",
            // which is an instruction, not a title for the panel it opens.
            el.setAttribute('aria-label', t('deck.slideLabel', { n: i + 1, total: slides.length }));
            el.tabIndex = -1;
            setActive(el, i === 0);
            frag.appendChild(el);
            this.elements.push(el);

            // The progress bar doubles as the slide picker: a second row of
            // dots said the same thing and collided with the toolbar.
            const seg = document.createElement('button');
            seg.className = 'progress-seg';
            seg.type = 'button';
            seg.id = `slide-tab-${i}`;
            seg.setAttribute('role', 'tab');
            seg.setAttribute('aria-label', t('deck.goToSlide', { n: i + 1 }));
            seg.setAttribute('aria-controls', `slide-${i}`);
            seg.setAttribute('aria-selected', String(i === 0));
            // Roving tabindex: one Tab stop for the whole bar, arrows move
            // inside it. Thirty tab stops between the toolbar and the slide
            // made the deck unusable with a keyboard.
            seg.tabIndex = i === 0 ? 0 : -1;
            seg.innerHTML = '<span class="progress-fill"></span>';
            seg.addEventListener('click', () => { this.stopStory(); this.goTo(i, { focus: true }); });
            progress.appendChild(seg);
        });
        container.appendChild(frag);
        this.bindTablistKeys();

        const requested = readHash().slide;
        const start = requested != null && requested < slides.length ? requested : 0;

        this.fillAround(0);
        this.updateChrome(0);
        this.initChart(0);
        if (start > 0) this.goTo(start, { immediate: true });
    }

    /**
     * Put a slide's HTML into its element, once.
     *
     * Every slide element exists from `mount` — the progress bar, the aria
     * wiring and the tab order all depend on that — but its content is written
     * only when it comes into reach. `onSlideReady` fires here rather than
     * after `mount`, so anything that has to reach into a slide's markup (the
     * recap slide's buttons) still gets its chance whenever the slide arrives.
     */
    fill(index) {
        const el = this.elements[index];
        const slide = this.slides[index];
        if (!el || !slide || this.filled.has(index)) return;
        this.filled.add(index);
        el.innerHTML = slide.html;
        if (slide.chart) el._chartInit = slide.chart;
        this.refs.onSlideReady?.(index, el);
    }

    /** The slide and its two neighbours — what a swipe can reach before paint. */
    fillAround(index) {
        this.fill(index);
        this.fill(index - 1);
        this.fill(index + 1);
    }

    /** Restore the deck to an empty state (new analysis). */
    clear() {
        this.stopStory();
        destroyAllCharts();
        this.slides = [];
        this.elements = [];
        this.index = 0;
        this.chartsReady.clear();
        this.filled.clear();
        this.refs.container.innerHTML = '';
        this.refs.progress.innerHTML = '';
    }

    async initChart(index) {
        this.fill(index);
        const el = this.elements[index];
        if (!el || !el._chartInit || this.chartsReady.has(index)) return;
        this.chartsReady.add(index); // claim the slot before awaiting, so a fast
                                     // swipe back and forth can't double-init
        try {
            await ensureChart();
        } catch (err) {
            this.chartsReady.delete(index);
            console.warn('[chart]', err);
            return;
        }
        const canvas = el.querySelector('canvas');
        if (!canvas) return;
        el._chartInit(canvas.getContext('2d'), el);
    }

    /**
     * @param {number} index
     * @param {{ immediate?: boolean, focus?: boolean }} [options]
     *   `focus` moves keyboard focus onto the slide — set it when the move came
     *   from the keyboard or from clicking the progress bar, so the next Tab
     *   continues from the new slide instead of from wherever focus was left.
     *   Story mode and swipes deliberately leave focus alone.
     */
    goTo(index, { immediate = false, focus = false } = {}) {
        if (index < 0 || index >= this.length || index === this.index) return;
        if (this.animating && !immediate) return;

        this.fillAround(index);

        const forward = index > this.index;
        const from = this.elements[this.index];
        const to = this.elements[index];

        if (immediate || this.reducedMotion) {
            from.classList.remove('active');
            setActive(from, false);
            to.classList.add('active');
            setActive(to, true);
            this.index = index;
        } else {
            this.animating = true;
            to.style.transition = 'none';
            to.style.transform = forward ? 'translateX(100%)' : 'translateX(-100%)';
            to.style.opacity = '1';
            to.classList.add('active');
            setActive(to, true);
            void to.offsetHeight; // force the start position to stick

            to.style.transition = '';
            to.style.transform = 'translateX(0)';
            from.style.transform = forward ? 'translateX(-100%)' : 'translateX(100%)';
            from.style.opacity = '0';
            setActive(from, false);

            setTimeout(() => {
                from.classList.remove('active');
                from.style.cssText = '';
                this.animating = false;
            }, TRANSITION_MS);
            this.index = index;
        }

        this.updateChrome(index);
        this.initChart(index);
        this.initChart(index + 1); // pre-warm the next chart so it never pops in
        announce(t('deck.slideLabel', { n: index + 1, total: this.length }));
        writeSlide(index);
        this.refs.onSlideChange?.(index);
        if (focus) to.focus({ preventScroll: true });
        if (this.storyPlaying) this.scheduleStory();
    }

    next(options) { this.index < this.length - 1 ? this.goTo(this.index + 1, options) : this.stopStory(); }
    prev(options) { this.goTo(this.index - 1, options); }

    /**
     * Arrow keys inside the progress bar move the roving tab stop, matching
     * what a tablist is expected to do.
     */
    bindTablistKeys() {
        const { progress } = this.refs;
        if (!progress || progress._keysBound) return;
        progress._keysBound = true;
        progress.addEventListener('keydown', (e) => {
            const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1
                : e.key === 'Home' ? -this.length : e.key === 'End' ? this.length : 0;
            if (!delta) return;
            e.preventDefault();
            this.stopStory();
            this.goTo(Math.max(0, Math.min(this.length - 1, this.index + delta)), { focus: true });
            /** @type {HTMLElement|null} */
            const seg = progress.querySelector('.progress-seg.current');
            seg?.focus();
        });
    }

    updateChrome(index) {
        const { counter, progress } = this.refs;
        if (counter) counter.textContent = `${index + 1} / ${this.length}`;
        progress.querySelectorAll('.progress-seg').forEach((seg, i) => {
            seg.classList.toggle('seen', i < index);
            seg.classList.toggle('current', i === index);
            seg.setAttribute('aria-selected', String(i === index));
            seg.tabIndex = i === index ? 0 : -1;
        });
    }

    // ------------------------------------------------------------ story mode

    /** Dwell time scaled by how much there is to read on the slide. */
    storyDuration(index) {
        this.fill(index);
        const el = this.elements[index];
        const chars = el ? (el.textContent || '').trim().length : 0;
        return Math.min(STORY_MAX_MS, STORY_BASE_MS + chars * 12);
    }

    toggleStory() {
        this.storyPausedByHide = false;
        this.storyPlaying ? this.stopStory() : this.startStory();
        return this.storyPlaying;
    }

    /**
     * @param {{ fromCurrent?: boolean }} [options] `fromCurrent` keeps the
     *   current slide even if it is the last one — used when resuming after
     *   the tab came back, where restarting from slide 1 would be a surprise.
     */
    startStory({ fromCurrent = false } = {}) {
        if (this.length === 0) return;
        if (!fromCurrent && this.index === this.length - 1) this.goTo(0, { immediate: true });
        this.storyPlaying = true;
        document.body.classList.add('story-playing');
        announce(t('deck.storyStarted'));
        this.scheduleStory();
    }

    stopStory() {
        if (this.storyPlaying) announce(t('deck.storyStopped'));
        this.storyPlaying = false;
        clearTimeout(this.storyTimer);
        this.storyTimer = null;
        document.body.classList.remove('story-playing');
        const seg = this.refs.progress?.querySelector('.progress-seg.current .progress-fill');
        if (seg) seg.style.animation = 'none';
    }

    scheduleStory() {
        clearTimeout(this.storyTimer);
        const duration = this.storyDuration(this.index);
        const fill = this.refs.progress.querySelector('.progress-seg.current .progress-fill');
        if (fill) {
            fill.style.animation = 'none';
            void fill.offsetWidth;
            fill.style.animation = `progress-fill ${duration}ms linear forwards`;
        }
        this.storyTimer = setTimeout(() => this.next(), duration);
    }

    retint() { retintCharts(); }
}

/**
 * Wire keyboard, touch and wheel navigation once, for the lifetime of the page.
 * @param {Deck} deck
 * @param {() => boolean} isActive
 */
export function bindNavigation(deck, isActive) {
    document.addEventListener('keydown', (e) => {
        if (!isActive()) return;
        if (e.target.closest('input, textarea, select, [contenteditable]')) return;
        switch (e.key) {
            case 'ArrowRight': e.preventDefault(); deck.stopStory(); deck.next({ focus: true }); break;
            case 'ArrowLeft':  e.preventDefault(); deck.stopStory(); deck.prev({ focus: true }); break;
            case 'Home':       e.preventDefault(); deck.stopStory(); deck.goTo(0, { focus: true }); break;
            case 'End':        e.preventDefault(); deck.stopStory(); deck.goTo(deck.length - 1, { focus: true }); break;
            case ' ':
                if (e.target.closest('button')) return; // let Space activate buttons
                e.preventDefault();
                deck.toggleStory();
                break;
            default: break;
        }
    });

    const container = deck.refs.container;
    let startX = 0, startY = 0;
    container.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });
    container.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
            deck.stopStory();
            dx < 0 ? deck.next() : deck.prev();
        }
    }, { passive: true });

    let wheelLock = null;
    container.addEventListener('wheel', (e) => {
        if (wheelLock) return;
        if (Math.abs(e.deltaY) < 30) return;
        // A scrollable slide (long rankings on a small screen) scrolls first;
        // only take over once it has hit the end.
        const scroller = e.target.closest('.slide-inner');
        if (scroller && scroller.scrollHeight > scroller.clientHeight + 4) {
            const atTop = scroller.scrollTop <= 0;
            const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
            if (!(e.deltaY > 0 ? atEnd : atTop)) return;
        }
        wheelLock = setTimeout(() => { wheelLock = null; }, 700);
        deck.stopStory();
        e.deltaY > 0 ? deck.next() : deck.prev();
    }, { passive: true });
}
