// Single production server: serves the built `dist/` static frontend AND the
// /api/chart + /api/search routes (reusing the same CoinGecko+Binance logic as
// the Vite dev middleware and the Vercel functions). One process, one port —
// ideal for Coolify / any container host. Bundled to server.mjs at build time,
// so the runtime image needs no node_modules.

import { createServer, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { getChart, searchCoins } from './api/_coingecko';

const DIST = join(process.cwd(), 'dist');
const PORT = Number(process.env.PORT) || 3000;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function sendJson(res: ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  // Health probe for Coolify / load balancers — cheap, no upstream calls.
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  try {
    if (url.pathname === '/api/chart') {
      const data = await getChart(
        url.searchParams.get('id') ?? 'bitcoin',
        url.searchParams.get('range') ?? '30d',
        url.searchParams.get('sym') ?? '',
      );
      res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
      return sendJson(res, data);
    }
    if (url.pathname === '/api/search') {
      const data = await searchCoins(url.searchParams.get('q') ?? '');
      res.setHeader('Cache-Control', 's-maxage=3600');
      return sendJson(res, data);
    }
  } catch (err) {
    return sendJson(res, { error: err instanceof Error ? err.message : String(err) }, 502);
  }

  // Static files from dist/, with a guard against path traversal.
  let rel = normalize(decodeURIComponent(url.pathname));
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = join(DIST, rel);
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const info = await stat(filePath);
    const finalPath = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    const buf = await readFile(finalPath);
    res.writeHead(200, { 'Content-Type': MIME[extname(finalPath)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch {
    // SPA fallback — serve index.html for unknown paths.
    try {
      const buf = await readFile(join(DIST, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }
});

server.listen(PORT, () => console.log(`crypto-chart-racer listening on :${PORT}`));
