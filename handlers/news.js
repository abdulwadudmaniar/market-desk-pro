// /api/news?symbols=A,B,C&names=Name1|Name2 — exchange filings + market news + holding-specific headlines.
import { send, query } from '../lib/http.js';
import { requireSession } from '../lib/auth.js';
import { rssFeeds, holdingNews, bseAnnouncements, nseAnnouncements } from '../lib/news.js';

let CACHE = { at: 0, key: '', data: null };
const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9&\-]/g, '');

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  const q = query(req);
  const symbols = String(q.symbols || '').split(',').map(clean).filter(Boolean).slice(0, 40);
  const names = String(q.names || '').split('|').map((s) => s.trim().toLowerCase()).filter((s) => s.length > 3).slice(0, 40);
  const key = symbols.join(',');
  if (CACHE.data && CACHE.key === key && Date.now() - CACHE.at < 5 * 60000) return send(res, 200, CACHE.data);

  const parts = (await Promise.all([rssFeeds(), holdingNews(symbols), bseAnnouncements().then((x) => [x]), nseAnnouncements().then((x) => [x])])).flat();
  const loaded = Array.from(new Set(parts.filter((p) => p.ok).map((p) => p.ok)));
  const failed = parts.filter((p) => p.fail).map((p) => p.fail);

  // de-duplicate by title, tag items that mention a holding
  const seen = new Set();
  const items = [];
  for (const it of parts.flatMap((p) => p.items)) {
    const k = it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
    if (seen.has(k)) continue;
    seen.add(k);
    const text = (it.title + ' ' + (it.company || '')).toUpperCase();
    const lower = text.toLowerCase();
    const tags = new Set(it.symbols || []);
    symbols.forEach((s) => { if (new RegExp(`(^|[^A-Z])${s.replace(/[&-]/g, '\\$&')}([^A-Z]|$)`).test(text)) tags.add(s); });
    names.forEach((n, i) => { if (lower.includes(n) && symbols[i]) tags.add(symbols[i]); });
    items.push({ ...it, symbols: Array.from(tags) });
  }
  items.sort((a, b) => (b.time || 0) - (a.time || 0));
  const data = { at: Date.now(), loaded, failed, items: items.slice(0, 250) };
  CACHE = { at: Date.now(), key, data };
  send(res, 200, data);
}
