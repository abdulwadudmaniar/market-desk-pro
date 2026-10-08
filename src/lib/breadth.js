// Live market-breadth engine: turns a list of {sym, sector, chg, volume} into breadth stats,
// keeping a short in-session memory (A-D line, breadth momentum, event tape).
import { pct } from './format.js';

export function createEngine() {
  return { hist: [], e19: null, e39: null, ad: 0, prev: {}, feed: [], last: 0 };
}

const time = () => {
  const d = new Date(Date.now() + 5.5 * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
};

export function pushEvent(E, msg, kind = 'info') {
  E.feed.unshift({ id: Math.random().toString(36).slice(2), time: time(), msg, kind });
  if (E.feed.length > 9) E.feed.pop();
}

export function stepEngine(E, stocks) {
  const N = stocks.length || 1;
  let adv = 0, dec = 0, upV = 0, dnV = 0, sum = 0;
  const hasVol = stocks.some((s) => s.volume > 0);
  for (const s of stocks) {
    const v = hasVol ? s.volume || 0 : 1;
    if (s.chg > 0.05) { adv++; upV += v; } else if (s.chg < -0.05) { dec++; dnV += v; }
    sum += s.chg;
    const p = E.prev[s.sym];
    if (p !== undefined) {
      if (s.chg >= 2 && p < 2) pushEvent(E, `${s.sym} breaks above +2% (${pct(s.chg, 1)})`, 'up');
      else if (s.chg <= -2 && p > -2) pushEvent(E, `${s.sym} slides below −2% (${pct(s.chg, 1)})`, 'down');
    }
    E.prev[s.sym] = s.chg;
  }
  const unch = N - adv - dec;
  const net = adv - dec;
  E.ad += net;
  E.hist.push(E.ad);
  if (E.hist.length > 120) E.hist.shift();
  E.e19 = E.e19 == null ? net : E.e19 + (net - E.e19) * 0.1;
  E.e39 = E.e39 == null ? net : E.e39 + (net - E.e39) * 0.05;
  const adr = adv / Math.max(dec, 1);
  const trin = hasVol && upV && dnV ? adr / (upV / dnV) : null;
  const mcc = (E.e19 - E.e39) * 4;
  const upVolPct = upV + dnV ? (upV / (upV + dnV)) * 100 : 50;
  const score = (adr > 1.3 ? 1 : adr < 0.77 ? -1 : 0) + (trin == null ? 0 : trin < 0.85 ? 1 : trin > 1.15 ? -1 : 0) + (mcc > 5 ? 1 : mcc < -5 ? -1 : 0) + (upVolPct > 60 ? 1 : upVolPct < 40 ? -1 : 0);
  const regime = score >= 2 ? 'RISK-ON' : score <= -2 ? 'RISK-OFF' : 'BALANCED';
  const sectors = {};
  for (const s of stocks) { (sectors[s.sector] = sectors[s.sector] || { sum: 0, n: 0 }); sectors[s.sector].sum += s.chg; sectors[s.sector].n++; }
  return {
    N, adv, dec, unch, net, adr, trin, mcc, upVolPct, regime, score, avg: sum / N,
    hist: E.hist.slice(), feed: E.feed.slice(),
    sectors: Object.keys(sectors).map((k) => ({ name: k, v: sectors[k].sum / sectors[k].n })).sort((a, b) => b.v - a.v),
    sorted: stocks.slice().sort((a, b) => b.chg - a.chg),
  };
}

// Daily breadth from ~1y of closes for the universe: % above 50/200-DMA, 52-week highs/lows.
export function dailyBreadth(series, symbols) {
  let n = 0, a50 = 0, a200 = 0, hi = 0, lo = 0;
  for (const s of symbols) {
    const p = (series[s] || []).map((x) => x[1]);
    if (p.length < 200) continue;
    n++;
    const last = p[p.length - 1];
    const m50 = p.slice(-50).reduce((x, y) => x + y, 0) / 50;
    const m200 = p.slice(-200).reduce((x, y) => x + y, 0) / 200;
    const yr = p.slice(-252, -1);
    if (last > m50) a50++;
    if (last > m200) a200++;
    if (last >= Math.max(...yr)) hi++;
    if (last <= Math.min(...yr)) lo++;
  }
  if (!n) return null;
  return { p50: (a50 / n) * 100, p200: (a200 / n) * 100, highs: hi, lows: lo, n };
}
