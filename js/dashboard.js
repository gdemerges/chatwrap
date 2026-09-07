/**
 * Dashboard page — renders a full data view from stats produced by the main app.
 * Data source (in order): sessionStorage 'ww-stats' → URL #share=<lzstring>.
 */

import { escapeHtml } from './utils.js';
import { fmt, fmtDate, fmtClock, fmtHour, fmtTime, dayNames, peakDayName, monthMedium } from './format.js';
import { t, initLocale, setLocale, getLocale, onLocaleChange, applyStaticI18n, LOCALES } from './i18n.js';
import { rehydrateDates, sanitizeShared } from './payload.js';
import { ensureLZString } from './vendor.js';
import { openShareSheet } from './ui/share.js';
import { showToast, showError } from './ui/toast.js';
import { exportData } from './export-data.js';
import { readHash } from './ui/hash.js';
import { track, trackPageview } from './analytics.js';

initLocale();
applyStaticI18n();

const STORAGE_KEY = 'ww-stats';
const $ = (sel) => document.querySelector(sel);
const content = $('#dash-content');

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[sw] registration failed:', err));
    });
}

// ---------- Theme ----------
initTheme();
function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.dataset.theme = saved;
    const btn = $('#theme-toggle');
    if (!btn) return;
    applyLabel(btn, saved);
    btn.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('theme', next);
        applyLabel(btn, next);
    });
}
function applyLabel(btn, theme) {
    btn.setAttribute('aria-label', t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark'));
    btn.setAttribute('title', t(theme === 'dark' ? 'theme.light' : 'theme.dark'));
}

/**
 * The language picker, and the full re-render behind it.
 *
 * Every card is a string of HTML built from the stats, so switching language
 * means rebuilding all of them — cheaper than threading a locale through two
 * dozen template functions, and it keeps the active participant filter honest
 * because `render` re-runs the filter wiring too.
 */
function initLangPicker() {
    const select = $('#lang-select');
    if (!select) return;
    select.innerHTML = Object.values(LOCALES)
        .map(l => `<option value="${l.code}">${escapeHtml(l.label)}</option>`).join('');
    select.value = getLocale();
    select.addEventListener('change', () => setLocale(select.value));
}

onLocaleChange(() => {
    applyStaticI18n();
    const btn = $('#theme-toggle');
    if (btn) applyLabel(btn, document.documentElement.dataset.theme);
    const picker = $('#lang-select');
    if (picker) picker.value = getLocale();
    if (current) render(current.stats, current.comparison);
});

// ---------- Load ----------
/** @type {{ stats: any, comparison: any } | null} */
let current = null;
/** Empty string = everyone. Survives a language switch and a re-render. */
let selectedPerson = '';

initLangPicker();
trackPageview();
boot();

async function boot() {
    const payload = await loadPayload();
    if (!payload) return; // the empty state already in the HTML stands
    const stats = rehydrateDates(payload.stats);
    current = { stats, comparison: payload.comparison || null };
    render(stats, current.comparison);
    wireToolbar();
}

async function loadPayload() {
    const { share } = readHash();
    if (share) {
        try {
            await ensureLZString();
            const json = window.LZString.decompressFromEncodedURIComponent(share);
            if (json) {
                const p = sanitizeShared(JSON.parse(json));
                return { stats: p.s, comparison: p.c };
            }
        } catch (e) {
            console.error(e);
            showError(t('error.unreadableLink'));
        }
    }
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) { console.error(e); }
    return null;
}

// ---------- Render ----------
function render(stats, comparison) {
    const sections = [];
    sections.push(heroCard(stats));
    // Pinned above everything else, because when a person is selected they are
    // what the page is about.
    if (selectedPerson) sections.push(personCard(stats, selectedPerson));
    if (comparison) sections.push(comparisonCard(comparison));
    sections.push(overviewCard(stats));
    sections.push(rankingCard(stats));
    if (stats.chapters?.length) sections.push(chaptersCard(stats));
    if (stats.profiles?.length) sections.push(profilesCard(stats));
    if (stats.interactions?.pairs?.length) sections.push(interactionsCard(stats));
    if (stats.topDomains?.length) sections.push(domainsCard(stats));
    sections.push(activityCard(stats));
    sections.push(emojisCard(stats));
    if (stats.reactions?.total) sections.push(reactionsCard(stats));
    sections.push(wordsCard(stats));
    if (stats.uniqueWordsPerPerson && Object.keys(stats.uniqueWordsPerPerson).length) {
        sections.push(signatureCard(stats));
    }
    if (stats.ghosting?.count) sections.push(ghostingCard(stats));
    if (stats.initiator?.length) sections.push(initiatorCard(stats));
    if (stats.sentiment) sections.push(sentimentCard(stats));
    if (stats.responseStats) sections.push(responseCard(stats));
    if (stats.compatibility) sections.push(compatibilityCard(stats));
    sections.push(funFactsCard(stats));

    content.innerHTML = sections.filter(Boolean).join('');
    populatePersonFilter(stats);
    applyPersonFilter(selectedPerson);
}

/**
 * Everything the stats know about one person, gathered in one card.
 *
 * The participant selector used to do nothing but hide table rows: you could
 * narrow the page down to someone, but their numbers stayed scattered across
 * nine cards and you still had to read them one by one. All of this is already
 * computed — `perPerson`, `profiles`, `interactions`, the per-person word and
 * emoji rankings — it had simply never been put side by side.
 *
 * @param {any} s
 * @param {string} name
 */
function personCard(s, name) {
    const p = s.perPerson?.[name];
    if (!p) return '';

    const profile = (s.profiles || []).find(x => x.name === name) || {};
    const closest = s.interactions?.closest?.[name] || null;
    const shareOfAll = s.totalMessages ? Math.round((p.count / s.totalMessages) * 100) : 0;
    const avgLen = p.textCount ? Math.round(p.textChars / p.textCount) : 0;

    const tile = (value, label) =>
        `<div class="dash-person-tile"><div class="dash-person-value">${value}</div><div class="dash-person-label">${label}</div></div>`;

    const tiles = [
        tile(fmt(p.count), t('dash.messages')),
        tile(`${shareOfAll}%`, t('units.share')),
        tile(fmt(avgLen), t('units.charsPerMsg')),
        tile(fmt(p.emojis || 0), t('units.emojis')),
        tile(fmt(p.media || 0), t('units.media')),
        tile(fmt(p.links || 0), t('dash.links')),
        tile(profile.peakHour == null ? t('common.none') : fmtHour(profile.peakHour), t('dash.peakHour')),
        tile(p.avgResponseMin == null ? t('common.none') : fmtClock(p.avgResponseMin), t('dash.responseTime')),
        tile(fmt(profile.initiations || 0), t('dash.initiations')),
        tile(fmt(p.nightMsgs || 0), t('dash.nightMessages')),
        tile(fmt(p.morningMsgs || 0), t('dash.morningMessages')),
        tile(fmt(p.deleted || 0), t('dash.deleted')),
    ].join('');

    const chips = (entries, empty) => {
        const list = (entries || []).slice(0, 8);
        if (!list.length) return `<p class="dash-person-empty">${empty}</p>`;
        return `<div class="dash-chips">${list.map(([label, n]) =>
            `<span class="dash-chip">${escapeHtml(String(label))}<b>${fmt(n)}</b></span>`).join('')}</div>`;
    };

    const closestLine = closest
        ? `<p class="dash-person-line">${t('dash.answersMostly')} <strong>${escapeHtml(closest.author)}</strong> — ${fmt(closest.count)}</p>`
        : '';

    return `
    <section class="dash-card dash-person col-12" data-person="${escapeHtml(name)}">
        <h2>${escapeHtml(name)} <span class="dash-meta">${t('dash.personCardMeta')}</span></h2>
        <div class="dash-person-grid">${tiles}</div>
        ${closestLine}
        <h4 class="dash-subheading">${t('dash.topWords')}</h4>
        ${chips(s.topWordsPerPerson?.[name], t('dash.noUniqueWords'))}
        <h4 class="dash-subheading">${t('dash.signature')}</h4>
        ${chips(s.uniqueWordsPerPerson?.[name], t('dash.noUniqueWords'))}
        <h4 class="dash-subheading">${t('dash.topEmojis')}</h4>
        ${chips(profile.topEmoji ? [profile.topEmoji] : [], t('common.none'))}
    </section>`;
}

// ---------- New cards ----------

const CHAPTER_KEYS = { high: 'high', steady: 'steady', low: 'low' };
const chapterLabel = (intensity) =>
    CHAPTER_KEYS[intensity] ? t(`slide.chapters.${CHAPTER_KEYS[intensity]}`) : intensity;

function chaptersCard(s) {
    const rows = s.chapters.map((c, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(chapterLabel(c.intensity))}</td>
            <td>${monthMedium(c.from)} → ${monthMedium(c.to)}</td>
            <td>${fmt(c.total)}</td>
            <td>${fmt(c.avgPerMonth)}</td>
        </tr>`).join('');
    return `
    <section class="dash-card col-12">
        <h2>${t('dash.chapters')} <span class="dash-meta">${t('dash.chaptersMeta')}</span></h2>
        <table class="dash-table">
            <thead><tr><th>#</th><th>${t('dash.phase')}</th><th>${t('dash.period')}</th><th>${t('dash.messages')}</th><th>${t('dash.perMonth')}</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </section>`;
}

function profilesCard(s) {
    const rows = s.profiles.map(p => `
        <tr data-person="${escapeHtml(p.name)}">
            <td>${escapeHtml(p.name)}</td>
            <td>${fmt(p.count)}</td>
            <td>${fmtHour(p.peakHour)}</td>
            <td>${p.topEmoji ? escapeHtml(p.topEmoji[0]) : t('common.none')}</td>
            <td>${p.signatureWord ? escapeHtml(p.signatureWord[0]) : t('common.none')}</td>
            <td>${p.topDomain ? escapeHtml(p.topDomain[0]) : t('common.none')}</td>
            <td>${fmt(p.initiations)}</td>
        </tr>`).join('');
    return `
    <section class="dash-card col-12">
        <h2>${t('dash.profiles')}</h2>
        <table class="dash-table">
            <thead><tr><th>${t('dash.person')}</th><th>${t('dash.messages')}</th><th>${t('dash.hour')}</th><th>${t('dash.emoji')}</th><th>${t('dash.word')}</th><th>${t('dash.site')}</th><th>${t('dash.initiations')}</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </section>`;
}

function interactionsCard(s) {
    const pairs = s.interactions.pairs.slice(0, 10).map(p => `
        <tr data-person="${escapeHtml(p.a)}" data-person-b="${escapeHtml(p.b)}">
            <td>${escapeHtml(p.a)} ↔ ${escapeHtml(p.b)}</td>
            <td>${fmt(p.count)}</td>
        </tr>`).join('');
    const closest = Object.entries(s.interactions.closest || {}).map(([who, target]) => `
        <tr data-person="${escapeHtml(who)}"><td>${escapeHtml(who)}</td><td>${escapeHtml(target.author)}</td><td>${fmt(target.count)}</td></tr>`).join('');
    return `
    <section class="dash-card col-6">
        <h2>${t('dash.whoTalksTo')} <span class="dash-meta">${t('dash.whoTalksToMeta')}</span></h2>
        <table class="dash-table"><tbody>${pairs}</tbody></table>
        <h4 class="dash-subheading">${t('dash.closest')}</h4>
        <table class="dash-table">
            <thead><tr><th>${t('dash.person')}</th><th>${t('dash.answersMostly')}</th><th>${t('dash.times')}</th></tr></thead>
            <tbody>${closest}</tbody>
        </table>
    </section>`;
}

function domainsCard(s) {
    const rows = s.topDomains.map(([domain, count]) =>
        `<tr><td>${escapeHtml(domain)}</td><td>${fmt(count)}</td></tr>`).join('');
    return `
    <section class="dash-card col-6">
        <h2>${t('dash.domains')} <span class="dash-meta">${t('dash.domainsMeta', { n: fmt(s.totalLinks) })}</span></h2>
        <table class="dash-table"><thead><tr><th>${t('dash.domain')}</th><th>${t('dash.links')}</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
}

function heroCard(s) {
    return `
    <section class="dash-hero">
        <div class="dash-hero-period">${fmtDate(s.startDate)} — ${fmtDate(s.endDate)} · ${t('dash.heroDays', { n: s.totalDays })}</div>
        <div class="dash-hero-item"><div class="dash-hero-value">${fmt(s.totalMessages)}</div><div class="dash-hero-label">${t('units.messages')}</div></div>
        <div class="dash-hero-item"><div class="dash-hero-value">${s.avgPerDay}</div><div class="dash-hero-label">${t('dash.perDay')}</div></div>
        <div class="dash-hero-item"><div class="dash-hero-value">${s.participants}</div><div class="dash-hero-label">${t('units.participants')}</div></div>
        <div class="dash-hero-item"><div class="dash-hero-value">${fmt(s.emojis?.total || 0)}</div><div class="dash-hero-label">${t('units.emojis')}</div></div>
        <div class="dash-hero-item"><div class="dash-hero-value">${fmt(s.totalMedia)}</div><div class="dash-hero-label">${t('units.media')}</div></div>
        <div class="dash-hero-item"><div class="dash-hero-value">${t('format.days', { n: s.streak?.max || 0 })}</div><div class="dash-hero-label">${t('units.bestStreak')}</div></div>
    </section>`;
}

function comparisonCard(c) {
    const row = (label, data, unit = '') => {
        const pct = data.pct;
        const arrow = pct == null ? '' : pct > 0 ? '▲' : pct < 0 ? '▼' : '=';
        const trendClass = pct == null ? 'dash-trend-flat' : pct > 0 ? 'dash-trend-up' : pct < 0 ? 'dash-trend-down' : 'dash-trend-flat';
        return `<tr><td>${label}</td><td>${fmt(data.previous)}${unit}</td><td>${fmt(data.current)}${unit}</td><td class="${trendClass}">${arrow} ${pct == null ? t('common.none') : Math.abs(pct) + '%'}</td></tr>`;
    };
    return `
    <section class="dash-card col-12">
        <h2>${t('dash.comparison')}</h2>
        <table class="dash-table">
            <thead><tr><th>${t('dash.metric')}</th><th>${t('dash.previous')}</th><th>${t('dash.currentYear')}</th><th>${t('dash.change')}</th></tr></thead>
            <tbody>
                ${row(t('dash.messages'), c.messages)}
                ${row(t('dash.avgPerDay'), c.avgPerDay)}
                ${row(t('slide.comparison.emojis'), c.emojis)}
                ${row(t('slide.comparison.media'), c.media)}
                <tr><td>${t('dash.bestStreak')}</td><td>${t('format.days', { n: c.streak.previous })}</td><td>${t('format.days', { n: c.streak.current })}</td><td>${t('common.none')}</td></tr>
            </tbody>
        </table>
    </section>`;
}

function overviewCard(s) {
    return `
    <section class="dash-card col-6">
        <h2>${t('dash.overview')}</h2>
        <dl class="dash-kv">
            <dt>${t('dash.totalChars')}</dt><dd>${fmt(s.totalChars)}</dd>
            <dt>${t('dash.avgLen')}</dt><dd>${t('format.chars', { n: s.avgMsgLen })}</dd>
            <dt>${t('dash.sharedLinks')}</dt><dd>${fmt(s.totalLinks)}</dd>
            <dt>${t('dash.edited')}</dt><dd>${fmt(s.totalEdited)}</dd>
            <dt>${t('dash.deleted')}</dt><dd>${fmt(s.totalDeleted || 0)}</dd>
            <dt>${t('dash.peakHour')}</dt><dd>${fmtHour(s.peakHour)}</dd>
            <dt>${t('dash.peakDay')}</dt><dd>${escapeHtml(peakDayName(s))}</dd>
            <dt>${t('dash.busiestDay')}</dt><dd>${escapeHtml(s.mostActiveDay?.[0] || t('common.none'))} (${fmt(s.mostActiveDay?.[1] || 0)})</dd>
            <dt>${t('dash.detectedLang')}</dt><dd>${(s.lang || 'fr').toUpperCase()}</dd>
        </dl>
    </section>`;
}

function rankingCard(s) {
    const emojiMap = Object.fromEntries(s.emojis?.perPerson || []);
    return `
    <section class="dash-card col-6">
        <h2>${t('dash.ranking')}</h2>
        <table class="dash-table">
            <thead><tr><th>#</th><th>${t('dash.name')}</th><th>${t('dash.messages')}</th><th>%</th><th>${t('dash.avg')}</th><th>${t('slide.comparison.emojis')}</th></tr></thead>
            <tbody>${s.ranking.map(([name, d], i) => {
                const rank = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
                return `<tr data-person="${escapeHtml(name)}"><td class="dash-rank ${rank}">${i + 1}</td><td>${escapeHtml(name)}</td><td>${fmt(d.count)}</td><td>${d.percent}%</td><td>${d.avgLen}</td><td>${fmt(emojiMap[name] || 0)}</td></tr>`;
            }).join('')}</tbody>
        </table>
    </section>`;
}

function activityCard(s) {
    const max = Math.max(...s.hourly);
    const bars = s.hourly.map((v, h) => {
        const pct = max ? (v / max) * 100 : 0;
        return `<div class="dash-hour-bar" title="${t('dash.hourTooltip', { hour: fmtHour(h), n: v })}">
            <div class="dash-hour-track"><div class="dash-hour-fill" style="--fill:${pct}%"></div></div>
            <div class="dash-hour-label">${h}</div>
        </div>`;
    }).join('');
    const dayMax = Math.max(...s.weekday);
    const days = dayNames();
    const dayBars = s.weekday.map((v, i) => {
        const pct = dayMax ? (v / dayMax) * 100 : 0;
        return `<div class="dash-day-row">
            <span class="dash-day-name">${days[i].slice(0, 3)}</span>
            <div class="dash-day-track"><div class="dash-day-fill" style="--fill:${pct}%"></div></div>
            <span class="dash-day-count">${fmt(v)}</span>
        </div>`;
    }).join('');
    return `
    <section class="dash-card col-12">
        <h2>${t('dash.activity')}</h2>
        <div class="dash-hourly-row">${bars}</div>
        <div class="dash-day-list">${dayBars}</div>
    </section>`;
}

function emojisCard(s) {
    if (!s.emojis?.top?.length) return '';
    const chips = s.emojis.top.map(([e, c]) => `<span class="dash-chip">${escapeHtml(e)} <span class="count">${fmt(c)}</span></span>`).join('');
    return `
    <section class="dash-card col-6">
        <h2>${t('dash.topEmojis')} <span class="dash-meta">${t('dash.topEmojisMeta', { n: fmt(s.emojis.total), unique: s.emojis.unique })}</span></h2>
        <div class="dash-chips">${chips}</div>
    </section>`;
}

function reactionsCard(s) {
    const emojis = (s.reactions.topEmojis || []).map(([e, c]) => `<span class="dash-chip">${escapeHtml(e)} <span class="count">${fmt(c)}</span></span>`).join('');
    const authors = (s.reactions.perAuthor || []).map(([n, c]) => `<tr data-person="${escapeHtml(n)}"><td>${escapeHtml(n)}</td><td>${fmt(c)}</td></tr>`).join('');
    return `
    <section class="dash-card col-6">
        <h2>${t('dash.reactions')} <span class="dash-meta">${t('dash.reactionsMeta', { n: fmt(s.reactions.total) })}</span></h2>
        <div class="dash-chips dash-chips--spaced">${emojis}</div>
        <table class="dash-table"><thead><tr><th>${t('dash.author')}</th><th>${t('dash.reactions')}</th></tr></thead><tbody>${authors}</tbody></table>
    </section>`;
}

function wordsCard(s) {
    if (!s.topWords?.length) return '';
    const chips = s.topWords.slice(0, 25).map(([w, c]) => `<span class="dash-chip">${escapeHtml(w)} <span class="count">${fmt(c)}</span></span>`).join('');
    return `
    <section class="dash-card col-12">
        <h2>${t('dash.topWords')}</h2>
        <div class="dash-chips">${chips}</div>
    </section>`;
}

function signatureCard(s) {
    const blocks = Object.entries(s.uniqueWordsPerPerson).map(([author, words]) => {
        const chips = words.slice(0, 10).map(([w, c]) => `<span class="dash-chip">${escapeHtml(w)} <span class="count">${c}</span></span>`).join('');
        return `<div class="dash-sig-block"><h4>${escapeHtml(author)}</h4><div class="dash-chips">${chips || `<span class="dash-empty-note">${t('dash.noUniqueWords')}</span>`}</div></div>`;
    }).join('');
    return `
    <section class="dash-card col-12">
        <h2>${t('dash.signature')} <span class="dash-meta">${t('dash.signatureMeta')}</span></h2>
        <div class="dash-signature">${blocks}</div>
    </section>`;
}

function ghostingCard(s) {
    const longest = (s.ghosting.longest || []).map(g => {
        const h = Math.round(g.minutes / 60);
        return `<tr data-person="${escapeHtml(g.silenced)}" data-person-b="${escapeHtml(g.revived)}"><td>${escapeHtml(g.silenced)} → ${escapeHtml(g.revived)}</td><td>${t('format.hours', { h })}</td><td>${fmtDate(g.when)}</td></tr>`;
    }).join('');
    const revivers = (s.ghosting.revivers || []).map(([n, c]) => `<tr data-person="${escapeHtml(n)}"><td>${escapeHtml(n)}</td><td>${fmt(c)}</td></tr>`).join('');
    return `
    <section class="dash-card col-6">
        <h2>${t('dash.ghosting')} <span class="dash-meta">${t('dash.ghostingMeta', { n: fmt(s.ghosting.count) })}</span></h2>
        <h4 class="dash-subheading dash-subheading--first">${t('dash.longestSilences')}</h4>
        <table class="dash-table"><tbody>${longest}</tbody></table>
        <h4 class="dash-subheading">${t('dash.whoBreaks')}</h4>
        <table class="dash-table"><tbody>${revivers}</tbody></table>
    </section>`;
}

function initiatorCard(s) {
    const rows = s.initiator.map(([n, c]) => `<tr data-person="${escapeHtml(n)}"><td>${escapeHtml(n)}</td><td>${t('dash.daysValue', { n: fmt(c) })}</td></tr>`).join('');
    return `
    <section class="dash-card col-6">
        <h2>${t('dash.initiator')}</h2>
        <table class="dash-table"><tbody>${rows}</tbody></table>
    </section>`;
}

function sentimentCard(s) {
    const st = s.sentiment;
    const mlBadge = st.mlEnabled
        ? `<span class="dash-badge">${t(st.ironyModel ? 'dash.badgeMLIrony' : 'dash.badgeML', { device: st.device ?? 'wasm' })}</span>`
        : `<span class="dash-badge dash-badge--dim">${t('dash.badgeLexicon')}</span>`;

    const rows = (st.perPerson || []).map(p => {
        const ratePct = (p.rate * 100).toFixed(1);
        const sampled = p.sampled > 0 ? `<span class="dash-meta-inline" title="${t('dash.sampledTitle', { n: p.sampled })}">(${p.sampled})</span>` : '';
        return `<tr data-person="${escapeHtml(p.author)}">
            <td>${escapeHtml(p.author)}</td>
            <td>${fmt(p.pos)}</td>
            <td>${fmt(p.neg)}</td>
            <td>${fmt(p.compliment)}</td>
            <td>${fmt(p.insult)}</td>
            <td>${p.rate > 0 ? '+' : ''}${ratePct}% ${sampled}</td>
            <td>${p.stdDev > 0 ? p.stdDev.toFixed(2) : t('common.none')}</td>
            <td>${p.sarcasmHits > 0 ? p.sarcasmHits : t('common.none')}</td>
        </tr>`;
    }).join('');

    const highlights = [];
    const highlight = (icon, text) =>
        highlights.push(`<div class="dash-fact"><span class="dash-fact-icon">${icon}</span><div>${text}</div></div>`);

    if (st.sweetest?.compliment)
        highlight('💖', t('dash.sweetest', { name: escapeHtml(st.sweetest.author), n: st.sweetest.compliment }));
    if (st.sharpest?.insult)
        highlight('🌶️', t('dash.sharpest', { name: escapeHtml(st.sharpest.author), n: st.sharpest.insult }));
    if (st.mostPositive)
        highlight('☀️', t('dash.mostPositive', { name: escapeHtml(st.mostPositive.author), pct: (st.mostPositive.rate * 100).toFixed(1) }));
    if (st.mostVolatile)
        highlight('🎢', t('dash.mostVolatile', { name: escapeHtml(st.mostVolatile.author), sd: st.mostVolatile.stdDev.toFixed(2) }));
    if (st.mostStable && st.perPerson.length > 1)
        highlight('🧘', t('dash.mostStable', { name: escapeHtml(st.mostStable.author), sd: st.mostStable.stdDev.toFixed(2) }));
    if (st.mostBeloved)
        highlight('💝', t('dash.mostBeloved', { name: escapeHtml(st.mostBeloved.author), pct: (st.mostBeloved.reactionsReceivedMean * 100).toFixed(0), n: st.mostBeloved.reactionsReceived }));
    if (st.mostExpressive && st.perPerson.length > 1)
        highlight('🎭', t('dash.mostExpressive', { name: escapeHtml(st.mostExpressive.author), n: st.mostExpressive.reactionsSent }));

    const hasReactions = (st.perPerson || []).some(p => p.reactionsSent > 0 || p.reactionsReceived > 0);
    const reactionRows = !hasReactions ? '' : (st.perPerson || []).map(p => {
        const sentPct = p.reactionsSent > 0 ? `${p.reactionsSentMean >= 0 ? '+' : ''}${(p.reactionsSentMean * 100).toFixed(0)}%` : t('common.none');
        const recPct  = p.reactionsReceived > 0 ? `${p.reactionsReceivedMean >= 0 ? '+' : ''}${(p.reactionsReceivedMean * 100).toFixed(0)}%` : t('common.none');
        return `<tr data-person="${escapeHtml(p.author)}">
            <td>${escapeHtml(p.author)}</td>
            <td>${fmt(p.reactionsSent)} <span class="dash-meta-inline">${sentPct}</span></td>
            <td>${fmt(p.reactionsReceived)} <span class="dash-meta-inline">${recPct}</span></td>
        </tr>`;
    }).join('');

    const afterRows = Object.entries(st.afterAuthor || {})
        .sort((a, b) => Math.abs(b[1].mean) - Math.abs(a[1].mean))
        .map(([author, { mean, count }]) => {
            const pct = (mean * 100).toFixed(1);
            return `<tr data-person="${escapeHtml(author)}"><td>${escapeHtml(author)}</td><td>${mean >= 0 ? '+' : ''}${pct}%</td><td class="dash-meta-inline">${t('dash.signals', { n: count })}</td></tr>`;
        }).join('');

    return `
    <section class="dash-card col-12">
        <h2>${t('dash.sentiment')} ${mlBadge}</h2>
        <div class="dash-facts dash-facts--spaced">${highlights.join('')}</div>
        <table class="dash-table">
            <thead><tr><th>${t('dash.person')}</th><th>${t('dash.positive')}</th><th>${t('dash.negative')}</th><th>${t('dash.compliments')}</th><th>${t('dash.barbs')}</th><th>${t('dash.ratio')}</th><th>σ</th><th>${t('dash.irony')}</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        ${reactionRows ? `
        <h3 class="dash-section-heading">${t('dash.emojiReactions')}</h3>
        <table class="dash-table">
            <thead><tr><th>${t('dash.person')}</th><th>${t('dash.sent')}</th><th>${t('dash.received')}</th></tr></thead>
            <tbody>${reactionRows}</tbody>
        </table>` : ''}
        ${afterRows ? `
        <h3 class="dash-section-heading">${t('dash.influence')}</h3>
        <table class="dash-table">
            <thead><tr><th>${t('dash.afterMessages')}</th><th>${t('dash.replyMood')}</th><th></th></tr></thead>
            <tbody>${afterRows}</tbody>
        </table>` : ''}
    </section>`;
}

function responseCard(s) {
    const rows = (s.responseStats.all || []).map(([n, min]) =>
        `<tr data-person="${escapeHtml(n)}"><td>${escapeHtml(n)}</td><td>${fmtTime(min)}</td></tr>`
    ).join('');
    return `
    <section class="dash-card col-6">
        <h2>${t('dash.responseTime')}</h2>
        <table class="dash-table"><tbody>${rows}</tbody></table>
    </section>`;
}

function compatibilityCard(s) {
    const c = s.compatibility;
    return `
    <section class="dash-card col-6">
        <h2>${t('dash.compatibility')}</h2>
        <div class="dash-compat">
            <div><span class="dash-compat-score">${c.score}</span><span class="dash-compat-max">/100</span></div>
        </div>
        <dl class="dash-compat-grid">
            <div class="dash-compat-cell"><dt>${t('dash.lengths')}</dt><dd>${c.components.lengthSimilarity}</dd></div>
            <div class="dash-compat-cell"><dt>${t('dash.balance')}</dt><dd>${c.components.volumeBalance}</dd></div>
            <div class="dash-compat-cell"><dt>${t('dash.reciprocity')}</dt><dd>${c.components.reciprocity}</dd></div>
            <div class="dash-compat-cell"><dt>${t('dash.consistency')}</dt><dd>${c.components.consistency}</dd></div>
        </dl>
    </section>`;
}

function funFactsCard(s) {
    const facts = [];
    if (s.firstMessage) {
        facts.push({ i: '🎬', t: t('dash.firstMessage', { name: escapeHtml(s.firstMessage.author), date: fmtDate(s.firstMessage.datetime), time: fmtClock(s.firstMessage.datetime) }) });
    }
    if (s.longestMessage?.msgLen) {
        facts.push({ i: '📜', t: t('dash.longestMessage', { name: escapeHtml(s.longestMessage.author), n: fmt(s.longestMessage.msgLen) }) });
    }
    if (s.nightOwl) facts.push({ i: '🦉', t: t('dash.nightOwl', { name: escapeHtml(s.nightOwl[0]), n: s.nightOwl[1] }) });
    if (s.earlyBird) facts.push({ i: '🐦', t: t('dash.earlyBird', { name: escapeHtml(s.earlyBird[0]), n: s.earlyBird[1] }) });
    if (s.streak?.max) facts.push({ i: '🔥', t: t('dash.streak', { n: s.streak.max }) });
    const html = facts.map(f => `<div class="dash-fact"><span class="dash-fact-icon">${f.i}</span><div>${f.t}</div></div>`).join('');
    return `
    <section class="dash-card col-12">
        <h2>${t('dash.funFacts')}</h2>
        <div class="dash-facts">${html}</div>
    </section>`;
}

// ---------- Toolbar: filter, export, share ----------

/**
 * Focus mode rather than recomputation: the dashboard only ever receives
 * aggregated stats, never the messages, so a participant filter can highlight
 * the rows about that person but cannot recompute totals. Rows that carry no
 * `data-person` are left alone, and the card is marked so it is obvious that a
 * filter is active.
 */
function populatePersonFilter(stats) {
    const select = $('#dash-person');
    if (!select) return;
    const names = (stats.ranking || []).map(([name]) => name);
    select.innerHTML = `<option value="">${t('common.everyone')}</option>` +
        names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    select.disabled = names.length === 0;
    // A shared payload can be anonymised between two renders; drop a selection
    // that no longer names anyone.
    if (selectedPerson && !names.includes(selectedPerson)) selectedPerson = '';
    select.value = selectedPerson;
}

function applyPersonFilter(name) {
    document.body.classList.toggle('is-filtered', !!name);
    content.querySelectorAll('tr[data-person]').forEach(row => {
        const matches = !name ||
            row.dataset.person === name ||
            row.dataset.personB === name;
        row.hidden = !matches;
    });
}

function wireToolbar() {
    $('#dash-person')?.addEventListener('change', (e) => {
        selectedPerson = e.target.value;
        // A full re-render rather than just hiding rows: the person card has to
        // be built for whoever is now selected.
        if (current) render(current.stats, current.comparison);
    });

    $('#dash-share')?.addEventListener('click', () => {
        if (!current) return;
        openShareSheet({
            stats: current.stats,
            comparison: current.comparison,
            card: null,
            recapCard: null,
        });
    });

    $('#dash-export-json')?.addEventListener('click', () => runExport('json'));
    $('#dash-export-csv')?.addEventListener('click', () => runExport('csv'));
}

/**
 * Both exports go through `js/export-data.js`, which the share sheet uses too.
 *
 * The dashboard used to build its own CSV: one table, headers written in
 * French in an app that speaks nine languages, and — the reason this moved —
 * a `csvCell` that quoted commas but did nothing about a leading `=`, `+` or
 * `@`. Participant names come from the chat, so that cell was a formula
 * waiting to run the next time someone opened the file in Excel.
 */
function runExport(format) {
    if (!current) return;
    exportData({
        stats: current.stats,
        comparison: current.comparison,
        format,
        // The dashboard shows real names on screen already; a file saved from
        // here matches what is on screen. The share sheet is where the
        // anonymisation switch lives.
        anonymize: false,
    });
    track('export', { format });
    showToast(t(format === 'csv' ? 'dash.csvDone' : 'dash.jsonDone'));
}
