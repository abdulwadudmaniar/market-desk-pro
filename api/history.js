// /api/history?symbols=A,B,C&universe=1 — ~1 year of daily closes for each symbol plus the Nifty 50.
// universe=1 also returns the 50 breadth stocks (used for % above 50/200-DMA and 52-week highs/lows).
import { send, query } from '../lib/http.js';
import { requireSession, brokerTokens } from '../lib/auth.js';
import { UNIVERSE } from '../lib/universe.js';
import { upstoxDaily } from '../lib/upstox.js';
import { kiteDaily } from '../lib/kite.js';

const CACHE = new Map(); // `${source}:${symbol}:${day}` -> series
const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9&\-]/g, '');

async function pool(items, limit, gapMs, fn) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]).catch((e) => ({ error: e.message }));
      if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  const q = query(req);
  const t = brokerTokens(req);
  let symbols = String(q.symbols || '').split(',').map(clean).filter(Boolean).slice(0, 60);
  if (q.universe === '1') symbols = Array.from(new Set(symbols.concat(UNIVERSE.map((u) => u.sym))));

  let source = null;
  let fetcher = null;
  let limit = 5;
  let gap = 0;
  if (t.upstox) { source = 'Upstox'; fetcher = (s) => upstoxDaily(t.upstox.t, s); }
  else if (t.kite) { source = 'Zerodha'; fetcher = (s) => kiteDaily(t.kite.t, s); limit = 2; gap = 350; }
  if (!fetcher) return send(res, 200, { source: null, series: {}, index: null, errors: ['Connect a broker to load price history.'] });

  const day = new Date().toISOString().slice(0, 10);
  const get = async (sym) => {
    const key = `${source}:${sym}:${day}`;
    if (CACHE.has(key)) return CACHE.get(key);
    const s = (await fetcher(sym)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    CACHE.set(key, s);
    return s;
  };

  const all = ['__NIFTY__'].concat(symbols);
  const results = await pool(all, limit, gap, get);
  const series = {};
  const errors = [];
  all.forEach((s, i) => {
    const r = results[i];
    if (Array.isArray(r)) series[s] = r;
    else errors.push(`${s === '__NIFTY__' ? 'NIFTY 50' : s}: ${r && r.error}`);
  });
  const index = series.__NIFTY__ || null;
  delete series.__NIFTY__;
  send(res, 200, { source, series, index, errors });
}
