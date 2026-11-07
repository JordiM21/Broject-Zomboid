// Hands browsers short-lived Cloudflare TURN credentials so co-op works behind strict NATs (mobile data, CGNAT).
// Needs CF_TURN_KEY_ID and CF_TURN_API_TOKEN in Vercel's env; without them it returns 204 and peers go direct-only.
export default async function handler(req, res) {
  const { CF_TURN_KEY_ID: id, CF_TURN_API_TOKEN: token } = process.env;
  if (!id || !token) return res.status(204).end();
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: 86400 }),
  });
  if (!r.ok) return res.status(502).end();
  const { iceServers } = await r.json();
  // Port 53 URLs are blocked by browsers and only slow down ICE.
  for (const s of iceServers) if (Array.isArray(s.urls)) s.urls = s.urls.filter((u) => !/:53(\?|$)/.test(u));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ iceServers });
}
