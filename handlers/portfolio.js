// /api/portfolio — holdings from every connected broker, merged by symbol.
import { send } from '../lib/http.js';
import { requireSession, brokerTokens } from '../lib/auth.js';
import { kiteHoldings } from '../lib/kite.js';
import { upstoxHoldings } from '../lib/upstox.js';
import { angelHoldings } from '../lib/angel.js';

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  const t = brokerTokens(req);
  const errors = [];
  const jobs = [];
  if (t.kite) jobs.push(['Zerodha', () => kiteHoldings(t.kite.t), 403]);
  if (t.upstox) jobs.push(['Upstox', () => upstoxHoldings(t.upstox.t), 401]);
  if (t.angel) jobs.push(['Angel One', () => angelHoldings(t.angel.t), 401]);
  const lists = await Promise.all(jobs.map(async ([name, fn, expiredCode]) => {
    try { return await fn(); } catch (e) { errors.push({ broker: name, error: e.message, expired: e.status === expiredCode || e.status === 401 || e.status === 403 }); return []; }
  }));
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
  send(res, 200, { holdings: Object.values(merged), errors, connected: { kite: !!t.kite, upstox: !!t.upstox, angel: !!t.angel } });
}
