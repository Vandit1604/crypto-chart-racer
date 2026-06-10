// Shared CoinGecko access + caching. Used by both the Vite dev middleware
// (vite.config.ts) and the Vercel serverless functions (api/chart.ts, api/search.ts).
//
// Charts are snapshotted into 6-hour buckets: "BTC 30d" resolves to the SAME
// terrain for everyone within a 6h window, and the VPS makes at most one
// upstream CoinGecko call per token/range per 6h. No database — cache is just
// an in-process Map (per server instance).

const BASE = 'https://api.coingecko.com/api/v3';
const API_KEY = process.env.COINGECKO_API_KEY;

const HOUR = 60 * 60 * 1000;
const CHART_TTL = 6 * HOUR; // snapshot charts in 6h windows — one upstream call per token/range per 6h

// Free CoinGecko caps historical data at 365 days, so every range stays <= 365.
export type Range = '7d' | '30d' | '90d' | '1y';

export const RANGE_DAYS: Record<Range, string> = {
  '7d': '7',
  '30d': '30',
  '90d': '90',
  '1y': '365',
};

export interface PricePoint {
  t: number; // unix ms
  p: number; // usd
}

export interface ChartPayload {
  id: string;
  range: Range;
  prices: PricePoint[];
  source: 'coingecko' | 'binance';
}

export interface CoinHit {
  id: string;
  name: string;
  symbol: string;
  rank: number | null;
  thumb: string;
}

interface CacheEntry {
  value: unknown;
  exp: number;
}

const cache = new Map<string, CacheEntry>();

/** Bucket the wall clock into 6h windows so a token/range maps to one snapshot. */
function bucketKey(): string {
  const now = Date.now();
  return String(Math.floor(now / CHART_TTL));
}

function headers(): Record<string, string> {
  return API_KEY ? { 'x-cg-demo-api-key': API_KEY } : {};
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cg<T>(path: string): Promise<T> {
  // Retry transient rate limits with backoff before giving up.
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(BASE + path, { headers: headers() });
    if (res.ok) return (await res.json()) as T;
    const body = await res.text().catch(() => '');
    lastErr = `coingecko ${res.status}: ${body.slice(0, 200)}`;
    if (res.status === 429 && attempt < 2) {
      await sleep(600 * (attempt + 1));
      continue;
    }
    throw new Error(lastErr);
  }
  throw new Error(lastErr);
}

function normalizeRange(input: string): Range {
  return (['7d', '30d', '90d', '1y'] as Range[]).includes(input as Range)
    ? (input as Range)
    : '30d';
}

// --- Binance fallback ---------------------------------------------------------
// When CoinGecko is rate-limited/unavailable, the major coins that drive viral
// traffic almost all trade as a USDT pair on Binance, whose public klines API
// has far higher limits and needs no key. We map the coin's symbol -> SYMBOLUSDT.
// Obscure long-tail tokens won't have a pair; those fall through to a clean error.

const BINANCE = 'https://api.binance.com/api/v3/klines';

const BINANCE_PARAMS: Record<Range, { interval: string; limit: number }> = {
  '7d': { interval: '1h', limit: 168 },
  '30d': { interval: '4h', limit: 180 },
  '90d': { interval: '12h', limit: 180 },
  '1y': { interval: '1d', limit: 365 },
};

async function fetchBinance(sym: string, range: Range): Promise<PricePoint[] | null> {
  const ticker = sym.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!ticker) return null;
  const { interval, limit } = BINANCE_PARAMS[range];
  const pair = `${ticker}USDT`;
  try {
    const res = await fetch(`${BINANCE}?symbol=${pair}&interval=${interval}&limit=${limit}`);
    if (!res.ok) return null; // 400 = no such pair; just give up on the fallback
    const rows = (await res.json()) as unknown[];
    if (!Array.isArray(rows) || rows.length < 2) return null;
    return rows
      .map((r) => {
        const row = r as [number, string, string, string, string];
        return { t: row[0], p: Number(row[4]) }; // openTime, close price
      })
      .filter((pt) => Number.isFinite(pt.p));
  } catch {
    return null;
  }
}

export async function getChart(
  idRaw: string,
  rangeRaw: string,
  symRaw = '',
): Promise<ChartPayload> {
  const id = idRaw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  const range = normalizeRange(rangeRaw);
  if (!id) throw new Error('missing token id');

  const key = `chart:${id}:${range}:${bucketKey()}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as ChartPayload;

  // Keyed independently of the 6h bucket so a previous good snapshot survives
  // across windows and can be served stale if every live source fails.
  const staleKey = `chart-last:${id}:${range}`;
  const days = RANGE_DAYS[range];

  let prices: PricePoint[] | null = null;
  let source: ChartPayload['source'] = 'coingecko';
  let primaryErr: unknown;

  // 1) Primary: CoinGecko (broadest coverage).
  try {
    const data = await cg<{ prices: [number, number][] }>(
      `/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`,
    );
    prices = (data.prices || [])
      .filter((row) => Array.isArray(row) && Number.isFinite(row[1]))
      .map(([t, p]) => ({ t, p }));
    if (prices.length < 2) prices = null;
  } catch (err) {
    primaryErr = err;
  }

  // 2) Fallback: Binance public klines (huge limits, major coins only).
  if (!prices && symRaw) {
    const binance = await fetchBinance(symRaw, range);
    if (binance && binance.length >= 2) {
      prices = binance;
      source = 'binance';
    }
  }

  // 3) Last resort: a previously cached good snapshot (slightly stale).
  if (!prices) {
    const stale = cache.get(staleKey);
    if (stale) return stale.value as ChartPayload;
    throw primaryErr instanceof Error
      ? primaryErr
      : new Error('no price data available for this token/range');
  }

  const value: ChartPayload = { id, range, prices, source };
  cache.set(key, { value, exp: Date.now() + CHART_TTL });
  cache.set(staleKey, { value, exp: Number.MAX_SAFE_INTEGER });
  return value;
}

export async function searchCoins(qRaw: string): Promise<CoinHit[]> {
  const q = qRaw.trim();
  if (!q) return [];

  const key = `search:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as CoinHit[];

  const data = await cg<{
    coins: { id: string; name: string; symbol: string; market_cap_rank: number | null; thumb: string }[];
  }>(`/search?query=${encodeURIComponent(q)}`);

  const coins: CoinHit[] = (data.coins || []).slice(0, 12).map((c) => ({
    id: c.id,
    name: c.name,
    symbol: c.symbol,
    rank: c.market_cap_rank ?? null,
    thumb: c.thumb,
  }));

  cache.set(key, { value: coins, exp: Date.now() + HOUR });
  return coins;
}
