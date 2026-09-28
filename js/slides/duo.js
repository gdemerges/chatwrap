import { escapeHtml } from '../utils.js';
import { fmt, fmtTime } from '../format.js';
import { t } from '../i18n.js';
import { CHART_COLORS } from './_constants.js';

function signatureWord(stats, author) {
    const list = stats.uniqueWordsPerPerson?.[author];
    return list && list[0] ? list[0] : null;
}

/**
 * Duo board: side-by-side comparison for 2-person conversations.
 */
export function duoBoardSlide(stats, gradient) {
    if (stats.participants !== 2 || stats.ranking.length !== 2) return null;
    const [a, b] = stats.ranking;
    const [nameA, pA] = a;
    const [nameB, pB] = b;

    const colorA = CHART_COLORS[0];
    const colorB = CHART_COLORS[1];

    const sigA = signatureWord(stats, nameA);
    const sigB = signatureWord(stats, nameB);

    const cell = (value, label) => `<div class="duo-cell"><div class="duo-value">${value}</div><div class="duo-label">${label}</div></div>`;

    const winnerArrow = (av, bv, higherIsBetter = true) => {
        if (av === bv) return '=';
        const aWins = higherIsBetter ? av > bv : av < bv;
        return aWins ? '◀' : '▶';
    };

    const rtA = pA.avgResponseMin;
    const rtB = pB.avgResponseMin;

    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.duo.tag')}</span>
                <h2 class="slide-title">${t('slide.duo.title')}</h2>
                <div class="duo-board">
                    <div class="duo-col" data-css="border-color:${colorA};">
                        <h3 data-css="color:${colorA};">${escapeHtml(nameA)}</h3>
                        ${cell(fmt(pA.count), t('units.messages'))}
                        ${cell(`${pA.percent}%`, t('units.share'))}
                        ${cell(`${pA.avgLen}`, t('units.charsPerMsg'))}
                        ${cell(rtA != null ? fmtTime(rtA) : t('common.none'), t('slide.duo.responseTime'))}
                        ${cell(fmt(pA.emojis), t('units.emojis'))}
                        ${cell(fmt(pA.media), t('units.media'))}
                        ${sigA ? cell(escapeHtml(sigA[0]), t('slide.duo.signature')) : ''}
                    </div>
                    <div class="duo-vs">
                        <div class="duo-arrow">${winnerArrow(pA.count, pB.count)}</div>
                        <div class="duo-arrow">${winnerArrow(+pA.percent, +pB.percent)}</div>
                        <div class="duo-arrow">${winnerArrow(pA.avgLen, pB.avgLen)}</div>
                        <div class="duo-arrow">${rtA != null && rtB != null ? winnerArrow(rtA, rtB, false) : t('common.none')}</div>
                        <div class="duo-arrow">${winnerArrow(pA.emojis, pB.emojis)}</div>
                        <div class="duo-arrow">${winnerArrow(pA.media, pB.media)}</div>
                        ${sigA || sigB ? `<div class="duo-arrow">${t('common.none')}</div>` : ''}
                    </div>
                    <div class="duo-col" data-css="border-color:${colorB};">
                        <h3 data-css="color:${colorB};">${escapeHtml(nameB)}</h3>
                        ${cell(fmt(pB.count), t('units.messages'))}
                        ${cell(`${pB.percent}%`, t('units.share'))}
                        ${cell(`${pB.avgLen}`, t('units.charsPerMsg'))}
                        ${cell(rtB != null ? fmtTime(rtB) : t('common.none'), t('slide.duo.responseTime'))}
                        ${cell(fmt(pB.emojis), t('units.emojis'))}
                        ${cell(fmt(pB.media), t('units.media'))}
                        ${sigB ? cell(escapeHtml(sigB[0]), t('slide.duo.signature')) : ''}
                    </div>
                </div>
            </div>
        `,
    };
}

/**
 * Side-by-side signature vocabulary for 2 persons.
 */
export function duoWordsSlide(stats, gradient) {
    if (stats.participants !== 2 || stats.ranking.length !== 2) return null;
    const [nameA] = stats.ranking[0];
    const [nameB] = stats.ranking[1];

    const wordsA = stats.uniqueWordsPerPerson?.[nameA] || [];
    const wordsB = stats.uniqueWordsPerPerson?.[nameB] || [];
    if (wordsA.length === 0 && wordsB.length === 0) return null;

    const colorA = CHART_COLORS[0];
    const colorB = CHART_COLORS[1];
    const tag = (w, c, color) =>
        `<span class="word-tag" data-css="background:${color}33;color:${color};">${escapeHtml(w)} <small>${c}</small></span>`;
    const cloudA = wordsA.slice(0, 10).map(([w, c]) => tag(w, c, colorA)).join('');
    const cloudB = wordsB.slice(0, 10).map(([w, c]) => tag(w, c, colorB)).join('');

    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.duo.wordsTag')}</span>
                <h2 class="slide-title">${t('slide.duo.wordsTitle')}</h2>
                <p class="slide-subtitle">${t('slide.duo.wordsSubtitle')}</p>
                <div class="duo-words">
                    <div class="duo-words-col">
                        <h4 data-css="color:${colorA};">${escapeHtml(nameA)}</h4>
                        <div class="words-cloud">${cloudA || `<em data-css="opacity:0.5;">${t('slide.duo.noWords')}</em>`}</div>
                    </div>
                    <div class="duo-words-col">
                        <h4 data-css="color:${colorB};">${escapeHtml(nameB)}</h4>
                        <div class="words-cloud">${cloudB || `<em data-css="opacity:0.5;">${t('slide.duo.noWords')}</em>`}</div>
                    </div>
                </div>
            </div>
        `,
    };
}
