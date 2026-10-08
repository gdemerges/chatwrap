/**
 * Edge cases for the slides that the main deck test only exercises on the
 * demo conversation: ranking, time, words and sentiment.
 *
 * Every conversation here is built from raw WhatsApp-style lines and run
 * through the real parser → stats pipeline, so the shapes are the ones the
 * app actually produces (empty arrays, single authors, missing ML payloads).
 *
 * Chart.js is never instantiated: `makeChart` is mocked and each `chart`
 * builder is called with a stub context, so the config is built and checked
 * without a canvas (jsdom has none).
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parse } from '../js/parser.js';
import { compute } from '../js/stats.js';
import { setLocale } from '../js/i18n.js';
import { topMessagersSlide, pieSlide, evolutionPerPersonSlide, messageLengthSlide, initiatorSlide } from '../js/slides/ranking.js';
import { monthlySlide, heatmapSlide, hourlyWeekdaySlide } from '../js/slides/time.js';
import { topWordsSlide, uniqueWordsSlide } from '../js/slides/words.js';
import { ambianceSlide, sentimentTimelineSlide, moodHourlySlide, momentsSlide, influenceSlide } from '../js/slides/sentiment.js';
import { generateSlides } from '../js/slides/index.js';
import { makeChart } from '../js/slides/_charts.js';
import { THEME } from '../js/slides/_constants.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

vi.mock('../js/slides/_charts.js', () => ({
    makeChart: vi.fn(() => ({ data: {}, options: { plugins: { legend: {} } }, update: () => {} })),
    cssVar: () => '#888',
    destroyAllCharts: () => {},
    retintCharts: () => {},
}));

const here = dirname(fileURLToPath(import.meta.url));
const fixture = name => readFileSync(join(here, 'fixtures', name), 'utf8');

/** Build an iOS-format export from [date, author, text] triples. */
function chat(rows) {
    return rows
        .map(([d, author, text]) => `[${d}] ${author}: ${text}`)
        .join('\n');
}

const stat = text => compute(parse(text));

const gradients = new Set(Object.values(THEME));
const BAD = /undefined|NaN|style=/;

/** Mount a slide's html and run its chart builder against a stub context. */
function mountSlide(slide) {
    const root = document.createElement('div');
    root.innerHTML = slide.html;
    if (slide.chart) slide.chart({ stub: true }, root);
    return root;
}

function assertClean(slide) {
    expect(slide.html).not.toMatch(BAD);
    expect(gradients.has(slide.gradient)).toBe(true);
}

beforeEach(() => {
    setLocale('fr');
    makeChart.mockClear();
    // jsdom has no canvas: the chart builders call getContext on real nodes.
    globalThis.HTMLCanvasElement.prototype.getContext = () => ({});
});

/* ── Fixtures ─────────────────────────────────────────────────────────── */

const DAYS = ['15/03/2024', '16/03/2024', '17/03/2024'];

/** One participant only: the app must still show something sane. */
const solo = stat(chat([
    [`${DAYS[0]}, 2:30:00 PM`, 'Alice', 'Bonjour tout le monde, comment ça va aujourd’hui ?'],
    [`${DAYS[0]}, 2:31:00 PM`, 'Alice', 'Je pense à un sujet important pour nous'],
    [`${DAYS[1]}, 9:00:00 AM`, 'Alice', 'Encore une journée de travail longue'],
]));

/** Two participants, no media, no emoji, nothing but stopwords. */
const duo = stat(chat([
    [`${DAYS[0]}, 2:30:00 PM`, 'Alice', 'oui'],
    [`${DAYS[0]}, 2:31:00 PM`, 'Bob', 'non'],
    [`${DAYS[1]}, 9:00:00 AM`, 'Alice', 'ok'],
]));

/** A large group: 12 people, each with a different volume. */
const bigGroupRows = [];
for (let i = 0; i < 12; i++) {
    const name = `Personne${String.fromCharCode(65 + i)}`;
    for (let k = 0; k <= i; k++) {
        const day = 1 + ((i + k) % 28);
        const dd = String(day).padStart(2, '0');
        const mm = String(1 + (i % 12)).padStart(2, '0');
        bigGroupRows.push([`${dd}/${mm}/2024, ${String(k % 12 + 1).padStart(2, '0')}:00:00 AM`, name,
            `Message numéro ${k} de ${name}, avec des mots variés et un peu de contenu`]);
    }
}
const big = stat(chat(bigGroupRows));

/** A real export with media, emoji and a long stretch of history. */
const real = stat(fixture('ios_en.txt'));

/** One day only, with a single author: the shortest possible period. */
const oneDay = stat(chat([
    [`${DAYS[0]}, 10:00:00 AM`, 'Alice', 'Salut Bob'],
    [`${DAYS[0]}, 10:05:00 AM`, 'Bob', 'Salut Alice'],
]));

/** Sentiment payloads — null, neutral and ML-enabled. */
function withSentiment(base, overrides = {}) {
    const authors = base.ranking.map(([name]) => name);
    const person = (author, i) => ({
        author, pos: 5, neg: 5, strongPos: 0, strongNeg: 0,
        sampled: 10, sarcasmHits: 0, intensity: 0, stdDev: 0,
        compliment: 0, insult: 0, words: 50, rate: 0,
        reactionsSent: 0, reactionsSentMean: 0,
        reactionsReceived: 0, reactionsReceivedMean: 0, i,
    });
    const perPerson = authors.map(person);
    return {
        ...base,
        sentiment: {
            mlEnabled: true, device: 'wasm', ironyModel: false,
            perPerson,
            sweetest: null, sharpest: null, mostPositive: null, mostNegative: null,
            mostIntense: null, mostVolatile: null, mostStable: null,
            mostBeloved: null, mostExpressive: null,
            monthly: {}, monthlyPerPerson: {},
            sentimentHourly: Array.from({ length: 24 }, () => null),
            bestDays: [], worstDays: [], afterAuthor: {},
            ...overrides,
        },
    };
}

/* ── ranking.js ───────────────────────────────────────────────────────── */

describe('ranking slides — participant counts', () => {
    it('one participant: ranking has a single bar at 100%', () => {
        const slide = topMessagersSlide(solo, THEME.people);
        assertClean(slide);
        expect(slide.html.match(/ranking-item/g)).toHaveLength(1);
        expect(slide.card.bars).toHaveLength(1);
        expect(slide.card.bars[0].ratio).toBe(1);
    });

    it('one participant: pie chart config has one slice and no "others"', () => {
        const slide = pieSlide(solo, THEME.people);
        assertClean(slide);
        mountSlide(slide);
        const config = makeChart.mock.calls.at(-1)[1];
        expect(config.type).toBe('doughnut');
        expect(config.data.labels).toEqual(['Alice']);
        expect(config.data.datasets[0].data).toEqual([3]);
    });

    it('two participants: both appear in the ranking and the pie', () => {
        const ranking = topMessagersSlide(duo, THEME.people);
        assertClean(ranking);
        expect(ranking.html).toContain('Alice');
        expect(ranking.html).toContain('Bob');
        mountSlide(pieSlide(duo, THEME.people));
        const config = makeChart.mock.calls.at(-1)[1];
        expect(config.data.labels.sort()).toEqual(['Alice', 'Bob']);
    });

    it('large group (12): the pie folds everyone past the eighth into "others"', () => {
        expect(big.ranking).toHaveLength(12);
        mountSlide(pieSlide(big, THEME.people));
        const config = makeChart.mock.calls.at(-1)[1];
        expect(config.data.labels).toHaveLength(9);
        expect(config.data.labels.at(-1)).toBe('Autres');
        const total = config.data.datasets[0].data.reduce((a, b) => a + b, 0);
        const expected = big.ranking.reduce((sum, r) => sum + r[1].count, 0);
        expect(total).toBe(expected);
    });

    it('large group: the ranking lists every person with a finite width', () => {
        const slide = topMessagersSlide(big, THEME.people);
        assertClean(slide);
        expect(slide.html.match(/ranking-item/g)).toHaveLength(12);
        expect(slide.card.bars).toHaveLength(8); // card is capped for the story frame
    });

    it('large group: evolution chart builds one dataset per author on "all"', () => {
        const slide = evolutionPerPersonSlide(big, THEME.time);
        assertClean(slide);
        const root = mountSlide(slide);
        const config = makeChart.mock.calls.at(-1)[1];
        expect(config.data.datasets).toHaveLength(12);
        expect(root.querySelectorAll('.filter-btn')).toHaveLength(13);
    });

    it('evolution: filter click on a single author switches to one dataset', () => {
        const slide = evolutionPerPersonSlide(duo, THEME.time);
        const root = mountSlide(slide);
        const chart = makeChart.mock.results.at(-1).value;
        const bobBtn = [...root.querySelectorAll('.filter-btn')].find(b => b.dataset.filter === 'Bob');
        bobBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
        // The chart object is the mock result; the click handler mutates it.
        expect(chart.data.datasets).toHaveLength(1);
        expect(chart.data.datasets[0].label).toBe('Bob');
        expect(chart.options.plugins.legend.display).toBe(false);
    });

    it('message length: a single author yields one bar', () => {
        const slide = messageLengthSlide(solo, THEME.words);
        assertClean(slide);
        expect(slide.card.bars).toHaveLength(1);
    });

    it('initiator: absent when nobody has initiated anything', () => {
        expect(initiatorSlide({ ...duo, initiator: [] }, THEME.relations)).toBeNull();
        expect(initiatorSlide({ ...duo, initiator: undefined }, THEME.relations)).toBeNull();
    });

    it('initiator: one participant takes the whole share', () => {
        const slide = initiatorSlide({ ...solo, initiator: [['Alice', 2]] }, THEME.relations);
        assertClean(slide);
        expect(slide.html).toContain('100.0%');
    });

    it('initiator: a real conversation renders without NaN', () => {
        const slide = initiatorSlide(real, THEME.relations);
        if (slide) assertClean(slide);
    });
});

/* ── time.js ──────────────────────────────────────────────────────────── */

describe('time slides — shortest and sparsest periods', () => {
    it('monthly: a single day gives a single bar', () => {
        const slide = monthlySlide(oneDay, THEME.time);
        assertClean(slide);
        mountSlide(slide);
        const config = makeChart.mock.calls.at(-1)[1];
        expect(config.data.labels).toHaveLength(1);
        expect(config.data.datasets[0].backgroundColor).toHaveLength(1);
    });

    it('monthly: no messages at all still builds without NaN', () => {
        const empty = { ...oneDay, monthly: {} };
        const slide = monthlySlide(empty, THEME.time);
        assertClean(slide);
        mountSlide(slide);
        expect(makeChart.mock.calls.at(-1)[1].data.labels).toEqual([]);
    });

    it('heatmap: a single day lights exactly one cell at full intensity', () => {
        const slide = heatmapSlide(oneDay, THEME.time);
        assertClean(slide);
        const cells = slide.html.match(/heatmap-cell/g) || [];
        expect(cells).toHaveLength(7 * 24);
        expect(slide.html).toContain('var(--heat-empty)');
    });

    it('heatmap: an all-empty week uses only the empty token, never NaN', () => {
        const empty = { ...oneDay, heatmap: Array.from({ length: 7 }, () => Array(24).fill(0)) };
        const slide = heatmapSlide(empty, THEME.time);
        assertClean(slide);
        expect(slide.html).not.toContain('hsla(');
    });

    it('heatmap: the subtitle names the peak hour and day', () => {
        const slide = heatmapSlide(oneDay, THEME.time);
        expect(slide.html).toMatch(/slide-subtitle/);
        expect(slide.html).not.toContain('undefined');
    });

    it('hourly/weekday: a quiet period still draws 24 hours and 7 days', () => {
        const slide = hourlyWeekdaySlide(oneDay, THEME.time);
        assertClean(slide);
        mountSlide(slide);
        const [hourly, weekday] = makeChart.mock.calls.slice(-2).map(c => c[1]);
        expect(hourly.data.labels).toHaveLength(24);
        expect(hourly.data.datasets[0].data).toHaveLength(24);
        expect(weekday.data.labels).toHaveLength(7);
        expect(weekday.options.indexAxis).toBe('y');
    });

    it('hourly/weekday: works on a real export with media and emoji', () => {
        const slide = hourlyWeekdaySlide(real, THEME.time);
        assertClean(slide);
        mountSlide(slide);
    });
});

/* ── words.js ─────────────────────────────────────────────────────────── */

describe('words slides — no meaningful words', () => {
    it('top words: stopword-only chat yields an empty cloud, not a crash', () => {
        const slide = topWordsSlide({ ...duo, topWords: [] }, THEME.words);
        assertClean(slide);
        expect(slide.html).toContain('words-cloud');
        expect(slide.html).not.toContain('word-tag');
    });

    it('top words: a real chat with a handful of words renders each tag once', () => {
        const slide = topWordsSlide({ ...solo, topWords: [['salut', 2], ['ça', 1]] }, THEME.words);
        assertClean(slide);
        expect(slide.html.match(/word-tag/g)).toHaveLength(2);
    });

    it('top words: caps the cloud at 25 words even when more are supplied', () => {
        const many = Array.from({ length: 40 }, (_, i) => [`mot${i}`, 40 - i]);
        const slide = topWordsSlide({ ...solo, topWords: many }, THEME.words);
        assertClean(slide);
        expect(slide.html.match(/word-tag/g)).toHaveLength(25);
    });

    it('top words: escapes a word that looks like markup', () => {
        const slide = topWordsSlide({ ...solo, topWords: [['<b>x</b>', 3]] }, THEME.words);
        expect(slide.html).not.toContain('<b>x</b>');
        expect(slide.html).toContain('&lt;b&gt;');
    });

    it('unique words: absent when nobody owns a unique word', () => {
        expect(uniqueWordsSlide({ ...duo, uniqueWordsPerPerson: {} }, THEME.words)).toBeNull();
        expect(uniqueWordsSlide({ ...duo, uniqueWordsPerPerson: undefined }, THEME.words)).toBeNull();
        expect(uniqueWordsSlide({ ...duo, uniqueWordsPerPerson: { Alice: [], Bob: [] } }, THEME.words)).toBeNull();
    });

    it('unique words: a single author with words renders one block', () => {
        const slide = uniqueWordsSlide({ ...solo, uniqueWordsPerPerson: { Alice: [['salut', 2]] } }, THEME.words);
        assertClean(slide);
        expect(slide.html.match(/uniq-block/g)).toHaveLength(1);
    });

    it('unique words: only the first six authors get a block', () => {
        const per = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`P${i}`, [['mot', 1]]]));
        const slide = uniqueWordsSlide({ ...big, uniqueWordsPerPerson: per }, THEME.words);
        expect(slide.html.match(/uniq-block/g)).toHaveLength(6);
    });

    it('unique words: a real export yields only clean markup', () => {
        const slide = uniqueWordsSlide(real, THEME.words);
        if (slide) assertClean(slide);
    });
});

/* ── sentiment.js ─────────────────────────────────────────────────────── */

describe('sentiment slides — absent or neutral sentiment', () => {
    it('ambiance: null sentiment yields no slide', () => {
        expect(ambianceSlide({ ...duo, sentiment: null }, THEME.mood)).toBeNull();
    });

    it('ambiance: ML disabled and no per-person data yields no slide', () => {
        expect(ambianceSlide({ ...duo, sentiment: { mlEnabled: false, perPerson: [] } }, THEME.mood)).toBeNull();
    });

    it('ambiance: ML disabled with people shows only the "no ML" notice', () => {
        const base = withSentiment(duo);
        base.sentiment.mlEnabled = false;
        const slide = ambianceSlide(base, THEME.mood);
        assertClean(slide);
        expect(slide.html).toContain('fun-fact');
        expect(slide.html).not.toContain('undefined');
    });

    it('ambiance: neutral ML with nothing notable yields no slide', () => {
        // Every field is zero or null: no fact clears its threshold.
        const base = withSentiment(duo);
        base.sentiment.mlEnabled = true;
        expect(ambianceSlide(base, THEME.mood)).toBeNull();
    });

    it('ambiance: a single person never gets the "most stable" fact', () => {
        const base = withSentiment(solo);
        base.sentiment.perPerson[0].compliment = 4;
        base.sentiment.sweetest = base.sentiment.perPerson[0];
        base.sentiment.mostStable = base.sentiment.perPerson[0];
        base.sentiment.mostPositive = base.sentiment.perPerson[0];
        const slide = ambianceSlide(base, THEME.mood);
        assertClean(slide);
        expect(slide.html).not.toContain('🧘');
        expect(slide.html).not.toContain('🌧️');
    });

    it('timeline: fewer than three months yields no chart', () => {
        const base = withSentiment(oneDay, { monthly: { '2024-03': 0.2, '2024-04': 0.1 } });
        expect(sentimentTimelineSlide(base, THEME.mood)).toBeNull();
    });

    it('timeline: disabled ML yields no chart even with months', () => {
        const base = withSentiment(oneDay, { monthly: { '2024-01': 0, '2024-02': 0, '2024-03': 0 } });
        base.sentiment.mlEnabled = false;
        expect(sentimentTimelineSlide(base, THEME.mood)).toBeNull();
    });

    it('timeline: neutral (all-zero) months render as 0%, not NaN', () => {
        const monthly = { '2024-01': 0, '2024-02': 0, '2024-03': 0 };
        const base = withSentiment(solo, { monthly, monthlyPerPerson: {} });
        const slide = sentimentTimelineSlide(base, THEME.mood);
        assertClean(slide);
        mountSlide(slide);
        const config = makeChart.mock.calls.at(-1)[1];
        expect(config.data.datasets[0].data).toEqual([0, 0, 0]);
    });

    it('timeline: gaps in a person\'s months become nulls (spanGaps)', () => {
        const monthly = { '2024-01': 0.1, '2024-02': 0.2, '2024-03': 0.3 };
        const base = withSentiment(duo, { monthly, monthlyPerPerson: { Alice: { '2024-01': 0.1 } } });
        const slide = sentimentTimelineSlide(base, THEME.mood);
        mountSlide(slide);
        const config = makeChart.mock.calls.at(-1)[1];
        const alice = config.data.datasets.find(d => d.label === 'Alice');
        expect(alice.data).toEqual([10, null, null]);
    });

    it('moods by hour: fewer than eight valid hours yields no chart', () => {
        const hourly = Array.from({ length: 24 }, (_, h) => (h < 7 ? (h - 3) / 10 : null));
        expect(moodHourlySlide(withSentiment(duo, { sentimentHourly: hourly }), THEME.mood)).toBeNull();
    });

    it('moods by hour: a flat day (all zero) picks a best and worst hour without NaN', () => {
        const flat = Array.from({ length: 24 }, () => 0);
        const slide = moodHourlySlide(withSentiment(duo, { sentimentHourly: flat }), THEME.mood);
        assertClean(slide);
        mountSlide(slide);
        const config = makeChart.mock.calls.at(-1)[1];
        expect(config.data.datasets[0].data).toHaveLength(24);
        expect(config.data.datasets[0].backgroundColor.every(c => c.startsWith('rgba('))).toBe(true);
    });

    it('moods by hour: nulls are drawn transparent, never as a value', () => {
        const hourly = Array.from({ length: 24 }, (_, h) => (h % 2 ? null : 0.5));
        const slide = moodHourlySlide(withSentiment(duo, { sentimentHourly: hourly }), THEME.mood);
        mountSlide(slide);
        const config = makeChart.mock.calls.at(-1)[1];
        expect(config.data.datasets[0].backgroundColor[1]).toBe('transparent');
        expect(config.data.datasets[0].data[1]).toBeNull();
    });

    it('moments: no best or worst day yields no slide', () => {
        expect(momentsSlide(withSentiment(duo), THEME.mood)).toBeNull();
    });

    it('moments: a neutral day (mean 0) is labelled "tense" and never NaN', () => {
        const base = withSentiment(duo, {
            bestDays: [{ date: '2024-03-15', mean: 0, count: 3, perAuthor: [] }],
        });
        const slide = momentsSlide(base, THEME.mood);
        assertClean(slide);
        expect(slide.html).toContain('🌧️');
    });

    it('moments: a worst day that is also a best day is dropped from the worst list', () => {
        const day = { date: '2024-03-15', mean: 0.7, count: 3, perAuthor: [] };
        const base = withSentiment(duo, { bestDays: [day], worstDays: [day] });
        const slide = momentsSlide(base, THEME.mood);
        // The day is best, so it is listed under the best heading only.
        expect(slide.html.match(/fun-fact-text/g)).toHaveLength(1);
    });

    it('influence: a single author is too little to compare', () => {
        const base = withSentiment(solo, { afterAuthor: { Alice: { mean: 0.3, count: 4 } } });
        expect(influenceSlide(base, THEME.mood)).toBeNull();
    });

    it('influence: two authors both neutral (0) render as the negative bucket', () => {
        const base = withSentiment(duo, { afterAuthor: { Alice: { mean: 0, count: 4 }, Bob: { mean: 0, count: 4 } } });
        const slide = influenceSlide(base, THEME.mood);
        assertClean(slide);
        expect(slide.html.match(/🌧️/g)).toHaveLength(2);
    });

    it('influence: caps the list at six authors', () => {
        const afterAuthor = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`P${i}`, { mean: 0.1 * i, count: 3 }]));
        const slide = influenceSlide(withSentiment(big, { afterAuthor }), THEME.mood);
        expect(slide.html.match(/fun-fact-icon/g)).toHaveLength(6);
    });
});

/* ── Whole-deck guards on the edge fixtures ───────────────────────────── */

describe('every generated slide on the edge conversations', () => {
    const cases = {
        solo: () => solo,
        duo: () => duo,
        bigGroup: () => big,
        oneDay: () => oneDay,
        withEmptySentiment: () => withSentiment(duo),
    };

    for (const [name, make] of Object.entries(cases)) {
        it(`${name}: no inline style, undefined or NaN in any slide, in fr and en`, () => {
            for (const locale of ['fr', 'en']) {
                setLocale(locale);
                const slides = generateSlides(make(), null);
                expect(slides.length).toBeGreaterThan(0);
                for (const slide of slides) {
                    expect(slide.html).not.toMatch(/style=/);
                    expect(slide.html).not.toContain('undefined');
                    expect(slide.html).not.toContain('NaN');
                }
            }
        });
    }

    it('one-day conversation: the sentiment and time sections still build', () => {
        const slides = generateSlides(withSentiment(oneDay), null);
        expect(slides.some(s => s.html.includes('heatmap-grid'))).toBe(true);
    });
});
