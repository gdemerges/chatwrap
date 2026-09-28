/**
 * Dialog, toast and period picker — the interactive UI the deck-level tests
 * never reach. Before this file `js/ui/dialog.js`, `toast.js` and `period.js`
 * were at 2%, 18% and 0% coverage.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDialog } from '../js/ui/dialog.js';
import { showToast, showError, announce, copyToClipboard } from '../js/ui/toast.js';
import { pickPeriod } from '../js/ui/period.js';
import { setLocale, t } from '../js/i18n.js';

beforeEach(() => {
    setLocale('fr');
    document.body.innerHTML = '<button id="opener">open</button><div id="share-toast"></div><div id="a11y-live"></div>';
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const key = (k, opts = {}) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));

describe('openDialog', () => {
    const html = '<button id="a">A</button><button id="b" data-autofocus>B</button><button id="c">C</button>';

    it('is an aria-modal dialog with a label, and focuses [data-autofocus]', () => {
        openDialog({ label: 'Choisir', html });
        const d = document.querySelector('[role="dialog"]');
        expect(d.getAttribute('aria-modal')).toBe('true');
        expect(d.getAttribute('aria-label')).toBe('Choisir');
        expect(document.activeElement.id).toBe('b');
    });

    it('resolves with the value handed to close, once', async () => {
        let close;
        const p = openDialog({ label: 'x', html, onMount: (_, c) => { close = c; } });
        close('first');
        close('second');
        await expect(p).resolves.toBe('first');
    });

    it('Escape cancels — resolves undefined, never a default', async () => {
        const p = openDialog({ label: 'x', html });
        key('Escape');
        await expect(p).resolves.toBeUndefined();
    });

    it('clicking the backdrop cancels, clicking inside does not', async () => {
        const p = openDialog({ label: 'x', html });
        const overlay = document.querySelector('[role="dialog"]');
        let settled = false;
        p.then(() => { settled = true; });
        overlay.querySelector('#a').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await Promise.resolve();
        expect(settled).toBe(false);
        overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await expect(p).resolves.toBeUndefined();
    });

    it('traps Tab: last wraps to first, Shift+Tab from first wraps to last', () => {
        openDialog({ label: 'x', html });
        document.querySelector('#c').focus();
        key('Tab');
        expect(document.activeElement.id).toBe('a');
        key('Tab', { shiftKey: true });
        expect(document.activeElement.id).toBe('c');
    });

    it('restores focus to whatever opened it', async () => {
        const opener = document.getElementById('opener');
        opener.focus();
        const p = openDialog({ label: 'x', html });
        key('Escape');
        await p;
        expect(document.activeElement).toBe(opener);
    });

    it('removes the overlay after closing', async () => {
        vi.useFakeTimers();
        const p = openDialog({ label: 'x', html });
        key('Escape');
        await p;
        vi.advanceTimersByTime(500);
        expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
});

describe('toast', () => {
    it('shows, then hides after the duration', () => {
        vi.useFakeTimers();
        showToast('Copié');
        const el = document.querySelector('#share-toast');
        expect(el.textContent).toBe('Copié');
        expect(el.classList.contains('visible')).toBe(true);
        vi.advanceTimersByTime(2300);
        expect(el.classList.contains('visible')).toBe(false);
    });

    it('a second toast restarts the timer instead of cutting itself short', () => {
        vi.useFakeTimers();
        showToast('un');
        vi.advanceTimersByTime(2000);
        showToast('deux');
        vi.advanceTimersByTime(1000);
        expect(document.querySelector('#share-toast').classList.contains('visible')).toBe(true);
    });

    it('errors last longer and are announced to screen readers', () => {
        vi.useFakeTimers();
        showError('boom');
        const el = document.querySelector('#share-toast');
        expect(el.classList.contains('error')).toBe(true);
        expect(document.querySelector('#a11y-live').textContent).toContain('boom');
        vi.advanceTimersByTime(3000);
        expect(el.classList.contains('visible')).toBe(true);
        vi.advanceTimersByTime(1500);
        expect(el.classList.contains('visible')).toBe(false);
    });

    it('does not throw when the page has no toast element', () => {
        document.body.innerHTML = '';
        expect(() => { showToast('x'); announce('y'); }).not.toThrow();
    });
});

describe('copyToClipboard', () => {
    const setClipboard = (writeText) =>
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    it('uses the async clipboard API when it exists', async () => {
        const writeText = vi.fn().mockResolvedValue();
        setClipboard(writeText);
        expect(await copyToClipboard('lien')).toBe(true);
        expect(writeText).toHaveBeenCalledWith('lien');
        expect(document.querySelector('#share-toast').textContent).toBe(t('share.linkCopied'));
    });

    it('falls back to execCommand when the API rejects', async () => {
        setClipboard(vi.fn().mockRejectedValue(new Error('denied')));
        document.execCommand = vi.fn().mockReturnValue(true);
        expect(await copyToClipboard('lien')).toBe(true);
        expect(document.execCommand).toHaveBeenCalledWith('copy');
        expect(document.querySelector('textarea')).toBeNull();
    });

    it('reports failure when both routes fail', async () => {
        setClipboard(vi.fn().mockRejectedValue(new Error('denied')));
        document.execCommand = vi.fn().mockReturnValue(false);
        expect(await copyToClipboard('lien')).toBe(false);
        expect(document.querySelector('#share-toast').classList.contains('error')).toBe(true);
    });
});

describe('pickPeriod', () => {
    const spec = {
        years: [2023, 2024],
        yearCounts: { 2023: 100, 2024: 250 },
        bounds: { from: '2023-02-01T00:00:00', to: '2024-11-30T00:00:00' },
    };
    const root = () => document.querySelector('.period-dialog');

    it('picking a year resolves with that year and no range', async () => {
        const p = pickPeriod(spec);
        root().querySelector('[data-year="2024"]').click();
        await expect(p).resolves.toEqual({ year: 2024, range: null });
    });

    it('"all years" resolves with year null', async () => {
        const p = pickPeriod(spec);
        root().querySelector('[data-year="all"]').click();
        await expect(p).resolves.toEqual({ year: null, range: null });
    });

    it('marks the current choice', () => {
        pickPeriod({ ...spec, current: { year: 2023, range: null } });
        expect(root().querySelector('[data-year="2023"]').classList.contains('is-current')).toBe(true);
        expect(root().querySelector('[data-year="2024"]').classList.contains('is-current')).toBe(false);
    });

    it('the range tab swaps panels and keeps aria-selected in step', () => {
        pickPeriod(spec);
        const [years, range] = root().querySelectorAll('.tab-btn');
        range.click();
        expect(root().querySelector('[data-panel="range"]').hidden).toBe(false);
        expect(root().querySelector('[data-panel="years"]').hidden).toBe(true);
        expect(range.getAttribute('aria-selected')).toBe('true');
        expect(years.getAttribute('aria-selected')).toBe('false');
    });

    it('a range covers the whole last day', async () => {
        const p = pickPeriod(spec);
        root().querySelector('#range-from').value = '2023-05-01';
        root().querySelector('#range-to').value = '2023-06-30';
        root().querySelector('#range-apply').click();
        await expect(p).resolves.toEqual({
            year: null,
            range: { from: '2023-05-01T00:00:00', to: '2023-06-30T23:59:59' },
        });
    });

    it('rejects a reversed range and stays open', () => {
        pickPeriod(spec);
        root().querySelector('#range-from').value = '2024-05-01';
        root().querySelector('#range-to').value = '2023-06-30';
        root().querySelector('#range-apply').click();
        const err = root().querySelector('#range-error');
        expect(err.hidden).toBe(false);
        expect(err.textContent).toBe(t('period.badOrder'));
        expect(root()).not.toBeNull();
    });

    it('rejects an empty bound', () => {
        pickPeriod(spec);
        root().querySelector('#range-from').value = '';
        root().querySelector('#range-apply').click();
        expect(root().querySelector('#range-error').textContent).toBe(t('period.needBoth'));
    });

    it('cancel resolves undefined', async () => {
        const p = pickPeriod(spec);
        root().querySelector('[data-dismiss]').click();
        await expect(p).resolves.toBeUndefined();
    });
});
