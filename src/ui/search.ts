// Token picker. On focus (empty input) it shows a curated "Popular" list so
// people can pick without typing; typing >=2 chars switches to live /api/search.

import { fetchSearch, type CoinHit } from '../data/api';
import { POPULAR_TOKENS } from '../data/popular';

export interface SearchUI {
  input: HTMLInputElement;
  dropdown: HTMLElement;
}

export interface PickedToken {
  id: string;
  name: string;
  symbol: string;
}

// Popular entries have no logo/rank; search hits do. A single row renderer
// handles both.
interface Row {
  id: string;
  name: string;
  symbol: string;
  rank: number | null;
  thumb?: string;
}

const fromHit = (c: CoinHit): Row => ({ ...c });
const fromPopular = (p: PickedToken): Row => ({ ...p, rank: null });

export function wireSearch(ui: SearchUI, onPick: (token: PickedToken) => void): void {
  let timer = 0;
  let lastQuery = '';

  const close = () => {
    ui.dropdown.innerHTML = '';
    ui.dropdown.classList.remove('open');
  };

  const render = (rows: Row[], heading: string) => {
    ui.dropdown.innerHTML = '';
    if (!rows.length) return close();

    const head = document.createElement('div');
    head.className = 'search-head';
    head.textContent = heading;
    ui.dropdown.appendChild(head);

    for (const row of rows) {
      const btn = document.createElement('button');
      btn.className = 'search-row';
      const badge = row.thumb
        ? `<img src="${row.thumb}" alt="" width="20" height="20" />`
        : `<span class="sr-badge">${row.symbol.charAt(0).toUpperCase()}</span>`;
      btn.innerHTML = `
        ${badge}
        <span class="sr-name">${row.name}</span>
        <span class="sr-sym">${row.symbol.toUpperCase()}</span>
        ${row.rank ? `<span class="sr-rank">#${row.rank}</span>` : ''}`;
      btn.addEventListener('click', () => {
        onPick({ id: row.id, name: row.name, symbol: row.symbol });
        ui.input.value = row.name;
        close();
      });
      ui.dropdown.appendChild(btn);
    }
    ui.dropdown.classList.add('open');
  };

  const showPopular = () => render(POPULAR_TOKENS.map(fromPopular), 'Popular');

  // Open the popular list as soon as the field is focused/clicked.
  ui.input.addEventListener('focus', () => {
    if (ui.input.value.trim().length < 2) showPopular();
  });

  ui.input.addEventListener('input', () => {
    const q = ui.input.value.trim();
    window.clearTimeout(timer);
    if (q.length < 2) return showPopular();
    timer = window.setTimeout(async () => {
      if (q === lastQuery) return;
      lastQuery = q;
      try {
        const hits = await fetchSearch(q);
        render(hits.map(fromHit), 'Results');
      } catch {
        close();
      }
    }, 250);
  });

  document.addEventListener('click', (e) => {
    if (!ui.dropdown.contains(e.target as Node) && e.target !== ui.input) close();
  });
}
