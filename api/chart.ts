// Vercel serverless function: GET /api/chart?id=bitcoin&range=30d
import { getChart } from './_coingecko.js';

export default async function handler(req: any, res: any): Promise<void> {
  try {
    const { id = 'bitcoin', range = '30d', sym = '' } = req.query ?? {};
    const data = await getChart(String(id), String(range), String(sym));
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
