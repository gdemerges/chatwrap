import { THEME } from './_constants.js';
import { overviewSlide, comparisonSlide, wordsTrendSlide, recapSlide } from './overview.js';
import { topMessagersSlide, pieSlide, evolutionPerPersonSlide, messageLengthSlide, initiatorSlide } from './ranking.js';
import { monthlySlide, heatmapSlide, hourlyWeekdaySlide } from './time.js';
import { topWordsSlide, uniqueWordsSlide } from './words.js';
import { emojiSlide, reactionsSlide, emojisPerPersonSlide } from './emojis.js';
import { mediaSlide } from './media.js';
import { linksSlide } from './links.js';
import { ghostingSlide, compatibilitySlide, funFactsSlide } from './relationships.js';
import { ambianceSlide, sentimentTimelineSlide, moodHourlySlide, momentsSlide, influenceSlide } from './sentiment.js';
import { duoBoardSlide, duoWordsSlide } from './duo.js';
import { chaptersSlide } from './chapters.js';
import { interactionsSlide } from './network.js';
import { profilesSlide } from './profiles.js';
import { versusSlide } from './versus.js';

/**
 * Build the deck, in narrative order: what this conversation is → its phases →
 * the people → their rhythms → their words → what they share → how it feels →
 * the wrap-up. Builders returning null (not enough data) drop out silently.
 *
 * @param {import('../types.d.ts').Stats} stats
 * @param {import('../types.d.ts').YearComparison | null} [comparison]
 * @param {{ versus: any, pinnedName: string, currentName: string } | null} [versus]
 *   A second conversation to compare against — see `js/compare.js`. It sits
 *   right after the year comparison because it answers the same question with
 *   a different baseline.
 * @returns {import('../types.d.ts').Slide[]}
 */
export function generateSlides(stats, comparison = null, versus = null) {
    const builders = [
        () => overviewSlide(stats, THEME.intro),
        () => chaptersSlide(stats, THEME.story),
        () => comparisonSlide(comparison, THEME.story),
        () => (versus ? versusSlide(versus.versus, versus.pinnedName, versus.currentName, THEME.story) : null),

        () => topMessagersSlide(stats, THEME.people),
        () => duoBoardSlide(stats, THEME.people),
        () => pieSlide(stats, THEME.people),
        () => profilesSlide(stats, THEME.people),
        () => interactionsSlide(stats, THEME.people),

        () => monthlySlide(stats, THEME.time),
        () => evolutionPerPersonSlide(stats, THEME.time),
        () => heatmapSlide(stats, THEME.time),
        () => hourlyWeekdaySlide(stats, THEME.time),

        () => topWordsSlide(stats, THEME.words),
        () => wordsTrendSlide(comparison, THEME.words),
        () => uniqueWordsSlide(stats, THEME.words),
        () => duoWordsSlide(stats, THEME.words),
        () => messageLengthSlide(stats, THEME.words),

        () => emojiSlide(stats, THEME.emojis),
        () => reactionsSlide(stats, THEME.emojis),
        () => emojisPerPersonSlide(stats, THEME.emojis),

        () => mediaSlide(stats, THEME.media),
        () => linksSlide(stats, THEME.media),

        () => initiatorSlide(stats, THEME.relations),
        () => ghostingSlide(stats, THEME.relations),

        () => ambianceSlide(stats, THEME.mood),
        () => sentimentTimelineSlide(stats, THEME.mood),
        () => moodHourlySlide(stats, THEME.mood),
        () => momentsSlide(stats, THEME.mood),
        () => influenceSlide(stats, THEME.mood),

        () => compatibilitySlide(stats, THEME.fun),
        () => funFactsSlide(stats, THEME.fun),
        () => recapSlide(stats, THEME.outro),
    ];

    const slides = [];
    for (const build of builders) {
        const s = build();
        if (s) slides.push(s);
    }
    return slides;
}
