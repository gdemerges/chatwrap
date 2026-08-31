/**
 * Stopwords by language, plus WhatsApp-specific noise tokens always excluded.
 *
 * Coverage follows `js/lang/chat-locales.js`: FR, EN, ES, DE, PT, IT, NL. The
 * parser has always read those seven; the word statistics used to score them
 * all against French, so a Spanish chat's top words were `que, de, la, y`.
 */

export const STOPWORDS_FR = new Set([
    'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'on',
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'en',
    'au', 'aux', 'ce', 'se', 'sa', 'son', 'ses', 'mon', 'ma', 'mes',
    'ton', 'ta', 'tes', 'que', 'qui', 'quoi', 'dont', 'ou', 'mais',
    'si', 'ne', 'pas', 'plus', 'par', 'pour', 'dans', 'sur', 'avec',
    'tout', 'tous', 'toute', 'toutes', 'bien', 'aussi', 'comme',
    'quand', 'alors', 'donc', 'car', 'encore', 'trop', 'fait',
    'avoir', 'etre', 'être', 'faire', 'dire', 'aller', 'voir', 'venir',
    'est', 'sont', 'suis', 'avons', 'avez', 'ont', 'ai', 'as',
    'ete', 'été', 'cette', 'ces', 'ici', 'moi', 'toi', 'lui',
    'leur', 'leurs', 'notre', 'votre', 'meme', 'même', 'autre',
    'autres', 'peu', 'rien', 'tres', 'très', 'peut', 'faut', 'chez',
    'sans', 'sous', 'vers', 'apres', 'après', 'avant', 'entre', 'contre',
    'oui', 'non', 'bon', 'bah', 'ben', 'ouais', 'ouai', 'mdr', 'lol',
    'haha', 'hehe', 'hihi', 'hmm', 'mmm', 'ah', 'eh', 'oh',
]);

export const STOPWORDS_EN = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'you', 'was',
    'are', 'not', 'but', 'have', 'has', 'had', 'from', 'they',
    'were', 'been', 'being', 'their', 'them', 'there', 'then',
    'than', 'when', 'what', 'which', 'who', 'whom', 'would', 'could',
    'should', 'will', 'into', 'about', 'over', 'under', 'your',
    'its', 'our', 'out', 'some', 'any', 'all', 'just', 'only',
    'yes', 'yeah', 'ok', 'okay', 'lol', 'haha',
]);

export const STOPWORDS_ES = new Set([
    'que', 'de', 'no', 'la', 'el', 'en', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'del', 'por', 'con', 'para', 'como', 'pero', 'más', 'mas', 'muy', 'todo', 'todos',
    'toda', 'todas', 'este', 'esta', 'esto', 'estos', 'estas', 'ese', 'esa', 'eso',
    'aquí', 'aqui', 'allí', 'alli', 'yo', 'tú', 'tu', 'él', 'ella', 'nosotros',
    'vosotros', 'ellos', 'ellas', 'usted', 'ustedes', 'mi', 'mis', 'su', 'sus',
    'nuestro', 'nuestra', 'les', 'le', 'lo', 'se', 'me', 'te', 'nos', 'os',
    'es', 'son', 'era', 'eran', 'ser', 'estar', 'está', 'esta', 'están', 'estan',
    'estoy', 'hay', 'hacer', 'hace', 'tener', 'tiene', 'tengo', 'puede', 'puedo',
    'cuando', 'donde', 'dónde', 'porque', 'entonces', 'también', 'tambien',
    'sin', 'sobre', 'entre', 'hasta', 'desde', 'antes', 'después', 'despues',
    'si', 'sí', 'ya', 'bien', 'bueno', 'nada', 'algo', 'otro', 'otra',
    'jaja', 'jajaja', 'jeje', 'vale', 'oye',
]);

export const STOPWORDS_DE = new Set([
    'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem',
    'einer', 'eines', 'und', 'oder', 'aber', 'doch', 'denn', 'weil', 'dass',
    'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mir', 'mich', 'dir', 'dich',
    'uns', 'euch', 'ihm', 'ihn', 'ihnen', 'mein', 'dein', 'sein', 'unser',
    'ist', 'sind', 'war', 'waren', 'bin', 'bist', 'sein', 'haben', 'hat',
    'hatte', 'hatten', 'habe', 'hast', 'wird', 'werden', 'wurde', 'kann',
    'können', 'konnen', 'muss', 'müssen', 'mussen', 'soll', 'will', 'nicht',
    'nur', 'noch', 'schon', 'auch', 'mehr', 'sehr', 'alle', 'alles', 'man',
    'für', 'fur', 'mit', 'von', 'vor', 'nach', 'bei', 'aus', 'auf', 'über',
    'uber', 'unter', 'ohne', 'gegen', 'durch', 'zum', 'zur', 'als', 'wie',
    'was', 'wer', 'wann', 'wo', 'warum', 'dann', 'hier', 'dort', 'jetzt',
    'immer', 'wieder', 'ja', 'nein', 'gut', 'okay', 'echt',
]);

export const STOPWORDS_PT = new Set([
    'que', 'de', 'da', 'do', 'das', 'dos', 'não', 'nao', 'uma', 'um', 'umas', 'uns',
    'para', 'com', 'como', 'mas', 'mais', 'muito', 'tudo', 'todo', 'toda', 'todos',
    'todas', 'este', 'esta', 'isso', 'isto', 'esse', 'essa', 'aqui', 'ali',
    'eu', 'tu', 'você', 'voce', 'ele', 'ela', 'nós', 'nos', 'eles', 'elas',
    'meu', 'minha', 'seu', 'sua', 'nosso', 'nossa', 'lhe', 'lhes', 'me', 'te', 'se',
    'é', 'e', 'são', 'sao', 'era', 'eram', 'ser', 'estar', 'está', 'esta', 'estão',
    'estou', 'tem', 'ter', 'tenho', 'tinha', 'pode', 'posso', 'vai', 'vou',
    'quando', 'onde', 'porque', 'então', 'entao', 'também', 'tambem', 'já', 'ja',
    'sem', 'sobre', 'entre', 'até', 'ate', 'desde', 'antes', 'depois', 'por',
    'sim', 'bem', 'bom', 'nada', 'algo', 'outro', 'outra', 'pra', 'pro',
    'kkkk', 'kkk', 'haha', 'né', 'ne',
]);

export const STOPWORDS_IT = new Set([
    'che', 'di', 'da', 'del', 'della', 'dei', 'delle', 'il', 'lo', 'la', 'gli',
    'le', 'un', 'uno', 'una', 'non', 'per', 'con', 'come', 'ma', 'più', 'piu',
    'molto', 'tutto', 'tutti', 'tutta', 'tutte', 'questo', 'questa', 'quello',
    'quella', 'qui', 'qua', 'io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro',
    'mio', 'mia', 'tuo', 'tua', 'suo', 'sua', 'nostro', 'mi', 'ti', 'si', 'ci', 'vi',
    'è', 'sono', 'era', 'erano', 'essere', 'stare', 'sta', 'stanno', 'ho', 'hai',
    'ha', 'hanno', 'avere', 'avevo', 'può', 'puo', 'posso', 'fare', 'fa', 'faccio',
    'quando', 'dove', 'perché', 'perche', 'allora', 'anche', 'già', 'gia',
    'senza', 'sopra', 'sotto', 'tra', 'fra', 'fino', 'prima', 'dopo', 'nel', 'nella',
    'sì', 'si', 'no', 'bene', 'buono', 'niente', 'qualcosa', 'altro', 'altra',
    'ahah', 'ahahah', 'boh', 'dai',
]);

export const STOPWORDS_NL = new Set([
    'de', 'het', 'een', 'en', 'van', 'in', 'op', 'te', 'dat', 'die', 'dit', 'deze',
    'is', 'zijn', 'was', 'waren', 'ben', 'bent', 'heb', 'hebt', 'heeft', 'hebben',
    'had', 'hadden', 'wordt', 'worden', 'werd', 'kan', 'kunnen', 'moet', 'moeten',
    'wil', 'willen', 'zal', 'zou', 'niet', 'geen', 'wel', 'ook', 'nog', 'maar',
    'want', 'omdat', 'als', 'dan', 'toch', 'weer', 'heel', 'veel', 'meer', 'alle',
    'alles', 'ik', 'jij', 'je', 'hij', 'zij', 'ze', 'wij', 'we', 'jullie', 'u',
    'mij', 'me', 'jou', 'hem', 'haar', 'ons', 'mijn', 'jouw', 'hun', 'zich',
    'voor', 'met', 'naar', 'door', 'over', 'onder', 'zonder', 'tegen', 'bij',
    'uit', 'aan', 'om', 'tot', 'wat', 'wie', 'waar', 'wanneer', 'waarom', 'hoe',
    'ja', 'nee', 'goed', 'oke', 'even', 'hier', 'daar', 'nu',
]);

/** Noise tokens emitted by WhatsApp media/system lines, always excluded. */
export const STOPWORDS_WHATSAPP = new Set([
    'image', 'absente', 'gif', 'retire', 'retiré', 'sticker', 'omis',
    'message', 'modifie', 'modifié', 'nan', 'https', 'http', 'www',
    'medias', 'médias', 'omitted', 'omise', 'video', 'vidéo', 'audio',
    'document', 'omitted',
    // The same notices in the other six languages the parser reads.
    'imagen', 'audio', 'omitido', 'omitida', 'eliminado', 'multimedia',
    'bild', 'weggelassen', 'medien', 'entfernt', 'nachricht',
    'imagem', 'omitido', 'oculto', 'mensagem', 'apagada',
    'immagine', 'omesso', 'omessa', 'messaggio', 'eliminato',
    'afbeelding', 'weggelaten', 'bericht', 'verwijderd',
]);

/** @type {Record<string, Set<string>>} */
const BY_LANG = {
    fr: STOPWORDS_FR,
    en: STOPWORDS_EN,
    es: STOPWORDS_ES,
    de: STOPWORDS_DE,
    pt: STOPWORDS_PT,
    it: STOPWORDS_IT,
    nl: STOPWORDS_NL,
};

/** Languages the word statistics can score, in detection order. */
export const SUPPORTED_LANGS = Object.keys(BY_LANG);

/**
 * Letters that can make up a word, in every alphabet the parser may meet.
 *
 * A hand-written French range (`[a-zàâä…]`) silently cut every other language's
 * words in half — `años` became `a` + `os`, `straße` became `stra` + `e`. The
 * Unicode property escape covers all of them, and `\p{M}` keeps decomposed
 * accents attached to their base letter.
 */
export const WORD_CHARS_RE = /\p{L}[\p{L}\p{M}'’]*/gu;

/**
 * Cheap language detection by counting stopword hits per language.
 *
 * Ties go to the earlier language in `BY_LANG`, so a chat with no recognisable
 * stopwords at all still lands on French rather than on nothing.
 *
 * @param {string} sampleText
 * @returns {string} one of `SUPPORTED_LANGS`
 */
export function detectLanguage(sampleText) {
    const sample = sampleText.slice(0, 20000).toLowerCase();
    const words = sample.match(WORD_CHARS_RE) || [];

    /** @type {Record<string, number>} */
    const score = {};
    for (const lang of SUPPORTED_LANGS) score[lang] = 0;
    for (const w of words) {
        for (const lang of SUPPORTED_LANGS) {
            if (BY_LANG[lang].has(w)) score[lang]++;
        }
    }

    let best = 'fr';
    for (const lang of SUPPORTED_LANGS) {
        if (score[lang] > score[best]) best = lang;
    }
    return best;
}

/**
 * Stopwords to strip for a chat detected as `lang`.
 *
 * English is always mixed in on top of the detected language: a chat in any of
 * these seven borrows English words constantly, and `ok`/`lol`/`the` are noise
 * everywhere. The other five are *not* mixed in — doing that for all seven
 * would strip real words (`si`, `come`, `van`, `die`, `no`) from the very
 * language being analysed.
 */
export function stopwordsFor(lang) {
    const set = new Set(STOPWORDS_WHATSAPP);
    const base = BY_LANG[lang] || STOPWORDS_FR;
    for (const w of base) set.add(w);
    for (const w of STOPWORDS_EN) set.add(w);
    return set;
}
