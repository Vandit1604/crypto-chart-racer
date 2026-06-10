import type { Range } from '../config';

export interface PricePoint {
  t: number;
  p: number;
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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: string }).error ?? `request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export function fetchChart(id: string, range: Range, sym = ''): Promise<ChartPayload> {
  const symParam = sym ? `&sym=${encodeURIComponent(sym)}` : '';
  return getJson<ChartPayload>(`/api/chart?id=${encodeURIComponent(id)}&range=${range}${symParam}`);
}

export function fetchSearch(q: string): Promise<CoinHit[]> {
  return getJson<CoinHit[]>(`/api/search?q=${encodeURIComponent(q)}`);
}
