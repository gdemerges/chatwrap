/**
 * Share sheet — the link, the data export, the image hand-off and the
 * dialog lifecycle. `js/ui/share.js` was at ~5% coverage.
 *
 * jsdom has no canvas and no Web Share API, and the CDN LZString is not an
 * npm dependency, so those three are replaced: the image and data exports are
 * mocked modules, LZString is a reversible stand-in (encodeURIComponent), and
 * `navigator.share` / `navigator.clipboard` are stubbed per test.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../js/export-image.js', () => ({
    shareCard: vi.fn(),
    buildPosterCard: vi.fn(() => ({ kind: 'poster' })),
}));
vi.mock('../js/export-data.js', () => ({
    exportData: vi.fn(() => 'chatwrap-data.csv'),
}));
vi.mock('../js/vendor.js', () => ({
    ensureLZString: vi.fn(async () => {
        globalThis.LZString = {
            compressToEncodedURIComponent: (s) => encodeURIComponent(s),
        };
    }),
}));
vi.mock('../js/analytics.js', () => ({ track: vi.fn() }));

import { openShareSheet } from '../js/ui/share.js';
import { shareCard, buildPosterCard } from '../js/export-image.js';
import { exportData } from '../js/export-data.js';
import { track } from '../js/analytics.js';
import { parse } from '../js/parser.js';
import { compute } from '../js/stats.js';
import { setLocale, t } from '../js/i18n.js';
import { resolvePreset } from '../js/export-presets.js';

const CHAT = [
    '[01/03/2024 10:00:00] Alice Martin: bonjour https://youtube.com/a',
    '[01/03/2024 10:01:00] Bob: salut Alice',
    '[02/03/2024 10:00:00] Alice Martin: coucou 😀',
    '[02/03/2024 10:01:00] Bob: yo',
    '[03/03/2024 10:00:00] Alice Martin: encore moi 😀',
    '[03/03/2024 10:05:00] Bob: ok',
].join('\n');

const stats = compute(parse(CHAT));
const card = { title: 'Ça — Ça & là', gradient: 'x' };
const recapCard = { tag: 'recap' };

/** Decode the `#share=` fragment written by buildShareURL. */
function decodeShare(url) {
    const raw = decodeURIComponent(url.split('#share=')[1]);
    return JSON.parse(raw);
}

const $ = (sel) => document.querySelector(sel);
const flush = () => new Promise((r) => setTimeout(r, 0));

function open(opts = {}) {
    // A dismissed dialog stays in the DOM for 400ms (transition clean-up), so
    // clear it here or the next sheet's selectors would hit the stale one.
    document.querySelectorAll('[role="dialog"]').forEach((d) => d.remove());
    return openShareSheet({ stats, comparison: null, card, recapCard, ...opts });
}

function clickAction(action) {
    document.querySelector(`[data-action="${action}"]`).click();
}

let clipboardWrite;

beforeEach(() => {
    setLocale('fr');
    document.body.innerHTML = '<div id="share-toast"></div><div id="a11y-live"></div>';
    localStorage.clear();
    vi.clearAllMocks();
    clipboardWrite = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: clipboardWrite },
    });
    delete navigator.share;
    delete navigator.canShare;
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.querySelectorAll('[role="dialog"]').forEach((d) => d.remove());
});

describe('openShareSheet — rendering', () => {
    it('shows every action when a card, a recap and stats are all available', () => {
        open();
        for (const action of ['slide', 'recap', 'poster', 'link', 'data']) {
            expect(document.querySelector(`[data-action="${action}"]`)).not.toBeNull();
        }
        expect($('[role="dialog"]').getAttribute('aria-label')).toBe(t('share.title'));
    });

    it('hides the image, recap and poster/data rows when their input is missing', () => {
        open({ stats: null, card: null, recapCard: null });
        expect($('[data-action="slide"]')).toBeNull();
        expect($('[data-action="recap"]')).toBeNull();
        expect($('[data-action="poster"]')).toBeNull();
        expect($('[data-action="data"]')).toBeNull();
        expect($('[data-action="link"]')).not.toBeNull();
    });

    it('defaults the anonymise switch to on, and to off once the user unticked it', () => {
        open();
        expect($('#share-anon').checked).toBe(true);
        $('[data-dismiss]').click();

        localStorage.setItem('ww-anonymize-share', 'false');
        open();
        expect($('#share-anon').checked).toBe(false);
    });

    it('remembers the anonymise switch, the poster format and the data format', () => {
        open();
        const anon = $('#share-anon');
        anon.checked = false;
        anon.dispatchEvent(new Event('change'));
        expect(localStorage.getItem('ww-anonymize-share')).toBe('false');

        const data = $('#data-format');
        data.value = 'json';
        data.dispatchEvent(new Event('change'));
        expect(localStorage.getItem('ww-data-format')).toBe('json');

        const poster = $('#poster-format');
        poster.value = 'a4';
        poster.dispatchEvent(new Event('change'));
        expect(localStorage.getItem('ww-poster-format')).toBe('a4');
        const a4 = resolvePreset('a4');
        expect($('#poster-meta').textContent).toBe(
            t('share.posterMeta', { dpi: a4.dpi, w: a4.widthPx, h: a4.heightPx }),
        );
    });

    it('restores the remembered formats on the next open', () => {
        localStorage.setItem('ww-data-format', 'json');
        localStorage.setItem('ww-poster-format', 'a4');
        open();
        expect($('#data-format').value).toBe('json');
        expect($('#poster-format').value).toBe('a4');
    });
});

describe('openShareSheet — dialog lifecycle', () => {
    it('resolves with the action name once an action completes', async () => {
        const p = open({ card: null, recapCard: null });
        clickAction('link');
        await expect(p).resolves.toBe('link');
        await flush();
        expect($('[role="dialog"]')).not.toBeNull(); // removal is deferred by the dialog
    });

    // Known gap, pinned as-is: the link row is rendered even without stats
    // (share.js line 65), but serializeStats cannot read null. The error is
    // caught and shown, the sheet stays open and the button is re-enabled.
    // Both app.js and dashboard.js always pass stats today, so this is latent.
    it('clicking the link without stats shows an error and keeps the sheet open', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        open({ stats: null, card: null, recapCard: null });
        const btn = $('[data-action="link"]');
        clickAction('link');
        await flush();
        expect(clipboardWrite).not.toHaveBeenCalled();
        expect($('#share-toast').classList.contains('error')).toBe(true);
        expect($('[role="dialog"]')).not.toBeNull();
        expect(btn.disabled).toBe(false);
    });

    it('resolves undefined when dismissed with the close button, calling no export', async () => {
        const p = open();
        $('[data-dismiss]').click();
        await expect(p).resolves.toBeUndefined();
        expect(exportData).not.toHaveBeenCalled();
        expect(shareCard).not.toHaveBeenCalled();
        expect(clipboardWrite).not.toHaveBeenCalled();
    });

    it('resolves undefined on Escape', async () => {
        const p = open();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await expect(p).resolves.toBeUndefined();
    });
});

describe('link action', () => {
    it('copies a #share= URL whose payload carries the stats, with no name when anonymised', async () => {
        open({ stats: stats, card: null, recapCard: null });
        clickAction('link');
        await flush();

        expect(clipboardWrite).toHaveBeenCalledTimes(1);
        const url = clipboardWrite.mock.calls[0][0];
        expect(url).toContain('#share=');
        const { s } = decodeShare(url);
        expect(s.totalMessages ?? s.total ?? true).toBeTruthy();
        expect(s.ranking.map(([n]) => n)).toEqual(['A.', 'B.']);
        const dump = JSON.stringify(decodeShare(url));
        expect(dump).not.toContain('Alice');
        expect(dump).not.toContain('Bob');
    });

    it('sends the real names when anonymisation is unticked', async () => {
        localStorage.setItem('ww-anonymize-share', 'false');
        open({ stats, card: null, recapCard: null });
        clickAction('link');
        await flush();
        const url = clipboardWrite.mock.calls[0][0];
        const dump = JSON.stringify(decodeShare(url));
        expect(dump).toContain('Alice Martin');
        expect(dump).toContain('Bob');
    });

    it('tracks the link event with the anonymised flag, never the URL', async () => {
        open({ stats, card: null, recapCard: null });
        clickAction('link');
        await flush();
        expect(track).toHaveBeenCalledWith('share_link', { anonymized: true });
        for (const call of track.mock.calls) {
            expect(JSON.stringify(call)).not.toContain('#share=');
        }
    });

    it('confirms with the plain toast when the link fits', async () => {
        open({ stats, card: null, recapCard: null });
        clickAction('link');
        await flush();
        expect($('#share-toast').textContent).toBe(t('share.linkCopied'));
        expect($('#share-toast').classList.contains('error')).toBe(false);
    });

    it('warns that the link was trimmed when the payload exceeds the safe length', async () => {
        const heavy = {
            ...stats,
            topWords: Array.from({ length: 400 }, (_, i) => [`motlong${i}abcdefghij`, 5]),
        };
        open({ stats: heavy, card: null, recapCard: null });
        clickAction('link');
        await flush();
        expect($('#share-toast').textContent).toBe(t('share.linkCopiedTrimmed'));
    });

    it('falls back to execCommand copy when the async clipboard is refused', async () => {
        clipboardWrite.mockRejectedValueOnce(new Error('denied'));
        const exec = vi.fn(() => true);
        document.execCommand = exec;
        open({ stats, card: null, recapCard: null });
        clickAction('link');
        await flush();
        expect(exec).toHaveBeenCalledWith('copy');
        expect($('#share-toast').textContent).toBe(t('share.linkCopied'));
        expect(document.querySelector('textarea')).toBeNull(); // scratch textarea removed
        delete document.execCommand;
    });

    it('shows the copy-failed error when both clipboard routes fail', async () => {
        clipboardWrite.mockRejectedValueOnce(new Error('denied'));
        document.execCommand = vi.fn(() => false);
        open({ stats, card: null, recapCard: null });
        clickAction('link');
        await flush();
        expect($('#share-toast').textContent).toBe(t('error.prefix', { message: t('share.copyFailed') }));
        expect($('#share-toast').classList.contains('error')).toBe(true);
        delete document.execCommand;
    });
});

describe('data action', () => {
    it('exports with the chosen format and the anonymise switch', async () => {
        open();
        $('#data-format').value = 'json';
        clickAction('data');
        await flush();
        expect(exportData).toHaveBeenCalledWith({
            stats, comparison: null, format: 'json', anonymize: true,
        });
        expect(track).toHaveBeenCalledWith('export_data', { format: 'json', anonymized: true });
    });

    it('confirms with the file name written', async () => {
        open();
        clickAction('data');
        await flush();
        expect($('#share-toast').textContent).toBe(t('share.dataSaved', { name: 'chatwrap-data.csv' }));
    });

    it('reports a failing export through the error toast and re-enables the button', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        exportData.mockImplementationOnce(() => { throw new Error('disk full'); });
        open();
        const btn = $('[data-action="data"]');
        clickAction('data');
        await flush();
        expect($('#share-toast').textContent).toBe(t('error.prefix', { message: 'disk full' }));
        expect($('#share-toast').classList.contains('error')).toBe(true);
        expect(btn.disabled).toBe(false);
    });
});

describe('image and poster actions', () => {
    it('shares the slide card with a slug filename derived from its title', async () => {
        shareCard.mockResolvedValueOnce('shared');
        open();
        clickAction('slide');
        await flush();
        // NFD strips the accents: « Ça — Ça & là » → ca-ca-la.
        expect(shareCard).toHaveBeenCalledWith(card, 'chatwrap-ca-ca-la.png');
        expect(track).toHaveBeenCalledWith('share_image', { kind: 'slide' });
        expect($('#share-toast').textContent).toBe(t('share.imageShared'));
    });

    it('says the image was saved when shareCard fell back to a download', async () => {
        shareCard.mockResolvedValueOnce('downloaded');
        open();
        clickAction('slide');
        await flush();
        expect($('#share-toast').textContent).toBe(t('share.imageSaved'));
    });

    it.each(['slide', 'poster'])('treats a dismissed share sheet (%s) as nothing happening', async (action) => {
        shareCard.mockResolvedValueOnce('cancelled');
        open();
        const btn = $(`[data-action="${action}"]`);
        clickAction(action);
        await flush();
        expect(track).not.toHaveBeenCalledWith(action === 'poster' ? 'poster' : 'share_image', expect.anything());
        expect($('#share-toast')?.textContent ?? '').not.toMatch(
            new RegExp([t('share.imageShared'), t('share.posterShared')].join('|')),
        );
        expect(btn.disabled).toBe(false);
        expect($('[role="dialog"]')).not.toBeNull();
    });

    it('shares the recap card, not the slide card, for the recap action', async () => {
        shareCard.mockResolvedValueOnce('downloaded');
        open();
        clickAction('recap');
        await flush();
        expect(shareCard.mock.calls[0][0]).toBe(recapCard);
        expect(shareCard.mock.calls[0][1]).toBe('chatwrap-recap.png');
    });

    it('renders the poster from the stats at the chosen preset', async () => {
        shareCard.mockResolvedValueOnce('downloaded');
        open();
        $('#poster-format').value = 'a4';
        clickAction('poster');
        await flush();
        expect(buildPosterCard).toHaveBeenCalledWith(stats);
        expect(shareCard).toHaveBeenCalledWith(
            { kind: 'poster' },
            'chatwrap-poster-a4.png',
            { preset: 'a4' },
        );
        expect(track).toHaveBeenCalledWith('poster', { format: 'a4' });
    });

    it('shows the working toast before the poster is rendered', async () => {
        let release;
        shareCard.mockImplementationOnce(() => new Promise((r) => { release = r; }));
        open();
        clickAction('poster');
        await flush();
        expect($('#share-toast').textContent).toBe(t('share.posterWorking'));
        release('shared');
        await flush();
        expect($('#share-toast').textContent).toBe(t('share.posterShared'));
    });

    it('surfaces an image failure as an error and keeps the sheet open', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        shareCard.mockRejectedValueOnce(new Error('canvas refused'));
        open();
        const btn = $('[data-action="slide"]');
        clickAction('slide');
        await flush();
        expect($('#share-toast').textContent).toBe(t('error.prefix', { message: 'canvas refused' }));
        expect(btn.disabled).toBe(false);
        expect($('[role="dialog"]')).not.toBeNull();
    });
});
