import { escapeHtml } from '../utils.js';
import { fmt, fmtHour } from '../format.js';
import { t } from '../i18n.js';

/**
 * Turn a day's context (built in the worker, see `js/worker/day-context.js`)
 * into the one or two clauses that explain it.
 *
 * A date and a mood are a verdict without evidence. What makes « the 11th was
 * tense » mean something is the rest of the shape: three times the usual
 * volume, one person holding the floor, the thread running until 2am, six days
 * of silence right after. Every candidate clause carries a salience so the
 * strongest signals win the two slots a slide can spare — a day is explained
 * by what set it apart, not by whatever happens to be measurable.
 */

const MAX_CLAUSES = 2;

/**
 * @param {any} day A `bestDays` / `worstDays` entry.
 * @param {'best'|'worst'} tone
 * @returns {string[]} Ready-to-render HTML clauses, strongest first.
 */
export function dayWhy(day, tone) {
    const c = day?.context;
    if (!c) return [];
    /** @type {[number, string][]} */
    const clauses = [];
    const add = (salience, key, params) => clauses.push([salience, t(`slide.moments.why.${key}`, params)]);
    const pct = share => Math.round(share * 100);

    // Volume is the most available signal and therefore the least telling:
    // a notable day is almost always a busy one. It is kept below the clauses
    // that say something a reader could not have guessed.
    if (c.volumeRatio >= 1.8) {
        add(1.8 + Math.min(1.2, c.volumeRatio / 4), 'volumeHigh', { n: fmt(c.messages), mult: mult(c.volumeRatio) });
    } else if (c.volumeRatio != null && c.volumeRatio <= 0.5) {
        add(2, 'volumeLow', { n: fmt(c.messages) });
    }

    if (c.silenceBefore >= 3) add(2.2 + Math.min(1.5, c.silenceBefore / 14), 'afterSilence', { n: c.silenceBefore });
    if (c.silenceAfter >= 3) add(2.4 + Math.min(1.5, c.silenceAfter / 14), 'thenSilence', { n: c.silenceAfter });

    if (c.topAuthor && c.topAuthor.share >= 0.6 && c.participants > 1) {
        add(1.5 + c.topAuthor.share, 'dominated', {
            name: escapeHtml(c.topAuthor.author),
            pct: pct(c.topAuthor.share),
        });
    }

    // Whose tone made the day — only when the participants actually diverged.
    const voices = day.perAuthor ?? [];
    if (voices.length > 1) {
        const low  = voices.reduce((a, b) => (b.mean < a.mean ? b : a));
        const high = voices.reduce((a, b) => (b.mean > a.mean ? b : a));
        if (high.mean - low.mean >= 0.4) {
            const who = tone === 'worst' ? low : high;
            add(3.2, tone === 'worst' ? 'toneDown' : 'toneUp', { name: escapeHtml(who.author) });
        }
    }

    if (c.replyRatio >= 1.6) add(1.8, 'slowReplies', { mult: mult(c.replyRatio) });
    else if (c.replyRatio != null && c.replyRatio <= 0.6) add(1.6, 'fastReplies', { mult: mult(1 / c.replyRatio) });

    if (c.nightShare >= 0.25) add(1.4 + c.nightShare, 'night', { pct: pct(c.nightShare) });
    else if (c.peakHourShare >= 0.4) add(1.2, 'peak', { hour: fmtHour(c.peakHour) });

    if (c.questionShare >= 0.3) add(1.3, 'questions', { pct: pct(c.questionShare) });
    if (c.mediaShare >= 0.4) add(1.1, 'media', { pct: pct(c.mediaShare) });
    if (c.longestMessage >= 600) add(1.5, 'longMessage', { n: fmt(c.longestMessage) });

    const out = clauses.sort((a, b) => b[0] - a[0]).slice(0, MAX_CLAUSES).map(([, text]) => text);

    // Keywords are the closest thing to a subject line, so they get their own
    // slot rather than competing with the numbers.
    if (c.keywords?.length > 0) {
        out.push(t('slide.moments.why.keywords', {
            words: c.keywords.map(w => `<em>${escapeHtml(w)}</em>`).join(', '),
        }));
    }
    return out;
}

/** "3,2" / "3.2" — a ratio, without a trailing ",0". */
function mult(ratio) {
    return fmt(Math.round(ratio * 10) / 10);
}
