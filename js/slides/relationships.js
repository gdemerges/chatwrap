import { escapeHtml } from '../utils.js';
import { fmt, fmtTime, fmtDate } from '../format.js';
import { t } from '../i18n.js';

export function ghostingSlide(stats, gradient) {
    if (!stats.ghosting || stats.ghosting.count === 0) return null;
    const longest = stats.ghosting.longest.slice(0, 3).map(g => `<li>${t('slide.ghosting.longest', {
        silenced: escapeHtml(g.silenced),
        revived: escapeHtml(g.revived),
        days: (g.minutes / 1440).toFixed(1),
    })}</li>`).join('');
    const revivers = stats.ghosting.revivers.slice(0, 3).map(([name, c]) =>
        `<li>${t('slide.ghosting.reviver', { name: escapeHtml(name), n: c })}</li>`
    ).join('');
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.ghosting.tag')}</span>
                <h2 class="slide-title">${t('slide.ghosting.title', { n: stats.ghosting.count })}</h2>
                <p class="slide-subtitle">${t('slide.ghosting.subtitle')}</p>
                <h4 data-css="margin-top:1.5rem;opacity:0.8;">${t('slide.ghosting.longestTitle')}</h4>
                <ul class="plain-list">${longest}</ul>
                <h4 data-css="margin-top:1.5rem;opacity:0.8;">${t('slide.ghosting.reviversTitle')}</h4>
                <ul class="plain-list">${revivers}</ul>
            </div>
        `,
    };
}

export function compatibilitySlide(stats, gradient) {
    if (!stats.compatibility) return null;
    const c = stats.compatibility;
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.compatibility.tag')}</span>
                <div class="big-number">${c.score}<span data-css="font-size:2rem;opacity:0.7;">/100</span></div>
                <div class="big-label">${t('slide.compatibility.big')}</div>
                <div class="stat-grid">
                    <div class="stat-card"><div class="stat-value">${c.components.lengthSimilarity}</div><div class="stat-label">${t('slide.compatibility.length')}</div></div>
                    <div class="stat-card"><div class="stat-value">${c.components.volumeBalance}</div><div class="stat-label">${t('slide.compatibility.volume')}</div></div>
                    <div class="stat-card"><div class="stat-value">${c.components.reciprocity}</div><div class="stat-label">${t('slide.compatibility.reciprocity')}</div></div>
                    <div class="stat-card"><div class="stat-value">${c.components.consistency}</div><div class="stat-label">${t('slide.compatibility.consistency')}</div></div>
                </div>
            </div>
        `,
    };
}

export function funFactsSlide(stats, gradient) {
    const facts = [];
    facts.push({ icon: '📅', text: t('slide.funFacts.busiestDay', { date: fmtDate(stats.mostActiveDay[0]), n: stats.mostActiveDay[1] }) });
    if (stats.streak.max > 1) facts.push({ icon: '🔥', text: t('slide.funFacts.streak', { n: stats.streak.max }) });
    if (stats.longestMessage && stats.longestMessage.msgLen > 0) facts.push({ icon: '📝', text: t('slide.funFacts.longest', { n: fmt(stats.longestMessage.msgLen), name: escapeHtml(stats.longestMessage.author) }) });
    if (stats.nightOwl) facts.push({ icon: '🦉', text: t('slide.funFacts.nightOwl', { name: escapeHtml(stats.nightOwl[0]), n: stats.nightOwl[1] }) });
    if (stats.earlyBird) facts.push({ icon: '🐦', text: t('slide.funFacts.earlyBird', { name: escapeHtml(stats.earlyBird[0]), n: stats.earlyBird[1] }) });
    if (stats.responseStats?.fastest) facts.push({ icon: '⚡', text: t('slide.funFacts.fastest', { name: escapeHtml(stats.responseStats.fastest[0]), time: fmtTime(stats.responseStats.fastest[1]) }) });

    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.funFacts.tag')}</span>
                <h2 class="slide-title">${t('slide.funFacts.title')}</h2>
                <div class="fun-facts">${facts.map(f => `<div class="fun-fact"><div class="fun-fact-icon">${f.icon}</div><div class="fun-fact-text">${f.text}</div></div>`).join('')}</div>
            </div>
        `,
    };
}
