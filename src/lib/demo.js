// Demo portfolio + simulated market, used until a broker is connected (always labelled DEMO / SIM in the UI).
import { rng, gauss } from './stats.js';
import { UNIVERSE, sectorOf } from '../../lib/universe.js';

// `y` = the sample one-year return each demo series is shaped to.
export const DEMO_HOLDINGS = [
  { symbol: 'RELIANCE', qty: 10, avg: 2450, ltp: 2890, prevClose: 2867, b: 1.0, iv: 0.18, y: 0.18 },
  { symbol: 'HDFCBANK', qty: 15, avg: 1580, ltp: 1690, prevClose: 1697, b: 0.9, iv: 0.16, y: 0.12 },
  { symbol: 'INFY', qty: 12, avg: 1520, ltp: 1460, prevClose: 1443, b: 0.8, iv: 0.2, y: -0.04 },
  { symbol: 'TATAMOTORS', qty: 20, avg: 980, ltp: 720, prevClose: 735, b: 1.5, iv: 0.32, y: -0.22 },
  { symbol: 'ITC', qty: 40, avg: 410, ltp: 455, prevClose: 453.6, b: 0.6, iv: 0.15, y: 0.09 },
  { symbol: 'NIFTYBEES', qty: 50, avg: 240, ltp: 275, prevClose: 273.6, b: 1.0, iv: 0.02, y: 0.11 },
  { symbol: 'IRFC', qty: 150, avg: 145, ltp: 118, prevClose: 122.2, b: 1.7, iv: 0.38, y: -0.15 },
].map((h) => ({ ...h, sector: sectorOf(h.symbol), source: 'Demo' }));

// Rescale a simulated path so it starts at end/(1+y) and ends exactly at `end`.
function shape(p, end, y) {
  const T = p.length - 1;
  const k = (1 + y) / (p[T] / p[0]);
  const q = p.map((v, t) => v * Math.pow(k, t / T));
  return q.map((v) => (v * end) / q[T]);
}

function weekdays(n) {
  const out = [];
  const d = new Date();
  while (out.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

export function demoHistory() {
  const dates = weekdays(253);
  const r = rng(5);
  const m = [1];
  const z = [0];
  for (let t = 1; t < dates.length; t++) { z.push(gauss(r)); m.push(m[t - 1] * (1 + 0.12 / 252 + (0.14 / Math.sqrt(252)) * z[t])); }
  const mi = shape(m, 24860, 0.11);
  const index = dates.map((d, t) => [d, mi[t]]);
  const series = {};
  DEMO_HOLDINGS.forEach((h, k) => {
    const rr = rng(17 + k * 7);
    const p = [1];
    for (let t = 1; t < dates.length; t++) p.push(p[t - 1] * (1 + h.b * (0.14 / Math.sqrt(252)) * z[t] + (h.iv / Math.sqrt(252)) * gauss(rr)));
    const q = shape(p, h.ltp, h.y);
    series[h.symbol] = dates.map((d, t) => [d, q[t]]);
  });
  return { source: 'Demo', index, series };
}

// ---------- Simulated breadth feed ----------
export function initSim() {
  const S = { mom: 0.04, stocks: UNIVERSE.map((u) => ({ sym: u.sym, sector: u.sector, beta: 0.6 + Math.random() * 1.0, chg: (Math.random() - 0.45) * 1.6, volume: 1 })) };
  for (let k = 0; k < 30; k++) stepSim(S);
  return S;
}
export function stepSim(S) {
  const avg0 = S.stocks.reduce((a, s) => a + s.chg, 0) / S.stocks.length;
  S.mom = S.mom * 0.9 + (Math.random() - 0.5) * 0.12 - avg0 * 0.01;
  S.stocks.forEach((s) => {
    s.chg += s.beta * S.mom * 0.25 + (Math.random() - 0.5) * 0.26 - s.chg * 0.015;
    s.volume = 0.6 + Math.random() * 0.8 + Math.abs(s.chg) * 0.6;
  });
  S.avg = S.stocks.reduce((a, s) => a + s.chg, 0) / S.stocks.length;
  S.index = { ltp: 24860 * (1 + S.avg / 100), chg: S.avg };
  return S;
}
