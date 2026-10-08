// Free NSE prices, history and charts from Yahoo Finance's public chart endpoint.
// Unofficial: no key needed, but Yahoo can rate-limit or change it. Prices may be delayed.
const HOSTS = (process.env.YAHOO_BASE_URL ? [process.env.YAHOO_BASE_URL] : ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const NIFTY = '^NSEI';
export const ySym = (s) => (s === '__NIFTY__' ? NIFTY : s.startsWith('^') || s.includes('.') ? s : `${s}.NS`);

async function yget(path) {
  let last;
  for (const host of HOSTS) {
    try {
      const r = await fetch(host + path, { headers: { 'User-Agent': UA, Accept: 'application/json' }, cache: 'no-store' });
      if (r.ok) return await r.json();
      last = new Error(`Yahoo ${r.status}`);
    } catch (e) { last = e; }
  }
  throw last || new Error('Yahoo unavailable');
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = { error: e.message }; } }
  }));
  return out;
}

// Raw chart: returns { meta, candles:[{t,o,h,l,c,v}] }
export async function yChart(symbol, range = '1y', interval = '1d') {
  const j = await yget(`/v8/finance/chart/${encodeURIComponent(ySym(symbol))}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplits`);
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r) throw new Error((j && j.chart && j.chart.error && j.chart.error.description) || 'No data');
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const ts = r.timestamp || [];
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.close == null || q.close[i] == null) continue;
    candles.push({ t: ts[i] * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume ? q.volume[i] || 0 : 0 });
  }
  return { meta: r.meta || {}, candles };
}

const QCACHE = new Map(); // symbol -> {at, rec}

// Latest price for many symbols. Returns { stocks:{SYM:{ltp,prevClose,volume,name}}, index }
export async function yQuotes(symbols, withIndex = true) {
  const list = Array.from(new Set(symbols.concat(withIndex ? ['__NIFTY__'] : [])));
  const fresh = Date.now() - 15000;
  const need = list.filter((s) => !(QCACHE.has(s) && QCACHE.get(s).at > fresh));
  const res = await pool(need, 8, async (s) => {
    const { meta, candles } = await yChart(s, '1d', '5m');
    const last = candles.length ? candles[candles.length - 1] : null;
    const ltp = meta.regularMarketPrice ?? (last && last.c);
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? ltp;
    const vol = meta.regularMarketVolume ?? candles.reduce((a, c) => a + (c.v || 0), 0);
    return { ltp, prevClose: prev, volume: vol, name: meta.shortName || meta.longName || null };
  });
  need.forEach((s, i) => { if (res[i] && !res[i].error && res[i].ltp) QCACHE.set(s, { at: Date.now(), rec: res[i] }); });
  const out = { stocks: {}, index: null, errors: [] };
  for (const s of list) {
    const c = QCACHE.get(s);
    if (!c) { out.errors.push(s); continue; }
    if (s === '__NIFTY__') out.index = c.rec; else out.stocks[s] = c.rec;
  }
  if (!Object.keys(out.stocks).length && !out.index) throw new Error('Yahoo returned no prices (it may be rate-limiting).');
  return out;
}

const HCACHE = new Map();
// Daily closes ~1y: [[date, close, volume], ...]
export async function yDaily(symbol) {
  const day = new Date().toISOString().slice(0, 10);
  const key = symbol + day;
  if (HCACHE.has(key)) return HCACHE.get(key);
  const { candles } = await yChart(symbol, '1y', '1d');
  const s = candles.map((c) => [new Date(c.t + 5.5 * 3600e3).toISOString().slice(0, 10), c.c, c.v]);
  HCACHE.set(key, s);
  if (HCACHE.size > 400) HCACHE.delete(HCACHE.keys().next().value);
  return s;
}

export { pool };
