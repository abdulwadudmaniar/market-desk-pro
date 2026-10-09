// Market tools the AI agents can call. All read-only: no tool can place orders or move money.
import { yQuotes, yChart, yDaily, pool } from './yahoo.js';
import { holdingNews, bseAnnouncements } from './news.js';
import { UNIVERSE, sectorOf } from './universe.js';

const TABS = ['core', 'command', 'news', 'charts', 'screener', 'risk', 'stress', 'opt', 'deriv', 'alpha', 'positions', 'tools', 'connect', 'desk'];
const clean = (s) => String(s || '').toUpperCase().replace(/\.NS$/, '').replace(/[^A-Z0-9&\-]/g, '');
const r2 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const rets = (p) => p.slice(1).map((v, i) => v / p[i] - 1);

export const TOOL_DEFS = [
  { name: 'get_quotes', description: 'Latest price, previous close and % change today for NSE stocks (and NIFTY for the Nifty 50 index). Free feed, may be slightly delayed.', input_schema: { type: 'object', properties: { symbols: { type: 'array', items: { type: 'string' }, description: 'NSE trading symbols, e.g. ["RELIANCE","TCS"]. Use NIFTY for the index.' } }, required: ['symbols'] } },
  { name: 'get_technicals', description: 'One-year technical snapshot of an NSE stock: returns (1W/1M/3M/6M/1Y), RSI14, position vs 20/50/200-day averages, distance from 52-week high/low, annualised volatility, beta vs Nifty, max drawdown, volume vs 20-day average, support/resistance levels.', input_schema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } },
  { name: 'backtest_setup', description: 'Evidence check: finds every past occurrence (up to 5 years) of a technical setup in a stock and reports what happened over the next N trading days (count, % of times it rose, average/median/worst/best return) vs the stock\'s normal N-day return. Past results do not guarantee future results.', input_schema: { type: 'object', properties: { symbol: { type: 'string' }, setup: { type: 'string', enum: ['rsi_below_30', 'rsi_above_70', 'new_52w_high', 'near_52w_low', 'cross_above_200dma', 'cross_below_200dma', 'drop_5pct_day', 'gain_5pct_day', 'golden_cross_50_200', 'death_cross_50_200'] }, horizon_days: { type: 'integer', minimum: 5, maximum: 120, description: 'Trading days ahead, e.g. 20 ≈ 1 month' } }, required: ['symbol', 'setup'] } },
  { name: 'probability_range', description: 'Statistical price range for a stock over the next N trading days based on its own recent volatility (5th/25th/50th/75th/95th percentiles). A range of likely outcomes, not a forecast.', input_schema: { type: 'object', properties: { symbol: { type: 'string' }, days: { type: 'integer', minimum: 1, maximum: 252 } }, required: ['symbol', 'days'] } },
  { name: 'get_news', description: 'Recent headlines for a company (Google News) plus any BSE corporate filings that mention it in the last 2 days.', input_schema: { type: 'object', properties: { symbol: { type: 'string' }, company_name: { type: 'string', description: 'Optional full company name to improve matching' } }, required: ['symbol'] } },
  { name: 'screen_market', description: 'Scans the 50 large-cap NSE stocks (plus optional extra symbols) and returns those matching a preset screen, ranked.', input_schema: { type: 'object', properties: { preset: { type: 'string', enum: ['momentum_leaders', 'near_52w_high', 'pullback_in_uptrend', 'oversold', 'volume_spike', 'near_52w_low', 'breakdown_risk', 'low_volatility'] }, extra_symbols: { type: 'array', items: { type: 'string' } }, limit: { type: 'integer', minimum: 3, maximum: 20 } }, required: ['preset'] } },
  { name: 'navigate', description: 'Move the user\'s dashboard to a tab (optionally opening a stock chart). Use when the user asks to open/show/go to something.', input_schema: { type: 'object', properties: { tab: { type: 'string', enum: TABS }, symbol: { type: 'string', description: 'For tab=charts: the stock to open' } }, required: ['tab'] } },
];

async function closesWithDates(symbol, range = '1y') {
  if (range === '1y') return (await yDaily(symbol)).filter((x) => x[1] != null);
  const { candles } = await yChart(symbol, range, '1d');
  return candles.map((c) => [new Date(c.t).toISOString().slice(0, 10), c.c, c.v]);
}

function rsiSeries(c, n = 14) {
  const out = c.map(() => null);
  let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    if (i <= n) { if (d > 0) g += d; else l -= d; if (i === n) { g /= n; l /= n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } continue; }
    g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
const smaAt = (c, i, n) => (i + 1 >= n ? mean(c.slice(i + 1 - n, i + 1)) : null);

export function technicals(series, idx) {
  const c = series.map((x) => x[1]), v = series.map((x) => x[2] || 0), L = c.length, last = c[L - 1];
  const back = (n) => (L > n ? r2((last / c[L - 1 - n] - 1) * 100) : null);
  const hi = Math.max(...c), lo = Math.min(...c);
  let peak = c[0], mdd = 0; for (const p of c) { peak = Math.max(peak, p); mdd = Math.min(mdd, p / peak - 1); }
  const rsi = rsiSeries(c);
  const s20 = smaAt(c, L - 1, 20), s50 = smaAt(c, L - 1, 50), s200 = smaAt(c, L - 1, 200);
  let beta = null;
  if (idx && idx.length > 60) {
    const m = new Map(idx.map((x) => [x[0], x[1]]));
    const pairs = series.filter((x) => m.has(x[0])).map((x) => [x[1], m.get(x[0])]);
    const a = rets(pairs.map((p) => p[0])), b = rets(pairs.map((p) => p[1]));
    const mb = mean(b), ma = mean(a);
    beta = r2(a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / b.reduce((s, x) => s + (x - mb) ** 2, 0));
  }
  const recent = c.slice(-60);
  const vol20 = mean(v.slice(-21, -1));
  return {
    last: r2(last), returns_pct: { '1W': back(5), '1M': back(21), '3M': back(63), '6M': back(126), '1Y': r2((last / c[0] - 1) * 100) },
    rsi14: r2(rsi[L - 1]), sma20: r2(s20), sma50: r2(s50), sma200: r2(s200),
    above_sma50: s50 ? last > s50 : null, above_sma200: s200 ? last > s200 : null,
    high_52w: r2(hi), low_52w: r2(lo), pct_from_52w_high: r2((last / hi - 1) * 100), pct_from_52w_low: r2((last / lo - 1) * 100),
    annual_volatility_pct: r2(sd(rets(c.slice(-61))) * Math.sqrt(252) * 100), beta_vs_nifty: beta, max_drawdown_1y_pct: r2(mdd * 100),
    volume_vs_20d_avg: vol20 ? r2(v[L - 1] / vol20) : null,
    support_60d: r2(Math.min(...recent)), resistance_60d: r2(Math.max(...recent)), as_of: series[L - 1][0],
  };
}

export function backtest(series, setup, H = 20) {
  const c = series.map((x) => x[1]); const L = c.length;
  const rsi = rsiSeries(c);
  const sig = (i) => {
    const s50 = smaAt(c, i, 50), s200 = smaAt(c, i, 200), p50 = smaAt(c, i - 1, 50), p200 = smaAt(c, i - 1, 200);
    const win = c.slice(Math.max(0, i - 251), i);
    switch (setup) {
      case 'rsi_below_30': return rsi[i] != null && rsi[i] < 30 && rsi[i - 1] >= 30;
      case 'rsi_above_70': return rsi[i] != null && rsi[i] > 70 && rsi[i - 1] <= 70;
      case 'new_52w_high': return win.length > 200 && c[i] > Math.max(...win);
      case 'near_52w_low': return win.length > 200 && c[i] <= Math.min(...win) * 1.02;
      case 'cross_above_200dma': return s200 && p200 && c[i] > s200 && c[i - 1] <= p200;
      case 'cross_below_200dma': return s200 && p200 && c[i] < s200 && c[i - 1] >= p200;
      case 'drop_5pct_day': return c[i] / c[i - 1] - 1 <= -0.05;
      case 'gain_5pct_day': return c[i] / c[i - 1] - 1 >= 0.05;
      case 'golden_cross_50_200': return s50 && s200 && p50 && p200 && s50 > s200 && p50 <= p200;
      case 'death_cross_50_200': return s50 && s200 && p50 && p200 && s50 < s200 && p50 >= p200;
      default: return false;
    }
  };
  const fwd = [], dates = [];
  for (let i = 15; i < L - H; i++) {
    if (sig(i)) { fwd.push(c[i + H] / c[i] - 1); dates.push(series[i][0]); i += Math.max(5, Math.floor(H / 2)); }
  }
  const base = [];
  for (let i = 0; i < L - H; i += 5) base.push(c[i + H] / c[i] - 1);
  const stat = (a) => (a.length ? { count: a.length, pct_positive: r2((a.filter((x) => x > 0).length / a.length) * 100), avg_return_pct: r2(mean(a) * 100), median_return_pct: r2(a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] * 100), worst_pct: r2(Math.min(...a) * 100), best_pct: r2(Math.max(...a) * 100) } : { count: 0 });
  return { setup, horizon_trading_days: H, period: `${series[0][0]} to ${series[L - 1][0]}`, after_setup: stat(fwd), all_periods_baseline: stat(base), recent_occurrences: dates.slice(-5), caution: fwd.length < 8 ? 'Small sample — treat as weak evidence.' : undefined };
}

async function screen(preset, extra = [], limit = 10) {
  const syms = Array.from(new Set(UNIVERSE.map((u) => u.sym).concat(extra.map(clean).filter(Boolean)))).slice(0, 80);
  const res = await pool(syms, 8, (s) => yDaily(s));
  const rows = [];
  syms.forEach((s, i) => {
    const ser = res[i];
    if (!Array.isArray(ser) || ser.length < 60) return;
    const t = technicals(ser);
    rows.push({ symbol: s, sector: sectorOf(s), price: t.last, r1m: t.returns_pct['1M'], r3m: t.returns_pct['3M'], rsi14: t.rsi14, above_sma50: t.above_sma50, above_sma200: t.above_sma200, pct_from_52w_high: t.pct_from_52w_high, pct_from_52w_low: t.pct_from_52w_low, vol_pct: t.annual_volatility_pct, volume_x: t.volume_vs_20d_avg });
  });
  const P = {
    momentum_leaders: [(r) => r.r3m > 10 && r.above_sma200, (a, b) => b.r3m - a.r3m],
    near_52w_high: [(r) => r.pct_from_52w_high > -3, (a, b) => b.pct_from_52w_high - a.pct_from_52w_high],
    pullback_in_uptrend: [(r) => r.above_sma200 && !r.above_sma50, (a, b) => a.rsi14 - b.rsi14],
    oversold: [(r) => r.rsi14 < 35, (a, b) => a.rsi14 - b.rsi14],
    volume_spike: [(r) => r.volume_x > 1.8, (a, b) => b.volume_x - a.volume_x],
    near_52w_low: [(r) => r.pct_from_52w_low < 5, (a, b) => a.pct_from_52w_low - b.pct_from_52w_low],
    breakdown_risk: [(r) => r.above_sma200 === false && r.r3m < -10, (a, b) => a.r3m - b.r3m],
    low_volatility: [() => true, (a, b) => a.vol_pct - b.vol_pct],
  }[preset];
  const out = rows.filter(P[0]).sort(P[1]).slice(0, limit);
  return { preset, scanned: rows.length, matches: out.length, results: out };
}

// Runs one tool call. Returns { result } or { result, action } for UI actions.
export async function runTool(name, input) {
  switch (name) {
    case 'get_quotes': {
      const syms = (input.symbols || []).map((s) => (clean(s) === 'NIFTY' || clean(s) === 'NIFTY50' ? '__NIFTY__' : clean(s))).filter(Boolean).slice(0, 15);
      const q = await yQuotes(syms.filter((s) => s !== '__NIFTY__'), syms.includes('__NIFTY__'));
      const fmt = (r) => ({ price: r2(r.ltp), prev_close: r2(r.prevClose), change_pct: r2((r.ltp / r.prevClose - 1) * 100), name: r.name || undefined });
      const out = {};
      for (const [k, v] of Object.entries(q.stocks)) out[k] = fmt(v);
      if (q.index) out.NIFTY = fmt(q.index);
      return { result: { quotes: out, source: 'Yahoo Finance (may be delayed)' } };
    }
    case 'get_technicals': {
      const s = clean(input.symbol);
      const [ser, idx] = await Promise.all([closesWithDates(s), yDaily('__NIFTY__').catch(() => null)]);
      if (ser.length < 30) throw new Error(`Not enough price history for ${s}`);
      return { result: { symbol: s, sector: sectorOf(s), ...technicals(ser, idx) } };
    }
    case 'backtest_setup': {
      const s = clean(input.symbol);
      const ser = await closesWithDates(s, '5y');
      if (ser.length < 250) throw new Error(`Not enough history for ${s}`);
      return { result: { symbol: s, ...backtest(ser, input.setup, Math.min(120, Math.max(5, input.horizon_days || 20))) } };
    }
    case 'probability_range': {
      const s = clean(input.symbol);
      const ser = await closesWithDates(s);
      const c = ser.map((x) => x[1]);
      const sig = sd(rets(c.slice(-127)));
      const d = Math.min(252, Math.max(1, input.days || 20)), last = c[c.length - 1];
      const z = { p5: -1.645, p25: -0.674, p50: 0, p75: 0.674, p95: 1.645 };
      const out = {};
      for (const [k, zz] of Object.entries(z)) out[k] = r2(last * Math.exp(-0.5 * sig * sig * d + zz * sig * Math.sqrt(d)));
      return { result: { symbol: s, last: r2(last), trading_days: d, daily_volatility_pct: r2(sig * 100), price_percentiles: out, note: 'Assumes recent volatility continues and no drift; real markets have fatter tails.' } };
    }
    case 'get_news': {
      const s = clean(input.symbol);
      const [g, b] = await Promise.all([holdingNews([s]), bseAnnouncements()]);
      const name = String(input.company_name || '').toLowerCase().replace(/\b(ltd|limited)\b\.?/g, '').trim();
      const filings = (b.items || []).filter((i) => (name && i.title.toLowerCase().includes(name)) || i.title.toUpperCase().includes(s)).slice(0, 6);
      const items = (g[0] ? g[0].items : []).slice(0, 8);
      return { result: { symbol: s, headlines: items.map((i) => ({ title: i.title, source: i.source, time: i.time ? new Date(i.time).toISOString() : null, link: i.link })), bse_filings: filings.map((i) => ({ title: i.title, time: i.time ? new Date(i.time).toISOString() : null, link: i.link })), unavailable: [g[0] && g[0].fail, b.fail].filter(Boolean) } };
    }
    case 'screen_market':
      return { result: await screen(input.preset, input.extra_symbols || [], Math.min(20, input.limit || 10)) };
    case 'navigate': {
      const tab = TABS.includes(input.tab) ? input.tab : 'command';
      const symbol = input.symbol ? clean(input.symbol) : undefined;
      return { result: { ok: true, opened: tab, symbol }, action: { type: 'navigate', tab, symbol } };
    }
    default:
      throw new Error('Unknown tool');
  }
}
