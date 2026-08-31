/**
 * One conversation against another.
 *
 * Same table as the year-over-year slide — the numbers come from the same
 * `compareYears` — but the two columns are two different conversations rather
 * than two years, so the headings name them instead of saying "before" and
 * "now".
 */
import { t } from '../i18n.js';
import { fmt } from '../format.js';
import { escapeHtml } from '../utils.js';

/**
 * @param {any} versus result of `compareYears(current, pinned.digest)`
 * @param {string} pinnedName the pinned conversation's label
 * @param {string} currentName the current conversation's label
 * @param {string} gradient
 * @returns {import('../types.d.ts').Slide | null}
 */
export function versusSlide(versus, pinnedName, currentName, gradient) {
    if (!versus) return null;

    const row = (label, d, unit = '') => {
        if (!d) return '';
        const pct = d.pct;
        const arrow = pct == null ? '' : pct > 0 ? '▲' : pct < 0 ? '▼' : '=';
        const color = pct == null ? 'var(--text-muted)' : pct > 0 ? 'var(--accent-green)' : 'var(--accent-pink)';
        const pctText = pct == null ? '' : `<span style="color:${color};font-weight:600;">${arrow} ${Math.abs(pct)}%</span>`;
        return `<tr><td>${label}</td><td>${fmt(d.previous)}${unit}</td><td>${fmt(d.current)}${unit}</td><td>${pctText}</td></tr>`;
    };

    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.versus.tag')}</span>
                <h2 class="slide-title">${t('slide.versus.title')}</h2>
                <p class="slide-subtitle">${t('slide.versus.subtitle')}</p>
                <table class="compare-table">
                    <thead><tr>
                        <th></th>
                        <th>${escapeHtml(pinnedName)}</th>
                        <th>${escapeHtml(currentName)}</th>
                        <th>${t('slide.comparison.change')}</th>
                    </tr></thead>
                    <tbody>
                        ${row(t('slide.comparison.messages'), versus.messages)}
                        ${row(t('slide.comparison.perDay'), versus.avgPerDay)}
                        ${row(t('slide.comparison.emojis'), versus.emojis)}
                        ${row(t('slide.comparison.media'), versus.media)}
                        ${row(t('slide.comparison.avgLen'), versus.avgMsgLen, ` ${t('units.chars')}`)}
                        ${row(t('slide.comparison.streak'), versus.streak, ` ${t('units.days')}`)}
                    </tbody>
                </table>
            </div>
        `,
    };
}
