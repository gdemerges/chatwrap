import { escapeHtml } from '../utils.js';
import { monthShort } from '../format.js';
import { CHART_COLORS } from './_constants.js';

export function rankingBars(items, valueFn, labelFn, max) {
    return items.map(([name, data], i) => {
        const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
        const w = ((valueFn([name, data]) / max) * 100).toFixed(1);
        const color = CHART_COLORS[i % CHART_COLORS.length];
        return `
            <div class="ranking-item">
                <div class="ranking-pos ${posClass}">${i + 1}</div>
                <div class="ranking-bar-wrapper">
                    <div class="ranking-bar-label"><span class="name">${escapeHtml(name)}</span><span class="value">${labelFn([name, data])}</span></div>
                    <div class="ranking-bar"><div class="ranking-bar-fill" data-css="--bar-width: ${w}%; background: ${color};"></div></div>
                </div>
            </div>`;
    }).join('');
}

export function monthLabels(monthKeys) {
    return monthKeys.map(monthShort);
}
