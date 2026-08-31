/**
 * The whole chain, in a language that is not French.
 *
 * The parser has read seven languages for a long time, but everything after it
 * scored words against a French alphabet and a French stopword list. A Spanish
 * chat therefore parsed perfectly and then produced a top-words slide reading
 * `que, de, la, y` — correct arithmetic on the wrong tokens. This walks a chat
 * from raw export to built slides in each of the five newly covered languages.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '../js/parser.js';
import { compute } from '../js/stats.js';
import { detectLanguage } from '../js/lang/stopwords.js';

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
                for (const stop of ['de', 'la', 'die', 'che', 'que', 'niet', 'non']) {
                    expect(words.has(stop)).toBe(false);
                }
            });
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
