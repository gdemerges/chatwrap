/**
 * Renders a card to an image, on canvas — for a story, or for print.
 *
 * This is the piece that makes a "Wrapped" shareable at all: before it, the
 * only way to pass results on was a link carrying the conversation's stats —
 * names included — through someone else's chat logs.
 *
 * Slides describe *what* to export via an optional `card` descriptor (see
 * `js/slides/_card.js`); this module owns *how* it looks. Nothing here reads
 * the DOM, so the output is identical whatever the viewport.
 *
 * Everything is laid out in **design units**: the canvas is always 1080 units
 * wide, and the context is scaled to the preset's real pixel width. A print
 * poster is therefore the same drawing code as a story, at 2480 px wide and a
 * shorter aspect ratio — not a separate layout.
 */

import { resolvePreset, buildPosterCard } from './export-presets.js';
import { t } from './i18n.js';

export { buildPosterCard };

/** Design-unit width. Every size and offset below is expressed against this. */
const BASE_W = 1080;
const PAD = 88;

/** Canvas can't read `var(--x)`, and the story card has its own palette. */
const PALETTES = {
    'slide-gradient-1':  ['#12103a', '#241c63', '#2b1d4e'],
    'slide-gradient-2':  ['#2a0b3d', '#611a5e', '#3a1150'],
    'slide-gradient-3':  ['#320f38', '#6a1d55', '#411550'],
    'slide-gradient-4':  ['#0b2038', '#123a63', '#0f2b4d'],
    'slide-gradient-5':  ['#3a1020', '#7a2438', '#4a1430'],
    'slide-gradient-6':  ['#062a2e', '#0e4f52', '#0a3540'],
    'slide-gradient-7':  ['#08281a', '#0f4f34', '#0b3826'],
    'slide-gradient-8':  ['#3a1108', '#6e2a12', '#45150f'],
    'slide-gradient-9':  ['#221046', '#3d1f73', '#2a1550'],
    'slide-gradient-10': ['#101a2c', '#1e3450', '#16243c'],
    'slide-gradient-11': ['#1b1050', '#33207e', '#221459'],
};
const DEFAULT_PALETTE = PALETTES['slide-gradient-1'];

const DISPLAY = "'Space Grotesk', system-ui, -apple-system, sans-serif";
const BODY = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/** Below this the type stops being a poster and starts being a leaflet. */
const MIN_CONTENT_SCALE = 0.62;

/** Height reserved at the bottom for the footer line. */
const FOOTER_BAND = 70;

/** The display face must be resident before the first canvas draw. */
async function readyFonts() {
    if (!document.fonts) return;
    try {
        await Promise.all([
            document.fonts.load(`700 100px ${DISPLAY}`),
            document.fonts.load(`500 40px ${DISPLAY}`),
        ]);
        await document.fonts.ready;
    } catch { /* system fallback is fine */ }
}

/**
 * @param {import('./types.d.ts').SlideCard} card
 * @param {{ preset?: string }} [options]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderCard(card, options = {}) {
    await readyFonts();

    const preset = resolvePreset(options.preset || 'story');
    const scale = preset.widthPx / BASE_W;
    const H = preset.heightPx / scale;   // design-unit height, varies by format

    const canvas = document.createElement('canvas');
    canvas.width = preset.widthPx;
    canvas.height = preset.heightPx;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const layout = { w: BASE_W, h: H, pad: PAD };
    paintBackground(ctx, layout, PALETTES[card.gradient] || DEFAULT_PALETTE);

    // A poster carries more blocks than a story and has proportionally less
    // height for them. Rather than dropping content, the whole block is scaled
    // to fit — which is what makes one card descriptor work in both formats.
    //
    // The box stops short of the footer band: the fit used to be computed
    // against the full height, so a dense poster ran its last row of tiles
    // straight through the footer.
    const boxTop = PAD + 40;
    const boxBottom = H - PAD - FOOTER_BAND;
    const available = boxBottom - boxTop;
    // The estimate is deliberately rough, so keep a little slack in hand.
    const estimated = estimateHeight(ctx, layout, card) * 1.02;
    const contentScale = Math.max(MIN_CONTENT_SCALE, Math.min(1, available / estimated));

    ctx.save();
    if (contentScale < 1) {
        // Scale about the horizontal centre so the margins stay symmetric.
        ctx.translate(BASE_W / 2, 0);
        ctx.scale(contentScale, contentScale);
        ctx.translate(-BASE_W / 2, 0);
    }

    // Everything below is in scaled units, so the box has to be too.
    let y = boxTop / contentScale
        + Math.max(0, (available / contentScale - estimated) / 2);

    y = drawTag(ctx, layout, card.tag, y);
    if (card.title) y = drawTitle(ctx, layout, card.title, y + 28);
    if (card.subtitle) y = drawSubtitle(ctx, layout, card.subtitle, y + 18);
    if (card.big) y = drawBig(ctx, layout, card.big, y + 70);
    if (card.grid?.length) y = drawGrid(ctx, layout, card.grid, y + 60);
    if (card.bars?.length) y = drawBars(ctx, layout, card.bars, y + 60);
    if (card.emojis?.length) y = drawEmojis(ctx, layout, card.emojis, y + 56);
    if (card.lines?.length) drawLines(ctx, layout, card.lines, y + 52);
    ctx.restore();

    drawFooter(ctx, layout);
    return canvas;
}

/**
 * @param {import('./types.d.ts').SlideCard} card
 * @param {{ preset?: string }} [options]
 * @returns {Promise<Blob>}
 */
export async function renderCardBlob(card, options = {}) {
    const canvas = await renderCard(card, options);
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                // A canvas the browser refused to allocate comes back blank and
                // tiny rather than throwing; treat that as the failure it is.
                if (!blob || blob.size < 1024) {
                    reject(new Error(t('image.renderFailed')));
                    return;
                }
                resolve(blob);
            },
            'image/png',
        );
    });
}

/**
 * Hand the image to the OS share sheet when there is one (that's the path that
 * actually ends in a story), otherwise fall back to a download.
 *
 * A dismissed share sheet is `'cancelled'`, not `'shared'`: nothing was
 * shared, so there is nothing to confirm and nothing to count.
 * @returns {Promise<'shared' | 'downloaded' | 'cancelled'>}
 */
export async function shareCard(card, filename = 'chatwrap.png', options = {}) {
    const blob = await renderCardBlob(card, options);
    const file = new File([blob], filename, { type: 'image/png' });

    if (navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: t('image.shareTitle') });
            return 'shared';
        } catch (err) {
            if (err && err.name === 'AbortError') return 'cancelled';
            // Anything else: fall through to the download path.
        }
    }
    downloadBlob(blob, filename);
    return 'downloaded';
}

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on the next tick — Safari needs the URL alive during the click.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Rough height of the content block, in the same order `renderCard` draws it.
 * Used to centre the block and to decide whether it must be scaled down, so an
 * approximation is enough — the draw functions remain the source of truth for
 * actual positions.
 */
function estimateHeight(ctx, layout, card) {
    const inner = layout.w - layout.pad * 2;
    let h = 0;
    if (card.tag) h += 80;
    if (card.title) {
        ctx.font = `700 76px ${DISPLAY}`;
        h += 28 + lineCount(ctx, card.title, inner) * 88;
    }
    if (card.subtitle) {
        ctx.font = `400 34px ${BODY}`;
        h += 18 + lineCount(ctx, card.subtitle, inner) * 46;
    }
    if (card.big) h += 70 + 200 + 60;
    if (card.grid?.length) h += 60 + Math.ceil(Math.min(card.grid.length, 6) / 2) * 174;
    if (card.bars?.length) h += 60 + Math.min(card.bars.length, 8) * 108;
    if (card.emojis?.length) h += 56 + Math.ceil(Math.min(card.emojis.length, 10) / 5) * 170;
    if (card.lines?.length) h += 52 + Math.min(card.lines.length, 6) * 64;
    return h;
}

function lineCount(ctx, text, maxWidth) {
    let lines = 1;
    let line = '';
    for (const word of String(text).split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width > maxWidth && line) {
            lines++;
            line = word;
        } else {
            line = candidate;
        }
    }
    return lines;
}

// ---------------------------------------------------------------- painting

function paintBackground(ctx, { w, h }, stops) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.55, stops[1]);
    g.addColorStop(1, stops[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Two soft light pools, so a flat gradient doesn't read as a wallpaper.
    for (const [cx, cy, r, alpha] of [[w * 0.85, h * 0.12, w * 0.57, 0.16], [w * 0.1, h * 0.82, w * 0.65, 0.12]]) {
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        glow.addColorStop(0, `rgba(255,255,255,${alpha})`);
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
    }
}

function drawTag(ctx, { pad }, tag, y) {
    if (!tag) return y;
    ctx.font = `600 30px ${BODY}`;
    const textW = ctx.measureText(tag.toUpperCase()).width;
    const padX = 30;
    const h = 62;
    roundRect(ctx, pad, y - h + 14, textW + padX * 2, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag.toUpperCase(), pad + padX, y - h + 14 + h / 2 + 1);
    return y + 18;
}

function drawTitle(ctx, { w, pad }, title, y) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 76px ${DISPLAY}`;
    ctx.textBaseline = 'top';
    return wrapText(ctx, title, pad, y, w - pad * 2, 88);
}

function drawSubtitle(ctx, { w, pad }, text, y) {
    ctx.fillStyle = 'rgba(255,255,255,0.68)';
    ctx.font = `400 34px ${BODY}`;
    ctx.textBaseline = 'top';
    return wrapText(ctx, text, pad, y, w - pad * 2, 46);
}

function drawBig(ctx, { w, pad }, big, y) {
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    // Shrink to fit rather than overflow: "1 234 567" must stay on one line.
    let size = 190;
    do {
        ctx.font = `700 ${size}px ${DISPLAY}`;
        size -= 10;
    } while (ctx.measureText(big.value).width > w - pad * 2 && size > 70);

    ctx.fillText(big.value, pad, y);
    const lineH = size + 10;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = `500 38px ${BODY}`;
    ctx.fillText(big.label, pad, y + lineH + 8);
    return y + lineH + 60;
}

function drawGrid(ctx, { w, pad }, cells, y) {
    const cols = 2;
    const gap = 24;
    const cw = (w - pad * 2 - gap * (cols - 1)) / cols;
    const ch = 150;
    cells.slice(0, 6).forEach(([value, label], i) => {
        const cx = pad + (i % cols) * (cw + gap);
        const cy = y + Math.floor(i / cols) * (ch + gap);
        roundRect(ctx, cx, cy, cw, ch, 28);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.textBaseline = 'top';
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 52px ${DISPLAY}`;
        ctx.fillText(fit(ctx, String(value), cw - 48), cx + 24, cy + 28);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `400 28px ${BODY}`;
        ctx.fillText(fit(ctx, label, cw - 48), cx + 24, cy + 94);
    });
    const rows = Math.ceil(Math.min(cells.length, 6) / cols);
    return y + rows * (ch + gap);
}

function drawBars(ctx, { w, pad }, bars, y) {
    const rowH = 108;
    const barW = w - pad * 2;
    bars.slice(0, 8).forEach((bar, i) => {
        const by = y + i * rowH;
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#ffffff';
        ctx.font = `600 34px ${BODY}`;
        ctx.fillText(fit(ctx, bar.label, barW - 300), pad, by);

        ctx.fillStyle = 'rgba(255,255,255,0.66)';
        ctx.font = `400 32px ${BODY}`;
        ctx.textAlign = 'right';
        ctx.fillText(bar.value, w - pad, by);
        ctx.textAlign = 'left';

        roundRect(ctx, pad, by + 52, barW, 22, 11);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fill();

        const filled = Math.max(0.02, Math.min(1, bar.ratio ?? 0)) * barW;
        roundRect(ctx, pad, by + 52, filled, 22, 11);
        ctx.fillStyle = bar.color || '#8B5CF6';
        ctx.fill();
    });
    return y + Math.min(bars.length, 8) * rowH;
}

function drawEmojis(ctx, { w, pad }, emojis, y) {
    const cols = 5;
    const gap = 20;
    const cw = (w - pad * 2 - gap * (cols - 1)) / cols;
    const ch = 150;
    emojis.slice(0, 10).forEach(([emoji, count], i) => {
        const cx = pad + (i % cols) * (cw + gap);
        const cy = y + Math.floor(i / cols) * (ch + gap);
        roundRect(ctx, cx, cy, cw, ch, 24);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `400 62px ${BODY}`;
        ctx.fillText(emoji, cx + cw / 2, cy + 22);
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font = `600 26px ${BODY}`;
        ctx.fillText(String(count), cx + cw / 2, cy + 100);
        ctx.textAlign = 'left';
    });
    const rows = Math.ceil(Math.min(emojis.length, 10) / cols);
    return y + rows * (ch + gap);
}

function drawLines(ctx, { w, pad }, lines, y) {
    let cursor = y;
    ctx.textBaseline = 'top';
    for (const line of lines.slice(0, 6)) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = `400 34px ${BODY}`;
        ctx.fillText('—', pad, cursor + 2);
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        cursor = wrapText(ctx, line, pad + 52, cursor, w - pad * 2 - 52, 46) + 18;
    }
    return cursor;
}

function drawFooter(ctx, { w, h, pad }) {
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `500 30px ${BODY}`;
    ctx.fillText('Chatwrap', pad, h - pad);
    ctx.textAlign = 'right';
    ctx.fillText(t('image.footer'), w - pad, h - pad);
    ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- helpers

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

/** Draw wrapped text; returns the y just below the last line. */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text).split(/\s+/);
    let line = '';
    let cursor = y;
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width > maxWidth && line) {
            ctx.fillText(line, x, cursor);
            cursor += lineHeight;
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line) {
        ctx.fillText(line, x, cursor);
        cursor += lineHeight;
    }
    return cursor;
}

/** Ellipsize to fit the given width using the current font. */
function fit(ctx, text, maxWidth) {
    let s = String(text);
    if (ctx.measureText(s).width <= maxWidth) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
    return s + '…';
}
