// /api/portfolio — holdings from every connected broker, merged by symbol.
import { send } from '../lib/http.js';
import { requireSession, brokerTokens } from '../lib/auth.js';
import { kiteHoldings } from '../lib/kite.js';
import { upstoxHoldings } from '../lib/upstox.js';

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  const t = brokerTokens(req);
  const errors = [];
  const lists = [];
  if (t.kite) {
    try { lists.push(await kiteHoldings(t.kite.t)); } catch (e) { errors.push({ broker: 'Zerodha', error: e.message, expired: e.status === 403 }); }
  }
  if (t.upstox) {
    try { lists.push(await upstoxHoldings(t.upstox.t)); } catch (e) { errors.push({ broker: 'Upstox', error: e.message, expired: e.status === 401 }); }
  }
  const merged = {};
  for (const h of lists.flat()) {
    if (!h.symbol || !h.qty) continue;
    const m = merged[h.symbol];
    if (!m) { merged[h.symbol] = { ...h, brokers: [h.broker] }; continue; }
    const qty = m.qty + h.qty;
    m.avg = (m.avg * m.qty + h.avg * h.qty) / qty;
    m.qty = qty;
    m.brokers.push(h.broker);
  }
  send(res, 200, { holdings: Object.values(merged), errors, connected: { kite: !!t.kite, upstox: !!t.upstox } });
}
