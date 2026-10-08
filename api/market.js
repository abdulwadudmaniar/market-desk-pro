// /api/market?extra=SYM1,SYM2 — live quotes for the 50-stock breadth universe, the Nifty 50 and any extra symbols.
// Order: Upstox (official, real-time) if connected → Yahoo Finance (free, no login) → Zerodha (paid Connect plan).
import { send, query } from '../lib/http.js';
import { requireSession, brokerTokens } from '../lib/auth.js';
import { UNIVERSE } from '../lib/universe.js';
import { upstoxQuotes } from '../lib/upstox.js';
import { kiteQuotes } from '../lib/kite.js';
import { yQuotes } from '../lib/yahoo.js';

const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9&\-]/g, '');

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  const t = brokerTokens(req);
  const extra = String(query(req).extra || '').split(',').map(clean).filter(Boolean).slice(0, 100);
  const symbols = Array.from(new Set(UNIVERSE.map((u) => u.sym).concat(extra)));
  const warnings = [];
  const tries = [];
  if (t.upstox) tries.push(['Upstox', () => upstoxQuotes(t.upstox.t, symbols)]);
  if (process.env.DISABLE_YAHOO !== '1') tries.push(['Yahoo', () => yQuotes(symbols)]);
  if (t.kite) tries.push(['Zerodha', () => kiteQuotes(t.kite.t, symbols)]);
  for (const [name, fn] of tries) {
    try {
      const q = await fn();
      return send(res, 200, { source: name, delayed: name === 'Yahoo', at: Date.now(), stocks: q.stocks, index: q.index, warnings });
    } catch (e) {
      warnings.push(`${name}: ${e.message}`);
    }
  }
  send(res, 200, { source: null, at: Date.now(), stocks: {}, index: null, warnings });
}
