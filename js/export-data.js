/**
 * Take the numbers away with you: the stats as JSON, or as flat CSV tables.
 *
 * Everything the deck shows is already computed and already serialisable —
 * `payload.js` does exactly that for the share link — but there was no way to
 * get at it other than reading a slide. This is that way out.
 *
 * It respects the same anonymisation switch as the share link, and, like every
 * other export, it is built and saved entirely in the page: no upload, no
 * round-trip.
 */
import { serializeStats } from './payload.js';
import { anonymizeStats } from './anonymize.js';
import { downloadBlob } from './export-image.js';

/**
 * The tables worth flattening. Each maps a stats field to CSV columns; a field
 * that is missing (a short chat, a trimmed share payload) is skipped rather
 * than emitted empty, so the file only ever contains real rows.
 *
 * @type {{ name: string, columns: string[], rows: (s: any) => (string|number)[][] }[]}
 */
const TABLES = [
    {
        name: 'totals',
        columns: ['metric', 'value'],
        rows: (s) => [
            ['messages', s.totalMessages],
            ['characters', s.totalChars],
            ['media', s.totalMedia],
            ['links', s.totalLinks],
            ['deleted', s.totalDeleted],
            ['edited', s.totalEdited],
            ['participants', s.participants ?? Object.keys(s.perPerson || {}).length],
            ['avg_message_length', s.avgMsgLen],
            ['first_message', s.startDate],
            ['last_message', s.endDate],
            ['detected_language', s.lang],
        ].filter(([, v]) => v !== undefined && v !== null),
    },
    {
        name: 'people',
        columns: [
            'person', 'messages', 'characters', 'media', 'links', 'emojis',
            'deleted', 'edited', 'night_messages', 'morning_messages',
            'avg_response_minutes',
        ],
        rows: (s) => Object.entries(s.perPerson || {}).map(([name, p]) => [
            name, p.count ?? 0, p.totalChars ?? 0, p.media ?? 0,
            p.links ?? 0, p.emojis ?? 0, p.deleted ?? 0, p.edited ?? 0,
            p.nightMsgs ?? 0, p.morningMsgs ?? 0,
            p.avgResponseMin ?? '',
        ]),
    },
    {
        name: 'daily',
        columns: ['date', 'messages'],
        rows: (s) => Object.entries(s.daily || {}),
    },
    {
        name: 'monthly',
        columns: ['month', 'messages'],
        rows: (s) => Object.entries(s.monthly || {}),
    },
    {
        name: 'top_words',
        columns: ['word', 'count'],
        rows: (s) => (s.topWords || []).map(([w, n]) => [w, n]),
    },
    {
        name: 'top_emojis',
        columns: ['emoji', 'count'],
        rows: (s) => (s.emojis?.top || []).map(([e, n]) => [e, n]),
    },
    {
        name: 'top_domains',
        columns: ['domain', 'count'],
        rows: (s) => (s.topDomains || []).map(([d, n]) => [d, n]),
    },
];

/**
 * Quote a CSV field per RFC 4180.
 *
 * The leading-character guard is not about CSV at all: a value starting with
 * `=`, `+`, `-` or `@` is executed as a formula when the file is opened in a
 * spreadsheet, and chat data is user-written text. Prefixing an apostrophe
 * keeps the value readable and inert.
 */
function csvField(value) {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvRows = (rows) => rows.map(row => row.map(csvField).join(',')).join('\n');

/**
 * One CSV file holding every table, separated by a blank line and a `# name`
 * header. A zip of seven files would need JSZip and a second decision from the
 * user; one file opens in any spreadsheet and keeps the whole picture together.
 *
 * @param {any} stats already serialised (dates as ISO strings)
 */
export function statsToCSV(stats) {
    const blocks = [];
    for (const table of TABLES) {
        const rows = table.rows(stats) || [];
        if (!rows.length) continue;
        blocks.push(`# ${table.name}\n${table.columns.join(',')}\n${csvRows(rows)}`);
    }
    return blocks.join('\n\n') + '\n';
}

/** @param {any} stats already serialised */
export function statsToJSON(stats, comparison) {
    return JSON.stringify({
        generator: 'Chatwrap',
        exportedAt: new Date().toISOString(),
        stats,
        comparison: comparison || null,
    }, null, 2);
}

/**
 * Build and save the export.
 *
 * @param {{ stats: any, comparison: any, format: 'json'|'csv', anonymize: boolean }} options
 * @returns {string} the file name written
 */
export function exportData({ stats, comparison, format, anonymize }) {
    const source = anonymize ? anonymizeStats(stats) : stats;
    const serialized = serializeStats(source);

    const [body, type] = format === 'csv'
        ? [statsToCSV(serialized), 'text/csv;charset=utf-8']
        : [statsToJSON(serialized, comparison), 'application/json'];

    const filename = `chatwrap-data.${format}`;
    // A BOM so Excel reads the accents and the emoji as UTF-8 rather than as
    // the local codepage, which is where every "Ã©" in a shared CSV comes from.
    downloadBlob(new Blob([format === 'csv' ? '\uFEFF' + body : body], { type }), filename);
    return filename;
}
