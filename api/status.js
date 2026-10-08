// /api/status — which brokers are set up on the server and connected in this browser.
import { send } from '../lib/http.js';
import { requireSession, brokerTokens } from '../lib/auth.js';
import { kiteConfigured } from '../lib/kite.js';
import { upstoxConfigured } from '../lib/upstox.js';

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  const t = brokerTokens(req);
  send(res, 200, {
    kite: { configured: kiteConfigured(), connected: !!t.kite, expires: t.kite ? t.kite.exp : null },
    upstox: { configured: upstoxConfigured(), connected: !!t.upstox, expires: t.upstox ? t.upstox.exp : null },
    claude: !!process.env.ANTHROPIC_API_KEY,
  });
}
