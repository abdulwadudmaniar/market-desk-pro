// Upstox API v2 — read-only use (holdings, quotes, daily candles).
// Docs: https://upstox.com/developer/api-documentation/
import zlib from 'node:zlib';

const BASE = process.env.UPSTOX_BASE_URL || 'https://api.upstox.com/v2';
export const UPSTOX_NIFTY_KEY = 'NSE_INDEX|Nifty 50';

export const upstoxConfigured = () => !!(process.env.UPSTOX_API_KEY && process.env.UPSTOX_API_SECRET);

export function upstoxRedirectUri(origin) {
  return process.env.UPSTOX_REDIRECT_URI || `${origin}/api/upstox-callback`;
}

export function upstoxLoginUrl(origin) {
  const p = new URLSearchParams({ response_type: 'code', client_id: process.env.UPSTOX_API_KEY, redirect_uri: upstoxRedirectUri(origin) });
  return `${BASE}/login/authorization/dialog?${p}`;
}

export async function upstoxCreateSession(code, origin) {
  const r = await fetch(`${BASE}/login/authorization/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      code,
      client_id: process.env.UPSTOX_API_KEY,
      client_secret: process.env.UPSTOX_API_SECRET,
      redirect_uri: upstoxRedirectUri(origin),
      grant_type: 'authorization_code',
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error((j.errors && j.errors[0] && j.errors[0].message) || `Upstox login failed (${r.status})`);
  return j.access_token;
}

async function uget(path, token) {
  const r = await fetch(BASE + path, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.errors && j.errors[0] && j.errors[0].message) || `Upstox error ${r.status}`;
    throw Object.assign(new Error(msg), { status: r.status });
  }
  return j.data;
}

export async function upstoxHoldings(token) {
  const rows = await uget('/portfolio/long-term-holdings', token);
  return (rows || []).map((x) => ({
    broker: 'Upstox',
    symbol: x.tradingsymbol || x.trading_symbol,
    exchange: x.exchange,
    isin: x.isin,
    qty: x.quantity,
    avg: x.average_price,
    ltp: x.last_price,
    prevClose: x.close_price || x.last_price,
  }));
}

// Public instrument master (symbol -> instrument key), refreshed every 12h.
let INSTR = null;
let INSTR_AT = 0;
async function instrumentMap() {
  if (INSTR && Date.now() - INSTR_AT < 12 * 3600e3) return INSTR;
  const r = await fetch(process.env.UPSTOX_INSTRUMENTS_URL || 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz');
  if (!r.ok) throw new Error('Could not download the Upstox instrument list');
  const buf = Buffer.from(await r.arrayBuffer());
  let text;
  try { text = zlib.gunzipSync(buf).toString(); } catch { text = buf.toString(); }
  const map = {};
  const isin = {};
  for (const x of JSON.parse(text)) {
    if (x.segment === 'NSE_EQ' && (x.instrument_type === 'EQ' || !x.instrument_type)) {
      map[x.trading_symbol] = x.instrument_key;
      if (x.isin) isin[x.isin] = x.trading_symbol;
    }
  }
  INSTR = map;
  ISIN = isin;
  INSTR_AT = Date.now();
  return map;
}
let ISIN = null;

// ISIN -> NSE symbol, using the public Upstox instrument list (no login needed).
export async function symbolsForIsins(isins) {
  await instrumentMap();
  const out = {};
  for (const i of isins) if (ISIN[i]) out[i] = ISIN[i];
  return out;
}

export async function upstoxQuotes(token, symbols, withIndex = true) {
  const map = await instrumentMap();
  const keys = symbols.map((s) => map[s]).filter(Boolean);
  if (withIndex) keys.push(UPSTOX_NIFTY_KEY);
  const out = { stocks: {}, index: null };
  for (let i = 0; i < keys.length; i += 450) {
    const d = await uget('/market-quote/quotes?instrument_key=' + encodeURIComponent(keys.slice(i, i + 450).join(',')), token);
    for (const k in d) {
      const q = d[k];
      const rec = { ltp: q.last_price, prevClose: q.last_price - (q.net_change || 0), volume: q.volume || 0 };
      if (k.startsWith('NSE_INDEX')) out.index = rec;
      else out.stocks[q.symbol || k.split(':')[1]] = rec;
    }
  }
  return out;
}

const ymd = (d) => d.toISOString().slice(0, 10);

export async function upstoxDaily(token, symbol, days = 400) {
  let key = UPSTOX_NIFTY_KEY;
  if (symbol !== '__NIFTY__') {
    const map = await instrumentMap();
    key = map[symbol];
    if (!key) throw new Error(`No Upstox instrument for ${symbol}`);
  }
  const to = ymd(new Date());
  const from = ymd(new Date(Date.now() - days * 864e5));
  const d = await uget(`/historical-candle/${encodeURIComponent(key)}/day/${to}/${from}`, token);
  return (d.candles || []).map((c) => [String(c[0]).slice(0, 10), c[4]]).reverse();
}
