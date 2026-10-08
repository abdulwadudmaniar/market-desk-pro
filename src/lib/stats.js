// Pure maths helpers.
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export function sd(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}
export function cov(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}
export function corr(a, b) {
  const d = sd(a) * sd(b);
  return d ? cov(a, b) / d : 0;
}
export function returns(prices) {
  const r = [];
  for (let i = 1; i < prices.length; i++) r.push(prices[i - 1] ? prices[i] / prices[i - 1] - 1 : 0);
  return r;
}
export function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}
export function ncdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
export function ema(arr, n) {
  const k = 2 / (n + 1);
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) out.push(out[i - 1] + (arr[i] - out[i - 1]) * k);
  return out;
}
export const sma = (arr, n) => mean(arr.slice(-n));

export function rng(seed) {
  let s = (seed * 9973) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return (s + 0.5) / 233281;
  };
}
export function gauss(r) {
  return Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
}

export function bs(S, K, T, v, r, t) {
  if (t === 's') return S;
  if (T <= 0) return Math.max(0, t === 'c' ? S - K : K - S);
  const sq = v * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (v * v) / 2) * T) / sq;
  const d2 = d1 - sq;
  return t === 'c' ? S * ncdf(d1) - K * Math.exp(-r * T) * ncdf(d2) : K * Math.exp(-r * T) * ncdf(-d2) - S * ncdf(-d1);
}
