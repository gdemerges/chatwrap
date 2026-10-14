/**
 * Output formats for the image export, and the composite "poster" card.
 *
 * Kept apart from `export-image.js` because everything here is pure data —
 * no canvas, no DOM — so the sizing arithmetic and the poster composition can
 * be tested directly.
 */

import { fmt, fmtDecimal } from './format.js';
import { t } from './i18n.js';

const MM_PER_INCH = 25.4;

/**
 * Safety budget for a single canvas, in pixels.
 *
 * iOS Safari refuses to allocate a canvas beyond roughly 16.7 M pixels and —
 * worse — fails *silently*, handing back a blank bitmap. Every print preset is
 * therefore kept under this ceiling, and `resolvePreset` steps the DPI down
 * rather than letting a poster come out empty.
 */
export const MAX_CANVAS_PIXELS = 16_000_000;

/**
 * The design is authored in "design units" that are always 1080 wide; a
 * preset's pixel width sets the scale, and its aspect ratio sets how much
 * vertical room the layout gets. That is why a print preset is described by
 * millimetres and a DPI rather than by pixels.
 */
export const PRESETS = {
    story: {
        id: 'story',
        labelKey: 'image.presetStory',
        kind: 'screen',
        widthPx: 1080,
        heightPx: 1920,
    },
    a4: {
        id: 'a4',
        labelKey: 'image.presetA4',
        kind: 'print',
        mm: { w: 210, h: 297 },
        dpi: 300,
    },
    a3: {
        id: 'a3',
        labelKey: 'image.presetA3',
        kind: 'print',
        // 250 dpi, not 300: A3 at 300 dpi is 17.4 M pixels, just over what
        // iOS will allocate. At arm's length on a wall, 250 dpi is
        // indistinguishable — a blank poster is not.
        mm: { w: 297, h: 420 },
        dpi: 250,
    },
};

const round = (n) => Math.round(n);

/**
 * Turn a preset id into concrete pixel dimensions, lowering the DPI if the
 * result would exceed the canvas budget.
 *
 * @param {string} id
 * @param {number} [budget]
 * @returns {{ id: string, label: string, kind: string, widthPx: number,
 *             heightPx: number, dpi: number|null, mm: {w:number,h:number}|null,
 *             downscaled: boolean }}
 */
export function resolvePreset(id, budget = MAX_CANVAS_PIXELS) {
    const preset = PRESETS[id] || PRESETS.story;

    if (preset.kind === 'screen') {
        return {
            id: preset.id,
            label: t(preset.labelKey),
            kind: preset.kind,
            widthPx: preset.widthPx,
            heightPx: preset.heightPx,
            dpi: null,
            mm: null,
            downscaled: false,
        };
    }

    let dpi = preset.dpi;
    let widthPx = round((preset.mm.w / MM_PER_INCH) * dpi);
    let heightPx = round((preset.mm.h / MM_PER_INCH) * dpi);
    let downscaled = false;

    if (widthPx * heightPx > budget) {
        // Area scales with the square of the DPI.
        dpi = Math.floor(dpi * Math.sqrt(budget / (widthPx * heightPx)));
        widthPx = round((preset.mm.w / MM_PER_INCH) * dpi);
        heightPx = round((preset.mm.h / MM_PER_INCH) * dpi);
        downscaled = true;
    }

    return {
        id: preset.id,
        label: t(preset.labelKey),
        kind: preset.kind,
        widthPx,
        heightPx,
        dpi,
        mm: preset.mm,
        downscaled,
    };
}

/** "Camille, Léo & Sofia" — or "Camille, Léo & 6 autres" past three. */
export function participantsHeadline(names) {
    if (names.length === 0) return t('image.ourConversation');
    if (names.length === 1) return names[0];
    if (names.length <= 3) return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
    return t('image.andOthers', { names: names.slice(0, 2).join(', '), n: names.length - 2 });
}

/** "2024", or "2024 – 2025" when the conversation straddles two years. */
export function periodLabel(startDate, endDate) {
    const from = new Date(startDate).getFullYear();
    const to = new Date(endDate).getFullYear();
    return from === to ? String(from) : `${from} – ${to}`;
}

/**
 * A single card summarising the whole conversation, for print.
 *
 * A poster is not a slide: it is the one image someone puts on a wall, so it
 * carries the headline figure, the breakdown *and* the ranking at once. It is
 * deliberately denser than a story card — the renderer scales the block down
 * to fit rather than the card being trimmed here.
 *
 * @param {any} stats
 * @returns {import('./types.d.ts').SlideCard}
 */
export function buildPosterCard(stats) {
    const names = (stats.ranking || []).map(([name]) => name);
    const top = (stats.ranking || []).slice(0, 5);
    const maxCount = top[0]?.[1].count || 1;

    return {
        gradient: 'slide-gradient-11',
        tag: periodLabel(stats.startDate, stats.endDate),
        title: participantsHeadline(names),
        big: { value: fmt(stats.totalMessages), label: t('slide.overview.big') },
        grid: [
            [fmt(stats.totalDays), t('units.days')],
            [fmtDecimal(stats.avgPerDay), t('units.perDay')],
            [fmt(stats.emojis?.total || 0), t('units.emojis')],
            [t('format.days', { n: stats.streak?.max || 0 }), t('units.bestStreak')],
        ],
        bars: top.map(([name, p], i) => ({
            label: name,
            value: `${fmt(p.count)} · ${fmtDecimal(p.percent)}%`,
            ratio: p.count / maxCount,
            color: BAR_COLORS[i % BAR_COLORS.length],
        })),
        emojis: (stats.emojis?.top || []).slice(0, 5),
    };
}

const BAR_COLORS = ['#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F97316'];
