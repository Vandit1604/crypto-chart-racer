import './styles.css';
import { Game } from './game/Game';
import { fetchChart } from './data/api';
import { tuning } from './game/Bike';
import { wireSearch, type PickedToken } from './ui/search';
import { formatPrice, formatPct, formatDate, formatScore } from './ui/format';
import { RANGES, DEFAULT_TOKEN, type Range } from './config';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const canvas = $<HTMLCanvasElement>('game');
const els = {
  tokenName: $('token-name'),
  tickerPrice: $('ticker-price'),
  tickerPct: $('ticker-pct'),
  tickerDate: $('ticker-date'),
  progressBar: $('progress-bar'),
  score: $('score'),
  flips: $('flips'),
  toast: $('toast'),
  start: $<HTMLElement>('start-overlay'),
  startBtn: $<HTMLButtonElement>('start-btn'),
  startTitle: $('start-title'),
  startSub: $('start-sub'),
  over: $<HTMLElement>('over-overlay'),
  overScore: $('over-score'),
  overBest: $('over-best'),
  overReason: $('over-reason'),
  restartBtn: $<HTMLButtonElement>('restart-btn'),
  newTokenBtn: $<HTMLButtonElement>('newtoken-btn'),
  shareBtn: $<HTMLButtonElement>('share-btn'),
  rangeBar: $('range-bar'),
  searchInput: $<HTMLInputElement>('search-input'),
  searchDropdown: $('search-dropdown'),
  loader: $('loader'),
  wheelieChip: $('wheelie-chip'),
  countdown: $('countdown'),
  pauseBtn: $<HTMLButtonElement>('pause-btn'),
  pause: $<HTMLElement>('pause-overlay'),
  resumeBtn: $<HTMLButtonElement>('resume-btn'),
};

interface Token {
  id: string;
  name: string;
  symbol: string;
}

const params = new URLSearchParams(location.search);
let token: Token = {
  id: params.get('id') ?? DEFAULT_TOKEN.id,
  name: params.get('name') ?? DEFAULT_TOKEN.name,
  symbol: params.get('sym') ?? DEFAULT_TOKEN.symbol,
};
let range: Range = (RANGES as readonly string[]).includes(params.get('range') ?? '')
  ? (params.get('range') as Range)
  : '30d';

const bestKey = () => `ccr.best.${token.id}.${range}`;
let terrainReady = false;

const game = new Game(canvas, {
  onHud: (state, ticker) => {
    els.score.textContent = formatScore(state.score);
    els.flips.textContent = `${state.flips} flips`;
    els.wheelieChip.classList.toggle('on', state.wheelieActive);
    els.tickerPrice.textContent = formatPrice(ticker.price);
    els.tickerPct.textContent = formatPct(ticker.pctFromStart);
    els.tickerPct.className = `ticker-pct ${ticker.pctFromStart >= 0 ? 'up' : 'down'}`;
    els.tickerDate.textContent = formatDate(ticker.t);
    els.progressBar.style.width = `${(ticker.progress * 100).toFixed(1)}%`;
  },
  onFlip: (flips) => {
    showToast(flips >= 2 ? `${flips}× FLIP COMBO!` : 'FLIP! +150');
  },
  onCountdown: (n) => {
    if (n === null) {
      els.countdown.classList.remove('show');
      return;
    }
    els.countdown.textContent = n === 0 ? 'RIDE!' : String(n);
    els.countdown.classList.add('show');
    // retrigger the pulse animation
    els.countdown.classList.remove('pulse');
    void els.countdown.offsetWidth;
    els.countdown.classList.add('pulse');
  },
  onPause: (paused) => {
    els.pause.classList.toggle('show', paused);
    els.pauseBtn.textContent = paused ? '▸' : '❙❙';
  },
  onEnd: (result) => {
    const score = result.state.score;
    const prevBest = Number(localStorage.getItem(bestKey()) ?? 0);
    const best = Math.max(prevBest, score);
    localStorage.setItem(bestKey(), String(best));
    els.overReason.textContent =
      result.reason === 'finished' ? 'You reached NOW ▸' : 'Wiped out';
    els.overScore.textContent = formatScore(score);
    els.overBest.textContent = `Best: ${formatScore(best)}`;
    els.wheelieChip.classList.remove('on');
    els.over.classList.add('show');
  },
});

let toastTimer = 0;
function showToast(msg: string): void {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove('show'), 1200);
}

function syncUrl(): void {
  const q = new URLSearchParams({ id: token.id, name: token.name, sym: token.symbol, range });
  history.replaceState(null, '', `?${q.toString()}`);
}

async function loadToken(showStart: boolean): Promise<void> {
  els.loader.classList.add('show');
  els.over.classList.remove('show');
  els.tokenName.textContent = `${token.name} · ${token.symbol.toUpperCase()}`;
  try {
    const chart = await fetchChart(token.id, range, token.symbol);
    game.loadTerrain(chart.prices);
    const move = ((chart.prices[chart.prices.length - 1].p - chart.prices[0].p) / chart.prices[0].p) * 100;
    els.startTitle.textContent = `${token.name} · ${range}`;
    els.startSub.textContent = `${move >= 0 ? '▲' : '▼'} ${formatPct(move)} over ${range} — ride it.`;
    terrainReady = true;
    els.startBtn.textContent = 'Ride ▸';
    if (showStart) els.start.classList.add('show');
    syncUrl();
  } catch (err) {
    // No terrain loaded — the start button becomes a retry instead of riding
    // into an empty world.
    terrainReady = false;
    els.startTitle.textContent = 'Could not load that token';
    const msg = err instanceof Error ? err.message : 'Try another one.';
    els.startSub.textContent = /429|rate limit/i.test(msg)
      ? 'Rate limited for a moment — wait a few seconds and retry, or pick another token.'
      : msg;
    els.startBtn.textContent = 'Retry ↻';
    els.start.classList.add('show');
  } finally {
    els.loader.classList.remove('show');
  }
}

function buildRangeBar(): void {
  els.rangeBar.innerHTML = '';
  for (const r of RANGES) {
    const btn = document.createElement('button');
    btn.className = `range-btn ${r === range ? 'active' : ''}`;
    btn.textContent = r;
    btn.addEventListener('click', async () => {
      if (r === range) return;
      range = r;
      buildRangeBar();
      await loadToken(true);
    });
    els.rangeBar.appendChild(btn);
  }
}

function pickToken(coin: PickedToken): void {
  token = { id: coin.id, name: coin.name, symbol: coin.symbol };
  void loadToken(true);
}

els.startBtn.addEventListener('click', () => {
  if (!terrainReady) {
    void loadToken(true); // retry the failed load
    return;
  }
  els.start.classList.remove('show');
  game.start();
});
els.restartBtn.addEventListener('click', () => {
  els.over.classList.remove('show');
  game.restart();
});
els.newTokenBtn.addEventListener('click', () => {
  els.over.classList.remove('show');
  els.searchInput.focus();
});
els.shareBtn.addEventListener('click', async () => {
  syncUrl();
  try {
    await navigator.clipboard.writeText(location.href);
    showToast('Link copied — share this exact track');
  } catch {
    showToast(location.href);
  }
});

// Pause / resume
els.pauseBtn.addEventListener('click', () => game.togglePause());
els.resumeBtn.addEventListener('click', () => game.togglePause());

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') game.togglePause();
});

// Dev-only hooks for the headless tuning probe (scripts/probe-feel.mjs).
if (import.meta.env.DEV) {
  const w = window as unknown as { __ccr: () => unknown; __tune: typeof tuning };
  w.__ccr = () => game.debug();
  w.__tune = tuning;
}

wireSearch({ input: els.searchInput, dropdown: els.searchDropdown }, pickToken);
buildRangeBar();
void loadToken(true);
