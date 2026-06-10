import { defineConfig } from 'vite';
import type { ServerResponse } from 'node:http';
import { getChart, searchCoins } from './api/_coingecko';

function sendJson(res: ServerResponse, body: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// Dev-only middleware that mirrors the production Vercel functions so the
// frontend talks to the same /api/* surface in dev and prod.
function apiDevServer() {
  return {
    name: 'crypto-chart-racer-api',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: ServerResponse, next: () => void) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        try {
          if (url.pathname === '/api/chart') {
            const data = await getChart(
              url.searchParams.get('id') ?? 'bitcoin',
              url.searchParams.get('range') ?? '30d',
              url.searchParams.get('sym') ?? '',
            );
            return sendJson(res, data);
          }
          if (url.pathname === '/api/search') {
            const data = await searchCoins(url.searchParams.get('q') ?? '');
            return sendJson(res, data);
          }
        } catch (err) {
          return sendJson(res, { error: err instanceof Error ? err.message : String(err) }, 502);
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [apiDevServer()],
  server: { port: 5173 },
});
