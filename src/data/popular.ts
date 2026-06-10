// Curated popular tokens shown in the dropdown before the user types anything.
// Hardcoded on purpose: zero API calls, reliable ids, and these rarely change.
// `id` must be the CoinGecko coin id; `sym` doubles as the Binance-fallback hint.

export interface PopularToken {
  id: string;
  name: string;
  symbol: string;
}

export const POPULAR_TOKENS: PopularToken[] = [
  { id: 'bitcoin', name: 'Bitcoin', symbol: 'btc' },
  { id: 'ethereum', name: 'Ethereum', symbol: 'eth' },
  { id: 'solana', name: 'Solana', symbol: 'sol' },
  { id: 'binancecoin', name: 'BNB', symbol: 'bnb' },
  { id: 'ripple', name: 'XRP', symbol: 'xrp' },
  { id: 'dogecoin', name: 'Dogecoin', symbol: 'doge' },
  { id: 'cardano', name: 'Cardano', symbol: 'ada' },
  { id: 'avalanche-2', name: 'Avalanche', symbol: 'avax' },
  { id: 'chainlink', name: 'Chainlink', symbol: 'link' },
  { id: 'tron', name: 'TRON', symbol: 'trx' },
  { id: 'sui', name: 'Sui', symbol: 'sui' },
  { id: 'shiba-inu', name: 'Shiba Inu', symbol: 'shib' },
  { id: 'pepe', name: 'Pepe', symbol: 'pepe' },
  { id: 'dogwifcoin', name: 'dogwifhat', symbol: 'wif' },
  { id: 'bonk', name: 'Bonk', symbol: 'bonk' },
  { id: 'litecoin', name: 'Litecoin', symbol: 'ltc' },
];
