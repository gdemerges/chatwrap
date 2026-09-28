import { fmt, monthLong } from '../format.js';
import { t } from '../i18n.js';

const INTENSITY = {
    high:   { key: 'high',   icon: '🔥', color: 'var(--accent-orange)' },
    steady: { key: 'steady', icon: '🌊', color: 'var(--accent-blue)' },
    low:    { key: 'low',    icon: '🌙', color: 'var(--accent-purple)' },
};

function rangeLabel(from, to) {
    return from === to ? monthLong(from) : `${monthLong(from)} → ${monthLong(to)}`;
}

/**
 * The conversation told as a sequence of chapters — the phases where its
 * rhythm durably changed. Gives 28 slides of raw figures a narrative spine.
 */
export function chaptersSlide(stats, gradient) {
    const chapters = stats.chapters || [];
    if (chapters.length < 2) return null;

    const maxAvg = Math.max(...chapters.map(c => c.avgPerMonth), 1);

    const items = chapters.map((c, i) => {
        const meta = INTENSITY[c.intensity] || INTENSITY.steady;
        const height = Math.max(8, (c.avgPerMonth / maxAvg) * 100);
        return `
            <li class="chapter-item" data-css="--chapter-color:${meta.color};">
                <div class="chapter-spine" aria-hidden="true">
                    <span class="chapter-dot">${meta.icon}</span>
                    <span class="chapter-bar" data-css="height:${height.toFixed(0)}%;"></span>
                </div>
                <div class="chapter-body">
                    <span class="chapter-index">${t('slide.chapters.index', { n: i + 1 })}</span>
                    <h3 class="chapter-title">${t(`slide.chapters.${meta.key}`)}</h3>
                    <p class="chapter-range">${rangeLabel(c.from, c.to)}</p>
                    <p class="chapter-figures">${t('slide.chapters.figures', { total: fmt(c.total), avg: fmt(c.avgPerMonth) })}</p>
                </div>
            </li>`;
    }).join('');

    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.chapters.tag')}</span>
                <h2 class="slide-title">${t('slide.chapters.title', { n: chapters.length })}</h2>
                <p class="slide-subtitle">${t('slide.chapters.subtitle')}</p>
                <ol class="chapter-list">${items}</ol>
            </div>
        `,
    };
}
