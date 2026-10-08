/**
 * Vitest owns `tests/`; Playwright owns `e2e/`.
 *
 * Vitest's default glob picks up `**\/*.spec.js` too, so it collected the
 * Playwright spec and failed on `test()` being called outside a Playwright
 * runner — a confusing error for a file that was never its business. The two
 * suites are split by directory, and this says so.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        exclude: ['node_modules', 'e2e'],
        // `isolate: false` was tried: under a second saved, inside the noise,
        // and a module loaded by one file leaked past another file's `vi.mock`.
        // Isolation stays on.
        coverage: {
            provider: 'v8',
            // Ratchet: thresholds only go up. Raise them when coverage rises;
            // never lower them.
            thresholds: {
                statements: 80,
                branches: 69,
                functions: 81,
                lines: 82,
            },
        },
    },
});
