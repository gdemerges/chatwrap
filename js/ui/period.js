/**
 * Period picker: a year, everything, or an arbitrary date range.
 */
import { openDialog } from './dialog.js';
import { escapeHtml } from '../utils.js';
import { fmt } from '../format.js';
import { t } from '../i18n.js';

/**
 * @param {{ years: number[], yearCounts: Record<string, number>,
 *           bounds: { from: string, to: string },
 *           current: { year: number|null, range: {from: string, to: string}|null } }} spec
 * @returns {Promise<{ year: number|null, range: {from: string, to: string}|null } | undefined>}
 *   undefined when cancelled.
 */
export function pickPeriod({ years, yearCounts, bounds, current = { year: null, range: null } }) {
    const minDate = bounds.from.slice(0, 10);
    const maxDate = bounds.to.slice(0, 10);
    const total = Object.values(yearCounts).reduce((a, b) => a + b, 0);

    const yearButtons = years.map(y => `
        <button class="period-option ${current.year === y ? 'is-current' : ''}" data-year="${y}">
            <span class="period-value">${y}</span>
            <span class="period-count">${t('period.messages', { n: fmt(yearCounts[y]) })}</span>
        </button>`).join('');

    const html = `
        <div class="dialog-panel period-panel">
            <h2 class="dialog-title">${t('period.title')}</h2>
            <div class="tab-bar" role="tablist">
                <button class="tab-btn active" role="tab" aria-selected="true" data-tab="years" data-autofocus>${t('period.tabYears')}</button>
                <button class="tab-btn" role="tab" aria-selected="false" data-tab="range">${t('period.tabRange')}</button>
            </div>

            <div class="tab-panel" data-panel="years">
                <div class="period-options">
                    ${yearButtons}
                    <button class="period-option period-option-all ${current.year === null && !current.range ? 'is-current' : ''}" data-year="all">
                        <span class="period-value">${t('period.allYears')}</span>
                        <span class="period-count">${t('period.messages', { n: fmt(total) })}</span>
                    </button>
                </div>
            </div>

            <div class="tab-panel" data-panel="range" hidden>
                <label class="field">
                    <span>${t('period.from')}</span>
                    <input type="date" id="range-from" min="${minDate}" max="${maxDate}"
                           value="${escapeHtml(current.range?.from?.slice(0, 10) || minDate)}">
                </label>
                <label class="field">
                    <span>${t('period.to')}</span>
                    <input type="date" id="range-to" min="${minDate}" max="${maxDate}"
                           value="${escapeHtml(current.range?.to?.slice(0, 10) || maxDate)}">
                </label>
                <p class="field-error" id="range-error" role="alert" hidden></p>
                <button class="file-btn" id="range-apply">${t('period.apply')}</button>
            </div>

            <button class="dialog-dismiss" data-dismiss aria-label="${t('common.close')}">${t('common.cancel')}</button>
        </div>`;

    return openDialog({
        label: t('period.dialog'),
        className: 'period-dialog',
        html,
        onMount(root, close) {
            root.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    root.querySelectorAll('.tab-btn').forEach(b => {
                        const on = b === btn;
                        b.classList.toggle('active', on);
                        b.setAttribute('aria-selected', String(on));
                    });
                    root.querySelectorAll('.tab-panel').forEach(p => {
                        p.hidden = p.dataset.panel !== btn.dataset.tab;
                    });
                });
            });

            root.querySelectorAll('[data-year]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const raw = btn.dataset.year;
                    close({ year: raw === 'all' ? null : parseInt(raw, 10), range: null });
                });
            });

            const from = root.querySelector('#range-from');
            const to = root.querySelector('#range-to');
            const error = root.querySelector('#range-error');
            root.querySelector('#range-apply').addEventListener('click', () => {
                if (!from.value || !to.value) return fail(t('period.needBoth'));
                if (from.value > to.value) return fail(t('period.badOrder'));
                error.hidden = true;
                close({
                    year: null,
                    // End of day, so the last day of the range is included.
                    range: { from: `${from.value}T00:00:00`, to: `${to.value}T23:59:59` },
                });
            });

            function fail(message) {
                error.textContent = message;
                error.hidden = false;
            }

            root.querySelector('[data-dismiss]').addEventListener('click', () => close(undefined));
        },
    });
}
