// Network + local storage helpers for the browser.
import { sectorOf } from '../../lib/universe.js';

export async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: 'same-origin', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw Object.assign(new Error(j.error || 'Please log in.'), { status: 401 });
  if (!r.ok) throw Object.assign(new Error(j.error || `Request failed (${r.status})`), { status: r.status, body: j });
  return j;
}

const KEY = 'md_manual_holdings_v1';
export function loadManual() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
export function saveManual(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

// Very small CSV parser that handles quoted fields.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const pick = (head, tests) => head.findIndex((h) => tests.some((t) => t.test(h)));

// Accepts holdings exports from most brokers (Groww, Angel One, Zerodha console, etc.).
export function holdingsFromCsv(text, label = 'Import') {
  const rows = parseCsv(text);
  // find the header row (first row containing a quantity-like column)
  let hi = rows.findIndex((r) => r.some((c) => /qty|quantity|shares/i.test(c)));
  if (hi < 0) throw new Error('Could not find a quantity column. The file needs columns like Symbol, Quantity, Average price.');
  const head = rows[hi].map((h) => h.trim().toLowerCase());
  const iSym = pick(head, [/^symbol$/, /trading ?symbol/, /^instrument$/, /^scrip/, /stock name/, /^stock$/, /^name$/, /company/]);
  const iQty = pick(head, [/^qty/, /quantity/, /^shares/]);
  const iAvg = pick(head, [/avg/, /average/, /buy price/, /cost price/]);
  const iIsin = pick(head, [/^isin/]);
  if ((iSym < 0 && iIsin < 0) || iQty < 0 || iAvg < 0) throw new Error('Columns not recognised. Use: Symbol (or ISIN), Quantity, Average price.');
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const sym = iSym >= 0 ? String(r[iSym] || '').trim().toUpperCase().replace(/\s+(LTD|LIMITED)\.?$/, '').replace(/[^A-Z0-9&\-]/g, '') : '';
    const isin = iIsin >= 0 ? String(r[iIsin] || '').trim().toUpperCase() : '';
    const qty = Number(String(r[iQty] || '').replace(/[,₹\s]/g, ''));
    const avg = Number(String(r[iAvg] || '').replace(/[,₹\s]/g, ''));
    if ((sym || isin) && qty > 0 && avg > 0) out.push({ symbol: sym || isin, isin: isin || undefined, qty, avg, source: label });
  }
  if (!out.length) throw new Error('No holdings found in that file.');
  return out;
}

export function normaliseHolding(h, quote) {
  const ltp = quote ? quote.ltp : h.ltp || h.avg;
  return {
    symbol: h.symbol,
    qty: Number(h.qty),
    avg: Number(h.avg),
    ltp,
    prevClose: quote ? quote.prevClose : h.prevClose || ltp,
    sector: h.sector || sectorOf(h.symbol),
    source: h.source || (h.brokers ? h.brokers.join(' + ') : h.broker) || 'Manual',
    priced: !!quote || h.ltp != null,
  };
}
