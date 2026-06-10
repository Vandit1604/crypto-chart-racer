# 🏍️ Crypto Chart Racer

Ride a dirt bike across **any** crypto token's price chart. Pumps become launch
ramps, dumps become cliffs. Flip on the way down, don't wipe out, reach **NOW ▸**.

![ride](scripts/shot-ride.png)

## How it plays

- **→ / D** throttle · **← / A** brake · in the air, gas tucks forward / brake throws back to flip
- **Esc** pause · on mobile: right half = gas, left half = brake
- Rear-wheel drive (front lightly assists for climb grip). A 3-2-1 countdown lets
  the bike settle on the start line before you ride.
- Pick any token (search or the **Popular** dropdown) and any range (**7d / 30d / 90d / 1y**)
- **Simple, Hill-Climb-Racing style.** Hold gas to drive forward — that's it, no
  stalling or self-wheelies on flat ground. Flips happen in the **air**: launch
  off a steep pump/dump and use gas/brake to spin, then land on your wheels.
  **You always get to complete a flip** — the run only ends if you *fail* it
  (settle inverted / on your head) or fall off the track. The bike rests level on
  the start line. Volatile charts (memecoins) with steep terrain are the real test.
- Score = distance + airtime + flip combos + **wheelie-hold** (balance a wheelie
  for points, shown by the WHEELIE chip). Best score per token+range is saved
  locally (`localStorage`), and **Share track** copies a URL that loads the exact
  same token+range for anyone.
- Juice: wheel-dust particles on driving, hard landings, and crashes. (No sound
  and no screen shake — both removed by design.)

## Architecture

```
api/_coingecko.ts   CoinGecko access + 6h snapshot cache (in-process Map, no DB)
api/chart.ts        GET /api/chart?id=&range=   (Vercel function)
api/search.ts       GET /api/search?q=          (Vercel function)
vite.config.ts      dev middleware mirroring the two functions

src/data/terrain.ts price series -> resample -> Catmull-Rom smooth -> world terrain
src/game/Game.ts    Matter.js engine, fixed-step loop, collisions, scoring
src/game/Bike.ts    chassis + 2 wheels, throttle/lean
src/game/Renderer.ts  Canvas2D: neon chart terrain, bike, ATH line, finish
src/main.ts         UI glue: HUD, ticker, search, range bar, overlays
```

### No database, by design

Charts are snapshotted into **6-hour buckets**. Every player riding "BTC 30d"
within a window gets the **same deterministic track**, and your server makes at
most **one upstream CoinGecko call per token/range per 6h** — everything else is
served from the in-process cache. Scores live in the visitor's `localStorage`, so
there is zero write load on your VPS.

### Staying alive on the free tier (no paid API)

Data resilience is a chain so it keeps working even when CoinGecko throttles:

1. **6h cache** — the popular case (everyone riding BTC) is one upstream call.
2. **Retry w/ backoff** on `429`.
3. **Binance public klines fallback** — if CoinGecko fails, the major coins that
   drive viral traffic almost all trade as a `SYMBOLUSDT` pair on Binance, whose
   public API has far higher limits and needs no key. The frontend passes the
   coin's symbol as a hint (`/api/chart?...&sym=btc`).
4. **Serve-stale** — once a token's been ridden, a later failure serves the
   slightly-old snapshot instead of an error.
5. Only if all of the above fail does the UI show a friendly retry.

> CoinGecko's free tier caps history at **365 days**, so `max` isn't available —
> ranges are `7d / 30d / 90d / 1y`. A free demo key (`COINGECKO_API_KEY`) raises
> the primary limit but is optional.

> Because the cache is per-process, running multiple instances behind a load
> balancer just means each instance warms its own cache (still ≤1 call/6h each).
> If you later add a shared cache, point it at Redis — no schema needed.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173  (Vite + /api/* middleware)
```

Build & verify:

```bash
npm run build      # tsc --noEmit + vite build  (~34kb gzipped JS)
npm run smoke      # terrain pipeline assertions (headless)
node scripts/verify.mjs   # drives the real game in headless Chrome
```

### CoinGecko key (optional but recommended)

Copy `.env.example` to `.env` and set `COINGECKO_API_KEY` to a free demo key.
Without it the keyless endpoint still works (the 6h cache keeps you under limits
for modest traffic) but heavy testing will hit `429`s.

## Deploy

### Single server (Coolify / Docker / any VPS) — recommended

One Node process serves the built frontend **and** the `/api/*` routes — no
serverless, no separate API host:

```bash
npm run build      # builds dist/ AND bundles server.mjs
npm start          # node server.mjs  (PORT env, default 3000)
```

The included **`Dockerfile`** does exactly this (multi-stage: build → tiny
runtime that runs `server.mjs`, no node_modules in the final image). On
**Coolify**: point it at this repo, it auto-detects the Dockerfile, set the
optional `COINGECKO_API_KEY` env var, and expose port `3000`. Done.

### Vercel

Also works as-is: `api/*.ts` become serverless functions and the Vite app is the
static frontend. Set `COINGECKO_API_KEY` in project env vars.

## Tuning the feel

Everything lives in `src/config.ts` — terrain smoothness (`SUBDIV`, `AMPLITUDE`),
the rear-wheel motor (`TARGET_OMEGA`, `MAX_MOTOR_TORQUE`, `MOTOR_GAIN`), wheelbase,
air pitch, wipeout tolerance, camera, and scoring weights.

The control feel was dialed in empirically against the live game in headless
Chrome:

```bash
node scripts/probe-feel.mjs   # hold-gas flips? brake bites? can skill feather to the end?
node scripts/sweep-feel.mjs   # sweeps TIP_CAP / ENGINE_TIP live (no rebuild) to find the sweet spot
```

These read a dev-only `window.__ccr()` / `window.__tune` hook (stripped from prod
builds). Current values: hold-gas wheelies over in ~1.7s, skilled feathering
clears 80%+ of BTC-30d without crashing.
