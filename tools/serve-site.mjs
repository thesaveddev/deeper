/**
 * Minimal static file server for previewing site/ locally.
 *
 * The preview panel serves a single registered HTML file from its own root, so
 * every relative path (styles.css, assets/icon.png) 404s and the page renders
 * unstyled. This serves the directory properly so a browser check is real.
 *
 * Run: node tools/serve-site.mjs [port]
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PORT = Number(process.argv[2] ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  // sitemap.xml and robots.txt are served as text/xml and text/plain on a real
  // host, and a crawler rejects a sitemap that arrives as octet-stream. Serving
  // them wrong locally is how a broken MIME type reaches production.
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // Resolve inside ROOT only. A path that escapes it is a 403, not a read.
    const rel = decodeURIComponent(url.pathname) === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`site/ served on http://localhost:${PORT}`));
