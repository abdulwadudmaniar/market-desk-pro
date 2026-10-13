// /api/live-news?symbols=A,B — the Live News Desk: Moneycontrol, Economic Times, Business Standard and Reuters,
// merged, de-duplicated and ranked by how much each story matters to the user's holdings and the market.
// Sources are re-read at most once a minute (they publish every few minutes, and faster polling gets servers blocked).
import { send, query } from '../lib/http.js';
import { requireSession } from '../lib/auth.js';
import { rssFeeds, trendingNews } from '../lib/news.js';
import { rank, pickTop, holdingMatchers } from '../lib/rank.js';
import { yQuotes } from '../lib/yahoo.js';

const REFRESH_MS = 60_000;
const OUTLETS = ['Moneycontrol', 'Economic Times', 'Business Standard', 'Reuters'];
let POOL = { at: 0, data: null };
let inflight = null;
const NAMES = new Map(); // symbol -> company name (from Yahoo, cached for the life of the server)

const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9&\-]/g, '');

async function loadPool() {
  const [parts, trending] = await Promise.all([rssFeeds(), trendingNews()]);
  const status = Object.fromEntries(OUTLETS.map((o) => [o, { ok: false, count: 0, via: null }]));
  for (const p of parts) {
    const o = p.ok || (p.fail || '').split(':')[0];
    if (!status[o]) continue;
    if (p.ok) { status[o].ok = true; status[o].count += p.items.length; if (/Google News/.test(p.feed || '') || (p.items[0] && p.items[0].via)) status[o].via = 'Google News'; }
  }
  // Stories the trending feed carries from the four outlets join the pool too.
  const fromTrending = trending.filter((t) => OUTLETS.includes(t.outlet)).map((t) => ({ ...t, source: t.outlet, kind: 'market' }));
  const seen = new Set();
  const items = [];
  for (const it of parts.flatMap((p) => p.items).concat(fromTrending)) {
    if (!it.time || Date.now() - it.time > 36 * 3600e3) continue; // keep the last day and a half
    const k = it.source + '|' + it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 90);
    if (seen.has(k)) continue;
    seen.add(k);
    items.push(it);
  }
  return { at: Date.now(), items, trending, status };
}

async function getPool() {
  if (POOL.data && Date.now() - POOL.at < REFRESH_MS) return POOL.data;
  if (!inflight) inflight = loadPool().then((d) => { POOL = { at: d.at, data: d }; return d; }).finally(() => { inflight = null; });
  return inflight;
}

async function namesFor(symbols) {
  const need = symbols.filter((s) => !NAMES.has(s));
  if (need.length) {
    try {
      const q = await Promise.race([yQuotes(need, false), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
      need.forEach((s) => NAMES.set(s, (q.stocks[s] && q.stocks[s].name) || ''));
    } catch { /* names are a bonus; symbols and known aliases still match */ }
  }
  return Object.fromEntries(symbols.map((s) => [s, NAMES.get(s) || '']));
}

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  const symbols = Array.from(new Set(String(query(req).symbols || '').split(',').map(clean).filter(Boolean))).slice(0, 60);
  const [pool, names] = await Promise.all([getPool(), namesFor(symbols)]);
  const ranked = rank(pool.items, { trending: pool.trending, holdings: holdingMatchers(symbols, names) });
  const top = pickTop(ranked, 6);
  const topIds = new Set(top.map((t) => t.id));
  send(res, 200, {
    at: pool.at,
    nextAt: pool.at + REFRESH_MS,
    status: pool.status,
    breaking: ranked.filter((r) => r.breaking).slice(0, 5),
    top,
    items: ranked.filter((r) => !topIds.has(r.id)).sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 200),
  });
}
