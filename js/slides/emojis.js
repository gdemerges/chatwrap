import { escapeHtml } from '../utils.js';
import { fmt } from '../format.js';
import { t } from '../i18n.js';
import { CHART_COLORS } from './_constants.js';
import { barsFrom } from './_card.js';

export function emojiSlide(stats, gradient) {
    const items = stats.emojis.top.slice(0, 12).map(([emoji, count]) =>
        `<div class="emoji-item"><span class="emoji">${escapeHtml(emoji)}</span><span class="emoji-count">${fmt(count)}</span></div>`
    ).join('');
    return {
        gradient,
        card: {
            gradient,
            tag: t('slide.emojis.tag'),
            big: { value: fmt(stats.emojis.total), label: t('slide.emojis.big') },
            subtitle: t('slide.emojis.unique', { n: stats.emojis.unique }),
            emojis: stats.emojis.top.slice(0, 10),
        },
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.emojis.tag')}</span>
                <div class="big-number">${fmt(stats.emojis.total)}</div>
                <div class="big-label">${t('slide.emojis.big')}</div>
                <p class="slide-subtitle">${t('slide.emojis.unique', { n: stats.emojis.unique })}</p>
                <div class="emoji-grid">${items}</div>
            </div>
        `,
    };
}

export function reactionsSlide(stats, gradient) {
    if (!stats.reactions || stats.reactions.total === 0) return null;
    const top = stats.reactions.topEmojis.map(([e, n]) =>
        `<div class="emoji-item"><span class="emoji">${escapeHtml(e)}</span><span class="emoji-count">${fmt(n)}</span></div>`
    ).join('');
    const reacters = stats.reactions.perAuthor.slice(0, 5).map(([name, n]) =>
        `<li>${t('slide.reactions.perAuthor', { name: `<strong>${escapeHtml(name)}</strong>`, n: fmt(n) })}</li>`
    ).join('');
    return {
        gradient,
        card: {
            gradient,
            tag: t('slide.reactions.tag'),
            big: { value: fmt(stats.reactions.total), label: t('slide.reactions.big') },
            emojis: stats.reactions.topEmojis.slice(0, 10),
        },
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.reactions.tag')}</span>
                <div class="big-number">${fmt(stats.reactions.total)}</div>
                <div class="big-label">${t('slide.reactions.big')}</div>
                <div class="emoji-grid">${top}</div>
                <ul class="plain-list">${reacters}</ul>
            </div>
        `,
    };
}

export function emojisPerPersonSlide(stats, gradient) {
    if (!stats.emojis.perPerson.length) return null;
    const maxE = stats.emojis.perPerson[0][1] || 1;
    const rows = stats.emojis.perPerson.map(([name, count], i) => {
        const msgCount = stats.perPerson[name]?.count || 1;
        const ratio = (count / msgCount).toFixed(2);
        const w = ((count / maxE) * 100).toFixed(1);
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
        return `
            <div class="ranking-item">
                <div class="ranking-pos ${posClass}">${i + 1}</div>
                <div class="ranking-bar-wrapper">
                    <div class="ranking-bar-label"><span class="name">${escapeHtml(name)}</span><span class="value">${t('slide.emojis.perMsg', { n: fmt(count), ratio })}</span></div>
                    <div class="ranking-bar"><div class="ranking-bar-fill" data-css="--bar-width: ${w}%; background: ${color};"></div></div>
                </div>
            </div>`;
    }).join('');
    return {
        gradient,
        card: {
            gradient,
            tag: t('slide.emojis.tag'),
            title: t('slide.emojis.fansTitle'),
            bars: barsFrom(stats.emojis.perPerson, e => e[1], e => fmt(e[1])),
        },
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.emojis.tag')}</span>
                <h2 class="slide-title">${t('slide.emojis.fansTitle')}</h2>
                <div class="ranking-list">${rows}</div>
            </div>
        `,
    };
}
