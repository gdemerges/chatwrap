import { describe, it, expect } from 'vitest';
import { parse } from '../js/parser.js';
import { compute } from '../js/stats.js';
import { anonymizeStats, buildAliasMap } from '../js/anonymize.js';

const CHAT = [
    '[01/03/2024 10:00:00] Alice Martin: bonjour https://youtube.com/a',
    '[01/03/2024 10:01:00] Bob: salut Alice',
    '[02/03/2024 10:00:00] Alice Martin: coucou 😀',
    '[02/03/2024 10:01:00] Bob: yo',
    '[03/03/2024 10:00:00] Alice Martin: encore moi 😀',
    '[03/03/2024 10:05:00] Bob: ok',
].join('\n');

describe('anonymizeStats', () => {
    const stats = compute(parse(CHAT));
    const anon = anonymizeStats(stats);

    it('aliases names in ranking order', () => {
        expect(buildAliasMap(['x', 'y'])).toEqual(new Map([['x', 'A.'], ['y', 'B.']]));
        expect(anon.ranking[0][0]).toBe('A.');
        expect(anon.ranking[1][0]).toBe('B.');
    });

    it('remaps names used as object keys', () => {
        expect(Object.keys(anon.perPerson).sort()).toEqual(['A.', 'B.']);
        expect(Object.keys(anon.monthlyPerPerson).sort()).toEqual(['A.', 'B.']);
    });

    it('leaves no trace of the real names anywhere in the payload', () => {
        const dump = JSON.stringify(anon);
        expect(dump).not.toContain('Alice');
        expect(dump).not.toContain('Bob');
    });

    it('does not mutate the source stats', () => {
        expect(stats.ranking[0][0]).toBe('Alice Martin');
    });

    it('drops vocabulary when asked', () => {
        const strict = anonymizeStats(stats, { words: true });
        expect(strict.topWords).toEqual([]);
        expect(strict.uniqueWordsPerPerson).toEqual({});
        expect(strict.profiles.every(p => p.signatureWord === null)).toBe(true);
    });

    it('anonymizes the people named inside a notable day, and drops its keywords', () => {
        const withDays = {
            ...stats,
            sentiment: {
                bestDays: [{
                    date: '2024-03-02',
                    mean: 0.4,
                    count: 6,
                    perAuthor: [{ author: 'Bob', mean: -0.1, count: 3 }],
                    context: {
                        topAuthor: { author: 'Alice Martin', share: 0.7 },
                        keywords: ['déménagement'],
                    },
                }],
                worstDays: [],
            },
        };
        const anon = anonymizeStats(withDays);
        expect(anon.sentiment.bestDays[0].context.topAuthor.author).toBe('A.');
        expect(anon.sentiment.bestDays[0].perAuthor[0].author).toBe('B.');
        expect(anon.sentiment.bestDays[0].context.keywords).toEqual(['déménagement']);

        const strict = anonymizeStats(withDays, { words: true });
        expect(strict.sentiment.bestDays[0].context.keywords).toEqual([]);
    });

    it('keeps non-name data intact', () => {
        expect(anon.totalMessages).toBe(stats.totalMessages);
        expect(anon.startDate instanceof Date).toBe(true);
    });
});
