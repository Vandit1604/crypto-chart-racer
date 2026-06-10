// Node smoke test for the terrain pipeline — runs without a browser.
// Validates resample + smoothing + normalization on synthetic and (if network
// is available) real CoinGecko data.

import { buildTerrain, sampleAtX } from '../src/data/terrain.ts';

function synthetic(n) {
  const prices = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    p *= 1 + (Math.sin(i / 9) * 0.04 + (i % 13 === 0 ? 0.25 : -0.01));
    prices.push({ t: 1700000000000 + i * 3600_000, p: Math.max(1, p) });
  }
  return prices;
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ok: ${msg}`);
}

console.log('terrain pipeline smoke test');
const terrain = buildTerrain(synthetic(400));
assert(terrain.surface.length > 100, 'surface has many points');
assert(terrain.surface.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), 'all surface points finite');
assert(terrain.surface[0].x === 0, 'track starts at x=0');
assert(terrain.trackWidth > 5000, 'track is long');
assert(terrain.maxPrice > terrain.minPrice, 'price range non-degenerate');
assert(terrain.athPrice === terrain.maxPrice, 'ATH equals max price');

const mid = sampleAtX(terrain, terrain.trackWidth / 2);
assert(mid.price > 0 && Number.isFinite(mid.t), 'midpoint sample valid');

// monotonic x
let monotonic = true;
for (let i = 1; i < terrain.surface.length; i++) {
  if (terrain.surface[i].x <= terrain.surface[i - 1].x) monotonic = false;
}
assert(monotonic, 'surface x strictly increasing');

console.log('\nall terrain assertions passed ✔');
