// /api/history?symbols=A,B,C&universe=1 — ~1 year of daily [date, close, volume] for each symbol plus the Nifty 50.
// universe=1 adds the 50 breadth stocks. Source: Upstox if connected, otherwise Yahoo Finance (free).
import { send, query } from '../lib/http.js';
import { requireSession, brokerTokens } from '../lib/auth.js';
import { UNIVERSE } from '../lib/universe.js';
import { upstoxDaily } from '../lib/upstox.js';
import { yDaily, pool } from '../lib/yahoo.js';

const CACHE = new Map();
const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9&\-]/g, '');

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  const q = query(req);
  const t = brokerTokens(req);
  let symbols = String(q.symbols || '').split(',').map(clean).filter(Boolean).slice(0, 120);
  if (q.universe === '1') symbols = Array.from(new Set(symbols.concat(UNIVERSE.map((u) => u.sym))));

  const sources = [];
  if (t.upstox) sources.push(['Upstox', (s) => upstoxDaily(t.upstox.t, s)]);
  if (process.env.DISABLE_YAHOO !== '1') sources.push(['Yahoo', (s) => yDaily(s)]);
  if (!sources.length) return send(res, 200, { source: null, series: {}, index: null, errors: ['No price-history source available.'] });

  const day = new Date().toISOString().slice(0, 10);
  const all = ['__NIFTY__'].concat(symbols);
  const used = new Set();
  const results = await pool(all, 6, async (sym) => {
    let lastErr;
    for (const [name, fn] of sources) {
      const key = `${name}:${sym}:${day}`;
      if (CACHE.has(key)) { used.add(name); return CACHE.get(key); }
      try {
        const s = (await fn(sym)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
        if (s.length < 5) throw new Error('too little data');
        CACHE.set(key, s);
        if (CACHE.size > 600) CACHE.delete(CACHE.keys().next().value);
        used.add(name);
        return s;
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  });
  const series = {};
  const errors = [];
  all.forEach((s, i) => {
    const r = results[i];
    if (Array.isArray(r)) series[s] = r;
    else errors.push(`${s === '__NIFTY__' ? 'NIFTY 50' : s}: ${r && r.error}`);
  });
  const index = series.__NIFTY__ || null;
  delete series.__NIFTY__;
  send(res, 200, { source: Array.from(used).join(' + ') || null, series, index, errors });
}
