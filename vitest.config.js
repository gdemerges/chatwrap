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
    },
});
