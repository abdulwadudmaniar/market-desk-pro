// Zerodha Kite Connect v3 — read-only use (holdings, quotes, daily candles).
// Docs: https://kite.trade/docs/connect/v3/
import crypto from 'node:crypto';

const BASE = process.env.KITE_BASE_URL || 'https://api.kite.trade';
export const KITE_NIFTY_TOKEN = 256265; // NSE:NIFTY 50 index instrument token

export const kiteConfigured = () => !!(process.env.KITE_API_KEY && process.env.KITE_API_SECRET);

export function kiteLoginUrl() {
  return `${process.env.KITE_LOGIN_URL || 'https://kite.zerodha.com/connect/login'}?v=3&api_key=${encodeURIComponent(process.env.KITE_API_KEY)}`;
}

export async function kiteCreateSession(requestToken) {
  const key = process.env.KITE_API_KEY;
  const checksum = crypto.createHash('sha256').update(key + requestToken + process.env.KITE_API_SECRET).digest('hex');
  const r = await fetch(`${BASE}/session/token`, {
    method: 'POST',
    headers: { 'X-Kite-Version': '3', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ api_key: key, request_token: requestToken, checksum }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.data) throw new Error(j.message || `Zerodha login failed (${r.status})`);
  return j.data.access_token;
}

async function kget(path, token, asText = false) {
  const r = await fetch(BASE + path, {
    headers: { 'X-Kite-Version': '3', Authorization: `token ${process.env.KITE_API_KEY}:${token}` },
    cache: 'no-store',
  });
  if (asText) {
    if (!r.ok) throw Object.assign(new Error(`Zerodha error ${r.status}`), { status: r.status });
    return r.text();
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.message || `Zerodha error ${r.status}`), { status: r.status });
  return j.data;
}

export async function kiteHoldings(token) {
  const rows = await kget('/portfolio/holdings', token);
  return (rows || []).map((x) => ({
    broker: 'Zerodha',
    symbol: x.tradingsymbol,
    exchange: x.exchange,
    isin: x.isin,
    qty: (x.quantity || 0) + (x.t1_quantity || 0),
    avg: x.average_price,
    ltp: x.last_price,
    prevClose: x.close_price || x.last_price,
  }));
}

// Full quotes (needs the paid "Connect" plan). symbols are NSE trading symbols.
export async function kiteQuotes(token, symbols, withIndex = true) {
  const out = { stocks: {}, index: null };
  const ids = symbols.map((s) => `NSE:${s}`);
  if (withIndex) ids.push('NSE:NIFTY 50');
  for (let i = 0; i < ids.length; i += 450) {
    const qs = ids.slice(i, i + 450).map((x) => 'i=' + encodeURIComponent(x)).join('&');
    const d = await kget('/quote?' + qs, token);
    for (const k in d) {
      const q = d[k];
      const prev = q.ohlc && q.ohlc.close ? q.ohlc.close : q.last_price - (q.net_change || 0);
      const rec = { ltp: q.last_price, prevClose: prev, volume: q.volume || 0 };
      if (k === 'NSE:NIFTY 50') out.index = rec;
      else out.stocks[k.slice(4)] = rec;
    }
  }
  return out;
}

let INSTR = null;
let INSTR_AT = 0;
async function kiteInstrumentMap(token) {
  if (INSTR && Date.now() - INSTR_AT < 12 * 3600e3) return INSTR;
  const csv = await kget('/instruments/NSE', token, true);
  const lines = csv.split('\n');
  const head = lines[0].split(',');
  const iTok = head.indexOf('instrument_token');
  const iSym = head.indexOf('tradingsymbol');
  const iType = head.indexOf('instrument_type');
  const map = {};
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c[iType] === 'EQ') map[c[iSym]] = Number(c[iTok]);
  }
  INSTR = map;
  INSTR_AT = Date.now();
  return map;
}

const ymd = (d) => d.toISOString().slice(0, 10);

// Daily closes for ~1 year (needs the paid "Connect" plan). Returns [[date, close], ...] ascending.
export async function kiteDaily(token, symbol, days = 400) {
  let instrument = KITE_NIFTY_TOKEN;
  if (symbol !== '__NIFTY__') {
    const map = await kiteInstrumentMap(token);
    instrument = map[symbol];
    if (!instrument) throw new Error(`No Zerodha instrument for ${symbol}`);
  }
  const to = new Date();
  const from = new Date(Date.now() - days * 864e5);
  const d = await kget(`/instruments/historical/${instrument}/day?from=${ymd(from)}&to=${ymd(to)}`, token);
  return (d.candles || []).map((c) => [String(c[0]).slice(0, 10), c[4]]);
}
