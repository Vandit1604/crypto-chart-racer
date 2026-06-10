// Live sweep of pitch feel without rebuilding: overrides window.__tune per run.
// For each (TIP_CAP, ENGINE_TIP) it measures hold-gas time-to-flip and how far
// an expert feathering rider gets. Prints a table to pick the sweet spot.

import { chromium } from 'playwright-core';

const URL = 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function fresh(tune) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => document.getElementById('start-title')?.textContent?.includes('·'),
    { timeout: 15000 },
  );
  await page.evaluate((t) => Object.assign(window.__tune, t), tune);
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__ccr().status === 'running', { timeout: 8000 });
  return page;
}
const st = (p) => p.evaluate(() => window.__ccr());

async function holdGas(tune) {
  const page = await fresh(tune);
  await page.keyboard.down('ArrowRight');
  let t = 0;
  for (; t < 5000; t += 60) {
    await page.waitForTimeout(60);
    if ((await st(page)).status === 'crashed') break;
  }
  await page.close();
  return t < 5000 ? t : null;
}

async function feather(tune) {
  const page = await fresh(tune);
  let key = null;
  let maxP = 0;
  let crashed = false;
  const set = async (n) => {
    if (n === key) return;
    if (key) await page.keyboard.up(key);
    if (n) await page.keyboard.down(n);
    key = n;
  };
  for (let i = 0; i < 400; i++) {
    const s = await st(page);
    maxP = Math.max(maxP, s.progress);
    if (s.status === 'crashed') {
      crashed = true;
      break;
    }
    if (s.status === 'finished') break;
    let want;
    if (s.airborne) want = null; // don't throttle-spin in the air
    else if (s.tilt < -0.7) want = 'ArrowLeft';
    else if (s.tilt < -0.35) want = null;
    else want = 'ArrowRight';
    await set(want);
    await page.waitForTimeout(35);
  }
  await set(null);
  await page.close();
  return { maxP, crashed };
}

const caps = [0.1, 0.14, 0.18];
const tips = [0.015, 0.025];
console.log('cap    tip     holdGasFlip   featherReach  verdict');
for (const TIP_CAP of caps) {
  for (const ENGINE_TIP of tips) {
    const tune = { TIP_CAP, ENGINE_TIP, BRAKE_TIP: ENGINE_TIP * 1.2 };
    const flip = await holdGas(tune);
    const f = await feather(tune);
    const good = flip !== null && flip >= 1200 && flip <= 3000 && !f.crashed && f.maxP > 0.5;
    console.log(
      `${TIP_CAP.toFixed(2)}   ${ENGINE_TIP.toFixed(3)}   ` +
        `${flip ? flip + 'ms' : 'no flip'}`.padEnd(13) +
        `   ${(f.maxP * 100).toFixed(0)}%${f.crashed ? ' crash' : ''}`.padEnd(13) +
        `  ${good ? 'GOOD' : ''}`,
    );
  }
}
await browser.close();
