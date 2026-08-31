/**
 * App orchestration: file intake, worker plumbing, screens.
 *
 * The deck itself lives in deck.js, dialogs in ui/, sharing in ui/share.js —
 * this file only decides *what* happens, not how it looks.
 */

import { generateSlides } from './slides/index.js';
import { serializeStats, rehydrateDates, sanitizeShared } from './payload.js';
import { Deck, bindNavigation } from './deck.js';
import { pickPeriod } from './ui/period.js';
import { openShareSheet } from './ui/share.js';
import { showToast, showError, announce } from './ui/toast.js';
import { readHash, clearHash } from './ui/hash.js';
import { ensureJSZip, ensureLZString, preload } from './vendor.js';
import { buildDemoBlob } from './demo.js';
import { pinConversation, getPinned, clearPinned, isSameConversation } from './compare.js';
import { compareYears } from './stats.js';
import { escapeHtml } from './utils.js';
import { TIP_JAR_URL } from './config.js';
import { track, trackPageview, isEnabled as analyticsEnabled, isOptedOut, setOptOut } from './analytics.js';
import { fmt } from './format.js';
import { t, initLocale, setLocale, getLocale, onLocaleChange, applyStaticI18n, LOCALES } from './i18n.js';

// Settled before anything is painted: a slide bakes its text in when it is
// built, so the language has to be known before the first build.
initLocale();
applyStaticI18n();

const $ = (sel) => document.querySelector(sel);

const screens = {
    upload: $('#upload-screen'),
    loading: $('#loading-screen'),
    error: $('#error-screen'),
    wrapped: $('#wrapped-screen'),
};
const fileInput = $('#file-input');
const dropZone = $('#drop-zone');
const loadingStatus = $('#loading-status');
const loadingFile = $('#loading-file');
const aiToggle = $('#ai-toggle');

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const AI_KEY = 'ww-use-ai';
const SESSION_KEY = 'ww-stats';

/** @type {{ stats: any, comparison: any, versus: any, slides: any[] } | null} */
let session = null;
let period = { year: null, range: null };
let periodOptions = null; // { years, yearCounts, bounds }
/** Name of the file the current deck came from — shown, never uploaded. */
let sourceName = null;

const deck = new Deck({
    container: $('#slides-container'),
    counter: $('#slide-counter'),
    progress: $('#story-progress'),
    onSlideChange: () => {
        const hint = $('#swipe-hint');
        if (hint) hint.style.display = 'none';
    },
    // Slides are filled in as they come into reach, so the recap slide's
    // markup does not exist right after `mount` any more. Its buttons are
    // wired the moment it does.
    onSlideReady: (_i, el) => wireRecapActions(el),
});

// ========== Service worker ==========
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[sw] registration failed:', err));
    });
}

// ========== Theme ==========
initTheme();
function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.dataset.theme = saved;
    const btn = $('#theme-toggle');
    if (!btn) return;
    labelThemeBtn(btn, saved);
    btn.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('theme', next);
        labelThemeBtn(btn, next);
        // Charts are painted on canvas and cannot follow a CSS variable.
        deck.retint();
    });
}

function labelThemeBtn(btn, theme) {
    btn.setAttribute('aria-label', t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark'));
    btn.setAttribute('title', t(theme === 'dark' ? 'theme.light' : 'theme.dark'));
}

// ========== AI toggle ==========
if (aiToggle) {
    aiToggle.checked = localStorage.getItem(AI_KEY) === 'true';
    aiToggle.addEventListener('change', () => {
        localStorage.setItem(AI_KEY, String(aiToggle.checked));
    });
}
const useAI = () => localStorage.getItem(AI_KEY) === 'true';

// ========== Screens ==========
function showScreen(name) {
    for (const [key, el] of Object.entries(screens)) el.classList.toggle('active', key === name);
}

// ========== Worker ==========
let worker = null;
/** Rejects the call in flight, so `cancelAnalysis` can unblock the caller. */
let abortInFlight = null;

function getWorker() {
    if (!worker) worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    return worker;
}

/** Marks the one error the callers are expected to swallow silently. */
const CANCELLED = 'cancelled';

/**
 * Stop whatever the worker is doing and go back to the upload screen.
 *
 * There is no cooperative way out of a long parse or a 50 MB model download,
 * so the worker is killed outright; the next analysis builds a fresh one. That
 * also drops the retained parse, which is why `periodOptions` is cleared —
 * there is no file loaded any more to re-slice.
 */
function cancelAnalysis() {
    if (worker) {
        worker.terminate();
        worker = null;
    }
    periodOptions = null;
    sourceName = null;
    period = { year: null, range: null };
    fileInput.value = '';
    const reject = abortInFlight;
    abortInFlight = null;
    reject?.(Object.assign(new Error(t('loading.cancelled')), { code: CANCELLED }));
    showToast(t('loading.cancelled'));
    showScreen('upload');
}

$('#loading-cancel').addEventListener('click', cancelAnalysis);

/**
 * One request/response round-trip. Progress messages are streamed to the
 * loading screen; the first non-progress message settles the promise.
 */
function callWorker(message, transfer = []) {
    return new Promise((resolve, reject) => {
        const w = getWorker();
        abortInFlight = reject;
        const onMessage = (e) => {
            if (e.data.kind === 'progress') {
                // The worker names the step; the wording is chosen here, in the
                // language the visitor picked.
                loadingStatus.textContent = t(`loading.${e.data.code}`, e.data.params || {});
                return;
            }
            w.removeEventListener('message', onMessage);
            w.removeEventListener('error', onError);
            abortInFlight = null;
            if (e.data.kind === 'error') {
                // The worker names the failure; the page words it.
                const err = new Error(e.data.code ? t(`error.${e.data.code}`) : e.data.message);
                err.diagnostics = e.data.diagnostics;
                reject(err);
            } else {
                resolve(e.data);
            }
        };
        const onError = (e) => {
            w.removeEventListener('message', onMessage);
            w.removeEventListener('error', onError);
            abortInFlight = null;
            reject(new Error(e.message || t('error.computeFailed')));
        };
        w.addEventListener('message', onMessage);
        w.addEventListener('error', onError);
        w.postMessage(message, transfer);
    });
}

// ========== File intake ==========
fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
});
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    if (!screens.upload.classList.contains('active')) return;
    dragDepth++;
    document.body.classList.add('dragging-file');
});
window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) document.body.classList.remove('dragging-file');
});
window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
});
window.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    if (!screens.upload.classList.contains('active')) return;
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging-file');
    if (!dropZone.contains(e.target)) handleFile(e.dataTransfer.files[0]);
});

/**
 * Pasting the export works too.
 *
 * On iOS and on Windows the natural gesture after "share to Files" is a paste,
 * and the drop zone answered only to a drag. Ignored while a deck is on
 * screen, so Ctrl+V into the share sheet is not intercepted.
 */
window.addEventListener('paste', (e) => {
    if (!screens.upload.classList.contains('active')) return;
    const file = e.clipboardData?.files?.[0];
    if (!file) return;
    e.preventDefault();
    handleFile(file);
});

$('#demo-btn').addEventListener('click', () => runDemo());
$('#demo-peek').addEventListener('click', () => runDemo());
$('#error-demo').addEventListener('click', () => runDemo());
$('#error-retry').addEventListener('click', () => {
    showScreen('upload');
    fileInput.value = '';
    fileInput.click();
});

function runDemo() {
    showToast(t('upload.demoNotice'));
    handleBlob(buildDemoBlob(), { demo: true, name: t('upload.demoName') });
}

async function handleFile(file) {
    if (file.size > MAX_FILE_SIZE) {
        showFatal(t('error.tooBig', { mb: Math.round(MAX_FILE_SIZE / 1024 / 1024) }));
        return;
    }
    if (!/\.(txt|zip)$/i.test(file.name)) {
        showFatal(t('error.badExt'));
        return;
    }

    showScreen('loading');
    setSourceName(file.name);
    try {
        const blob = file.name.toLowerCase().endsWith('.zip') ? await unzip(file) : file;
        await handleBlob(blob, { name: file.name });
    } catch (err) {
        if (err.code === CANCELLED) return;
        console.error(err);
        showFatal(err.message, err.diagnostics);
    }
}

/**
 * Show which file is being read, and which one the deck came from.
 *
 * The name never leaves the page — it is not in the share payload and not in
 * any analytics event. It is here because after the import screen there was
 * nothing left saying *which* conversation you were looking at, which is
 * confusing the moment you analyse a second one.
 */
function setSourceName(name) {
    sourceName = name || null;
    if (loadingFile) {
        loadingFile.textContent = sourceName || '';
        loadingFile.hidden = !sourceName;
    }
    updateSourceLabel();
}

function updateSourceLabel() {
    const el = $('#deck-source');
    if (!el) return;
    if (!sourceName) {
        el.hidden = true;
        el.textContent = '';
        return;
    }
    const scope = period.range
        ? `${period.range.from.slice(0, 10)} → ${period.range.to.slice(0, 10)}`
        : (period.year == null ? t('toolbar.periodAll') : String(period.year));
    el.hidden = false;
    el.textContent = `${sourceName} · ${scope}`;
    el.title = el.textContent;
}

async function handleBlob(blob, { demo = false, name = null } = {}) {
    showScreen('loading');
    if (name) setSourceName(name);
    announce(t('loading.announce'));
    // Likely needed within seconds; warmed here so the first chart slide and
    // the first share don't pay for the round-trip.
    preload('chart');

    try {
        const info = await callWorker({ kind: 'load', blob });
        if (info.kind !== 'years') throw new Error(t('error.workerInvalid'));

        periodOptions = { years: info.years, yearCounts: info.yearCounts, bounds: info.bounds };
        // A multi-year chat used to stop here and demand a choice before it
        // would show anything — a modal in front of a result nobody had seen
        // yet. It opens on the most recent year instead, and says so; the
        // period button changes it, and now has something to change *from*.
        period = { year: info.years[0], range: null };

        await computeAndShow();
        if (info.years.length > 1 && !demo) {
            showToast(t('toolbar.periodDefaulted', { year: info.years[0] }));
        }
    } catch (err) {
        if (err.code === CANCELLED) return;
        console.error(err);
        showFatal(err.message, err.diagnostics);
    }
}

async function computeAndShow() {
    showScreen('loading');
    loadingStatus.textContent = t('loading.computing');
    const result = await callWorker({ kind: 'stats', year: period.year, range: period.range, ai: useAI() });
    if (result.kind !== 'stats') throw new Error(t('error.computeFailed'));

    sessionStorage.removeItem(SESSION_KEY); // drop stats from a previous analysis
    present(rehydrateDates(result.stats), result.comparison);
    // Only *that* an analysis happened, never anything about the conversation.
    track('analysis', { ai: useAI(), period: period.range ? 'range' : (period.year == null ? 'all' : 'year') });
}

async function unzip(file) {
    loadingStatus.textContent = t('loading.unzipping');
    await ensureJSZip();
    const zip = await window.JSZip.loadAsync(file);
    const entry = Object.values(zip.files).find(f => !f.dir && f.name.toLowerCase().endsWith('.txt'));
    if (!entry) throw new Error(t('error.noTxtInZip'));

    // The 50 MB cap applies to the *compressed* file; a small zip can inflate
    // to gigabytes. Check the declared size first, then the real one.
    const declared = entry._data?.uncompressedSize;
    if (typeof declared === 'number' && declared > MAX_FILE_SIZE) {
        throw new Error(t('error.unzippedTooBig', { mb: Math.round(MAX_FILE_SIZE / 1024 / 1024) }));
    }
    const blob = await entry.async('blob', (meta) => {
        loadingStatus.textContent = t('loading.unzippingPct', { pct: Math.round(meta.percent) });
    });
    if (blob.size > MAX_FILE_SIZE) {
        throw new Error(t('error.unzippedTooBig', { mb: Math.round(MAX_FILE_SIZE / 1024 / 1024) }));
    }
    return blob;
}

// ========== Presentation ==========
function present(stats, comparison) {
    const versus = buildVersus(stats);
    const slides = generateSlides(stats, comparison, versus);
    session = { stats, comparison, versus, slides };
    deck.mount(slides);
    updatePeriodButton();
    updateSourceLabel();
    updatePinButton();
    showScreen('wrapped');
    announce(t('deck.analysed', { n: fmt(stats.totalMessages) }));
}

/**
 * Compare this conversation to the pinned one, if there is a different one.
 *
 * `compareYears` does the maths; all this decides is whether there is anything
 * to compare. Re-analysing the same conversation — a different period of the
 * same file, or the same file exported twice — is not a comparison, so it is
 * dropped rather than shown as a row of zeros.
 */
function buildVersus(stats) {
    const pinned = getPinned();
    if (!pinned || isSameConversation(stats, pinned)) return null;
    const versus = compareYears(stats, pinned.digest);
    if (!versus) return null;
    return {
        versus,
        pinnedName: pinned.name || t('compare.pinnedFallback'),
        currentName: sourceName || t('compare.currentFallback'),
    };
}

/**
 * The last slide offers the same actions as the toolbar, at thumb height.
 * @param {HTMLElement} slideEl the slide that just received its markup
 */
function wireRecapActions(slideEl) {
    const host = slideEl.querySelector('.recap-actions');
    if (!host) return;
    host.innerHTML = '';

    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'file-btn';
    share.textContent = t('deck.recapShare');
    share.addEventListener('click', openShare);

    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'ghost-btn';
    again.textContent = t('deck.recapAgain');
    again.addEventListener('click', resetAll);

    host.append(share, again);
}

function updatePeriodButton() {
    const btn = $('#period-btn');
    const label = $('#period-label');
    // Shown whenever a file is loaded — even a single-year chat can be sliced
    // into a custom range. Hidden only for a deck restored from a share link,
    // where there is no source file to re-slice.
    if (!periodOptions) {
        btn.hidden = true;
        return;
    }
    btn.hidden = false;
    label.textContent = period.range
        ? `${period.range.from.slice(0, 10)} → ${period.range.to.slice(0, 10)}`
        : (period.year == null ? t('toolbar.periodAll') : String(period.year));
}

/** A deck restored from a link or from sessionStorage has no source file. */
function forgetSource() {
    setSourceName(null);
}

// ========== Toolbar ==========
$('#nav-prev').addEventListener('click', () => { deck.stopStory(); deck.prev(); });
$('#nav-next').addEventListener('click', () => { deck.stopStory(); deck.next(); });
bindNavigation(deck, () => screens.wrapped.classList.contains('active'));

$('#story-toggle').addEventListener('click', () => {
    syncStoryButton(deck.toggleStory());
});

function syncStoryButton(playing = deck.storyPlaying) {
    const btn = $('#story-toggle');
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(playing));
    btn.querySelector('span[aria-hidden]').textContent = playing ? '❚❚' : '▶';
    btn.querySelector('.toolbar-label').textContent = t(playing ? 'toolbar.storyPause' : 'toolbar.story');
}

$('#period-btn').addEventListener('click', async () => {
    if (!periodOptions) return;
    deck.stopStory();
    const chosen = await pickPeriod({ ...periodOptions, current: period });
    if (chosen === undefined) return;
    if (chosen.year === period.year && sameRange(chosen.range, period.range)) return;
    period = chosen;
    try {
        await computeAndShow();
    } catch (err) {
        if (err.code === CANCELLED) return;
        console.error(err);
        showError(err.message);
        showScreen('wrapped');
    }
});

$('#pin-btn').addEventListener('click', togglePin);

/**
 * Pin the conversation on screen, or drop the pin if it is already this one.
 *
 * Only a digest is stored — see `js/compare.js` — and it stays on the device.
 */
function togglePin() {
    if (!session) return;
    const pinned = getPinned();

    if (pinned && isSameConversation(session.stats, pinned)) {
        clearPinned();
        showToast(t('compare.unpinned'));
    } else if (pinConversation(session.stats, sourceName || t('compare.currentFallback'))) {
        showToast(t('compare.pinned'));
    } else {
        showError(t('compare.pinFailed'));
        return;
    }
    track('pin_conversation');
    updatePinButton();
}

/**
 * The button says what pressing it will do, and the deck says what it already
 * did — a pinned conversation shows up as a slide, not as a badge.
 */
function updatePinButton() {
    const btn = $('#pin-btn');
    if (!btn) return;
    btn.hidden = !session;
    if (!session) return;

    const pinned = getPinned();
    const isThisOne = pinned && isSameConversation(session.stats, pinned);
    btn.setAttribute('aria-pressed', String(Boolean(isThisOne)));
    btn.querySelector('.toolbar-label').textContent = t(isThisOne ? 'compare.unpin' : 'compare.pin');
    btn.setAttribute('aria-label', t(isThisOne ? 'compare.unpinAria' : 'compare.pinAria'));
    btn.title = pinned && !isThisOne ? t('compare.against', { name: pinned.name }) : '';
}

$('#share-btn').addEventListener('click', openShare);

function openShare() {
    if (!session) return;
    deck.stopStory();
    const recap = session.slides[session.slides.length - 1]?.card || null;
    openShareSheet({
        stats: session.stats,
        comparison: session.comparison,
        card: deck.current?.card || null,
        recapCard: recap,
    });
}

$('#reset-btn').addEventListener('click', resetAll);

function resetAll() {
    clearHash();
    sessionStorage.removeItem(SESSION_KEY);
    deck.clear();
    getWorker().postMessage({ kind: 'reset' });
    session = null;
    period = { year: null, range: null };
    periodOptions = null;
    updatePinButton();
    forgetSource();
    fileInput.value = '';
    showScreen('upload');
}

// ========== Dashboard hand-off ==========
$('#summary-btn').addEventListener('click', () => {
    if (!session) return;
    track('dashboard');
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            stats: serializeStats(session.stats),
            comparison: session.comparison,
        }));
    } catch (err) {
        console.error('Failed to save stats:', err);
        showError(t('error.dashboardStorage'));
        return;
    }
    window.location.href = 'dashboard.html';
});

// ========== Errors ==========
/**
 * A parse failure used to be a 4-second red toast. Now it gets a screen that
 * says what was actually read, so the user can tell a wrong file from an
 * unsupported format — and report the latter.
 */
function showFatal(message, diagnostics = null) {
    track('parse_error', { detected: Boolean(diagnostics?.detected) });
    $('#error-message').textContent = message;
    const box = $('#error-diagnostics');

    if (diagnostics) {
        const samples = diagnostics.samples.length
            ? `<p class="diag-label">${t('error.diagIntro')}</p>
               <ul class="diag-samples">${diagnostics.samples.map(s => `<li><code>${escapeHtml(s)}</code></li>`).join('')}</ul>`
            : '';
        box.innerHTML = `
            <dl class="diag-grid">
                <div><dt>${t('error.diagLines')}</dt><dd>${fmt(diagnostics.totalLines)}</dd></div>
                <div><dt>${t('error.diagDetected')}</dt><dd>${t(diagnostics.detected ? 'common.yes' : 'common.no')}</dd></div>
                <div><dt>${t('error.diagMatched')}</dt><dd>${diagnostics.matched}</dd></div>
            </dl>
            ${samples}`;
        box.hidden = false;
    } else {
        box.hidden = true;
        box.innerHTML = '';
    }

    announce(t('error.prefix', { message }));
    showScreen('error');
}

// ========== Restore from URL / session ==========
async function restore() {
    // #demo is the manifest shortcut target, and a stable entry point for
    // linking someone straight to a working example.
    if (window.location.hash === '#demo') {
        runDemo();
        return true;
    }
    const { share } = readHash();
    if (share) {
        try {
            await ensureLZString();
            const json = window.LZString.decompressFromEncodedURIComponent(share);
            if (json) {
                const payload = sanitizeShared(JSON.parse(json));
                present(rehydrateDates(payload.s), payload.c || null);
                return true;
            }
        } catch (err) {
            console.error('Failed to load shared data:', err);
            showToast(t('error.unreadableLink'), { error: true });
        }
    }
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) {
            const payload = JSON.parse(raw);
            present(rehydrateDates(payload.stats), payload.comparison || null);
            return true;
        }
    } catch (err) {
        console.error('Failed to load from session:', err);
    }
    return false;
}

initLangPicker();
syncStoryButton(false);
updatePinButton();
renderPrivacyNote();
renderTipJar();
trackPageview();
restore();

/**
 * The language picker.
 *
 * Options are built from `LOCALES` rather than written in the HTML, so a new
 * dictionary shows up in the menu the moment it is registered.
 */
function initLangPicker() {
    const select = $('#lang-select');
    if (!select) return;
    select.innerHTML = Object.values(LOCALES)
        .map(l => `<option value="${l.code}">${escapeHtml(l.label)}</option>`).join('');
    select.value = getLocale();
    select.addEventListener('change', () => setLocale(select.value));
}

/**
 * Repaint everything the language touches.
 *
 * The static HTML is re-translated in place, but a deck cannot be: each slide
 * is a string of HTML built once from the stats. It is rebuilt from the same
 * stats and re-mounted, and `mount` restores the slide recorded in the hash —
 * so changing language mid-deck leaves you on the slide you were reading.
 */
onLocaleChange(() => {
    applyStaticI18n();
    const themeBtn = $('#theme-toggle');
    if (themeBtn) labelThemeBtn(themeBtn, document.documentElement.dataset.theme);
    const picker = $('#lang-select');
    if (picker) picker.value = getLocale();
    renderPrivacyNote();
    updateSourceLabel();
    updatePinButton();
    const tip = document.querySelector('.tip-link');
    if (tip) tip.textContent = t('upload.tipJar');
    syncStoryButton();
    updatePeriodButton();

    if (!session) return;
    deck.stopStory();
    session.versus = buildVersus(session.stats);
    session.slides = generateSlides(session.stats, session.comparison, session.versus);
    deck.mount(session.slides);
});

/**
 * The note has to stay true in both states: claiming "rien n'est envoyé à un
 * serveur" while a usage counter is running would be a lie, so the sentence
 * about the counter appears exactly when the counter does.
 */
function renderPrivacyNote() {
    const note = $('.privacy-note');
    if (!note) return;

    const base = t('upload.privacy');

    if (!analyticsEnabled() && !isOptedOut()) {
        note.textContent = base;
        return;
    }
    note.textContent = '';
    note.append(base + ' ');

    const extra = document.createElement('span');
    extra.className = 'privacy-note-extra';
    if (isOptedOut()) {
        extra.append(t('upload.privacyOptedOut'));
        extra.append(makeToggle(t('upload.optIn'), false));
    } else {
        extra.append(t('upload.privacyCounter'));
        extra.append(makeToggle(t('upload.optOut'), true));
    }
    note.append(extra);
}

function makeToggle(label, optOut) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'link-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => {
        setOptOut(optOut);
        renderPrivacyNote();
        showToast(t(optOut ? 'upload.optOutDone' : 'upload.optInDone'));
    });
    return btn;
}

/** Support links appear only once a tip jar URL is configured. */
function renderTipJar() {
    if (!TIP_JAR_URL) return;
    const host = $('.upload-container');
    if (!host) return;
    const link = document.createElement('a');
    link.className = 'tip-link';
    link.href = TIP_JAR_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = t('upload.tipJar');
    link.addEventListener('click', () => track('tip_jar'));
    host.appendChild(link);
}

function sameRange(a, b) {
    if (!a || !b) return a === b;
    return a.from === b.from && a.to === b.to;
}
