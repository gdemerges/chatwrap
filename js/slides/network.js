import { escapeHtml } from '../utils.js';
import { fmt } from '../format.js';
import { t } from '../i18n.js';
import { CHART_COLORS } from './_constants.js';

const SIZE = 420;
const CENTER = SIZE / 2;
const RADIUS = SIZE * 0.36;
const MAX_NODES = 10;

/**
 * Who actually talks to whom, as a chord diagram.
 *
 * The group counterpart of the two-person `compatibilitySlide`. Drawn as
 * inline SVG — no chart library involved.
 */
export function interactionsSlide(stats, gradient) {
    const pairs = stats.interactions?.pairs || [];
    if (stats.participants < 3 || pairs.length < 2) return null;

    const people = stats.ranking.slice(0, MAX_NODES).map(([name]) => name);
    const index = new Map(people.map((n, i) => [n, i]));
    const visible = pairs.filter(p => index.has(p.a) && index.has(p.b));
    if (visible.length < 2) return null;

    const maxCount = visible[0].count || 1;
    const maxMessages = stats.ranking[0][1].count || 1;

    const pos = people.map((_, i) => {
        // Start at 12 o'clock so the most active person sits at the top.
        const angle = (i / people.length) * Math.PI * 2 - Math.PI / 2;
        return { x: CENTER + Math.cos(angle) * RADIUS, y: CENTER + Math.sin(angle) * RADIUS, angle };
    });

    const chords = visible.map((p) => {
        const a = pos[index.get(p.a)];
        const b = pos[index.get(p.b)];
        const weight = p.count / maxCount;
        const color = CHART_COLORS[index.get(p.a) % CHART_COLORS.length];
        // Pull the control point toward the centre so heavy pairs bow less —
        // strong ties read as short, direct links.
        const pull = 0.15 + (1 - weight) * 0.5;
        const cx = CENTER + ((a.x + b.x) / 2 - CENTER) * pull;
        const cy = CENTER + ((a.y + b.y) / 2 - CENTER) * pull;
        return `<path d="M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}"
                     fill="none" stroke="${color}" stroke-width="${(1 + weight * 9).toFixed(1)}"
                     stroke-linecap="round" opacity="${(0.2 + weight * 0.6).toFixed(2)}"></path>`;
    }).join('');

    const nodes = people.map((name, i) => {
        const { x, y, angle } = pos[i];
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const r = 6 + (stats.perPerson[name].count / maxMessages) * 14;
        const lx = CENTER + Math.cos(angle) * (RADIUS + r + 12);
        const ly = CENTER + Math.sin(angle) * (RADIUS + r + 12);
        const anchor = Math.abs(Math.cos(angle)) < 0.25 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end');
        return `
            <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}"></circle>
            <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle"
                  fill="currentColor" font-size="13" font-weight="600">${escapeHtml(truncate(name))}</text>`;
    }).join('');

    const top = visible.slice(0, 3).map(p =>
        `<li>${t('slide.network.pair', { a: escapeHtml(p.a), b: escapeHtml(p.b), n: fmt(p.count) })}</li>`
    ).join('');

    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.network.tag')}</span>
                <h2 class="slide-title">${t('slide.network.title')}</h2>
                <p class="slide-subtitle">${t('slide.network.subtitle')}</p>
                <div class="network-wrap">
                    <svg viewBox="0 0 ${SIZE} ${SIZE}" class="network-svg" role="img"
                         aria-label="${t('slide.network.svgLabel')}">
                        <g class="network-chords">${chords}</g>
                        <g class="network-nodes">${nodes}</g>
                    </svg>
                </div>
                <ul class="plain-list">${top}</ul>
            </div>
        `,
    };
}

function truncate(name, max = 14) {
    return name.length > max ? name.slice(0, max - 1) + '…' : name;
}
