// Categorical lexicons used for compliment/insult counters.
// Polarity scoring is handled by the ML model in js/worker/sentiment-ml.js.

export const COMPLIMENT = new Set([
    'merci', 'bravo', 'felicitations', 'félicitations', 'respect', 'champion', 'championne',
    'genius', 'génie', 'talented', 'talentueux', 'talentueuse', 'fort', 'forte', 'puissant',
    'puissante', 'intelligent', 'intelligente', 'doué', 'douée', 'incroyable',
    'thanks', 'thank', 'proud', 'fier', 'fière', 'grateful', 'awesome',
    'magnifique', 'adorable', 'parfait', 'parfaite',
]);

export const INSULT = new Set([
    'con', 'conne', 'connard', 'connasse', 'debile', 'débile', 'idiot', 'idiote',
    'bête', 'bete', 'nul', 'nulle', 'moche', 'relou', 'chiant', 'chiante',
    'merde', 'putain', 'ptn', 'salope', 'batard', 'bâtard', 'enculé', 'enculee',
    'stupid', 'dumb', 'ugly', 'shit', 'fuck', 'fucking', 'asshole',
    'bitch', 'damn', 'crap',
]);
