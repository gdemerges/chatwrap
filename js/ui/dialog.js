/**
 * Modal dialog: focus trap, Escape, backdrop click, focus restoration.
 *
 * Escape resolves to `undefined` — *cancelled* — never to a default value, so
 * a picker never makes a choice on the user's behalf.
 */

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * @param {{ label: string, html: string, className?: string,
 *           onMount?: (root: HTMLElement, close: (value?: any) => void) => void }} spec
 * @returns {Promise<any>} the value passed to `close`, or undefined if cancelled
 */
export function openDialog({ label, html, className = '', onMount }) {
    return new Promise((resolve) => {
        const previouslyFocused = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = `dialog-overlay ${className}`.trim();
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', label);
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('active'));

        let settled = false;
        function close(value) {
            if (settled) return;
            settled = true;
            document.removeEventListener('keydown', onKeydown, true);
            overlay.classList.remove('active');
            overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
            setTimeout(() => overlay.remove(), 400); // in case transitions are off
            if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
            resolve(value);
        }

        function onKeydown(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                close(undefined);
                return;
            }
            if (e.key !== 'Tab') return;
            const items = [...overlay.querySelectorAll(FOCUSABLE)].filter(el => !el.hasAttribute('disabled'));
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }

        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) close(undefined);
        });
        document.addEventListener('keydown', onKeydown, true);

        onMount?.(overlay, close);
        /** @type {HTMLElement|null} */
        const initial = overlay.querySelector('[data-autofocus]') || overlay.querySelector(FOCUSABLE);
        initial?.focus();
    });
}
