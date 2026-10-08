// /api/chart?symbol=RELIANCE&range=1y — OHLCV candles for the Charts tab (Yahoo Finance, free).
import { send, query } from '../lib/http.js';
import { requireSession } from '../lib/auth.js';
import { yChart } from '../lib/yahoo.js';

const RANGES = { '1d': '5m', '5d': '15m', '1mo': '1h', '6mo': '1d', '1y': '1d', '5y': '1wk' };
const CACHE = new Map();

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  const q = query(req);
  const symbol = String(q.symbol || '').toUpperCase().replace(/[^A-Z0-9&\-^]/g, '');
  const range = RANGES[q.range] ? q.range : '1y';
  if (!symbol) return send(res, 400, { error: 'Pick a symbol.' });
  const key = `${symbol}:${range}`;
  const ttl = range === '1d' ? 30000 : range === '5d' ? 120000 : 900000;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < ttl) return send(res, 200, hit.data);
  try {
    const { meta, candles } = await yChart(symbol === 'NIFTY' ? '__NIFTY__' : symbol, range, RANGES[range]);
    const data = {
      symbol, range, source: 'Yahoo',
      name: meta.longName || meta.shortName || symbol,
      currency: meta.currency || 'INR',
      price: meta.regularMarketPrice, prevClose: meta.chartPreviousClose ?? meta.previousClose,
      high52: meta.fiftyTwoWeekHigh, low52: meta.fiftyTwoWeekLow,
      candles,
    };
    CACHE.set(key, { at: Date.now(), data });
    if (CACHE.size > 300) CACHE.delete(CACHE.keys().next().value);
    send(res, 200, data);
  } catch (e) {
    send(res, 502, { error: `Couldn't load ${symbol}: ${e.message}. Check the NSE symbol.` });
  }
}
