/**
 * The ordering helpers exist to keep large exports off the copy path: they are
 * only ever right if they hand back the *same* array when nothing needs doing.
 */
import { describe, it, expect } from 'vitest';
import { ensureChronological, lowerBound, sliceByTime, localDayKey, localMonthKey, escapeHtml } from '../js/utils.js';

const at = (...isos) => isos.map(iso => ({ datetime: new Date(iso) }));
const ms = (iso) => new Date(iso).getTime();

describe('ensureChronological', () => {
    it('returns the very same array when it is already in order', () => {
        const list = at('2024-01-01', '2024-02-01', '2024-03-01');
        expect(ensureChronological(list)).toBe(list);
    });

    it('sorts a shuffled array into a new one, leaving the input alone', () => {
        const list = at('2024-03-01', '2024-01-01', '2024-02-01');
        const sorted = ensureChronological(list);
        expect(sorted).not.toBe(list);
        expect(sorted.map(m => m.datetime.getMonth())).toEqual([0, 1, 2]);
        expect(list[0].datetime.getMonth()).toBe(2);
    });

    it('tolerates equal timestamps', () => {
        const list = at('2024-01-01T10:00', '2024-01-01T10:00');
        expect(ensureChronological(list)).toBe(list);
    });

    it('handles empty and single-element arrays', () => {
        const empty = [];
        expect(ensureChronological(empty)).toBe(empty);
        const one = at('2024-01-01');
        expect(ensureChronological(one)).toBe(one);
    });
});

describe('lowerBound', () => {
    const list = at('2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01');

    it('finds the first index at or after the time', () => {
        expect(lowerBound(list, ms('2024-02-01'))).toBe(1);
        expect(lowerBound(list, ms('2024-02-15'))).toBe(2);
    });

    it('clamps at both ends', () => {
        expect(lowerBound(list, ms('2000-01-01'))).toBe(0);
        expect(lowerBound(list, ms('2030-01-01'))).toBe(4);
        expect(lowerBound([], 0)).toBe(0);
    });

    it('lands on the first of a run of equal timestamps', () => {
        const dupes = at('2024-01-01', '2024-02-01', '2024-02-01', '2024-03-01');
        expect(lowerBound(dupes, ms('2024-02-01'))).toBe(1);
    });
});

describe('sliceByTime', () => {
    const list = at('2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01');

    it('is half-open: includes `from`, excludes `to`', () => {
        const got = sliceByTime(list, ms('2024-02-01'), ms('2024-04-01'));
        expect(got.map(m => m.datetime.getMonth())).toEqual([1, 2]);
    });

    it('returns the same array — no copy — when the window covers everything', () => {
        expect(sliceByTime(list, ms('2000-01-01'), ms('2030-01-01'))).toBe(list);
    });

    it('returns empty for a window that matches nothing', () => {
        expect(sliceByTime(list, ms('2025-01-01'), ms('2025-06-01'))).toEqual([]);
    });

    it('agrees with the filter it replaced', () => {
        const from = ms('2024-01-15');
        const to = ms('2024-03-15');
        const filtered = list.filter(m => m.datetime.getTime() >= from && m.datetime.getTime() < to);
        expect(sliceByTime(list, from, to)).toEqual(filtered);
    });
});

describe('date keys', () => {
    it('uses local time, not UTC', () => {
        const late = new Date(2024, 11, 31, 23, 30);
        expect(localDayKey(late)).toBe('2024-12-31');
        expect(localMonthKey(late)).toBe('2024-12');
    });
});

describe('escapeHtml', () => {
    it('neutralises every character that can open a tag or an attribute', () => {
        expect(escapeHtml(`<a href="x" onclick='y'>&`))
            .toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
    });
});
