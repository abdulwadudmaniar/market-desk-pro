// /api/status — which brokers are set up on the server and connected in this browser.
import { send } from '../lib/http.js';
import { requireSession, brokerTokens, totpEnabled } from '../lib/auth.js';
import { kiteConfigured } from '../lib/kite.js';
import { upstoxConfigured } from '../lib/upstox.js';
import { angelConfigured } from '../lib/angel.js';

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  const t = brokerTokens(req);
  const b = (configured, tok) => ({ configured, connected: !!tok, expires: tok ? tok.exp : null });
  send(res, 200, {
    kite: b(kiteConfigured(), t.kite),
    upstox: b(upstoxConfigured(), t.upstox),
    angel: b(angelConfigured(), t.angel),
    claude: !!process.env.ANTHROPIC_API_KEY,
    security: { totp: totpEnabled(), sessionDays: Number(process.env.SESSION_DAYS || 7) },
  });
}
