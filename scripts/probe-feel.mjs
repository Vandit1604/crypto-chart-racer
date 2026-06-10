// Measures HCR-style control difficulty against the live game, reading the
// dev-only window.__ccr() state (tilt/progress/status).
//
//   A) HOLD GAS  -> should wheelie over and crash within a second or two.
//   B) HOLD BRAKE -> should nose-dive and crash.
//   C) SKILLED FEATHER -> a closed-loop rider that eases off when the front
//      lifts should keep it upright and cover real distance.
//
// Good feel = A and B crash fast, C survives and gets far.

import { chromium } from 'playwright-core';

const URL = 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });

const state = (page) => page.evaluate(() => window.__ccr());

async function fresh() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => document.getElementById('start-title')?.textContent?.includes('·'),
    { timeout: 15000 },
  );
  await page.click('#start-btn');
  // Wait out the 3-2-1 countdown until physics actually runs.
  await page.waitForFunction(() => window.__ccr().status === 'running', { timeout: 8000 });
  return page;
}

async function holdTest(label, key) {
  const page = await fresh();
  await page.keyboard.down(key);
  let t = 0;
  let crashed = false;
  for (; t < 5000; t += 60) {
    await page.waitForTimeout(60);
    const s = await state(page);
    if (s.status === 'crashed') {
      crashed = true;
      break;
    }
  }
  await page.keyboard.up(key);
  const s = await state(page);
  console.log(
    `${label}: ${crashed ? `flipped & crashed @ ${t}ms` : 'survived 5s'}, progress ${(s.progress * 100).toFixed(0)}%`,
  );
  await page.close();
  return { crashedMs: crashed ? t : null };
}

// Closed-loop "skilled" rider: gas while the bike is level-ish, ease off the
// moment the front lifts past a comfortable wheelie, blip brake if it climbs too
// far. Models a human who can actually feather — not a fixed robotic rhythm.
async function skilledFeather() {
  const page = await fresh();
  let key = null; // currently held key
  let crashed = false;
  let maxProg = 0;
  const set = async (next) => {
    if (next === key) return;
    if (key) await page.keyboard.up(key);
    if (next) await page.keyboard.down(next);
    key = next;
  };
  for (let i = 0; i < 700; i++) {
    const s = await state(page);
    maxProg = Math.max(maxProg, s.progress);
    if (s.status === 'crashed') {
      crashed = true;
      break;
    }
    if (s.status === 'finished') break;
    // Expert rider with hysteresis: don't throttle-spin in the air, blip the
    // brake to save an imminent backflip, ease off when the nose climbs, gas
    // when it's safe. Keeps the wheelie low.
    let want;
    if (s.airborne) want = null;
    else if (s.tilt < -0.85) want = 'ArrowLeft'; // recover: nose-down blip
    else if (s.tilt < -0.6) want = null; // coast: let the front drop
    else want = 'ArrowRight'; // safe: drive (gas confidently — controls are soft)
    await set(want);
    await page.waitForTimeout(30);
  }
  await set(null);
  const s = await state(page);
  const prog = Math.max(maxProg, s.progress);
  console.log(
    `SKILLED FEATHER: ${crashed ? 'crashed' : s.status === 'finished' ? 'FINISHED' : 'survived'}, progress ${(prog * 100).toFixed(0)}%`,
  );
  await page.close();
  return { crashed, prog };
}

console.log('--- control feel probe ---');
const gas = await holdTest('HOLD GAS  ', 'ArrowRight');
const brake = await holdTest('HOLD BRAKE', 'ArrowLeft');
const feather = await skilledFeather();

await browser.close();

const gasOk = gas.crashedMs !== null && gas.crashedMs <= 2500;
const brakeOk = brake.crashedMs !== null && brake.crashedMs <= 3000;
const skillOk = !feather.crashed && feather.prog > 0.4;

console.log('\nverdict:');
console.log(`  accel punishing (hold gas flips <=2.5s) : ${gasOk ? 'YES' : 'no'}`);
console.log(`  brake punishing (hold brake flips <=3s) : ${brakeOk ? 'YES' : 'no'}`);
console.log(`  skill rewarded  (feather reaches >40%)  : ${skillOk ? 'YES' : 'no'}`);
console.log(gasOk && brakeOk && skillOk ? '\nFEEL: dialed in ✔' : '\nFEEL: needs tuning');
