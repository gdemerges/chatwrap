import { escapeHtml } from '../utils.js';
import { fmt, fmtDate, stripTags } from '../format.js';
import { t } from '../i18n.js';

export function overviewSlide(stats, gradient) {
    const range = t('slide.overview.range', { from: fmtDate(stats.startDate), to: fmtDate(stats.endDate) });
    return {
        gradient,
        card: {
            gradient,
            tag: t('slide.overview.tag'),
            big: { value: fmt(stats.totalMessages), label: t('slide.overview.big') },
            subtitle: range,
            grid: [
                [stats.participants, t('units.participants')],
                [stats.totalDays, t('units.days')],
                [stats.avgPerDay, t('units.perDay')],
                [fmt(stats.totalChars), t('units.chars')],
            ],
        },
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.overview.tag')}</span>
                <div class="big-number">${fmt(stats.totalMessages)}</div>
                <div class="big-label">${t('slide.overview.big')}</div>
                <p class="slide-subtitle">${range}</p>
                <div class="stat-grid">
                    <div class="stat-card"><div class="stat-value">${stats.participants}</div><div class="stat-label">${t('units.participants')}</div></div>
                    <div class="stat-card"><div class="stat-value">${stats.totalDays}</div><div class="stat-label">${t('units.days')}</div></div>
                    <div class="stat-card"><div class="stat-value">${stats.avgPerDay}</div><div class="stat-label">${t('units.perDay')}</div></div>
                    <div class="stat-card"><div class="stat-value">${fmt(stats.totalChars)}</div><div class="stat-label">${t('units.chars')}</div></div>
                </div>
            </div>
        `,
    };
}

export function comparisonSlide(comparison, gradient) {
    if (!comparison) return null;
    const row = (label, d, unit = '') => {
        const pct = d.pct;
        const arrow = pct == null ? '' : pct > 0 ? '▲' : pct < 0 ? '▼' : '=';
        const color = pct == null ? 'var(--text-muted)' : pct > 0 ? 'var(--accent-green)' : 'var(--accent-pink)';
        const pctText = pct == null ? '' : `<span data-css="color:${color};font-weight:600;">${arrow} ${Math.abs(pct)}%</span>`;
        return `<tr><td>${label}</td><td>${fmt(d.previous)}${unit}</td><td>${fmt(d.current)}${unit}</td><td>${pctText}</td></tr>`;
    };
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.comparison.tag')}</span>
                <h2 class="slide-title">${t('slide.comparison.title')}</h2>
                <table class="compare-table">
                    <thead><tr><th></th><th>${t('slide.comparison.before')}</th><th>${t('slide.comparison.now')}</th><th>${t('slide.comparison.change')}</th></tr></thead>
                    <tbody>
                        ${row(t('slide.comparison.messages'), comparison.messages)}
                        ${row(t('slide.comparison.perDay'), comparison.avgPerDay)}
                        ${row(t('slide.comparison.emojis'), comparison.emojis)}
                        ${row(t('slide.comparison.media'), comparison.media)}
                        ${comparison.avgMsgLen ? row(t('slide.comparison.avgLen'), comparison.avgMsgLen, ` ${t('units.chars')}`) : ''}
                        ${comparison.streak ? row(t('slide.comparison.streak'), comparison.streak, ` ${t('units.days')}`) : ''}
                    </tbody>
                </table>
            </div>
        `,
    };
}

export function wordsTrendSlide(comparison, gradient) {
    if (!comparison) return null;
    const appeared = comparison.appeared || [];
    const disappeared = comparison.disappeared || [];
    if (appeared.length === 0 && disappeared.length === 0) return null;
    const tag = (w, c, color) =>
        `<span class="word-tag" data-css="background:${color}33;color:${color};">${escapeHtml(w)} <small>${c}</small></span>`;
    const newCloud = appeared.map(([w, c]) => tag(w, c, '#10B981')).join('');
    const oldCloud = disappeared.map(([w, c]) => tag(w, c, '#EC4899')).join('');
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.wordsTrend.tag')}</span>
                <h2 class="slide-title">${t('slide.wordsTrend.title')}</h2>
                ${appeared.length ? `<p data-css="color:var(--text-muted);font-size:0.85rem;margin-top:1rem;">${t('slide.wordsTrend.appeared')}</p><div class="words-cloud">${newCloud}</div>` : ''}
                ${disappeared.length ? `<p data-css="color:var(--text-muted);font-size:0.85rem;margin-top:1rem;">${t('slide.wordsTrend.disappeared')}</p><div class="words-cloud">${oldCloud}</div>` : ''}
            </div>
        `,
    };
}

export function recapSlide(stats, gradient) {
    const leader = stats.ranking[0];
    const dominant = leader
        ? t('slide.recap.dominant', { name: escapeHtml(leader[0]), pct: leader[1].percent })
        : '';
    return {
        gradient,
        card: {
            gradient,
            tag: t('slide.recap.tag'),
            title: t('slide.recap.title'),
            grid: [
                [fmt(stats.totalMessages), t('units.messages')],
                [stats.participants, t('units.participants')],
                [stats.totalDays, t('units.days')],
                [fmt(stats.emojis.total), t('units.emojis')],
                [fmt(stats.totalMedia), t('units.media')],
                [t('format.days', { n: stats.streak.max }), t('units.bestStreak')],
            ],
            lines: leader
                ? [stripTags(t('slide.recap.dominant', { name: leader[0], pct: leader[1].percent }))]
                : [],
        },
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.recap.tag')}</span>
                <h2 class="slide-title">${t('slide.recap.title')}</h2>
                <div class="stat-grid">
                    <div class="stat-card"><div class="stat-value">${fmt(stats.totalMessages)}</div><div class="stat-label">${t('units.messages')}</div></div>
                    <div class="stat-card"><div class="stat-value">${stats.participants}</div><div class="stat-label">${t('units.participants')}</div></div>
                    <div class="stat-card"><div class="stat-value">${stats.totalDays}</div><div class="stat-label">${t('units.days')}</div></div>
                    <div class="stat-card"><div class="stat-value">${fmt(stats.emojis.total)}</div><div class="stat-label">${t('units.emojis')}</div></div>
                    <div class="stat-card"><div class="stat-value">${fmt(stats.totalMedia)}</div><div class="stat-label">${t('units.media')}</div></div>
                    <div class="stat-card"><div class="stat-value">${t('format.days', { n: stats.streak.max })}</div><div class="stat-label">${t('units.bestStreak')}</div></div>
                </div>
                <p class="slide-subtitle" data-css="margin-top:1.5rem;">${dominant}</p>
                <div class="recap-actions"></div>
            </div>
        `,
    };
}
