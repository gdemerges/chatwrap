/**
 * The whole chain, in a language that is not French.
 *
 * The parser has read seven languages for a long time, but everything after it
 * scored words against a French alphabet and a French stopword list. A Spanish
 * chat therefore parsed perfectly and then produced a top-words slide reading
 * `que, de, la, y` — correct arithmetic on the wrong tokens. This walks a chat
 * from raw export to built slides in each of the languages added since.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '../js/parser.js';
import { compute } from '../js/stats.js';
import { detectLanguage } from '../js/lang/stopwords.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(resolve(here, 'fixtures', name), 'utf-8');

/** A short export in the Android shape, whose words are the point. */
function chat(lines) {
    const day = (i) => String((i % 27) + 1).padStart(2, '0');
    return lines
        .map((text, i) => `${day(i)}/03/2024, 1${i % 9}:30 - ${i % 2 ? 'Bruno' : 'Ana'}: ${text}`)
        .join('\n');
}

/** Repeat a body enough times to clear the "too few messages" floor. */
const many = (body) => Array.from({ length: 6 }, () => body).flat();

const CASES = {
    es: {
        lines: many([
            'que tal el diseño de los años pasados',
            'el diseño está muy bien pero no sé',
            'los años pasan y el diseño no cambia',
            'mañana hablamos del diseño otra vez',
        ]),
        expected: 'diseño',
        alsoWhole: ['años', 'mañana'],
    },
    pt: {
        lines: many([
            'o coração da questão é a tradução',
            'não sei se a tradução está boa',
            'a tradução do coração ficou ótima',
            'amanhã vemos a tradução outra vez',
        ]),
        expected: 'tradução',
        alsoWhole: ['coração'],
    },
    de: {
        lines: many([
            'die straße vor der wohnung ist gesperrt',
            'ich glaube die straße bleibt zu',
            'nicht die straße sondern die wohnung',
            'morgen schauen wir die straße wieder an',
        ]),
        expected: 'straße',
        alsoWhole: ['wohnung'],
    },
    it: {
        lines: many([
            'la città è bellissima perché piena di gente',
            'non so se la città mi piace davvero',
            'la città cambia ogni volta che torno',
            'domani parliamo ancora della città',
        ]),
        expected: 'città',
        alsoWhole: ['bellissima'],
    },
    nl: {
        lines: many([
            'de vergadering van morgen gaat niet door',
            'ik weet niet of de vergadering doorgaat',
            'die vergadering was echt te lang',
            'we plannen de vergadering opnieuw',
        ]),
        expected: 'vergadering',
        alsoWhole: ['opnieuw'],
    },
    id: {
        lines: many([
            'jadwal pertemuan besok sepertinya berubah lagi',
            'aku belum tahu apakah pertemuan itu jadi',
            'pertemuan kemarin kelamaan banget sih',
            'kita atur ulang pertemuan minggu depan ya',
        ]),
        expected: 'pertemuan',
        alsoWhole: ['jadwal', 'kemarin'],
    },
    tr: {
        lines: many([
            'yarınki toplantı galiba yine değişti',
            'toplantı olacak mı bilmiyorum henüz',
            'dünkü toplantı gerçekten çok uzundu',
            'toplantı için yeni bir gün ayarlayalım',
        ]),
        // Turkish agglutinates, so the bare stem is what recurs across the
        // four lines — `yarınki` and `dünkü` carry their suffixes and stay
        // distinct tokens, which is the correct behaviour for `\p{L}`.
        expected: 'toplantı',
        alsoWhole: ['yarınki', 'dünkü', 'ayarlayalım'],
    },
};

describe('a chat in each supported language', () => {
    for (const [lang, spec] of Object.entries(CASES)) {
        describe(lang, () => {
            const messages = parse(chat(spec.lines));
            const stats = compute(messages);
            const words = new Map(stats.topWords);

            it('parses', () => {
                expect(messages.length).toBe(spec.lines.length);
            });

            it('detects the language from the words themselves', () => {
                expect(stats.lang).toBe(lang);
                expect(detectLanguage(spec.lines.join(' '))).toBe(lang);
            });

            it('ranks a real word first, not a stopword', () => {
                expect(stats.topWords[0][0]).toBe(spec.expected);
            });

            it('keeps accented and non-ASCII words whole', () => {
                for (const w of [spec.expected, ...spec.alsoWhole]) {
                    expect(words.has(w)).toBe(true);
                }
            });

            it('strips that language\'s own stopwords', () => {
                for (const stop of ['de', 'la', 'die', 'che', 'que', 'niet', 'non',
                    'yang', 'kalau', 'çünkü', 'için']) {
                    expect(words.has(stop)).toBe(false);
                }
            });
        });
    }
});

describe('media placeholders land in a bucket, not just in the total', () => {
    // The whole point of `MEDIA_BY_TYPE`: a language whose placeholders are
    // missing still counts the attachment, so `mediaTotal` looks right while
    // the breakdown underneath it is empty. Only the per-type counts catch it.
    const cases = {
        'android_id.txt': { images: 1, stickers: 1 },
        'ios_tr.txt': { images: 1, documents: 1 },
    };
    for (const [file, expected] of Object.entries(cases)) {
        it(`buckets every placeholder in ${file}`, () => {
            const stats = compute(parse(fixture(file)), { minMessages: 1 });
            for (const [type, n] of Object.entries(expected)) {
                expect({ type, n: stats.mediaTypes[type] }).toEqual({ type, n });
            }
            const bucketed = Object.entries(stats.mediaTypes)
                .filter(([type]) => type !== 'links')
                .reduce((sum, [, n]) => sum + n, 0);
            expect(bucketed).toBe(2);
        });
    }
});

describe('the French path is unchanged', () => {
    beforeEach(() => {});

    it('still detects French and still strips French stopwords', () => {
        const stats = compute(parse(chat(many([
            'je pense que le déménagement est prévu',
            'le déménagement me stresse un peu',
            'on parle du déménagement demain',
            'tout ça pour un déménagement',
        ]))));
        expect(stats.lang).toBe('fr');
        expect(stats.topWords[0][0]).toBe('déménagement');
        expect(new Map(stats.topWords).has('que')).toBe(false);
    });
});
