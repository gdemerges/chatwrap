/**
 * End-to-end config.
 *
 * The unit suite runs under jsdom, which has neither a Web Worker nor a real
 * canvas — the two pieces this project leans on hardest. Everything from the
 * file landing in the worker to Chart.js painting pixels is therefore only
 * ever exercised here, in an actual browser.
 *
 * The server is the same one the README tells a contributor to run: there is
 * no build step, so the repo root *is* the site.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 8123;

export default defineConfig({
    testDir: './e2e',
    // The demo analysis runs a real worker over a generated conversation;
    // 30s is generous on CI and still catches a genuine hang.
    timeout: 30_000,
    expect: { timeout: 10_000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        trace: 'on-first-retry',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
    webServer: {
        command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
        url: `http://127.0.0.1:${PORT}/index.html`,
        reuseExistingServer: !process.env.CI,
        stdout: 'ignore',
    },
});
