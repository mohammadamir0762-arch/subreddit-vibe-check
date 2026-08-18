import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hotRoute } from './_lib/handlers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const url = new URL(req.url ?? '', `https://${req.headers.host ?? 'localhost'}`);
  const { status, body, cacheControl } = await hotRoute(url.searchParams);

  res.setHeader('Cache-Control', cacheControl);
  return res.status(status).json(body);
}
