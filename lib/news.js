// Free news sources: exchange filings (BSE, NSE) + market RSS (Moneycontrol, Economic Times, Business Standard,
// Reuters via Google News) + Google News per holding.
// Every source is optional — if one blocks or changes, the others still load.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const env = (k, d) => process.env[k] || d;
const gn = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;

// top: true marks an editor's "top stories" feed, used as a ranking signal on the live desk.
export const FEEDS = [
  { id: 'mc-latest', source: 'Moneycontrol', kind: 'market', url: env('FEED_MC_LATEST', 'https://www.moneycontrol.com/rss/latestnews.xml') },
  { id: 'mc-markets', source: 'Moneycontrol', kind: 'market', url: env('FEED_MC_MARKETS', 'https://www.moneycontrol.com/rss/marketreports.xml') },
  { id: 'mc-top', source: 'Moneycontrol', kind: 'market', top: true, url: env('FEED_MC_TOP', 'https://www.moneycontrol.com/rss/MCtopnews.xml') },
  { id: 'mc-buzz', source: 'Moneycontrol', kind: 'market', url: env('FEED_MC_BUZZ', 'https://www.moneycontrol.com/rss/buzzingstocks.xml') },
  { id: 'et-markets', source: 'Economic Times', kind: 'market', url: env('FEED_ET_MARKETS', 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms') },
  { id: 'et-stocks', source: 'Economic Times', kind: 'market', url: env('FEED_ET_STOCKS', 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms') },
  { id: 'et-top', source: 'Economic Times', kind: 'market', top: true, url: env('FEED_ET_TOP', 'https://economictimes.indiatimes.com/rssfeedstopstories.cms') },
  { id: 'et-economy', source: 'Economic Times', kind: 'market', url: env('FEED_ET_ECONOMY', 'https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms') },
  { id: 'bs-markets', source: 'Business Standard', kind: 'market', url: env('FEED_BS_MARKETS', 'https://www.business-standard.com/rss/markets-106.rss') },
  { id: 'bs-latest', source: 'Business Standard', kind: 'market', url: env('FEED_BS_LATEST', 'https://www.business-standard.com/rss/latest.rss') },
  // Reuters stopped publishing public RSS feeds, so its India and global-markets stories come through Google News.
  { id: 'reuters-india', source: 'Reuters', kind: 'market', via: 'Google News', url: gn('site:reuters.com (India OR Sensex OR Nifty OR RBI OR rupee OR SEBI) when:1d') },
  { id: 'reuters-global', source: 'Reuters', kind: 'market', via: 'Google News', url: gn('site:reuters.com (markets OR stocks OR Fed OR oil OR tariffs) when:1d') },
];

// If an outlet's own feeds block the server, its stories still arrive through Google News.
const FALLBACK = {
  Moneycontrol: gn('site:moneycontrol.com (Sensex OR Nifty OR stocks OR RBI OR results) when:1d'),
  'Economic Times': gn('site:economictimes.indiatimes.com (Sensex OR Nifty OR stocks OR RBI OR results) when:1d'),
  'Business Standard': gn('site:business-standard.com (Sensex OR Nifty OR stocks OR RBI OR results) when:1d'),
};

// Google News' own "Business" top stories for India: what most outlets are leading with right now.
export const TRENDING_URL = 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-IN&gl=IN&ceid=IN:en';

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

// Google News titles end with " - Publisher"; drop that so duplicates match across outlets.
const stripPublisher = (t, source) => (source ? t.replace(new RegExp(`\\s+[-|]\\s+(the\\s+)?${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$`, 'i'), '') : t);
const OUTLET_ALIASES = [[/reuters/i, 'Reuters'], [/business standard/i, 'Business Standard'], [/economic times|economictimes|et markets|etmarkets/i, 'Economic Times'], [/moneycontrol/i, 'Moneycontrol']];
export const outletOf = (name) => { const a = OUTLET_ALIASES.find(([re]) => re.test(name || '')); return a ? a[1] : null; };

async function feedItems(f) {
  let items = parseRss(await getText(f.url), f.source, f.kind);
  if (f.via) items = items.filter((x) => outletOf(x.source) === f.source).map((x) => ({ ...x, title: stripPublisher(x.title, x.source), source: f.source, via: f.via }));
  else items = items.map((x) => ({ ...x, source: f.source }));
  return f.top ? items.map((x) => ({ ...x, top: true })) : items;
}

export async function rssFeeds() {
  const out = await Promise.all(FEEDS.map(async (f) => {
    try { return { ok: f.source, feed: f.id, items: await feedItems(f) }; } catch (e) { return { fail: `${f.source}: ${e.message}`, feed: f.id, items: [] }; }
  }));
  // Any outlet that returned nothing directly gets its Google News fallback.
  const empty = Object.keys(FALLBACK).filter((src) => !out.some((o) => o.ok === src && o.items.length));
  const extra = await Promise.all(empty.map(async (src) => {
    try { return { ok: src, feed: `${src} (via Google News)`, items: await feedItems({ source: src, kind: 'market', via: 'Google News', url: FALLBACK[src] }) }; } catch (e) { return { fail: `${src}: ${e.message}`, items: [] }; }
  }));
  return out.concat(extra);
}

// Stories leading Google News Business (India) right now. Used to spot what's being read most.
export async function trendingNews() {
  try {
    const items = parseRss(await getText(TRENDING_URL), 'Google News', 'market');
    return items.map((x) => ({ ...x, outlet: outletOf(x.source), title: stripPublisher(x.title, x.source) }));
  } catch { return []; }
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
