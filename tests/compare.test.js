/**
 * Pinning is the only piece of state the app keeps between two analyses, so
 * what matters is that it stays small, survives a reload, and never claims a
 * comparison where there is none.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { pinConversation, getPinned, clearPinned, isSameConversation } from '../js/compare.js';
import { compareYears } from '../js/stats.js';

const stats = (over = {}) => ({
    totalMessages: 1200,
    totalDays: 300,
    avgPerDay: '4.0',
    totalMedia: 40,
    avgMsgLen: 42,
    emojis: { total: 300, top: [['😂', 100]], perPerson: [] },
    streak: { max: 12 },
    topWords: Array.from({ length: 30 }, (_, i) => [`w${i}`, 30 - i]),
    // Deliberately huge: the digest must not carry any of this.
    daily: Object.fromEntries(Array.from({ length: 900 }, (_, i) => [`d${i}`, i])),
    heatmap: Array.from({ length: 7 }, () => new Array(24).fill(3)),
    ...over,
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('pinConversation / getPinned', () => {
    it('round-trips through storage', () => {
        expect(pinConversation(stats(), 'chat.txt')).toBe(true);
        const pinned = getPinned();
        expect(pinned.name).toBe('chat.txt');
        expect(pinned.digest.totalMessages).toBe(1200);
        expect(Date.now() - pinned.savedAt).toBeLessThan(5000);
    });

    it('keeps only what the comparison reads — not the bulk series', () => {
        pinConversation(stats(), 'chat.txt');
        const { digest } = getPinned();
        expect(digest.daily).toBeUndefined();
        expect(digest.heatmap).toBeUndefined();
        expect(digest.topWords).toHaveLength(30);
        expect(JSON.stringify(digest).length).toBeLessThan(2000);
    });

    it('caps an absurd file name rather than storing it whole', () => {
        pinConversation(stats(), 'x'.repeat(500));
        expect(getPinned().name).toHaveLength(120);
    });

    it('returns null when nothing is pinned', () => {
        expect(getPinned()).toBeNull();
    });

    it('treats corrupt or outdated stored data as nothing pinned', () => {
        localStorage.setItem('ww-pinned', '{ not json');
        expect(getPinned()).toBeNull();
        localStorage.setItem('ww-pinned', JSON.stringify({ name: 'x', digest: {} }));
        expect(getPinned()).toBeNull();
    });

    it('reports failure instead of throwing when storage refuses', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(pinConversation(stats(), 'chat.txt')).toBe(false);
    });

    it('refuses to pin nothing', () => {
        expect(pinConversation(null, 'chat.txt')).toBe(false);
    });

    it('clears', () => {
        pinConversation(stats(), 'chat.txt');
        clearPinned();
        expect(getPinned()).toBeNull();
    });
});

describe('isSameConversation', () => {
    it('matches on the numbers, not on the file name', () => {
        pinConversation(stats(), 'export-2024.txt');
        // Same chat, re-exported under another name.
        expect(isSameConversation(stats(), getPinned())).toBe(true);
    });

    it('separates two conversations that merely look alike', () => {
        pinConversation(stats(), 'a.txt');
        expect(isSameConversation(stats({ totalMessages: 1201 }), getPinned())).toBe(false);
        expect(isSameConversation(stats({ totalDays: 301 }), getPinned())).toBe(false);
        expect(isSameConversation(stats({ avgPerDay: '4.1' }), getPinned())).toBe(false);
    });

    it('is false when either side is missing', () => {
        expect(isSameConversation(null, null)).toBe(false);
        expect(isSameConversation(stats(), null)).toBe(false);
    });
});

describe('the digest feeds compareYears unchanged', () => {
    it('produces the same comparison the year-over-year path would', () => {
        const older = stats({ totalMessages: 600, avgPerDay: '2.0', totalMedia: 20 });
        pinConversation(older, 'older.txt');

        const versus = compareYears(stats(), getPinned().digest);
        expect(versus.messages).toEqual({ current: 1200, previous: 600, pct: 100 });
        expect(versus.avgPerDay.pct).toBe(100);
        expect(versus.media.pct).toBe(100);
        expect(versus.streak).toEqual({ current: 12, previous: 12, pct: 0 });
    });

    it('still fills the word columns from the trimmed word list', () => {
        pinConversation(stats({ topWords: [['ancien', 9]] }), 'older.txt');
        const versus = compareYears(stats({ topWords: [['nouveau', 9]] }), getPinned().digest);
        expect(versus.appeared).toEqual([['nouveau', 9]]);
        expect(versus.disappeared).toEqual([['ancien', 9]]);
    });
});
