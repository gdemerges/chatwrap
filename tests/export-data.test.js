/**
 * The data export is the only place chat content lands in a file the user then
 * opens in another program — so the two things that matter are that the tables
 * hold what the deck showed, and that nothing in them can execute.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const downloadBlob = vi.fn();
vi.mock('../js/export-image.js', () => ({ downloadBlob: (...a) => downloadBlob(...a) }));

const { statsToCSV, statsToJSON, exportData } = await import('../js/export-data.js');

const stats = () => ({
    totalMessages: 1200,
    totalChars: 48000,
    totalMedia: 40,
    totalLinks: 12,
    totalDeleted: 3,
    totalEdited: 1,
    participants: 2,
    avgMsgLen: 40,
    lang: 'fr',
    startDate: new Date('2024-01-01T08:00:00Z'),
    endDate: new Date('2024-12-31T20:00:00Z'),
    perPerson: {
        Alice: { count: 700, totalChars: 30000, media: 20, links: 8, emojis: 90, deleted: 2, edited: 1, nightMsgs: 30, morningMsgs: 10, avgResponseMin: 12 },
        Bob: { count: 500, totalChars: 18000, media: 20, links: 4, emojis: 40, deleted: 1, edited: 0, nightMsgs: 5, morningMsgs: 60 },
    },
    // `anonymizeStats` builds its alias map from the ranking, so a fixture
    // without one would silently exercise the non-anonymised path.
    ranking: [['Alice', { count: 700 }], ['Bob', { count: 500 }]],
    daily: { '2024-01-01': 5, '2024-01-02': 9 },
    monthly: { '2024-01': 14 },
    topWords: [['pizza', 40], ['demain', 25]],
    emojis: { top: [['😂', 120], ['❤️', 60]] },
    topDomains: [['youtube.com', 9]],
});

const table = (csv, name) => {
    const block = csv.split('\n\n').find(b => b.startsWith(`# ${name}\n`));
    return block ? block.split('\n').slice(1) : null;
};

describe('statsToCSV', () => {
    it('writes one titled block per table, with a header row', () => {
        const csv = statsToCSV(stats());
        expect(csv).toContain('# totals');
        expect(table(csv, 'people')[0]).toMatch(/^person,messages,characters/);
        expect(table(csv, 'people')).toContain('Alice,700,30000,20,8,90,2,1,30,10,12');
    });

    it('leaves a missing optional column empty rather than writing undefined', () => {
        const rows = table(statsToCSV(stats()), 'people');
        expect(rows.at(-1)).toBe('Bob,500,18000,20,4,40,1,0,5,60,');
    });

    it('reads the emoji ranking from where stats actually keeps it', () => {
        expect(table(statsToCSV(stats()), 'top_emojis')).toContain('😂,120');
    });

    it('skips a table with no rows instead of emitting an empty one', () => {
        const bare = { ...stats(), topDomains: [], daily: {} };
        const csv = statsToCSV(bare);
        expect(csv).not.toContain('# top_domains');
        expect(csv).not.toContain('# daily');
    });

    it('quotes fields containing a comma, a quote or a newline', () => {
        const csv = statsToCSV({ ...stats(), topWords: [['a,b', 1], ['say "hi"', 2], ['two\nlines', 3]] });
        const rows = table(csv, 'top_words');
        expect(rows).toContain('"a,b",1');
        expect(rows).toContain('"say ""hi""",2');
        expect(rows.join('\n')).toContain('"two\nlines",3');
    });

    it('defuses spreadsheet formulas — chat text is user-written', () => {
        const csv = statsToCSV({ ...stats(), topWords: [['=1+1', 1], ['@sum', 2], ['-cmd', 3], ['+x', 4]] });
        const rows = table(csv, 'top_words');
        expect(rows).toContain("'=1+1,1");
        expect(rows).toContain("'@sum,2");
        expect(rows).toContain("'-cmd,3");
        expect(rows).toContain("'+x,4");
    });
});

describe('statsToJSON', () => {
    it('is valid JSON carrying the stats and the comparison', () => {
        const parsed = JSON.parse(statsToJSON({ totalMessages: 3 }, { delta: 1 }));
        expect(parsed.generator).toBe('Chatwrap');
        expect(parsed.stats.totalMessages).toBe(3);
        expect(parsed.comparison).toEqual({ delta: 1 });
        expect(Date.parse(parsed.exportedAt)).not.toBeNaN();
    });

    it('records a null comparison rather than dropping the field', () => {
        expect(JSON.parse(statsToJSON({}, null)).comparison).toBeNull();
    });
});

describe('exportData', () => {
    beforeEach(() => downloadBlob.mockClear());

    it('names the file after the format and hands it to the downloader', () => {
        expect(exportData({ stats: stats(), comparison: null, format: 'json', anonymize: false }))
            .toBe('chatwrap-data.json');
        expect(downloadBlob).toHaveBeenCalledOnce();
        expect(downloadBlob.mock.calls[0][1]).toBe('chatwrap-data.json');
        expect(downloadBlob.mock.calls[0][0].type).toBe('application/json');
    });

    it('prefixes CSV with a BOM so a spreadsheet reads it as UTF-8', async () => {
        exportData({ stats: stats(), comparison: null, format: 'csv', anonymize: false });
        const blob = downloadBlob.mock.calls[0][0];
        expect(blob.type).toBe('text/csv;charset=utf-8');
        // Checked on the bytes, not on `text()`: decoding strips a leading BOM,
        // so the string round-trip cannot see the thing being asserted.
        const bytes = new Uint8Array(await blob.arrayBuffer());
        expect([...bytes.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);
        expect(await blob.text()).toContain('# people');
    });

    it('replaces the names when anonymisation is on', async () => {
        exportData({ stats: stats(), comparison: null, format: 'csv', anonymize: true });
        const text = await downloadBlob.mock.calls[0][0].text();
        expect(text).not.toContain('Alice');
        expect(text).toContain('# people');
    });

    it('serialises dates as ISO strings, not as [object Object]', async () => {
        exportData({ stats: stats(), comparison: null, format: 'json', anonymize: false });
        const parsed = JSON.parse(await downloadBlob.mock.calls[0][0].text());
        expect(parsed.stats.startDate).toBe('2024-01-01T08:00:00.000Z');
    });
});
