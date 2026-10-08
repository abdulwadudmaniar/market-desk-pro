export const GREEN = '#5FE3A8';
export const RED = '#FF8A8A';
export const AMBER = '#F5BD62';

export const inr = (v) => '₹' + Math.round(Math.abs(v || 0)).toLocaleString('en-IN');
export const sInr = (v) => (v < 0 ? '−' : '+') + inr(v);
export const pct = (v, d = 2) => (v < 0 ? '−' : '+') + Math.abs(v || 0).toFixed(d) + '%';
export const upct = (v, d = 1) => (v || 0).toFixed(d) + '%';
export const col = (v) => (v < 0 ? RED : GREEN);
export const num = (v, d = 2) => (v == null || isNaN(v) ? '—' : Number(v).toFixed(d));
export const signed = (v, d = 2) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(d);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const PILL = {
  Safe: { background: 'rgba(61,190,139,.16)', color: '#5FD3A3' },
  Watch: { background: 'rgba(242,169,59,.16)', color: '#F5BD62' },
  Risky: { background: 'rgba(240,106,106,.16)', color: '#FF8A8A' },
  Info: { background: 'rgba(79,179,217,.14)', color: '#8FD3EE' },
  Off: { background: '#151D26', color: '#8D9AA8' },
};

export function pts(arr, w, h, pad, min, max) {
  if (!arr || arr.length < 2) return '';
  const span = max - min || 1;
  return arr.map((v, i) => ((i / (arr.length - 1)) * w).toFixed(1) + ',' + (pad + (1 - (v - min) / span) * (h - 2 * pad)).toFixed(1)).join(' ');
}

export function istNow() {
  return new Date(Date.now() + 5.5 * 3600e3);
}

export function marketOpen() {
  const d = istNow();
  const day = d.getUTCDay();
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return day >= 1 && day <= 5 && mins >= 555 && mins <= 930;
}

export function istClock() {
  const d = istNow();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
