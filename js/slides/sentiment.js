import { escapeHtml } from '../utils.js';
import { fmtDayMonth, fmtHour } from '../format.js';
import { t } from '../i18n.js';
import { CHART_COLORS } from './_constants.js';
import { monthLabels } from './_helpers.js';
import { makeChart } from './_charts.js';
import { dayWhy } from './_day-why.js';

export function ambianceSlide(stats, gradient) {
    const st = stats.sentiment;
    if (!st || st.perPerson.length === 0) return null;
    const items = [];
    const fact = (icon, text) =>
        items.push(`<div class="fun-fact"><div class="fun-fact-icon">${icon}</div><div class="fun-fact-text">${text}</div></div>`);

    if (st.sweetest?.compliment > 0)
        fact('🌸', t('slide.mood.sweetest', { name: escapeHtml(st.sweetest.author), n: st.sweetest.compliment }));
    if (st.sharpest?.insult > 0)
        fact('🌶️', t('slide.mood.sharpest', { name: escapeHtml(st.sharpest.author), n: st.sharpest.insult }));
    if (st.mostPositive)
        fact('☀️', t('slide.mood.mostPositive', { name: escapeHtml(st.mostPositive.author) }));
    if (st.mostNegative && st.mostNegative !== st.mostPositive)
        fact('🌧️', t('slide.mood.mostNegative', { name: escapeHtml(st.mostNegative.author) }));
    if (st.mostVolatile && st.mostVolatile !== st.mostStable)
        fact('🎢', t('slide.mood.mostVolatile', { name: escapeHtml(st.mostVolatile.author) }));
    if (st.mostStable && st.perPerson.length > 1)
        fact('🧘', t('slide.mood.mostStable', { name: escapeHtml(st.mostStable.author) }));
    if (!st.mlEnabled)
        fact('ℹ️', t('slide.mood.noML'));
    if (items.length === 0) return null;
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.mood.tag')}</span>
                <h2 class="slide-title">${t('slide.mood.title')}</h2>
                <div class="fun-facts">${items.join('')}</div>
            </div>
        `,
    };
}

export function sentimentTimelineSlide(stats, gradient) {
    const st = stats.sentiment;
    if (!st || !st.mlEnabled) return null;
    const months = Object.keys(st.monthly || {}).sort();
    const authors = st.perPerson.filter(p => p.sampled > 0).map(p => p.author);
    if (months.length < 3) return null;
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.timeline.tag')}</span>
                <h2 class="slide-title">${t('slide.timeline.title')}</h2>
                <div class="chart-wrapper"><canvas id="chart-sent-timeline" height="280"></canvas></div>
            </div>
        `,
        chart: (_, slide) => {
            const canvas = slide.querySelector('#chart-sent-timeline');
            const labels = monthLabels(months);
            const datasets = [];
            datasets.push({
                label: t('slide.timeline.average'),
                data: months.map(m => {
                    const v = st.monthly[m];
                    return v != null ? Math.round(v * 100) : null;
                }),
                borderColor: 'rgba(255,255,255,0.6)',
                borderWidth: 2,
                borderDash: [5, 3],
                pointRadius: 2,
                tension: 0.3,
                fill: false,
                spanGaps: true,
            });
            authors.forEach((author, idx) => {
                const color = CHART_COLORS[idx % CHART_COLORS.length];
                datasets.push({
                    label: author,
                    data: months.map(m => {
                        const v = st.monthlyPerPerson[author]?.[m];
                        return v != null ? Math.round(v * 100) : null;
                    }),
                    borderColor: color,
                    backgroundColor: color + '22',
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.3,
                    fill: false,
                    spanGaps: true,
                });
            });
            makeChart(canvas.getContext('2d'), {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            display: authors.length <= 5,
                            position: 'bottom',
                            labels: { color: 'var(--text-secondary)', padding: 8, font: { size: 9 }, boxWidth: 10 },
                        },
                    },
                    scales: {
                        x: { ticks: { color: 'var(--text-muted)', font: { size: 9 }, maxRotation: 45 }, grid: { display: false } },
                        y: {
                            ticks: { color: 'var(--text-muted)', callback: v => `${v > 0 ? '+' : ''}${v}%` },
                            grid: { color: 'var(--grid-line)' },
                        },
                    },
                },
            });
        },
    };
}

export function moodHourlySlide(stats, gradient) {
    const st = stats.sentiment;
    if (!st || !st.mlEnabled) return null;
    const sentHourly = st.sentimentHourly ?? [];
    const validHours = sentHourly.map((v, h) => ({ h, v })).filter(x => x.v != null);
    if (validHours.length < 8) return null;
    const bestHour  = [...validHours].sort((a, b) => b.v - a.v)[0];
    const worstHour = [...validHours].sort((a, b) => a.v - b.v)[0];
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.moodClock.tag')}</span>
                <h2 class="slide-title">${t('slide.moodClock.title')}</h2>
                <div class="chart-wrapper"><canvas id="chart-sent-hourly" height="200"></canvas></div>
                <div class="fun-facts" style="margin-top:0.75rem;">
                    ${bestHour  ? `<div class="fun-fact"><div class="fun-fact-icon">🌞</div><div class="fun-fact-text">${t('slide.moodClock.best', { hour: fmtHour(bestHour.h) })}</div></div>` : ''}
                    ${worstHour ? `<div class="fun-fact"><div class="fun-fact-icon">😴</div><div class="fun-fact-text">${t('slide.moodClock.worst', { hour: fmtHour(worstHour.h) })}</div></div>` : ''}
                </div>
            </div>
        `,
        chart: (_, slide) => {
            const canvas = slide.querySelector('#chart-sent-hourly');
            const labels = Array.from({ length: 24 }, (_, h) => fmtHour(h));
            const data   = sentHourly.map(v => v != null ? Math.round(v * 100) : null);
            const bgColors = data.map(v => {
                if (v == null) return 'transparent';
                const alpha = 0.3 + Math.min(0.7, Math.abs(v) / 80);
                return v >= 0 ? `rgba(16,185,129,${alpha})` : `rgba(239,68,68,${alpha})`;
            });
            makeChart(canvas.getContext('2d'), {
                type: 'bar',
                data: { labels, datasets: [{ data, backgroundColor: bgColors, borderRadius: 3 }] },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: 'var(--text-muted)', font: { size: 9 } }, grid: { display: false } },
                        y: { ticks: { color: 'var(--text-muted)', callback: v => `${v > 0 ? '+' : ''}${v}%` }, grid: { color: 'var(--grid-line)' } },
                    },
                },
            });
        },
    };
}

export function momentsSlide(stats, gradient) {
    const st = stats.sentiment;
    if (!st || !st.mlEnabled) return null;
    const best  = (st.bestDays || []).slice(0, 3);
    const worst = (st.worstDays || []).filter(d => !best.some(b => b.date === d.date)).slice(0, 2);
    if (best.length === 0 && worst.length === 0) return null;

    const moodIcon  = v => v > 0.5 ? '🌟' : v > 0.15 ? '☀️' : v < -0.5 ? '⛈️' : '🌧️';
    const moodLabel = v => t(v > 0.5 ? 'slide.moments.great'
        : v > 0.15 ? 'slide.moments.good'
        : v < -0.5 ? 'slide.moments.hard'
        : 'slide.moments.tense');

    /** A day, and — where the context allows — why it turned out that way. */
    const day = (d, tone) => {
        const why = dayWhy(d, tone);
        return `<div class="fun-fact">
            <div class="fun-fact-icon">${moodIcon(d.mean)}</div>
            <div class="fun-fact-text">
                <strong>${fmtDayMonth(d.date)}</strong> — ${moodLabel(d.mean)}
                ${why.length > 0 ? `<ul class="day-why">${why.map(w => `<li>${w}</li>`).join('')}</ul>` : ''}
            </div>
        </div>`;
    };

    const bestItems  = best.map(d => day(d, 'best')).join('');
    const worstItems = worst.map(d => day(d, 'worst')).join('');
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.moments.tag')}</span>
                <h2 class="slide-title">${t('slide.moments.title')}</h2>
                <p class="slide-subtitle">${t('slide.moments.subtitle')}</p>
                ${bestItems  ? `<p class="day-group">${t('slide.moments.bestTitle')}</p>${bestItems}` : ''}
                ${worstItems ? `<p class="day-group">${t('slide.moments.worstTitle')}</p>${worstItems}` : ''}
            </div>
        `,
    };
}

export function influenceSlide(stats, gradient) {
    const st = stats.sentiment;
    if (!st || !st.mlEnabled) return null;
    const after = Object.entries(st.afterAuthor || {})
        .sort((a, b) => Math.abs(b[1].mean) - Math.abs(a[1].mean))
        .slice(0, 6);
    if (after.length < 2) return null;
    const items = after.map(([author, { mean }]) => {
        const pct  = Math.round(mean * 100);
        const icon = pct > 10 ? '🌟' : pct > 0 ? '☀️' : pct < -10 ? '⛈️' : '🌧️';
        const desc = pct >= 0
            ? t('slide.influence.positive', { pct })
            : t('slide.influence.negative', { pct });
        return `<div class="fun-fact"><div class="fun-fact-icon">${icon}</div><div class="fun-fact-text"><strong>${escapeHtml(author)}</strong> : ${desc}</div></div>`;
    }).join('');
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.influence.tag')}</span>
                <h2 class="slide-title">${t('slide.influence.title')}</h2>
                <div class="fun-facts">${items}</div>
            </div>
        `,
    };
}
