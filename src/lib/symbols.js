// Turns spoken company names into NSE symbols ("tata motors" → TATAMOTORS).
import { UNIVERSE } from '../../lib/universe.js';

export const ALIASES = {
  nifty: 'NIFTY', 'nifty 50': 'NIFTY', 'nifty fifty': 'NIFTY', sensex: 'NIFTY',
  reliance: 'RELIANCE', 'reliance industries': 'RELIANCE', tcs: 'TCS', 'tata consultancy': 'TCS', infosys: 'INFY', infy: 'INFY',
  'hdfc bank': 'HDFCBANK', hdfc: 'HDFCBANK', 'icici bank': 'ICICIBANK', icici: 'ICICIBANK', sbi: 'SBIN', 'state bank': 'SBIN', 'state bank of india': 'SBIN',
  'axis bank': 'AXISBANK', kotak: 'KOTAKBANK', 'kotak bank': 'KOTAKBANK', 'kotak mahindra bank': 'KOTAKBANK', itc: 'ITC', 'l and t': 'LT', 'l&t': 'LT', 'larsen': 'LT', 'larsen and toubro': 'LT',
  airtel: 'BHARTIARTL', 'bharti airtel': 'BHARTIARTL', hul: 'HINDUNILVR', 'hindustan unilever': 'HINDUNILVR', 'bajaj finance': 'BAJFINANCE', 'bajaj finserv': 'BAJAJFINSV',
  'm and m': 'M&M', 'm&m': 'M&M', mahindra: 'M&M', 'mahindra and mahindra': 'M&M', 'sun pharma': 'SUNPHARMA', maruti: 'MARUTI', 'maruti suzuki': 'MARUTI',
  'tata motors': 'TATAMOTORS', ntpc: 'NTPC', 'hcl tech': 'HCLTECH', 'hcl technologies': 'HCLTECH', titan: 'TITAN', ultratech: 'ULTRACEMCO', 'ultratech cement': 'ULTRACEMCO',
  'power grid': 'POWERGRID', 'asian paints': 'ASIANPAINT', 'tata steel': 'TATASTEEL', ongc: 'ONGC', 'adani ports': 'ADANIPORTS', 'coal india': 'COALINDIA',
  nestle: 'NESTLEIND', 'jsw steel': 'JSWSTEEL', grasim: 'GRASIM', 'tech mahindra': 'TECHM', wipro: 'WIPRO', hindalco: 'HINDALCO', cipla: 'CIPLA',
  'dr reddy': 'DRREDDY', "dr reddy's": 'DRREDDY', 'doctor reddy': 'DRREDDY', 'bajaj auto': 'BAJAJ-AUTO', eicher: 'EICHERMOT', 'eicher motors': 'EICHERMOT',
  'hero motocorp': 'HEROMOTOCO', hero: 'HEROMOTOCO', britannia: 'BRITANNIA', apollo: 'APOLLOHOSP', 'apollo hospitals': 'APOLLOHOSP', 'tata consumer': 'TATACONSUM',
  'sbi life': 'SBILIFE', 'hdfc life': 'HDFCLIFE', indusind: 'INDUSINDBK', 'indusind bank': 'INDUSINDBK', 'shriram finance': 'SHRIRAMFIN', bel: 'BEL', 'bharat electronics': 'BEL',
  trent: 'TRENT', 'adani enterprises': 'ADANIENT', adani: 'ADANIENT', 'jio financial': 'JIOFIN', 'jio finance': 'JIOFIN', irfc: 'IRFC', zomato: 'ETERNAL', eternal: 'ETERNAL',
  hal: 'HAL', 'hindustan aeronautics': 'HAL', dmart: 'DMART', 'avenue supermarts': 'DMART', 'tata power': 'TATAPOWER', vedanta: 'VEDL', dlf: 'DLF', irctc: 'IRCTC', lic: 'LICI',
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9& ]/g, ' ').replace(/\b(limited|ltd|share|shares|stock|stocks|price|the|of|company|chart|ka|ki)\b/g, ' ').replace(/\s+/g, ' ').trim();

export function resolveSymbol(spoken, extra = [], names = {}) {
  const n = norm(spoken);
  if (!n) return null;
  if (ALIASES[n]) return ALIASES[n];
  const known = Array.from(new Set(UNIVERSE.map((u) => u.sym).concat(extra)));
  const squashed = n.replace(/\s/g, '').toUpperCase();
  const hit = known.find((s) => s.replace(/[^A-Z0-9]/g, '') === squashed.replace(/[^A-Z0-9]/g, ''));
  if (hit) return hit;
  for (const [sym, name] of Object.entries(names)) if (norm(name).startsWith(n) || n.startsWith(norm(name))) return sym;
  for (const [k, v] of Object.entries(ALIASES)) if (n.includes(k) && k.length > 3) return v;
  return /^[a-z0-9&-]{2,15}$/.test(n.replace(/\s/g, '')) ? squashed : null;
}

// Finds every stock mentioned anywhere in a sentence ("compare HDFC Bank and ICICI Bank" → [HDFCBANK, ICICIBANK]).
export function findSymbols(text, extra = []) {
  const found = [];
  const add = (s) => { if (s && !found.includes(s)) found.push(s); };
  const raw = String(text || '');
  for (const m of raw.matchAll(/\(([A-Z][A-Z0-9&-]{1,14})\)/g)) add(m[1]);
  let low = ' ' + raw.toLowerCase().replace(/[^a-z0-9& ]/g, ' ').replace(/\s+/g, ' ') + ' ';
  for (const k of Object.keys(ALIASES).sort((a, b) => b.length - a.length)) {
    if (k.length < 3 && k !== 'lt') continue;
    const needle = ' ' + k.replace(/[^a-z0-9& ]/g, ' ') + ' ';
    if (low.includes(needle)) { add(ALIASES[k]); low = low.split(needle).join(' '); }
  }
  const known = new Set(UNIVERSE.map((u) => u.sym).concat(extra.map((s) => String(s).toUpperCase())));
  for (const tok of raw.toUpperCase().split(/[^A-Z0-9&-]+/)) if (tok.length >= 2 && known.has(tok)) add(tok);
  const pos = (sym) => { const k = Object.keys(ALIASES).filter((a) => ALIASES[a] === sym).concat([sym.toLowerCase()]).map((a) => raw.toLowerCase().indexOf(a)).filter((i) => i >= 0); return k.length ? Math.min(...k) : 1e9; };
  return found.sort((a, b) => pos(a) - pos(b)).slice(0, 4);
}
