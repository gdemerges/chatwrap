import { describe, it, expect } from 'vitest';
import {
    detectLanguage, stopwordsFor, WORD_CHARS_RE, SUPPORTED_LANGS,
} from '../js/lang/stopwords.js';

const words = (s) => s.match(WORD_CHARS_RE) || [];

describe('WORD_CHARS_RE', () => {
    it('keeps accented words whole in every supported alphabet', () => {
        expect(words('años')).toEqual(['años']);
        expect(words('coração')).toEqual(['coração']);
        expect(words('straße')).toEqual(['straße']);
        expect(words('perché')).toEqual(['perché']);
        expect(words('gëzuar')).toEqual(['gëzuar']);
    });

    it('still splits on punctuation and digits', () => {
        expect(words('salut, ça va ? 42 fois')).toEqual(['salut', 'ça', 'va', 'fois']);
    });

    it('keeps apostrophes inside a word', () => {
        expect(words("l'ami don't")).toEqual(["l'ami", "don't"]);
    });

    it('is reusable — a global regex must not carry lastIndex between calls', () => {
        expect(words('hola')).toEqual(['hola']);
        expect(words('hola')).toEqual(['hola']);
    });
});

describe('detectLanguage', () => {
    const samples = {
        fr: 'je ne sais pas mais je suis avec toi pour tout ça',
        en: 'the quick brown fox and that was with you should have',
        es: 'que no me digas eso pero bueno vale con todo esto',
        de: 'ich bin nicht mit dir und das ist auch gut so',
        pt: 'eu nao sei mas voce esta com tudo isso para nos',
        it: 'che cosa non lo so ma sono con te per tutto questo',
        nl: 'ik weet het niet maar ik ben met jou voor alles',
    };

    for (const [lang, text] of Object.entries(samples)) {
        it(`detects ${lang}`, () => expect(detectLanguage(text)).toBe(lang));
    }

    it('falls back to French on an unscoreable sample', () => {
        expect(detectLanguage('🎉 🎉 🎉 12345')).toBe('fr');
    });

    it('only ever returns a supported language', () => {
        expect(SUPPORTED_LANGS).toContain(detectLanguage('zzz qqq'));
    });
});

describe('stopwordsFor', () => {
    it('mixes English into every language, since chats borrow it constantly', () => {
        for (const lang of SUPPORTED_LANGS) {
            expect(stopwordsFor(lang).has('the')).toBe(true);
        }
    });

    it('does not strip a language\'s own words as another language\'s stopwords', () => {
        // 'come' is an Italian stopword but an ordinary English verb; 'son'
        // and 'car' are French stopwords but ordinary English nouns.
        const en = stopwordsFor('en');
        expect(en.has('come')).toBe(false);
        expect(en.has('son')).toBe(false);
        expect(en.has('car')).toBe(false);
    });

    it('strips the detected language', () => {
        expect(stopwordsFor('es').has('que')).toBe(true);
        expect(stopwordsFor('de').has('nicht')).toBe(true);
        expect(stopwordsFor('nl').has('het')).toBe(true);
    });

    it('always strips WhatsApp media noise', () => {
        expect(stopwordsFor('pt').has('imagem')).toBe(true);
        expect(stopwordsFor('fr').has('médias')).toBe(true);
    });

    it('falls back to French for an unknown language', () => {
        expect(stopwordsFor('xx').has('mais')).toBe(true);
    });
});
