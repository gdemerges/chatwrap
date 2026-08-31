/**
 * Interface multilingue.
 *
 * Le parseur lit des exports en sept langues depuis toujours ; l'interface,
 * elle, était en français en dur. Quelqu'un pouvait donc charger un export
 * anglais, obtenir des statistiques parfaitement calculées, et ne rien
 * comprendre à ce qu'il lisait.
 *
 * Le dictionnaire est **chargé statiquement** : les slides appellent `t()` au
 * moment où elles se construisent, donc la langue doit être connue de façon
 * synchrone, avant le premier rendu. Deux dictionnaires pèsent quelques kilo-
 * octets — moins que le coût d'un chargement asynchrone à orchestrer.
 *
 * Ajouter une langue = ajouter un fichier dans `js/lang/ui/`, l'importer ici,
 * et l'inscrire dans `LOCALES`. Le test `tests/i18n.test.js` vérifie que tout
 * dictionnaire couvre exactement les mêmes clés que le français.
 */

import { fr } from './lang/ui/fr.js';
import { en } from './lang/ui/en.js';
import { es } from './lang/ui/es.js';
import { de } from './lang/ui/de.js';
import { pt } from './lang/ui/pt.js';
import { it } from './lang/ui/it.js';
import { nl } from './lang/ui/nl.js';

const STORAGE_KEY = 'ww-locale';

/** Le français fait référence : c'est la langue dans laquelle les clés naissent. */
export const FALLBACK = 'fr';

export const LOCALES = {
    fr: { code: 'fr', label: 'Français', dict: fr },
    en: { code: 'en', label: 'English', dict: en },
    es: { code: 'es', label: 'Español', dict: es },
    de: { code: 'de', label: 'Deutsch', dict: de },
    pt: { code: 'pt', label: 'Português', dict: pt },
    it: { code: 'it', label: 'Italiano', dict: it },
    nl: { code: 'nl', label: 'Nederlands', dict: nl },
};

/** @type {string} */
let current = FALLBACK;
/** @type {(code: string) => void} */
const listeners = new Set();

/**
 * Choisit la langue : préférence enregistrée, sinon celle du navigateur,
 * sinon le repli. `navigator.languages` est parcouru dans l'ordre pour qu'un
 * navigateur configuré en `de, en, fr` obtienne l'anglais plutôt que le
 * français.
 */
function detect() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && LOCALES[saved]) return saved;
    } catch { /* stockage indisponible : on continue */ }

    const candidates = typeof navigator !== 'undefined'
        ? (navigator.languages?.length ? navigator.languages : [navigator.language])
        : [];
    for (const tag of candidates) {
        const base = String(tag || '').toLowerCase().split('-')[0];
        if (LOCALES[base]) return base;
    }
    return FALLBACK;
}

/** À appeler une fois au démarrage, avant tout rendu. */
export function initLocale() {
    current = detect();
    reflect();
    return current;
}

export function getLocale() { return current; }

/** Le tag BCP-47 à passer à `Intl`. */
export function intlLocale() { return LOCALES[current]?.code || FALLBACK; }

/**
 * Change la langue et prévient les abonnés. Sans effet si la langue est
 * inconnue ou déjà active — un rendu complet n'est jamais gratuit.
 */
export function setLocale(code) {
    if (!LOCALES[code] || code === current) return false;
    current = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* peu importe */ }
    reflect();
    for (const fn of listeners) fn(code);
    return true;
}

/** @param {(code: string) => void} fn */
export function onLocaleChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function reflect() {
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.lang = current;
    }
}

/** Descend un chemin pointé dans un objet. */
function lookup(dict, path) {
    let node = dict;
    for (const part of path.split('.')) {
        if (node == null || typeof node !== 'object') return undefined;
        node = node[part];
    }
    return node;
}

/**
 * Traduit une clé.
 *
 * Les paramètres sont interpolés sur `{nom}`. Une valeur peut être une chaîne,
 * ou un objet de formes plurielles (`{ one, other }`) sélectionné par
 * `params.count` via `Intl.PluralRules` — ce dont l'anglais a besoin autant que
 * le français, et que le russe ou le polonais réclameront tels quels.
 *
 * Une clé absente du dictionnaire courant retombe sur le français, puis sur la
 * clé elle-même : une traduction manquante dégrade l'affichage, elle ne le
 * casse pas.
 *
 * @param {string} key
 * @param {Record<string, any>} [params]
 * @returns {string}
 */
export function t(key, params = {}) {
    let value = lookup(LOCALES[current]?.dict, key);
    if (value === undefined && current !== FALLBACK) value = lookup(LOCALES[FALLBACK].dict, key);
    if (value === undefined) return key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const rule = new Intl.PluralRules(intlLocale()).select(Number(params.count) || 0);
        value = value[rule] ?? value.other ?? Object.values(value)[0];
    }
    return interpolate(String(value), params);
}

/** Une entrée de dictionnaire qui est une liste (les jours de la semaine). */
export function tList(key) {
    const value = lookup(LOCALES[current]?.dict, key) ?? lookup(LOCALES[FALLBACK].dict, key);
    return Array.isArray(value) ? value : [];
}

function interpolate(str, params) {
    if (!str.includes('{')) return str;
    return str.replace(/\{(\w+)\}/g, (whole, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole);
}

/**
 * Traduit le HTML statique.
 *
 *   data-i18n="app.title"              → textContent
 *   data-i18n-html="app.rich"          → innerHTML (pour les <strong> internes)
 *   data-i18n-attr="aria-label:a.b; title:a.c"
 *
 * Appelée au démarrage et à chaque changement de langue.
 *
 * @param {ParentNode} [root]
 */
export function applyStaticI18n(root = document) {
    for (const el of root.querySelectorAll('[data-i18n]')) {
        el.textContent = t(el.getAttribute('data-i18n'));
    }
    for (const el of root.querySelectorAll('[data-i18n-html]')) {
        el.innerHTML = t(el.getAttribute('data-i18n-html'));
    }
    for (const el of root.querySelectorAll('[data-i18n-attr]')) {
        for (const pair of el.getAttribute('data-i18n-attr').split(';')) {
            const [attr, key] = pair.split(':').map(s => s.trim());
            if (attr && key) el.setAttribute(attr, t(key));
        }
    }
}
