import { MIN_DAY_SAMPLES, MIN_DAY_PER_AUTHOR, MIN_AFTER_SAMPLES, MIN_STABLE_SAMPLES } from './sentiment-config.js';

/**
 * Mutable accumulators for temporal & directed sentiment signals.
 * Fed by both reactions (full coverage) and ML polarities (sampled).
 */
export function newAggregator() {
    const monthlyAgg   = {};
    const monthlyPPAgg = {};
    const hourlyAgg    = {};
    const dailyAgg     = {};
    const dailyPPAgg   = {};
    const afterAgg     = {};

    function addEvent(author, dt, pol, prevAuthor) {
        if (dt) {
            const y  = dt.getFullYear();
            const mo = String(dt.getMonth() + 1).padStart(2, '0');
            const d  = String(dt.getDate()).padStart(2, '0');
            const mKey = `${y}-${mo}`;
            const dKey = `${y}-${mo}-${d}`;
            const h  = dt.getHours();
            (monthlyAgg[mKey] ??= { sum: 0, count: 0 }).sum += pol;
            monthlyAgg[mKey].count++;
            ((monthlyPPAgg[author] ??= {})[mKey] ??= { sum: 0, count: 0 }).sum += pol;
            monthlyPPAgg[author][mKey].count++;
            (hourlyAgg[h] ??= { sum: 0, count: 0 }).sum += pol;
            hourlyAgg[h].count++;
            (dailyAgg[dKey] ??= { sum: 0, count: 0 }).sum += pol;
            dailyAgg[dKey].count++;
            // Who carried the day's tone — the difference between « the 12th
            // was tense » and « the 12th was tense, and it was mostly Léa ».
            ((dailyPPAgg[dKey] ??= {})[author] ??= { sum: 0, count: 0 }).sum += pol;
            dailyPPAgg[dKey][author].count++;
        }
        if (prevAuthor) {
            (afterAgg[prevAuthor] ??= { sum: 0, count: 0 }).sum += pol;
            afterAgg[prevAuthor].count++;
        }
    }

    function finalize() {
        const monthly = Object.fromEntries(
            Object.entries(monthlyAgg).map(([k, v]) => [k, v.sum / v.count]),
        );
        const monthlyPerPerson = Object.fromEntries(
            Object.entries(monthlyPPAgg).map(([a, months]) => [
                a,
                Object.fromEntries(Object.entries(months).map(([k, v]) => [k, v.sum / v.count])),
            ]),
        );
        const sentimentHourly = Array.from({ length: 24 }, (_, h) => {
            const d = hourlyAgg[h];
            return (d && d.count >= 3) ? d.sum / d.count : null;
        });
        const dayEntries = Object.entries(dailyAgg)
            .filter(([, v]) => v.count >= MIN_DAY_SAMPLES)
            .map(([k, v]) => ({
                date: k,
                mean: v.sum / v.count,
                count: v.count,
                perAuthor: Object.entries(dailyPPAgg[k] ?? {})
                    .filter(([, a]) => a.count >= MIN_DAY_PER_AUTHOR)
                    .map(([author, a]) => ({ author, mean: a.sum / a.count, count: a.count }))
                    .sort((a, b) => a.mean - b.mean),
            }));
        const bestDays  = [...dayEntries].sort((a, b) => b.mean - a.mean).slice(0, 3);
        const worstDays = [...dayEntries].sort((a, b) => a.mean - b.mean).slice(0, 3);
        const afterAuthor = Object.fromEntries(
            Object.entries(afterAgg)
                .filter(([, v]) => v.count >= MIN_AFTER_SAMPLES)
                .map(([a, v]) => [a, { mean: v.sum / v.count, count: v.count }]),
        );
        return { monthly, monthlyPerPerson, sentimentHourly, bestDays, worstDays, afterAuthor };
    }

    return { addEvent, finalize };
}

export function buildResult(authors, categorical, polarity, reactionStats, aggregates, meta) {
    const entries = authors.map(author => {
        const cat = categorical[author] ?? {};
        const pol = polarity[author] ?? { pos: 0, neg: 0, strongPos: 0, strongNeg: 0, count: 0, sarcasmHits: 0, mean: 0, stdDev: 0, intensity: 0 };
        const rx  = reactionStats[author] ?? { sent: { sum: 0, count: 0 }, received: { sum: 0, count: 0 } };
        return {
            author,
            pos:          Math.round(pol.pos * 10) / 10,
            neg:          Math.round(pol.neg * 10) / 10,
            strongPos:    pol.strongPos,
            strongNeg:    pol.strongNeg,
            sampled:      pol.count,
            sarcasmHits:  pol.sarcasmHits,
            intensity:    Math.round(pol.intensity * 100) / 100,
            stdDev:       Math.round(pol.stdDev * 100) / 100,
            compliment:   cat.compliment ?? 0,
            insult:       cat.insult ?? 0,
            words:        cat.words ?? 0,
            rate:         pol.mean,
            reactionsSent:        rx.sent.count,
            reactionsSentMean:    rx.sent.count     > 0 ? rx.sent.sum     / rx.sent.count     : 0,
            reactionsReceived:    rx.received.count,
            reactionsReceivedMean:rx.received.count > 0 ? rx.received.sum / rx.received.count : 0,
        };
    });

    const ranked = (key, dir, requireSamples) => [...entries]
        .filter(e => !requireSamples || e.sampled > 0)
        .sort((a, b) => dir * (b[key] - a[key]))[0] ?? null;

    const stableCandidates = entries.filter(e => e.sampled >= MIN_STABLE_SAMPLES);
    const mostVolatile = stableCandidates.length > 0 ? [...stableCandidates].sort((a, b) => b.stdDev - a.stdDev)[0] : null;
    const mostStable   = stableCandidates.length > 1 ? [...stableCandidates].sort((a, b) => a.stdDev - b.stdDev)[0] : null;

    const reactionRanked = entries.filter(e => e.reactionsReceived >= 5);
    const mostBeloved = reactionRanked.length > 1
        ? [...reactionRanked].sort((a, b) => b.reactionsReceivedMean - a.reactionsReceivedMean)[0]
        : null;
    const reactorRanked = entries.filter(e => e.reactionsSent >= 5);
    const mostExpressive = reactorRanked.length > 0
        ? [...reactorRanked].sort((a, b) => b.reactionsSent - a.reactionsSent)[0]
        : null;

    return {
        mlEnabled:  meta.mlEnabled,
        device:     meta.device,
        ironyModel: !!meta.ironyModel,
        perPerson: entries,
        sweetest:     ranked('compliment', 1, false),
        sharpest:     ranked('insult', 1, false),
        mostPositive: ranked('rate', 1, true),
        mostNegative: ranked('rate', -1, true),
        mostIntense:  ranked('intensity', 1, true),
        mostVolatile,
        mostStable,
        mostBeloved,
        mostExpressive,
        monthly:          aggregates.monthly          ?? {},
        monthlyPerPerson: aggregates.monthlyPerPerson ?? {},
        sentimentHourly:  aggregates.sentimentHourly  ?? new Array(24).fill(null),
        bestDays:         aggregates.bestDays          ?? [],
        worstDays:        aggregates.worstDays         ?? [],
        afterAuthor:      aggregates.afterAuthor       ?? {},
    };
}
