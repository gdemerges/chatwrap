export const SENTIMENT_MODEL = 'Xenova/distilbert-base-multilingual-cased-sentiments-student';
export const IRONY_MODEL = 'Xenova/twitter-roberta-base-irony';

// Hub commits the models are pinned to. Without a revision, transformers.js
// follows `main`: a push to either repo would silently change every score.
// Bump deliberately, after checking the labels still map in polarityFromScores.
export const SENTIMENT_REVISION = '9d9ac661fd7b0b48535a1fc99b20ae6947629e65';
export const IRONY_REVISION = '170664e4f255671a688efb6095771566bf318b0c';

export const SAMPLE_PER_AUTHOR_GPU = 250;
export const SAMPLE_PER_AUTHOR_CPU = 60;
export const MAX_TOTAL_GPU = 2000;
export const MAX_TOTAL_CPU = 400;
export const MIN_CHARS = 8;
export const MAX_CHARS = 400;
export const BATCH_GPU = 32;
export const BATCH_CPU = 8;
export const STRONG = 0.4;
export const IRONY_FLIP_WEIGHT = 0.7;
export const MIN_DAY_SAMPLES = 3;
export const MIN_DAY_PER_AUTHOR = 2;
export const MIN_AFTER_SAMPLES = 5;
export const MIN_STABLE_SAMPLES = 30;

// Emoji reactions as a strong, full-coverage sentiment signal.
// Polarity in [-1, +1]. Only listed emojis contribute; unknown ones are ignored.
export const EMOJI_POLARITY = {
    '❤️': 1, '❤': 1, '🧡': 1, '💛': 1, '💚': 1, '💙': 1, '💜': 1, '🤍': 0.9, '🤎': 0.9,
    '💖': 1, '💗': 1, '💓': 1, '💞': 1, '💕': 1, '💝': 1, '💘': 1, '😍': 1, '🥰': 1,
    '😘': 0.9, '😻': 1, '🌹': 0.8, '🌸': 0.7, '✨': 0.7, '🌟': 0.8, '⭐': 0.7,
    '🎉': 0.9, '🎊': 0.9, '🥳': 0.9, '🔥': 0.6, '💯': 0.8, '🙌': 0.7, '👏': 0.7,
    '👍': 0.6, '👌': 0.6, '✅': 0.5, '💪': 0.6, '🤝': 0.5, '🤗': 0.8,
    '😂': 0.7, '🤣': 0.7, '😆': 0.7, '😄': 0.7, '😃': 0.6, '😁': 0.6, '😊': 0.7, '🙂': 0.4,
    '😮': 0, '😯': 0, '😲': 0, '🤔': 0, '🤨': -0.1, '😐': 0, '😑': -0.1,
    '🙄': -0.4, '😒': -0.5, '😕': -0.4, '😟': -0.5, '😔': -0.6, '😞': -0.6,
    '😢': -0.7, '😭': -0.8, '😿': -0.7, '💔': -0.9,
    '😡': -1, '😠': -0.9, '🤬': -1, '👎': -0.7, '❌': -0.5, '🤮': -0.8, '🤢': -0.7,
};

export const SARCASM_PATTERNS = [
    /\bouais bien s[uû]rs?\b/i,
    /\bouais c['e ]?est [çc]a\b/i,
    /\bmais bien s[uû]r\b/i,
    /\bcomme par hasard\b/i,
    /\bbravo champion\b/i,
    /\/s(\b|$)/,
    /\bquelle surprise\b/i,
];
export const SARCASM_EMOJIS = ['🙄', '😒', '🤡', '🥲'];

export function lexicalSarcasm(text) {
    for (const re of SARCASM_PATTERNS) if (re.test(text)) return true;
    for (const e of SARCASM_EMOJIS) if (text.includes(e)) return true;
    return false;
}
