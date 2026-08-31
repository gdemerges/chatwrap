/**
 * The deck, built end to end from the demo conversation.
 *
 * This is the guard that makes the translation real: it builds every slide in
 * French and in English and asserts that nothing French survives the switch.
 * A `t()` call forgotten in one of twenty slide files is otherwise invisible
 * until someone reads the deck in the other language.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '../js/parser.js';
import { compute, compareYears } from '../js/stats.js';
import { generateSlides } from '../js/slides/index.js';
import { buildDemoBlob } from '../js/demo.js';
import { setLocale, LOCALES } from '../js/i18n.js';
import { THEME } from '../js/slides/_constants.js';

const messages = parse(await buildDemoBlob().text());
const stats = compute(messages);
const stats2024 = compute(messages.filter(m => m.datetime.getFullYear() === 2024));
const stats2025 = compute(messages.filter(m => m.datetime.getFullYear() === 2025));
const comparison = compareYears(stats2025, stats2024);

/** Two people only — the duo slides live behind that. */
const duoStats = compute(messages.filter(m => m.author === 'Camille' || m.author === 'Léo'));

const gradients = new Set(Object.values(THEME));

/**
 * A plausible ML sentiment payload.
 *
 * The real one is produced in the worker by an optional model download, so the
 * five mood slides would otherwise never be built here — and they hold more
 * translated prose than any other section.
 */
/** A day loud enough to trip every clause of the « why » builder. */
function dayContext(authors) {
    return {
        messages: 214,
        volumeRatio: 3.4,
        topAuthor: { author: authors[0], share: 0.68 },
        participants: authors.length,
        peakHour: 23,
        peakHourShare: 0.45,
        nightShare: 0.31,
        questionShare: 0.34,
        mediaShare: 0.12,
        longestMessage: 940,
        replyRatio: 2.1,
        silenceBefore: 6,
        silenceAfter: 4,
        keywords: ['déménagement', 'clés'],
        emojis: ['😡'],
    };
}

function withSentiment(base) {
    const authors = base.ranking.map(([name]) => name);
    const months = Object.keys(base.monthly).sort();
    const person = (author, i) => ({
        author, pos: 40 - i, neg: 10 + i, strongPos: 5, strongNeg: 2,
        sampled: 120, sarcasmHits: i, intensity: 0.4, stdDev: 0.3 + i * 0.1,
        compliment: 12 - i, insult: 3 + i, words: 900, rate: 0.2 - i * 0.05,
        reactionsSent: 10 + i, reactionsSentMean: 0.3,
        reactionsReceived: 8 + i, reactionsReceivedMean: 0.25,
    });
    const perPerson = authors.map(person);
    return {
        ...base,
        sentiment: {
            mlEnabled: true, device: 'wasm', ironyModel: true,
            perPerson,
            sweetest: perPerson[0], sharpest: perPerson[1] ?? perPerson[0],
            mostPositive: perPerson[0], mostNegative: perPerson[1] ?? null,
            mostIntense: perPerson[0],
            mostVolatile: perPerson[perPerson.length - 1], mostStable: perPerson[0],
            mostBeloved: perPerson[0], mostExpressive: perPerson[0],
            monthly: Object.fromEntries(months.map((m, i) => [m, Math.sin(i) * 0.4])),
            monthlyPerPerson: Object.fromEntries(
                authors.map(a => [a, Object.fromEntries(months.map((m, i) => [m, Math.cos(i) * 0.3]))]),
            ),
            sentimentHourly: Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? null : (h - 12) / 24)),
            bestDays: [
                { date: '2024-06-15', mean: 0.7, count: 30, perAuthor: perPerson.map((p, i) => ({ author: p.author, mean: 0.6 - i * 0.3, count: 6 })), context: dayContext(authors) },
                { date: '2024-07-02', mean: 0.2, count: 12, perAuthor: [] },
            ],
            worstDays: [{
                date: '2024-02-11', mean: -0.6, count: 18,
                perAuthor: perPerson.map((p, i) => ({ author: p.author, mean: 0.5 - i * 0.6, count: 5 })),
                context: dayContext(authors),
            }],
            afterAuthor: Object.fromEntries(authors.map((a, i) => [a, { mean: 0.2 - i * 0.15, count: 40 }])),
        },
    };
}

const moodStats = withSentiment(stats);

beforeEach(() => setLocale('fr'));

describe('generateSlides', () => {
    it('builds a full deck from a real conversation', () => {
        const slides = generateSlides(stats, comparison);
        expect(slides.length).toBeGreaterThan(15);
    });

    it('gives every slide a themed gradient and some markup', () => {
        for (const slide of generateSlides(stats, comparison)) {
            expect(gradients.has(slide.gradient)).toBe(true);
            expect(slide.html).toContain('slide-inner');
        }
    });

    it('never emits an unresolved translation key or a stray "undefined"', () => {
        // Every registered language, not just the two originals: a missing key
        // in one of the five later dictionaries would otherwise reach the deck
        // as a literal `slide.something.title`.
        for (const locale of Object.keys(LOCALES)) {
            setLocale(locale);
            const html = generateSlides(stats, comparison).map(s => s.html).join('');
            expect(html).not.toMatch(/\bslide\.[a-z]+\.[a-zA-Z]+\b/);
            expect(html).not.toMatch(/\bunits\.[a-zA-Z]+\b/);
            expect(html).not.toContain('undefined');
            expect(html).not.toContain('NaN');
            expect(html).not.toMatch(/\{[a-z]+\}/i);   // an un-interpolated parameter
        }
    });

    /**
     * Comparing two conversations reuses `compareYears` wholesale — the maths
     * never cared that the two sides came from the same file. What is new is
     * the slide, and that it stays out of the way when there is nothing pinned.
     */
    describe('the versus slide', () => {
        const versus = {
            versus: compareYears(stats2025, stats2024),
            pinnedName: 'ancien-export.txt',
            currentName: 'nouveau-export.txt',
        };

        it('is absent unless a second conversation is given', () => {
            const before = generateSlides(stats, comparison).length;
            expect(generateSlides(stats, comparison, null).length).toBe(before);
            expect(generateSlides(stats, comparison, versus).length).toBe(before + 1);
        });

        it('names both conversations in its column headings', () => {
            const slide = generateSlides(stats, comparison, versus)
                .find(s => s.html.includes('ancien-export.txt'));
            expect(slide).toBeDefined();
            expect(slide.html).toContain('nouveau-export.txt');
            expect(gradients.has(slide.gradient)).toBe(true);
        });

        it('escapes the file names, which the user chose', () => {
            const slide = generateSlides(stats, comparison, {
                ...versus,
                pinnedName: '<img src=x onerror=alert(1)>',
            }).find(s => s.html.includes('onerror'));
            expect(slide.html).not.toContain('<img');
            expect(slide.html).toContain('&lt;img');
        });

        it('is translated like every other slide', () => {
            for (const locale of Object.keys(LOCALES)) {
                setLocale(locale);
                const html = generateSlides(stats, comparison, versus).map(s => s.html).join('');
                expect(html).not.toMatch(/\bslide\.versus\.[a-zA-Z]+\b/);
            }
        });
    });

    it('leaves no French in the English deck', () => {
        setLocale('en');
        const html = generateSlides(stats, comparison).map(s => s.html).join('');
        for (const word of [
            'Classement', 'Vocabulaire', 'Récapitulatif', 'messages échangés',
            'jours', 'Médias', 'Qui parle', 'Le saviez-vous', 'Chapitre',
        ]) {
            expect(html).not.toContain(word);
        }
    });

    it('translates the deck rather than merely rebuilding it', () => {
        setLocale('fr');
        const french = generateSlides(stats, comparison).map(s => s.html).join('');
        setLocale('en');
        const english = generateSlides(stats, comparison).map(s => s.html).join('');
        expect(english).not.toBe(french);
        expect(french).toContain('Classement');
        expect(english).toContain('Ranking');
    });

    it('formats numbers and dates for the active locale', () => {
        setLocale('en');
        const html = generateSlides(stats, comparison).map(s => s.html).join('');
        expect(html).toMatch(/\d,\d{3}/);          // English thousands separator
        expect(html).not.toMatch(/\d \d{3}/); // …and not the French one
    });

    it('drops the comparison slides when there is nothing to compare against', () => {
        const withComparison = generateSlides(stats, comparison).length;
        const without = generateSlides(stats, null).length;
        expect(without).toBeLessThan(withComparison);
    });

    it('shows the duo board for two people and the network graph for four', () => {
        const duo = generateSlides(duoStats, null).map(s => s.html).join('');
        const group = generateSlides(stats, null).map(s => s.html).join('');
        expect(duo).toContain('duo-board');
        expect(duo).not.toContain('network-svg');
        expect(group).toContain('network-svg');
        expect(group).not.toContain('duo-board');
    });

    it('describes its headline slides to the image exporter', () => {
        const cards = generateSlides(stats, comparison).map(s => s.card).filter(Boolean);
        expect(cards.length).toBeGreaterThan(4);
        for (const card of cards) {
            expect(gradients.has(card.gradient)).toBe(true);
            expect(card.tag || card.title).toBeTruthy();
            // A card is plain data: the canvas cannot render markup.
            for (const line of card.lines || []) expect(line).not.toContain('<');
            for (const [value, label] of card.grid || []) {
                expect(String(value)).not.toContain('<');
                expect(String(label)).not.toContain('<');
            }
        }
    });

    it('builds the mood slides, and translates them too', () => {
        setLocale('fr');
        const french = generateSlides(moodStats, comparison);
        expect(french.length).toBeGreaterThan(generateSlides(stats, comparison).length);
        const frenchHtml = french.map(s => s.html).join('');
        expect(frenchHtml).toContain("L'ambiance du chat");

        setLocale('en');
        const englishHtml = generateSlides(moodStats, comparison).map(s => s.html).join('');
        expect(englishHtml).toContain('The mood of the chat');
        for (const word of ['ambiance', 'journées', 'Humeur', 'positivité']) {
            expect(englishHtml).not.toContain(word);
        }
        expect(englishHtml).not.toContain('undefined');
        expect(englishHtml).not.toMatch(/\{[a-z]+\}/i);
    });

    it('explains a notable day instead of merely dating it', () => {
        setLocale('fr');
        const moments = generateSlides(moodStats, comparison)
            .map(s => s.html)
            .find(html => html.includes('Vos journées marquantes'));
        expect(moments).toBeTruthy();
        // The strongest signals win the two slots, and the subject line follows.
        expect(moments).toMatch(/le ton le plus dur venait de/);
        expect(moments).toContain('jours</strong> de silence');
        expect(moments).toContain('déménagement');
        // Weaker clauses are dropped rather than piled up — volume included,
        // since a notable day is almost always a busy one.
        expect(moments).not.toContain('rythme habituel');
        expect(moments).not.toContain('photos et de vidéos');
    });

    it('says nothing about a day it has no context for', () => {
        setLocale('fr');
        const bare = { ...moodStats, sentiment: { ...moodStats.sentiment, bestDays: [{ date: '2024-07-02', mean: 0.2, count: 12, perAuthor: [] }], worstDays: [] } };
        const moments = generateSlides(bare, comparison)
            .map(s => s.html)
            .find(html => html.includes('Vos journées marquantes'));
        expect(moments).toBeTruthy();
        expect(moments).not.toContain('day-why');
    });

    it('escapes a participant name that looks like markup', () => {
        const hostile = compute(messages.map(m => (
            m.author === 'Camille' ? { ...m, author: '<img src=x onerror=alert(1)>' } : m
        )));
        const html = generateSlides(hostile, null).map(s => s.html).join('');
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;img src=x');
    });
});
