/**
 * The context has to survive the whole worker path, not just its own module.
 *
 * `buildDayContexts` being right is worth nothing if the result never reaches
 * `sentiment.bestDays`, which is a plain wiring mistake the day-context tests
 * cannot see. The model is left off here: emoji reactions carry polarity on
 * their own, so notable days — and their explanation — exist without a
 * 50 MB download.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '../js/parser.js';
import { computeSentimentML } from '../js/worker/sentiment-ml.js';

const lines = [];
for (let day = 1; day <= 7; day++) {
    for (let i = 0; i < 4; i++) {
        lines.push(`[0${day}/03/2024 10:${String(i * 10).padStart(2, '0')}:00] ${i % 2 ? 'Bob' : 'Alice'}: on se voit demain ok`);
    }
}
for (let i = 0; i < 30; i++) {
    lines.push(`[09/03/2024 23:${String(i).padStart(2, '0')}:00] ${i % 10 === 0 ? 'Bob' : 'Alice'}: le déménagement est un vrai problème ?`);
    if (i % 3 === 0) lines.push(`[09/03/2024 23:${String(i).padStart(2, '0')}:30] Bob: a réagi 😡 à ce message`);
}

const messages = parse(lines.join('\n'));

describe('computeSentimentML', () => {
    it('hands the deck the reason a day stood out', async () => {
        const sentiment = await computeSentimentML(messages, 'fr', () => {}, { useML: false });
        const day = sentiment.worstDays[0];
        expect(day.date).toBe('2024-03-09');
        expect(day.context.volumeRatio).toBeGreaterThan(5);
        expect(day.context.topAuthor.author).toBe('Alice');
        expect(day.context.keywords).toContain('déménagement');
        expect(day.perAuthor.length).toBeGreaterThan(0);
    });
});
