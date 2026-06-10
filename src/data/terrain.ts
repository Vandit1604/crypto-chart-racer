// Turns a raw price series into rideable terrain.
//
// Pipeline:
//   1. Resample the (irregular) price series to a fixed number of evenly spaced
//      control points — same count regardless of range, so the track length is
//      stable and deterministic.
//   2. Catmull-Rom interpolate between control points so a single spiky candle
//      doesn't become an un-rideable needle, while pumps still feel like ramps
//      and dumps like cliffs.
//   3. Normalize price -> world Y (inverted: higher price = higher on screen).
//
// We keep the control points (`samples`) alongside the smooth `surface` so the
// HUD can map the bike's X position back to a real price/date.

import { TERRAIN } from '../config';
import type { PricePoint } from './api';

export interface Vec {
  x: number;
  y: number;
}

export interface TerrainSample {
  x: number;
  price: number;
  t: number;
}

export interface Terrain {
  /** Smooth polyline the bike rides on (world coords, y-up = negative). */
  surface: Vec[];
  /** Control points mapped to world X, for ticker/price lookup. */
  samples: TerrainSample[];
  minPrice: number;
  maxPrice: number;
  trackWidth: number;
  baselineY: number;
  /** World X of the all-time-high control point. */
  athX: number;
  athPrice: number;
  startPrice: number;
  endPrice: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Resample an irregular series to `count` evenly spaced points (by index). */
function resample(prices: PricePoint[], count: number): PricePoint[] {
  const n = prices.length;
  if (n <= count) return prices.slice();
  const out: PricePoint[] = [];
  for (let i = 0; i < count; i++) {
    const pos = (i / (count - 1)) * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, n - 1);
    const f = pos - lo;
    out.push({
      t: lerp(prices[lo].t, prices[hi].t, f),
      p: lerp(prices[lo].p, prices[hi].p, f),
    });
  }
  return out;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export function buildTerrain(prices: PricePoint[]): Terrain {
  const { CONTROL_POINTS, SUBDIV, SEGMENT_W, AMPLITUDE, BASELINE } = TERRAIN;

  const controls = resample(prices, CONTROL_POINTS);
  const c = controls.length;

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let athIndex = 0;
  for (let i = 0; i < c; i++) {
    const p = controls[i].p;
    if (p < minPrice) minPrice = p;
    if (p > maxPrice) {
      maxPrice = p;
      athIndex = i;
    }
  }
  const span = maxPrice - minPrice || 1;
  const norm = (p: number) => (p - minPrice) / span; // 0..1
  const toY = (p: number) => -norm(p) * AMPLITUDE; // higher price -> more negative (up)

  // Control points mapped to world X for lookup.
  const samples: TerrainSample[] = controls.map((cp, j) => ({
    x: j * SUBDIV * SEGMENT_W,
    price: cp.p,
    t: cp.t,
  }));

  // Smooth surface via Catmull-Rom over control Y values.
  const yAt = (j: number) => toY(controls[Math.max(0, Math.min(c - 1, j))].p);
  const surface: Vec[] = [];
  for (let j = 0; j < c - 1; j++) {
    const y0 = yAt(j - 1);
    const y1 = yAt(j);
    const y2 = yAt(j + 1);
    const y3 = yAt(j + 2);
    for (let s = 0; s < SUBDIV; s++) {
      const t = s / SUBDIV;
      const idx = j * SUBDIV + s;
      surface.push({ x: idx * SEGMENT_W, y: catmullRom(y0, y1, y2, y3, t) });
    }
  }
  surface.push({ x: (c - 1) * SUBDIV * SEGMENT_W, y: yAt(c - 1) });

  return {
    surface,
    samples,
    minPrice,
    maxPrice,
    trackWidth: surface[surface.length - 1].x,
    baselineY: BASELINE,
    athX: samples[athIndex].x,
    athPrice: maxPrice,
    startPrice: controls[0].p,
    endPrice: controls[c - 1].p,
  };
}

/** Binary-search the sample whose X is nearest to `x`. */
export function sampleAtX(terrain: Terrain, x: number): TerrainSample {
  const { samples } = terrain;
  let lo = 0;
  let hi = samples.length - 1;
  if (x <= samples[0].x) return samples[0];
  if (x >= samples[hi].x) return samples[hi];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].x < x) lo = mid + 1;
    else hi = mid;
  }
  const a = samples[Math.max(0, lo - 1)];
  const b = samples[lo];
  return Math.abs(a.x - x) < Math.abs(b.x - x) ? a : b;
}
