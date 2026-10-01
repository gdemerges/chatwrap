import { dayNames, fmtHour, peakDayName } from '../format.js';
import { t } from '../i18n.js';
import { CHART_COLORS } from './_constants.js';
import { monthLabels } from './_helpers.js';
import { makeChart } from './_charts.js';

export function monthlySlide(stats, gradient) {
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.monthly.tag')}</span>
                <h2 class="slide-title">${t('slide.monthly.title')}</h2>
                <div class="chart-wrapper"><canvas id="chart-monthly" height="250"></canvas></div>
            </div>
        `,
        chart: (ctx) => {
            const months = Object.keys(stats.monthly).sort();
            const values = months.map(k => stats.monthly[k]);
            makeChart(ctx, {
                type: 'bar',
                data: { labels: monthLabels(months), datasets: [{ data: values, backgroundColor: values.map((_, i) => `hsl(${260 + (i / Math.max(values.length - 1, 1)) * 100}, 70%, 60%)`), borderRadius: 4 }] },
                options: {
                    responsive: true, plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: 'var(--text-secondary)', maxRotation: 45, font: { size: 10 } }, grid: { display: false } },
                        y: { ticks: { color: 'var(--text-secondary)' }, grid: { color: 'var(--grid-line)' } },
                    },
                },
            });
        },
    };
}

export function heatmapSlide(stats, gradient) {
    const days = dayNames();
    const maxHeat = Math.max(...stats.heatmap.flat());
    const heatCells = [];
    heatCells.push('<div class="heatmap-label"></div>');
    for (let h = 0; h < 24; h++) heatCells.push(`<div class="heatmap-label hour-label">${fmtHour(h)}</div>`);
    for (let d = 0; d < 7; d++) {
        heatCells.push(`<div class="heatmap-label">${days[d]}</div>`);
        for (let h = 0; h < 24; h++) {
            const val = stats.heatmap[d][h];
            const intensity = maxHeat > 0 ? val / maxHeat : 0;
            const alpha = 0.1 + intensity * 0.9;
            const hue = 280 - intensity * 100;
            // An empty hour is a theme token: a literal white tint vanished on the
            // light gradients, and the CSS that patched it matched the attribute
            // text, which the CSSOM rewrites.
            const color = val === 0 ? 'var(--heat-empty)' : `hsla(${hue}, 70%, 55%, ${alpha})`;
            const tip = t('slide.heatmap.cell', { day: days[d], hour: fmtHour(h), n: val });
            heatCells.push(`<div class="heatmap-cell" data-css="background:${color}" data-tooltip="${tip}"></div>`);
        }
    }
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.heatmap.tag')}</span>
                <h2 class="slide-title">${t('slide.heatmap.title')}</h2>
                <p class="slide-subtitle">${t('slide.heatmap.subtitle', { hour: fmtHour(stats.peakHour), day: peakDayName(stats) })}</p>
                <div class="heatmap-container"><div class="heatmap-grid">${heatCells.join('')}</div></div>
            </div>
        `,
    };
}

export function hourlyWeekdaySlide(stats, gradient) {
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.clock.tag')}</span>
                <h2 class="slide-title">${t('slide.clock.title')}</h2>
                <div class="chart-wrapper"><canvas id="chart-hourly" height="200"></canvas></div>
                <div class="chart-wrapper" data-css="margin-top:1rem;"><canvas id="chart-weekday" height="160"></canvas></div>
            </div>
        `,
        chart: (_, slide) => {
            const hourlyCtx = slide.querySelector('#chart-hourly');
            makeChart(hourlyCtx, {
                type: 'bar',
                data: {
                    labels: Array.from({ length: 24 }, (_, i) => fmtHour(i)),
                    datasets: [{
                        data: stats.hourly,
                        backgroundColor: stats.hourly.map((_, i) => {
                            const h = (i < 6 || i > 21) ? 260 : (i < 12 ? 45 : 180);
                            return `hsla(${h}, 70%, 55%, 0.8)`;
                        }),
                        borderRadius: 3,
                    }],
                },
                options: {
                    responsive: true, plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: 'var(--text-muted)', font: { size: 9 } }, grid: { display: false } },
                        y: { ticks: { color: 'var(--text-muted)' }, grid: { color: 'var(--grid-line)' } },
                    },
                },
            });
            const weekdayCtx = slide.querySelector('#chart-weekday');
            makeChart(weekdayCtx, {
                type: 'bar',
                data: { labels: dayNames(), datasets: [{ data: stats.weekday, backgroundColor: CHART_COLORS.slice(0, 7), borderRadius: 4 }] },
                options: {
                    responsive: true, indexAxis: 'y', plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: 'var(--text-muted)' }, grid: { color: 'var(--grid-line)' } },
                        y: { ticks: { color: 'var(--text-secondary)', font: { size: 11 } }, grid: { display: false } },
                    },
                },
            });
        },
    };
}
