/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { applyInlineStyles, watchInlineStyles } from '../js/ui/inline-style.js';

afterEach(() => { document.body.innerHTML = ''; });

describe('applyInlineStyles', () => {
    it('moves data-css onto the element style and drops the attribute', () => {
        document.body.innerHTML = '<div id="a" data-css="color: red; --fill: 40%"></div>';
        applyInlineStyles();
        const el = document.getElementById('a');
        expect(el.style.color).toBe('red');
        expect(el.style.getPropertyValue('--fill')).toBe('40%');
        expect(el.hasAttribute('data-css')).toBe(false);
    });

    it('keeps styles already set from script', () => {
        document.body.innerHTML = '<div id="a" data-css="color: red"></div>';
        const el = document.getElementById('a');
        el.style.opacity = '0.5';
        applyInlineStyles();
        expect(el.style.opacity).toBe('0.5');
        expect(el.style.color).toBe('red');
    });

    it('handles the root itself', () => {
        const el = document.createElement('p');
        el.setAttribute('data-css', 'margin-top: 2px');
        applyInlineStyles(el);
        expect(el.style.marginTop).toBe('2px');
    });
});

describe('watchInlineStyles', () => {
    it('styles nodes inserted later, before the next task', async () => {
        const stop = watchInlineStyles();
        document.body.innerHTML = '<ul><li data-css="border-color: blue"></li></ul>';
        await Promise.resolve();
        expect(document.querySelector('li').style.borderColor).toBe('blue');
        stop();
    });

    it('stops when asked', async () => {
        const stop = watchInlineStyles();
        stop();
        document.body.innerHTML = '<i data-css="color: red"></i>';
        await Promise.resolve();
        expect(document.querySelector('i').hasAttribute('data-css')).toBe(true);
    });
});
