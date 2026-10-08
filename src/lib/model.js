// Portfolio risk model built from real holdings + real daily price history.
import { mean, sd, cov, corr, returns, percentile, rng, ema, sma } from './stats.js';
import { inr, pct, clamp } from './format.js';

export const RF = 0.065; // assumed risk-free rate (approx. Indian T-bill), used for Sharpe
export const MRP = 0.06; // assumed equity risk premium, used to shrink expected returns

function align(dates, series) {
  if (!series || series.length < 2) return null;
  const m = new Map(series);
  const out = [];
  let last = null;
  let hits = 0;
  for (const d of dates) {
    if (m.has(d)) { last = m.get(d); hits++; }
    out.push(last);
  }
  if (hits < dates.length * 0.6) return null;
  const first = out.find((v) => v != null);
  return out.map((v) => (v == null ? first : v));
}

export function buildModel(holdings, hist) {
  const H = holdings.filter((h) => h.qty > 0 && h.ltp > 0);
  const n = H.length;
  let total = 0, invested = 0, day = 0;
  H.forEach((h) => {
    total += h.qty * h.ltp;
    invested += h.qty * h.avg;
    day += h.qty * (h.ltp - (h.prevClose || h.ltp));
  });
  if (!n) return { empty: true, total: 0, invested: 0, day: 0, rows: [] };
  const w = H.map((h) => (h.qty * h.ltp) / total);

  // ---- history alignment
  const index = hist && hist.index && hist.index.length > 60 ? hist.index.slice(-253) : null;
  const dates = index ? index.map((x) => x[0]) : [];
  const idxPx = index ? index.map((x) => x[1]) : [];
  const rm = index ? returns(idxPx) : [];
  const sigM = index ? sd(rm) * Math.sqrt(252) : 0.15;
  const px = H.map((h) => (index && hist.series ? align(dates, hist.series[h.symbol]) : null));
  const rets = px.map((p) => (p ? returns(p) : null));
  const hasHist = !!index && px.some(Boolean);

  const beta = H.map((h, i) => (rets[i] ? cov(rets[i], rm) / (sd(rm) ** 2 || 1) : 1));
  const vol = H.map((h, i) => (rets[i] ? sd(rets[i]) * Math.sqrt(252) : 0.28));
  const mu = H.map((h, i) => {
    const capm = RF + beta[i] * MRP;
    return rets[i] ? 0.5 * clamp(mean(rets[i]) * 252, -0.5, 0.8) + 0.5 * capm : capm;
  });
  const C = [];
  for (let i = 0; i < n; i++) {
    C.push([]);
    for (let j = 0; j < n; j++) {
      if (rets[i] && rets[j]) C[i][j] = cov(rets[i], rets[j]) * 252;
      else if (i === j) C[i][j] = vol[i] * vol[i];
      else C[i][j] = beta[i] * beta[j] * sigM * sigM;
    }
  }
  const stats = (wv) => {
    let m = 0, v = 0;
    for (let i = 0; i < n; i++) {
      m += wv[i] * mu[i];
      for (let j = 0; j < n; j++) v += wv[i] * wv[j] * C[i][j];
    }
    const s = Math.sqrt(Math.max(v, 1e-12));
    return { mu: m, sig: s, sh: (m - RF) / s };
  };
  const cur = stats(w);
  const pBeta = w.reduce((s, wi, i) => s + wi * beta[i], 0);
  const rc = w.map((wi, i) => (wi * C[i].reduce((s, c, j) => s + c * w[j], 0)) / (cur.sig * cur.sig));
  const dSig = cur.sig / Math.sqrt(252);
  const var95 = 1.645 * dSig * total, var99 = 2.326 * dSig * total, cvar95 = 2.063 * dSig * total;

  // ---- realised history of today's portfolio
  let port = null, nifty = null, dd = null, real = null;
  if (hasHist) {
    port = dates.map((_, t) => H.reduce((s, h, i) => s + h.qty * (px[i] ? px[i][t] : h.ltp), 0));
    nifty = idxPx.map((v) => (v * port[0]) / idxPx[0]);
    const pr = returns(port);
    let peak = port[0], maxDD = 0;
    dd = port.map((v) => { peak = Math.max(peak, v); const d = v / peak - 1; maxDD = Math.min(maxDD, d); return d; });
    const ret1Y = port[port.length - 1] / port[0] - 1;
    const niftyRet = idxPx[idxPx.length - 1] / idxPx[0] - 1;
    const rv = sd(pr) * Math.sqrt(252);
    const down = Math.sqrt(mean(pr.map((x) => Math.min(x, 0) ** 2))) * Math.sqrt(252);
    const active = pr.map((x, i) => x - rm[i]);
    real = {
      ret1Y, niftyRet, vol: rv, maxDD,
      sharpe: rv ? (ret1Y - RF) / rv : 0,
      sortino: down ? (ret1Y - RF) / down : 0,
      te: sd(active) * Math.sqrt(252),
      hvar95: -percentile(pr, 0.05) * total,
      days: pr.length,
    };
  }

  // ---- per-holding flags
  const rows = H.map((h, i) => {
    const value = h.qty * h.ltp, cost = h.qty * h.avg, pnl = value - cost, pnlPct = cost ? (pnl / cost) * 100 : 0;
    const weight = w[i] * 100, chg = h.prevClose ? (h.ltp / h.prevClose - 1) * 100 : 0;
    let score = 0;
    const reasons = [];
    if (pnlPct < -15) { score += 2; reasons.push(`Down ${Math.abs(pnlPct).toFixed(1)}% from your average buy price of ${inr(h.avg)} — a large loss for one position.`); }
    else if (pnlPct < -5) { score += 1; reasons.push(`Down ${Math.abs(pnlPct).toFixed(1)}% from your buy price.`); }
    if (beta[i] >= 1.4) { score += 1; reasons.push(`Beta ${beta[i].toFixed(2)}: it has moved about ${beta[i].toFixed(1)}× as much as the Nifty${rets[i] ? ' over the past year' : ''}.`); }
    if (vol[i] > 0.4) { score += 1; reasons.push(`Very volatile: about ${(vol[i] * 100).toFixed(0)}% a year (the Nifty is about ${(sigM * 100).toFixed(0)}%).`); }
    if (weight > 20) { score += 1; reasons.push(`${weight.toFixed(1)}% of the portfolio — above the 20% single-stock guideline.`); }
    if (rc[i] * 100 > weight * 1.5 && rc[i] > 0.12) { score += 1; reasons.push(`Carries ${(rc[i] * 100).toFixed(1)}% of total portfolio risk while being ${weight.toFixed(1)}% of the money.`); }
    if (chg <= -3) { score += 1; reasons.push(`Fell ${Math.abs(chg).toFixed(1)}% today. Check for company news.`); }
    const status = score >= 3 ? 'Risky' : score >= 1 ? 'Watch' : 'Safe';
    if (!reasons.length) reasons.push('Nothing unusual — price, volatility, size and risk share are all in a comfortable range.');
    const prompts = status === 'Risky'
      ? ['Why did I buy this, and is that reason still true?', `Is the fall about this company or the whole ${h.sector} sector?`, `If I had fresh cash, would I buy it at ${inr(h.ltp)}?`]
      : status === 'Watch' ? ['Am I comfortable with this much in one stock?', 'What would make me trim or add?']
      : ['When are the next results, and what will I look for?', 'Is it still doing the job I bought it for?'];
    const sp = px[i] ? px[i].slice(-30) : null;
    return {
      ...h, value, cost, pnl, pnlPct, weight, chg, beta: beta[i], vol: vol[i], rc: rc[i], mu: mu[i], hasHist: !!px[i],
      status, reasons, prompts, spark: sp, prices: px[i], rets: rets[i],
      breakEven: h.ltp < h.avg ? (h.avg / h.ltp - 1) * 100 : 0,
      var95: 1.645 * (vol[i] / Math.sqrt(252)) * value,
    };
  });
  const counts = { Safe: 0, Watch: 0, Risky: 0 };
  rows.forEach((r) => counts[r.status]++);
  const health = Math.max(0, Math.round(100 - (counts.Risky * 60 + counts.Watch * 25) / Math.max(n, 3)));

  // ---- frontier
  const r = rng(41);
  const cloud = [];
  for (let k = 0; k < 400; k++) {
    const raw = H.map(() => Math.pow(-Math.log(r()), 2));
    const s = raw.reduce((a, b) => a + b, 0);
    const wv = raw.map((v) => v / s);
    cloud.push({ ...stats(wv), w: wv });
  }
  const maxSh = cloud.reduce((a, b) => (b.sh > a.sh ? b : a));
  const minVol = cloud.reduce((a, b) => (b.sig < a.sig ? b : a));

  const corrM = H.map((_, i) => H.map((__, j) => (i === j ? 1 : C[i][j] / Math.sqrt(C[i][i] * C[j][j]))));

  return {
    empty: false, n, total, invested, day, w, rows, counts, health, hasHist,
    beta: pBeta, sigma: cur.sig, mu: cur.mu, sharpeModel: cur.sh, var95, var99, cvar95, rc, C, corrM, sigM,
    dates, port, nifty, dd, real, cloud, maxSh, minVol, cur,
    te: real ? real.te : Math.sqrt(Math.max(0, cur.sig ** 2 - 2 * pBeta * sigM ** 2 + sigM ** 2)),
  };
}

// ---- Technical signal scanner from real closes
export function scanSignals(rows) {
  return rows.filter((r) => r.prices && r.prices.length >= 60).map((r) => {
    const p = r.prices;
    const L = p.length;
    let g = 0, l = 0;
    for (let j = L - 14; j < L; j++) { const d = p[j] - p[j - 1]; if (d > 0) g += d; else l -= d; }
    const rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    const s20 = sma(p, 20), s50 = sma(p, 50);
    const sd20 = Math.sqrt(p.slice(-20).reduce((a, b) => a + (b - s20) ** 2, 0) / 20) || 1;
    const z = (p[L - 1] - s20) / sd20;
    const mom = (p[L - 1] / p[Math.max(0, L - 64)] - 1) * 100;
    const e12 = ema(p, 12), e26 = ema(p, 26), macd = e12.map((v, i) => v - e26[i]), sg = ema(macd, 9);
    const bull = macd[L - 1] > sg[L - 1];
    const score = clamp(mom / 8 + (s20 > s50 ? 1 : -1) + (bull ? 1 : -1) - (rsi > 70 ? 1 : 0) + (rsi < 30 ? 1 : 0) - z * 0.4, -4, 4);
    const label = rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : score >= 1.5 ? 'Trend up' : score <= -1.5 ? 'Trend down' : 'Neutral';
    return { sym: r.symbol, px: r.ltp, rsi, z, mom, bull, up: s20 > s50, score, label, spark: p.slice(-60) };
  }).sort((a, b) => b.score - a.score);
}

// ---- Pair statistics between two real price series
export function pairStats(pa, pb) {
  const n = Math.min(pa.length, pb.length);
  const la = pa.slice(-n).map(Math.log), lb = pb.slice(-n).map(Math.log);
  const beta = cov(la, lb) / (sd(lb) ** 2 || 1);
  const spr = la.map((v, i) => v - beta * lb[i]);
  const W = Math.min(60, Math.floor(n / 3));
  const z = [];
  for (let t = W; t < n; t++) {
    const win = spr.slice(t - W, t);
    const m = mean(win), s = sd(win) || 1;
    z.push((spr[t] - m) / s);
  }
  const ms = mean(spr);
  let num = 0, den = 0;
  for (let u = 1; u < n; u++) { num += (spr[u] - ms) * (spr[u - 1] - ms); den += (spr[u - 1] - ms) ** 2; }
  const phi = num / (den || 1);
  const hl = phi > 0 && phi < 1 ? -Math.log(2) / Math.log(phi) : Infinity;
  return { beta, z, hl, corr: corr(returns(pa.slice(-n)), returns(pb.slice(-n))) };
}

// Plain-language summary sent to Ask Claude.
export function claudeContext(M, breadth) {
  if (!M || M.empty) return { note: 'No holdings loaded.' };
  return {
    portfolio: {
      value: Math.round(M.total), invested: Math.round(M.invested), todayPnL: Math.round(M.day),
      beta: +M.beta.toFixed(2), annualVolatilityPct: +(M.sigma * 100).toFixed(1),
      oneDayVaR95: Math.round(M.var95), healthScore: M.health,
      oneYear: M.real ? { returnPct: +(M.real.ret1Y * 100).toFixed(1), niftyReturnPct: +(M.real.niftyRet * 100).toFixed(1), maxDrawdownPct: +(M.real.maxDD * 100).toFixed(1), sharpe: +M.real.sharpe.toFixed(2) } : 'no price history loaded',
    },
    holdings: M.rows.map((r) => ({
      symbol: r.symbol, sector: r.sector, qty: r.qty, avgPrice: +r.avg.toFixed(2), lastPrice: r.ltp, todayPct: +r.chg.toFixed(2),
      pnlPct: +r.pnlPct.toFixed(1), weightPct: +r.weight.toFixed(1), beta: +r.beta.toFixed(2), volPct: +(r.vol * 100).toFixed(0),
      riskSharePct: +(r.rc * 100).toFixed(1), flag: r.status,
    })),
    market: breadth || null,
  };
}

export { pct };
