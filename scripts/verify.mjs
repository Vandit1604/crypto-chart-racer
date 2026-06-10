// Headless end-to-end check: load the game, start a ride, drive the bike for a
// few seconds, and assert that score/distance actually advance. Screenshots the
// boot screen and mid-ride.

import { chromium } from 'playwright-core';

const URL = 'http://localhost:5173';
const errors = [];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });

// Wait for the start overlay to be populated from the chart fetch.
await page.waitForFunction(
  () => document.getElementById('start-title')?.textContent?.includes('·'),
  { timeout: 15000 },
);
const title = await page.textContent('#start-title');
console.log('boot title:', title);
await page.screenshot({ path: 'scripts/shot-boot.png' });

// Start the ride.
await page.click('#start-btn');
const st = () => page.evaluate(() => window.__ccr());
// Wait out the 3-2-1 countdown.
await page.waitForFunction(() => window.__ccr().status === 'running', { timeout: 8000 });

// Hold gas and confirm the torque-driven bike keeps accelerating forward (it
// builds momentum rather than stalling). ~3.5s is well before any terrain wipeout.
await page.keyboard.down('ArrowRight');
const samples = [];
for (let i = 0; i < 7; i++) {
  await page.waitForTimeout(500);
  const s = await st();
  samples.push({
    score: await page.textContent('#score'),
    width: await page.evaluate(() => document.getElementById('progress-bar')?.style.width || '0%'),
  });
  if (s.status !== 'running') break;
}
await page.keyboard.up('ArrowRight');
await page.screenshot({ path: 'scripts/shot-ride.png' });

console.log('score/progress samples:', JSON.stringify(samples));

const finalScore = Number((samples.at(-1)?.score || '0').replace(/,/g, ''));
const finalWidth = parseFloat(samples.at(-1)?.width || '0');

await browser.close();

let failed = false;
const assert = (cond, msg) => {
  console.log(`  ${cond ? 'ok' : 'FAIL'}: ${msg}`);
  if (!cond) failed = true;
};

console.log('\nassertions:');
assert(errors.length === 0, `no console/page errors (${errors.length})`);
if (errors.length) console.log('   errors:', errors.slice(0, 5));
assert(finalScore > 0, `score advanced past 0 (got ${finalScore})`);
assert(finalWidth > 0, `bike made forward progress (${finalWidth}% of track)`);

console.log(failed ? '\nVERIFY FAILED ✘' : '\nVERIFY PASSED ✔');
process.exit(failed ? 1 : 0);
