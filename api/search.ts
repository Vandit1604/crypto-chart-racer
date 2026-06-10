// Vercel serverless function: GET /api/search?q=btc
import { searchCoins } from './_coingecko.js';

export default async function handler(req: any, res: any): Promise<void> {
  try {
    const { q = '' } = req.query ?? {};
    const data = await searchCoins(String(q));
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
