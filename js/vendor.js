/**
 * Lazy loaders for the pinned CDN dependencies.
 *
 * None of these are needed to paint the upload screen: Chart.js only matters
 * once a chart slide is reached, LZ-String only when a share link is built or
 * read, JSZip only for a .zip import. Loading them eagerly cost every visitor
 * ~250 KB before they had even picked a file.
 */

import { t } from './i18n.js';

const SRI = {
    chart: {
        src: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
        integrity: 'sha384-vsrfeLOOY6KuIYKDlmVH5UiBmgIdB1oEf7p01YgWHuqmOHfZr374+odEv96n9tNC',
        global: 'Chart',
        label: 'Chart.js',
    },
    lzstring: {
        src: 'https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js',
        integrity: 'sha384-0d+Gr7vM4Drod8E3hXKgciWJSWbjD/opKLLygI9ktiWbuvlDwQLzU46wJ9s5gsp7',
        global: 'LZString',
        label: 'LZ-String',
    },
    jszip: {
        src: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
        integrity: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG',
        global: 'JSZip',
        label: 'JSZip',
    },
};

/** @type {Record<string, Promise<void>>} */
const pending = {};

function load(key) {
    const dep = SRI[key];
    if (window[dep.global]) return Promise.resolve();
    if (pending[key]) return pending[key];

    pending[key] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = dep.src;
        s.integrity = dep.integrity;
        s.crossOrigin = 'anonymous';
        s.onload = () => resolve();
        s.onerror = () => {
            delete pending[key]; // allow a retry on the next call
            reject(Object.assign(new Error(t('error.vendorLoad', { lib: dep.label })), { code: 'vendorLoad' }));
        };
        document.head.appendChild(s);
    });
    return pending[key];
}

export const ensureChart = () => load('chart');
export const ensureLZString = () => load('lzstring');
export const ensureJSZip = () => load('jszip');

/**
 * Warm the cache for a dependency that is *likely* needed soon, without
 * blocking. Failures are ignored — the real `ensure*` call will surface them.
 */
export function preload(key) {
    load(key).catch(() => {});
}
