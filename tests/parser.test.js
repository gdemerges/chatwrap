import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
    parse, detectPattern, parseDate, cleanLine, inferDateOrder, diagnose,
    createStreamParser, stripInvisible,
} from '../js/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

describe('parser', () => {
    it('parses iOS FR format', () => {
        const messages = parse(fixture('ios_fr.txt'));
        expect(messages.length).toBeGreaterThan(8);
        expect(messages[0].author).toBe('Alice');
        expect(messages[0].message).toContain('Bonjour');
    });

    it('parses Android FR format', () => {
        const messages = parse(fixture('android_fr.txt'));
        expect(messages.length).toBe(4);
        expect(messages[0].author).toBe('Alice');
        expect(messages[2].author).toBe('Alice');
    });

    it('filters by year', () => {
        const text = `[01/01/2023 10:00:00] Alice: Old message
[01/01/2024 10:00:00] Alice: New message
[02/01/2024 10:00:00] Bob: Reply`;
        const msgs2024 = parse(text, { year: 2024 });
        expect(msgs2024.length).toBe(2);
        const msgs2023 = parse(text, { year: 2023 });
        expect(msgs2023.length).toBe(1);
    });

    it('marks media messages', () => {
        const messages = parse(fixture('ios_fr.txt'));
        const media = messages.filter(m => m.isMedia);
        expect(media.length).toBeGreaterThan(0);
    });

    it('detects reactions', () => {
        const messages = parse(fixture('ios_fr.txt'));
        const reactions = messages.filter(m => m.isReaction);
        expect(reactions.length).toBe(1);
        expect(reactions[0].reactionEmoji).toBe('❤️');
    });

    it('rejects non-WhatsApp text', () => {
        expect(() => parse('just some random text\nwith no structure')).toThrow(/Format/);
    });

    it('parses Android US format (M/D/YY, h:mm AM/PM)', () => {
        const messages = parse(fixture('android_us.txt'));
        expect(messages.length).toBe(4);
        expect(messages[0].author).toBe('Alice');
        const d = messages[0].datetime;
        expect(d.getFullYear()).toBe(2024);
        expect(d.getMonth()).toBe(2); // March
        expect(d.getDate()).toBe(15);
        expect(d.getHours()).toBe(14); // 2:30 PM
        expect(messages[2].datetime.getHours()).toBe(23); // 11:45 PM
        expect(messages[3].datetime.getHours()).toBe(7);  // 7:15 AM
    });

    it('reads a month-first file as month-first', () => {
        // Every second component is > 12, so the file can only be MM/DD.
        // The order is inferred once for the whole file rather than guessed
        // from the separator, which used to mangle these dates.
        const text = [
            '[03/25/2024 10:00:00] Alice: one',
            '[03/26/2024 10:01:00] Bob: two',
            '[03/27/2024 10:02:00] Alice: three',
            '[03/28/2024 10:03:00] Bob: four',
        ].join('\n');
        const msgs = parse(text);
        expect(msgs.length).toBe(4);
        expect(msgs[0].datetime.getMonth()).toBe(2); // March
        expect(msgs[0].datetime.getDate()).toBe(25);
    });

    it('handles Left-To-Right marks in iOS exports', () => {
        const line = '\u200e[12/03/2024 14:30:00] Alice: \u200emessage';
        expect(cleanLine(line)).toBe('[12/03/2024 14:30:00] Alice: \u200emessage');
    });

    it('parseDate handles DD/MM/YYYY', () => {
        const d = parseDate('15/03/2024', '10:30:00');
        expect(d.getFullYear()).toBe(2024);
        expect(d.getMonth()).toBe(2); // March
        expect(d.getDate()).toBe(15);
    });

    it('parseDate handles US M/D/YY with AM/PM', () => {
        const d = parseDate('3/15/24', '2:30 PM', 'mdy');
        expect(d.getFullYear()).toBe(2024);
        expect(d.getHours()).toBe(14);
    });

    it('detectPattern returns null for unrecognized format', () => {
        const lines = ['hello', 'world', 'foo bar'];
        expect(detectPattern(lines)).toBeNull();
    });

    it('parses iOS EN exports', () => {
        const messages = parse(fixture('ios_en.txt'));
        expect(messages.length).toBe(4);
        expect(messages[0].author).toBe('Alice');
        expect(messages[0].datetime.getHours()).toBe(14);
        expect(messages.filter(m => m.isMedia).length).toBe(1);
    });

    it('parses Android DE exports (dotted dates, dotted time)', () => {
        const messages = parse(fixture('android_de.txt'));
        expect(messages.length).toBe(4);
        expect(messages[0].author).toBe('Anna');
        expect(messages[0].datetime.getMonth()).toBe(2); // March
        expect(messages[0].datetime.getDate()).toBe(15);
    });

    it('parses iOS ES exports', () => {
        const messages = parse(fixture('ios_es.txt'));
        expect(messages.length).toBe(4);
        expect(messages.filter(m => m.isMedia).length).toBe(1);
    });

    it('drops author-less system notices instead of appending them', () => {
        const text = [
            '[15/03/2024 10:00:00] Alice: hello',
            '[15/03/2024 10:01:00] Les messages et les appels sont chiffrés de bout en bout.',
            '[15/03/2024 10:02:00] Bob: hi',
        ].join('\n');
        const msgs = parse(text);
        expect(msgs.length).toBe(2);
        expect(msgs[0].message).toBe('hello');
    });

    it('inferDateOrder uses AM/PM as a month-first tie-breaker', () => {
        expect(inferDateOrder(['01/02/24'], ['2:30 PM'])).toBe('mdy');
        expect(inferDateOrder(['01/02/24'], ['14:30'])).toBe('dmy');
        expect(inferDateOrder(['25/02/24'], ['2:30 PM'])).toBe('dmy');
    });

    it('diagnose reports why a file was rejected, without leaking content', () => {
        const d = diagnose('coucou tout le monde\nceci est un secret');
        expect(d.detected).toBe(false);
        expect(d.totalLines).toBe(2);
        expect(d.samples.join(' ')).not.toContain('secret');
    });
});

describe('parser — languages beyond FR/EN', () => {
    it('parses iOS PT exports, media and deletions included', () => {
        const messages = parse(fixture('ios_pt.txt'));
        expect(messages.length).toBe(6);
        expect(messages[0].author).toBe('Rita');
        expect(messages.filter(m => m.isMedia).length).toBe(2);
        expect(messages.filter(m => m.isDeleted).length).toBe(1);
        expect(messages.filter(m => m.isEdited).length).toBe(1);
    });

    it('parses Android IT exports', () => {
        const messages = parse(fixture('android_it.txt'));
        expect(messages.length).toBe(6);
        expect(messages[0].author).toBe('Giulia');
        expect(messages.filter(m => m.isMedia).length).toBe(2);
        expect(messages.filter(m => m.isDeleted).length).toBe(1);
    });

    it('parses Android NL exports with dashed dates', () => {
        const messages = parse(fixture('android_nl.txt'));
        expect(messages.length).toBe(6);
        expect(messages[0].author).toBe('Sanne');
        expect(messages[0].datetime.getDate()).toBe(15);
        expect(messages[0].datetime.getMonth()).toBe(2);
        expect(messages.filter(m => m.isMedia).length).toBe(2);
    });

    it('parses Android ID exports, with dots as the time separator', () => {
        const messages = parse(fixture('android_id.txt'));
        // The encryption notice is author-less and must not survive.
        expect(messages.length).toBe(6);
        expect(messages[0].author).toBe('Sari');
        expect(messages.filter(m => m.isMedia).length).toBe(2);
        expect(messages.filter(m => m.isDeleted).length).toBe(1);
        expect(messages.filter(m => m.isEdited).length).toBe(1);
    });

    it('parses iOS TR exports', () => {
        const messages = parse(fixture('ios_tr.txt'));
        expect(messages.length).toBe(6);
        expect(messages[0].author).toBe('Elif');
        expect(messages.filter(m => m.isMedia).length).toBe(2);
        expect(messages.filter(m => m.isDeleted).length).toBe(1);
        expect(messages.filter(m => m.isEdited).length).toBe(1);
    });

    it('tolerates en and em dashes as the Android separator', () => {
        const text = [
            '15/03/2024, 14:30 – Alice: one',
            '15/03/2024, 14:31 — Bob: two',
            '15/03/2024, 14:32 – Alice: three',
        ].join('\n');
        expect(parse(text).length).toBe(3);
    });
});

describe('parser — real-world quirks', () => {
    it('strips bidi marks from authors and bodies, and keeps polls whole', () => {
        const messages = parse(fixture('ios_quirks.txt'));
        // The encryption notice has no author and must not survive.
        expect(messages.map(m => m.author)).toEqual(['Alice', 'Bob', 'Alice']);
        expect(messages[0].message).toBe('Hey there');
        expect(messages[2].message).toBe('ok');
        const poll = messages.find(m => m.isPoll);
        expect(poll.author).toBe('Bob');
        expect(poll.message).toContain('On se voit quand ?');
        expect(poll.message).toContain('OPTION : dimanche');
    });

    it('keeps the emoji glue that stripInvisible must not touch', () => {
        expect(stripInvisible('a‎b')).toBe('ab');
        expect(stripInvisible('👩‍👩‍👧'))
            .toBe('👩‍👩‍👧');
    });

    it('keeps a message whose text merely resembles a group notice', () => {
        // "a ajouté" is a system phrase *and* ordinary French. Only author-less
        // lines are notices, so this one is a message like any other.
        const text = [
            '[15/03/2024 10:00:00] Alice: hello',
            '[15/03/2024 10:01:00] Bob: Elle a ajouté du sucre dans le café',
            '[15/03/2024 10:02:00] Alice: hi',
        ].join('\n');
        const msgs = parse(text);
        expect(msgs.length).toBe(3);
        expect(msgs[1].message).toContain('sucre');
    });

    it('blanks a deleted message rather than counting its tombstone as text', () => {
        const text = [
            '[15/03/2024 10:00:00] Alice: hello there',
            '[15/03/2024 10:01:00] Bob: This message was deleted',
            '[15/03/2024 10:02:00] Alice: hi',
        ].join('\n');
        const msgs = parse(text);
        expect(msgs[1].isDeleted).toBe(true);
        expect(msgs[1].message).toBe('');
        expect(msgs[1].msgLen).toBe(0);
    });
});

describe('parser — streaming', () => {
    const source = [
        '[15/03/2024 10:00:00] Alice: hello',
        '[15/03/2024 10:01:00] Bob: multi',
        'line message',
        '[15/03/2024 10:02:00] Alice: bye',
    ].join('\n');

    /** Feed the same text in `size`-character slices. */
    const streamed = (text, size) => {
        const p = createStreamParser();
        for (let i = 0; i < text.length; i += size) p.push(text.slice(i, i + size));
        return p.end();
    };

    it('gives the same result whatever the chunk boundaries', () => {
        const whole = parse(source);
        for (const size of [1, 3, 7, 31, 1000]) {
            const chunked = streamed(source, size);
            expect(chunked.length).toBe(whole.length);
            expect(chunked.map(m => m.message)).toEqual(whole.map(m => m.message));
            expect(chunked.map(m => m.datetime.getTime()))
                .toEqual(whole.map(m => m.datetime.getTime()));
        }
    });

    it('settles the day/month order across chunk boundaries', () => {
        const text = [
            '[03/25/2024 10:00:00] Alice: one',
            '[03/26/2024 10:01:00] Bob: two',
            '[03/27/2024 10:02:00] Alice: three',
        ].join('\n');
        const msgs = streamed(text, 5);
        expect(msgs[0].datetime.getMonth()).toBe(2);
        expect(msgs[0].datetime.getDate()).toBe(25);
    });

    it('carries diagnostics on the thrown error, without a second pass', () => {
        const p = createStreamParser();
        p.push('coucou tout le monde\nceci est un secret');
        let caught = null;
        try { p.end(); } catch (err) { caught = err; }
        expect(caught).toBeTruthy();
        expect(caught.diagnostics.detected).toBe(false);
        expect(caught.diagnostics.totalLines).toBe(2);
        expect(caught.diagnostics.samples.join(' ')).not.toContain('secret');
    });
});

describe('the demo conversation', () => {
    it('round-trips through the parser in every interface language', async () => {
        const { buildDemoBlob } = await import('../js/demo.js');
        const { LOCALES, setLocale } = await import('../js/i18n.js');

        for (const code of Object.keys(LOCALES)) {
            setLocale(code);
            const messages = parse(await buildDemoBlob().text());
            expect(messages.length, code).toBeGreaterThan(2000);
            expect(new Set(messages.map(m => m.author)).size, code).toBe(4);
            expect(messages.filter(m => m.isMedia).length, code).toBeGreaterThan(50);
            expect(messages.filter(m => m.isReaction).length, code).toBeGreaterThan(10);
            expect(messages.every(m => !isNaN(m.datetime.getTime())), code).toBe(true);
        }
        setLocale('fr');
    });
});
