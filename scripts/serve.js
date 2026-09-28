/**
 * A dependency-free static server for the e2e suite.
 *
 * The repo root *is* the site, so this only has to map URLs to files and get
 * the MIME types right — module scripts are refused unless they are served as
 * JavaScript. Written in Node so the suite runs anywhere Node does: the
 * previous `python3 -m http.server` did not exist on a stock Windows box.
 *
 *   node scripts/serve.js [port]
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2]) || 8000;

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (path.endsWith('/')) path += 'index.html';
        const file = normalize(join(root, path));
        // Never serve outside the repo, and never serve dependencies or git data.
        if (!file.startsWith(root + sep) || /[\/](node_modules|\.git)[\/]/.test(file)) {
            res.writeHead(403).end('Forbidden');
            return;
        }
        const body = await readFile(file);
        res.writeHead(200, {
            'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
            'Cache-Control': 'no-store',
        }).end(body);
    } catch {
        res.writeHead(404).end('Not found');
    }
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}`));
