/**
 * The evidence behind a notable day.
 *
 * These assertions are written against a hand-built conversation whose shape
 * is known: one ordinary week, then one day that explodes. What matters is
 * that the profile recovers that shape — the volume spike, the person who held
 * the floor, the silence around it, the word the day turned on.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '../js/parser.js';
import { buildDayContexts } from '../js/worker/day-context.js';

/** `[dd/mm/yyyy hh:mm:ss] Name: text` — the iOS shape the parser reads. */
function line(day, hour, minute, author, text) {
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    return `[${day}/03/2024 ${hh}:${mm}:00] ${author}: ${text}`;
}

const lines = [];
// A quiet, balanced baseline: four messages a day, ten minutes apart.
for (let day = 1; day <= 7; day++) {
    for (let i = 0; i < 4; i++) {
        lines.push(line(day, 10, i * 10, i % 2 ? 'Bob' : 'Alice', 'on se voit demain ok'));
    }
}
// Then the 9th: nothing on the 8th, forty messages, mostly Alice, mostly at
// night, all about one subject, and nothing for a week afterwards.
for (let i = 0; i < 40; i++) {
    const author = i % 10 === 0 ? 'Bob' : 'Alice';
    lines.push(line(9, 23, i, author, 'le déménagement est un vrai problème ?'));
}
lines.push(line(17, 10, 0, 'Bob', 'bon, ça va mieux ?'));

const messages = parse(lines.join('\n'));

describe('buildDayContexts', () => {
    const ctx = buildDayContexts(messages, 'fr', ['2024-03-09', '2024-03-03']);

    it('profiles only the days it was asked about', () => {
        expect(Object.keys(ctx).sort()).toEqual(['2024-03-03', '2024-03-09']);
    });

    it('measures the volume against the median day, not the average', () => {
        expect(ctx['2024-03-09'].messages).toBe(40);
        expect(ctx['2024-03-09'].volumeRatio).toBe(10);
        expect(ctx['2024-03-03'].volumeRatio).toBe(1);
    });

    it('names who held the floor, and only when someone did', () => {
        expect(ctx['2024-03-09'].topAuthor.author).toBe('Alice');
        expect(ctx['2024-03-09'].topAuthor.share).toBe(0.9);
        expect(ctx['2024-03-03'].topAuthor.share).toBe(0.5);
    });

    it('places the day in the hours it was actually lived', () => {
        expect(ctx['2024-03-09'].peakHour).toBe(23);
        expect(ctx['2024-03-09'].peakHourShare).toBe(1);
        expect(ctx['2024-03-03'].peakHour).toBe(10);
    });

    it('measures the silence on either side', () => {
        expect(ctx['2024-03-09'].silenceBefore).toBe(1);
        expect(ctx['2024-03-09'].silenceAfter).toBe(7);
        expect(ctx['2024-03-03'].silenceBefore).toBe(0);
    });

    it('keeps the words the day over-used, not the words it merely used', () => {
        expect(ctx['2024-03-09'].keywords).toContain('déménagement');
        expect(ctx['2024-03-09'].keywords).not.toContain('demain');
    });

    it('reads questions and reply speed against the whole conversation', () => {
        expect(ctx['2024-03-09'].questionShare).toBe(1);
        expect(ctx['2024-03-09'].replyRatio).toBeLessThan(1);
    });

    it('returns nothing when no day is asked for', () => {
        expect(buildDayContexts(messages, 'fr', [])).toEqual({});
    });
});
