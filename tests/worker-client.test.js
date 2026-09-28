/**
 * The page's side of the worker protocol, against a fake worker — jsdom has no
 * `Worker`, which is why none of this was tested while it lived in `app.js`.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWorkerClient, CANCELLED } from '../js/worker-client.js';
import { setLocale, t } from '../js/i18n.js';

/** Just enough Worker: an EventTarget that records what it was sent. */
class FakeWorker extends EventTarget {
    constructor() { super(); this.sent = []; this.terminated = false; }
    postMessage(msg, transfer) { this.sent.push({ msg, transfer }); }
    terminate() { this.terminated = true; }
    reply(data) { this.dispatchEvent(Object.assign(new Event('message'), { data })); }
    crash(message) { this.dispatchEvent(Object.assign(new Event('error'), { message })); }
}

let workers;
let progress;
let client;
beforeEach(() => {
    setLocale('fr');
    workers = [];
    progress = [];
    client = createWorkerClient({
        spawn: () => { const w = new FakeWorker(); workers.push(w); return w; },
        onProgress: (text) => progress.push(text),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('createWorkerClient', () => {
    it('spawns lazily, once, and reuses the worker', () => {
        expect(workers).toHaveLength(0);
        client.call({ kind: 'a' });
        client.call({ kind: 'b' });
        expect(workers).toHaveLength(1);
    });

    it('posts the message with its transfer list', () => {
        const buf = new ArrayBuffer(4);
        client.call({ kind: 'load' }, [buf]);
        expect(workers[0].sent[0]).toEqual({ msg: { kind: 'load' }, transfer: [buf] });
    });

    it('resolves with the first non-progress message', async () => {
        const p = client.call({ kind: 'stats' });
        workers[0].reply({ kind: 'done', value: 42 });
        await expect(p).resolves.toEqual({ kind: 'done', value: 42 });
    });

    it('words progress in the visitor\'s language, without settling', async () => {
        const p = client.call({ kind: 'load' });
        workers[0].reply({ kind: 'progress', code: 'computing' });
        expect(progress).toEqual([t('loading.computing')]);
        workers[0].reply({ kind: 'done' });
        await p;
    });

    it('passes progress params through to the translation', async () => {
        const p = client.call({ kind: 'load' });
        workers[0].reply({ kind: 'progress', code: 'unzippingPct', params: { pct: 40 } });
        expect(progress[0]).toBe(t('loading.unzippingPct', { pct: 40 }));
        workers[0].reply({ kind: 'done' });
        await p;
    });

    it('turns a coded worker error into a translated message, keeping diagnostics', async () => {
        const p = client.call({ kind: 'load' });
        workers[0].reply({ kind: 'error', code: 'tooFewMessages', diagnostics: { matched: 0 } });
        await expect(p).rejects.toMatchObject({
            message: t('error.tooFewMessages'),
            diagnostics: { matched: 0 },
        });
        expect(console.error).not.toHaveBeenCalled();
    });

    it('an uncoded error is a bug: generic text for the user, raw text to the console', async () => {
        const p = client.call({ kind: 'load' });
        workers[0].reply({ kind: 'error', message: 'TypeError: x is undefined' });
        await expect(p).rejects.toThrow(t('error.computeFailed'));
        expect(console.error).toHaveBeenCalledWith('[worker]', 'TypeError: x is undefined');
    });

    it('a worker crash rejects with the generic message', async () => {
        const p = client.call({ kind: 'load' });
        workers[0].crash('script error');
        await expect(p).rejects.toThrow(t('error.computeFailed'));
    });

    it('stops listening once settled, so a late message cannot reach a later call', async () => {
        const first = client.call({ kind: 'one' });
        workers[0].reply({ kind: 'done', n: 1 });
        await first;
        const second = client.call({ kind: 'two' });
        workers[0].reply({ kind: 'done', n: 2 });
        await expect(second).resolves.toEqual({ kind: 'done', n: 2 });
    });

    it('cancel terminates the worker and rejects the call in flight with CANCELLED', async () => {
        const p = client.call({ kind: 'load' });
        client.cancel('Annulé');
        expect(workers[0].terminated).toBe(true);
        await expect(p).rejects.toMatchObject({ code: CANCELLED, message: 'Annulé' });
    });

    it('the next call after a cancel gets a fresh worker', () => {
        client.call({ kind: 'a' }).catch(() => {});
        client.cancel('x');
        client.call({ kind: 'b' });
        expect(workers).toHaveLength(2);
        expect(workers[1].terminated).toBe(false);
    });

    it('cancel with nothing running is harmless', () => {
        expect(() => client.cancel('x')).not.toThrow();
        expect(workers).toHaveLength(0);
    });

    it('post is fire-and-forget', () => {
        client.post({ kind: 'reset' });
        expect(workers[0].sent[0].msg).toEqual({ kind: 'reset' });
    });
});
