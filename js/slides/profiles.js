import { escapeHtml } from '../utils.js';
import { fmt, fmtTime, fmtHour } from '../format.js';
import { t } from '../i18n.js';
import { CHART_COLORS } from './_constants.js';

const MAX_PROFILES = 8;

/** "13h" — the hour a person is most likely to be typing. */
function hourLabel(h) {
    return typeof h === 'number' && h >= 0 ? fmtHour(h) : t('common.none');
}

/**
 * One identity card per participant: the "who is this person in the chat"
 * view. Everything shown is already computed in stats.js.
 */
export function profilesSlide(stats, gradient) {
    const profiles = (stats.profiles || []).slice(0, MAX_PROFILES);
    if (profiles.length === 0) return null;

    const cards = profiles.map((p, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const traits = [
            [t('units.messages'), fmt(p.count)],
            [t('units.share'), `${p.percent}%`],
            [t('units.charsPerMsg'), fmt(p.avgLen)],
            [t('slide.profiles.peakHour'), hourLabel(p.peakHour)],
            [t('slide.profiles.response'), p.avgResponseMin != null ? fmtTime(p.avgResponseMin) : t('common.none')],
            [t('slide.profiles.initiations'), fmt(p.initiations)],
        ].map(([label, value]) =>
            `<div class="profile-trait"><span class="profile-trait-value">${value}</span><span class="profile-trait-label">${label}</span></div>`
        ).join('');

        const badges = [
            p.topEmoji ? `<span class="profile-badge" data-css="border-color:${color};">${escapeHtml(p.topEmoji[0])} <small>×${fmt(p.topEmoji[1])}</small></span>` : '',
            p.signatureWord ? `<span class="profile-badge" data-css="border-color:${color};">« ${escapeHtml(p.signatureWord[0])} »</span>` : '',
            p.topDomain ? `<span class="profile-badge" data-css="border-color:${color};">🔗 ${escapeHtml(p.topDomain[0])}</span>` : '',
        ].filter(Boolean).join('');

        return `
            <article class="profile-card" data-css="--profile-color:${color};">
                <header class="profile-head">
                    <span class="profile-avatar" aria-hidden="true">${escapeHtml(initials(p.name))}</span>
                    <h3>${escapeHtml(p.name)}</h3>
                </header>
                <div class="profile-traits">${traits}</div>
                <div class="profile-badges">${badges}</div>
            </article>`;
    }).join('');

    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.profiles.tag')}</span>
                <h2 class="slide-title">${t('slide.profiles.title')}</h2>
                <div class="profile-grid">${cards}</div>
            </div>
        `,
    };
}

function initials(name) {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map(p => [...p][0] || '').join('').toUpperCase() || '?';
}
