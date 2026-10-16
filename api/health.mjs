// Public, non-sensitive diagnostic endpoint for Vercel Functions.
// Does not expose environment variable values or connect to the database.
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, service: 'yemekpass-api', runtime: 'vercel' });
}
