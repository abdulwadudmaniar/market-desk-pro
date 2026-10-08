// Free news sources: exchange filings (BSE, NSE) + market RSS (Moneycontrol, ET Markets) + Google News per holding.
// Every source is optional — if one blocks or changes, the others still load.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const env = (k, d) => process.env[k] || d;

export const FEEDS = [
  { id: 'mc-latest', source: 'Moneycontrol', kind: 'market', url: env('FEED_MC_LATEST', 'https://www.moneycontrol.com/rss/latestnews.xml') },
  { id: 'mc-markets', source: 'Moneycontrol', kind: 'market', url: env('FEED_MC_MARKETS', 'https://www.moneycontrol.com/rss/marketreports.xml') },
  { id: 'et-markets', source: 'ET Markets', kind: 'market', url: env('FEED_ET_MARKETS', 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms') },
  { id: 'et-stocks', source: 'ET Markets', kind: 'market', url: env('FEED_ET_STOCKS', 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms') },
];

async function getText(url, headers = {}, ms = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*', ...headers }, signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(timer); }
}

const decode = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };
const safeUrl = (u) => { try { const x = new URL(decode(u)); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

export function parseRss(xml, source, kind) {
  const items = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const title = decode(tag(b, 'title'));
    const link = safeUrl(tag(b, 'link')) || safeUrl(tag(b, 'guid'));
    const t = Date.parse(decode(tag(b, 'pubDate')) || decode(tag(b, 'dc:date')));
    if (!title || !link) continue;
    items.push({ title: title.slice(0, 300), link, time: isNaN(t) ? null : t, source: decode(tag(b, 'source')) || source, kind, summary: decode(tag(b, 'description')).slice(0, 280) });
  }
  return items;
}

export async function rssFeeds() {
  const out = await Promise.all(FEEDS.map(async (f) => {
    try { return { ok: f.source, items: parseRss(await getText(f.url), f.source, f.kind) }; } catch (e) { return { fail: `${f.source}: ${e.message}`, items: [] }; }
  }));
  return out;
}

// Google News search per holding (company-specific headlines).
export async function holdingNews(symbols) {
  return Promise.all(symbols.slice(0, 12).map(async (s) => {
    const q = encodeURIComponent(`"${s}" NSE stock`);
    try {
      const items = parseRss(await getText(`https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`), 'Google News', 'holding');
      return { ok: 'Google News', items: items.slice(0, 6).map((x) => ({ ...x, symbols: [s] })) };
    } catch (e) { return { fail: `Google News (${s}): ${e.message}`, items: [] }; }
  }));
}

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

// BSE corporate announcements (companies file here first, alongside NSE).
export async function bseAnnouncements() {
  const to = new Date(Date.now() + 5.5 * 3600e3);
  const from = new Date(to.getTime() - 2 * 864e5);
  const url = `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?pageno=1&strCat=-1&strPrevDate=${ymd(from)}&strScrip=&strSearch=P&strToDate=${ymd(to)}&strType=C&subcategory=-1`;
  try {
    const j = JSON.parse(await getText(url, { Referer: 'https://www.bseindia.com/', Origin: 'https://www.bseindia.com', Accept: 'application/json' }));
    const rows = j.Table || [];
    return {
      ok: 'BSE filings',
      items: rows.slice(0, 120).map((r) => ({
        title: decode(`${r.SLONGNAME || r.SCRIP_CD}: ${r.HEADLINE || r.NEWSSUB || ''}`).slice(0, 300),
        link: r.ATTACHMENTNAME ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${encodeURIComponent(r.ATTACHMENTNAME)}` : 'https://www.bseindia.com/corporates/ann.html',
        time: Date.parse(String(r.NEWS_DT || r.DT_TM || '').replace(' ', 'T') + '+05:30') || null,
        source: 'BSE filing', kind: 'filing', company: decode(r.SLONGNAME || ''), category: decode(r.CATEGORYNAME || r.SUBCATNAME || ''),
      })),
    };
  } catch (e) { return { fail: `BSE filings: ${e.message}`, items: [] }; }
}

// NSE corporate announcements. NSE often blocks cloud servers; failure is expected and handled.
export async function nseAnnouncements() {
  try {
    const home = await fetch('https://www.nseindia.com/', { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(6000) });
    const cookies = (home.headers.getSetCookie ? home.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
    const j = JSON.parse(await getText('https://www.nseindia.com/api/corporate-announcements?index=equities', { Cookie: cookies, Referer: 'https://www.nseindia.com/companies-listing/corporate-filings-announcements', Accept: 'application/json' }));
    const rows = Array.isArray(j) ? j : j.data || [];
    return {
      ok: 'NSE filings',
      items: rows.slice(0, 120).map((r) => ({
        title: decode(`${r.sm_name || r.symbol}: ${r.desc || ''}${r.attchmntText ? ' — ' + r.attchmntText : ''}`).slice(0, 300),
        link: safeUrl(r.attchmntFile) || 'https://www.nseindia.com/companies-listing/corporate-filings-announcements',
        time: Date.parse(r.an_dt || r.sort_date) || null,
        source: 'NSE filing', kind: 'filing', symbols: r.symbol ? [r.symbol] : [], company: decode(r.sm_name || ''),
      })),
    };
  } catch (e) { return { fail: `NSE filings: ${e.message}`, items: [] }; }
}
