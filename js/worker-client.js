/**
 * The page's end of the worker conversation.
 *
 * This used to live in `app.js` as three module variables and two functions,
 * tangled with the loading screen. What it actually does is small and
 * self-contained — one request in flight, progress streamed out, a settled
 * answer or a translated error back — and it is the part of the app most worth
 * testing, so it takes its collaborators as arguments instead of reaching for
 * `Worker` and the DOM.
 */
import { t } from './i18n.js';

/** Marks the one error the callers are expected to swallow silently. */
export const CANCELLED = 'cancelled';

/**
 * @param {{ spawn: () => Worker, onProgress: (text: string) => void }} deps
 *   `spawn` builds a fresh worker; `onProgress` receives already-worded text.
 */
export function createWorkerClient({ spawn, onProgress }) {
    let worker = null;
    /** Rejects the call in flight, so `cancel` can unblock the caller. */
    let abortInFlight = null;

    const get = () => (worker ??= spawn());

    return {
        /**
         * One request/response round-trip. Progress messages are streamed to
         * `onProgress`; the first non-progress message settles the promise.
         */
        call(message, transfer = []) {
            return new Promise((resolve, reject) => {
                const w = get();
                abortInFlight = reject;
                const settle = () => {
                    w.removeEventListener('message', onMessage);
                    w.removeEventListener('error', onError);
                    abortInFlight = null;
                };
                const onMessage = (e) => {
                    if (e.data.kind === 'progress') {
                        // The worker names the step; the wording is chosen
                        // here, in the language the visitor picked.
                        onProgress(t(`loading.${e.data.code}`, e.data.params || {}));
                        return;
                    }
                    settle();
                    if (e.data.kind === 'error') {
                        // The worker names the failure; the page words it. An
                        // uncoded error is a bug, not a user mistake: its raw
                        // text goes to the console only.
                        if (!e.data.code) console.error('[worker]', e.data.message);
                        const err = new Error(t(e.data.code ? `error.${e.data.code}` : 'error.computeFailed'));
                        err.diagnostics = e.data.diagnostics;
                        reject(err);
                    } else {
                        resolve(e.data);
                    }
                };
                const onError = (e) => {
                    settle();
                    console.error('[worker]', e.message);
                    reject(new Error(t('error.computeFailed')));
                };
                w.addEventListener('message', onMessage);
                w.addEventListener('error', onError);
                w.postMessage(message, transfer);
            });
        },

        /** Fire and forget — no reply is expected. */
        post(message) {
            get().postMessage(message);
        },

        /**
         * Stop whatever the worker is doing.
         *
         * There is no cooperative way out of a long parse or a 50 MB model
         * download, so the worker is killed outright; the next call builds a
         * fresh one. That also drops the retained parse.
         *
         * @param {string} reason worded text for the caller's error
         */
        cancel(reason) {
            worker?.terminate();
            worker = null;
            const reject = abortInFlight;
            abortInFlight = null;
            reject?.(Object.assign(new Error(reason), { code: CANCELLED }));
        },
    };
}
