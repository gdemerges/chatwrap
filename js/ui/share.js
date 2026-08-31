/**
 * Share sheet.
 *
 * Two very different things live behind one button, and they have different
 * privacy profiles:
 *   • an image — self-contained, shows only what is drawn on it;
 *   • a link — carries the whole stats payload in the URL fragment, so it
 *     lands in browser history and in the logs of whatever app it is pasted
 *     into. Anonymisation is therefore on by default for links.
 */
import { openDialog } from './dialog.js';
import { buildShareURL } from '../payload.js';
import { anonymizeStats } from '../anonymize.js';
import { shareCard, buildPosterCard } from '../export-image.js';
import { exportData } from '../export-data.js';
import { resolvePreset } from '../export-presets.js';
import { ensureLZString } from '../vendor.js';
import { showToast, showError } from './toast.js';
import { t } from '../i18n.js';
import { track } from '../analytics.js';

const ANON_KEY = 'ww-anonymize-share';
const POSTER_KEY = 'ww-poster-format';
const DATA_KEY = 'ww-data-format';

/**
 * @param {{ stats: any, comparison: any, card: any|null, recapCard: any|null }} ctx
 */
export function openShareSheet({ stats, comparison, card, recapCard }) {
    const anonDefault = localStorage.getItem(ANON_KEY) !== 'false';
    const posterFormat = localStorage.getItem(POSTER_KEY) || 'a3';
    const dataFormat = localStorage.getItem(DATA_KEY) || 'csv';
    const posterMeta = resolvePreset(posterFormat);

    const html = `
        <div class="dialog-panel share-panel">
            <h2 class="dialog-title">${t('share.title')}</h2>

            <div class="share-actions">
                ${card ? `<button class="share-action" data-action="slide" data-autofocus>
                    <span class="share-action-icon" aria-hidden="true">🖼️</span>
                    <span><strong>${t('share.slide')}</strong><small>${t('share.slideHint')}</small></span>
                </button>` : ''}
                ${recapCard ? `<button class="share-action" data-action="recap">
                    <span class="share-action-icon" aria-hidden="true">🧾</span>
                    <span><strong>${t('share.recap')}</strong><small>${t('share.recapHint')}</small></span>
                </button>` : ''}
                ${stats ? `<div class="share-action share-action-compound">
                    <span class="share-action-icon" aria-hidden="true">🖨️</span>
                    <span class="share-action-body">
                        <strong>${t('share.poster')}</strong>
                        <small id="poster-meta">${t('share.posterMeta', { dpi: posterMeta.dpi, w: posterMeta.widthPx, h: posterMeta.heightPx })}</small>
                    </span>
                    <span class="share-action-controls">
                        <label class="share-action-select">
                            <span class="sr-only">${t('share.posterFormat')}</span>
                            <select id="poster-format">
                                <option value="a3" ${posterFormat === 'a3' ? 'selected' : ''}>A3</option>
                                <option value="a4" ${posterFormat === 'a4' ? 'selected' : ''}>A4</option>
                            </select>
                        </label>
                        <button class="share-action-go" data-action="poster" aria-label="${t('share.posterGoAria')}">${t('share.posterGo')}</button>
                    </span>
                </div>` : ''}
                <button class="share-action" data-action="link">
                    <span class="share-action-icon" aria-hidden="true">🔗</span>
                    <span><strong>${t('share.link')}</strong><small>${t('share.linkHint')}</small></span>
                </button>
                ${stats ? `<div class="share-action share-action-compound">
                    <span class="share-action-icon" aria-hidden="true">📄</span>
                    <span class="share-action-body">
                        <strong>${t('share.data')}</strong>
                        <small>${t('share.dataHint')}</small>
                    </span>
                    <span class="share-action-controls">
                        <label class="share-action-select">
                            <span class="sr-only">${t('share.dataFormat')}</span>
                            <select id="data-format">
                                <option value="csv" ${dataFormat === 'csv' ? 'selected' : ''}>CSV</option>
                                <option value="json" ${dataFormat === 'json' ? 'selected' : ''}>JSON</option>
                            </select>
                        </label>
                        <button class="share-action-go" data-action="data" aria-label="${t('share.dataGoAria')}">${t('share.dataGo')}</button>
                    </span>
                </div>` : ''}
            </div>

            <label class="switch-row">
                <input type="checkbox" id="share-anon" ${anonDefault ? 'checked' : ''}>
                <span>
                    <strong>${t('share.anonTitle')}</strong>
                    <small>${t('share.anonHint')}</small>
                </span>
            </label>

            <button class="dialog-dismiss" data-dismiss aria-label="${t('common.close')}">${t('common.close')}</button>
        </div>`;

    return openDialog({
        label: t('share.title'),
        className: 'share-dialog',
        html,
        onMount(root, close) {
            const anonBox = root.querySelector('#share-anon');
            anonBox.addEventListener('change', () => {
                localStorage.setItem(ANON_KEY, String(anonBox.checked));
            });

            const dataSelect = root.querySelector('#data-format');
            dataSelect?.addEventListener('change', () => {
                localStorage.setItem(DATA_KEY, dataSelect.value);
            });

            const formatSelect = root.querySelector('#poster-format');
            formatSelect?.addEventListener('change', () => {
                localStorage.setItem(POSTER_KEY, formatSelect.value);
                const meta = resolvePreset(formatSelect.value);
                root.querySelector('#poster-meta').textContent =
                    t('share.posterMeta', { dpi: meta.dpi, w: meta.widthPx, h: meta.heightPx });
            });

            root.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const action = btn.dataset.action;
                    btn.disabled = true;
                    try {
                        if (action === 'link') {
                            await copyLink(stats, comparison, anonBox.checked);
                        } else if (action === 'data') {
                            const format = dataSelect?.value || 'csv';
                            // Same anonymisation switch as the link: the two
                            // are the only exports that carry names.
                            const name = exportData({
                                stats, comparison, format, anonymize: anonBox.checked,
                            });
                            track('export_data', { format, anonymized: anonBox.checked });
                            showToast(t('share.dataSaved', { name }));
                        } else if (action === 'poster') {
                            const format = formatSelect?.value || 'a3';
                            showToast(t('share.posterWorking'));
                            const result = await shareCard(
                                buildPosterCard(stats),
                                `chatwrap-poster-${format}.png`,
                                { preset: format },
                            );
                            track('poster', { format });
                            showToast(t(result === 'shared' ? 'share.posterShared' : 'share.posterSaved'));
                        } else {
                            const chosen = action === 'recap' ? recapCard : card;
                            const result = await shareCard(chosen, filenameFor(chosen));
                            track('share_image', { kind: action });
                            showToast(t(result === 'shared' ? 'share.imageShared' : 'share.imageSaved'));
                        }
                        close(action);
                    } catch (err) {
                        console.error(err);
                        showError(err.message);
                        btn.disabled = false;
                    }
                });
            });

            root.querySelector('[data-dismiss]').addEventListener('click', () => close(undefined));
        },
    });
}

async function copyLink(stats, comparison, anonymize) {
    track('share_link', { anonymized: anonymize });
    await ensureLZString();
    const payload = anonymize ? anonymizeStats(stats) : stats;
    const { url, truncated } = buildShareURL(payload, comparison, { dropDaily: true });
    const { copyToClipboard } = await import('./toast.js');
    await copyToClipboard(
        url,
        t(truncated ? 'share.linkCopiedTrimmed' : 'share.linkCopied'),
    );
}

function filenameFor(card) {
    const slug = (card?.title || card?.tag || 'wrapped')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
    return `chatwrap-${slug || 'slide'}.png`;
}
