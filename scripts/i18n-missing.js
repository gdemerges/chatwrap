/**
 * Lists, per language, what still separates it from the French reference:
 * missing keys, extra keys, and `{parameters}` lost or invented in translation.
 *
 *   npm run i18n:missing            every language
 *   npm run i18n:missing -- de tr   only these
 *
 * Exits 1 when anything is off, so it can also gate a translation PR.
 * `tests/i18n.test.js` enforces the same rules; this is the readable version.
 */
import { LOCALES, FALLBACK } from '../js/i18n.js';

function flatten(obj, prefix = '', out = {}) {
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object') flatten(v, key, out);
        else out[key] = String(v);
    }
    return out;
}

const params = (s) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort();

const ref = flatten(LOCALES[FALLBACK].dict);
const wanted = process.argv.slice(2);
const codes = Object.keys(LOCALES).filter((c) => c !== FALLBACK && (!wanted.length || wanted.includes(c)));

let problems = 0;
for (const code of codes) {
    const dict = flatten(LOCALES[code].dict);
    const missing = Object.keys(ref).filter((k) => !(k in dict));
    const extra = Object.keys(dict).filter((k) => !(k in ref));
    const drift = Object.keys(ref)
        .filter((k) => k in dict && params(ref[k]).join() !== params(dict[k]).join())
        .map((k) => `${k}  ${params(ref[k]).join(' ')} → ${params(dict[k]).join(' ') || '∅'}`);

    const n = missing.length + extra.length + drift.length;
    problems += n;
    console.log(`${n ? '✗' : '✓'} ${code} (${LOCALES[code].label})${n ? ` — ${n} issue(s)` : ''}`);
    for (const k of missing) console.log(`    missing  ${k}`);
    for (const k of extra) console.log(`    extra    ${k}`);
    for (const d of drift) console.log(`    params   ${d}`);
}
process.exit(problems ? 1 : 0);
