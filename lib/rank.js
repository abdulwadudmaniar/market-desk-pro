// Live news desk ranking: groups the same story across outlets, then scores how much it matters to the user.
// No outlet publishes read counts, so "most read" is estimated from: how many of the outlets carry the story,
// whether it's in an editor's top-stories feed, and whether it's leading Google News Business right now.
import { sectorOf } from './universe.js';

const STOP = new Set(('a an the and or of in on at to for from by with as is are was were be been it its this that these those '
  + 'after before over under amid into than then up down out about says said say report reports reported check details here '
  + 'today live update updates news latest share shares stock stocks market markets india indian rs crore lakh per cent percent '
  + 'how why what when who will may could would should can new top key more most check know all').split(' '));

// light stemming so "rates/rate", "raises/raised", "falls/fell" line up across outlets
const SYN = { fell: 'fall', tanks: 'fall', tank: 'fall', slips: 'fall', slip: 'fall', drops: 'fall', drop: 'fall', declines: 'fall', plunges: 'fall', plunge: 'fall', tumbles: 'fall', sinks: 'fall', slumps: 'fall', rose: 'rise', jumps: 'rise', jump: 'rise', gains: 'rise', surges: 'rise', surge: 'rise', climbs: 'rise', soars: 'rise', rallies: 'rise', holds: 'hold', keeps: 'hold', unchanged: 'hold', 'central': 'rbi', reserve: 'rbi', growth: 'gdp' };
const stem = (w) => SYN[w] || (w.length > 4 ? w.replace(/(ies)$/, 'y').replace(/(es|ed|s|ing)$/, '') : w);
export const tokens = (t) => new Set(String(t).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9&.%]+/g, ' ').split(' ')
  .map((w) => w.replace(/^\.+|\.+$/g, '')).filter((w) => w.length > 2 && !STOP.has(w)).map(stem));

function similar(a, b) {
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  if (!common) return false;
  const jac = common / (a.size + b.size - common);
  const cover = common / Math.min(a.size, b.size);
  return jac >= 0.4 || (common >= 4 && cover >= 0.5) || (common >= 3 && cover >= 0.75);
}

// What makes a story important. w = weight, why = the plain-English reason shown to the user.
const RULES = [
  { re: /\b(rbi|repo rate|reverse repo|monetary policy|mpc|crr)\b/i, w: 24, tag: 'Policy', why: 'RBI decisions move interest rates, bank stocks and the whole market.' },
  { re: /\bsebi\b/i, w: 16, tag: 'Regulation', why: 'SEBI rule changes affect how you trade and invest.' },
  { re: /\b(union budget|budget 20\d\d|gst council|gst rate|income tax|ltcg|stcg|capital gains tax|securities transaction tax|stt)\b/i, w: 18, tag: 'Policy', why: 'Tax and budget changes hit your returns directly.' },
  { re: /\b(inflation|cpi|wpi|gdp|iip|fiscal deficit|current account deficit|trade deficit|pmi|jobless|unemployment)\b/i, w: 14, tag: 'Economy', why: 'Economic data shapes RBI policy and the market’s direction.' },
  { re: /\b(fed|federal reserve|powell|fomc|us yields?|treasury yields?|ecb|bank of japan|boj)\b/i, w: 15, tag: 'Global', why: 'Global interest rates decide whether foreign money flows into or out of India.' },
  { re: /\b(crude|brent|oil prices?|opec)\b/i, w: 12, tag: 'Global', why: 'Oil prices drive inflation, the rupee and fuel-sensitive sectors.' },
  { re: /\b(rupee|forex reserves|dollar index|usd\/inr)\b/i, w: 11, tag: 'Economy', why: 'Rupee moves change profits for IT, pharma and importers.' },
  { re: /\b(fiis?|fpis?|foreign (portfolio )?investors?|diis?|foreign outflows?|foreign inflows?)\b/i, w: 13, tag: 'Flows', why: 'Big foreign or domestic fund flows push the whole market up or down.' },
  { re: /\b(tariffs?|sanctions?|trade war|trade deal|export curbs?|import duty)\b/i, w: 13, tag: 'Global', why: 'Trade policy hits exporters and overall market mood.' },
  { re: /\b(war|missile|attack|ceasefire|geopolitical|conflict)\b/i, w: 12, tag: 'Global', why: 'Geopolitical shocks cause sudden market-wide falls.' },
  { re: /(\b(sensex|nifty)\b[^.]{0,60}\b(crash|crashes|plunges?|tanks?|slumps?|tumbles?|sinks?|record|all-time high|surges?|soars?|jumps?|rall(y|ies)|biggest|worst|best)\b)|(\b(crash|plunge|bloodbath|record high|all-time high|rally)\b[^.]{0,60}\b(sensex|nifty|dalal street)\b)/i, w: 18, tag: 'Market', why: 'A big move in the index — check how your portfolio reacted.' },
  { re: /\b(market crash|bloodbath|circuit breaker|market-wide|wipes? out|lakh crore)\b/i, w: 14, tag: 'Market', why: 'A market-wide move that affects almost every portfolio.' },
  { re: /\b(fraud|probe|raids?|penalty|penalised|banned?|default(s|ed)?|insolvency|ibc|nclt|resigns?|resignation|whistleblower|auditor|forensic|scam|pledge)\b/i, w: 15, tag: 'Red flag', why: 'Governance problems can cause sharp, sudden falls in a stock.' },
  { re: /\b(q[1-4]\s?(fy\d\d)?\s?(results?|earnings|profit|net profit|numbers|nos)|quarterly (results|earnings)|net profit|profit (rises|falls|jumps|drops|slumps|surges)|revenue (rises|falls|jumps|drops)|earnings (beat|miss))\b/i, w: 9, tag: 'Earnings', why: 'Quarterly results are the biggest single driver of a stock’s price.' },
  { re: /\b(merger|acquisition|acquires?|takeover|demerger|stake sale|open offer|delisting|block deal|bulk deal)\b/i, w: 10, tag: 'Deal', why: 'Deals and big stake sales can re-price a stock overnight.' },
  { re: /\b(buyback|bonus issue|bonus shares|stock split|dividend|record date)\b/i, w: 7, tag: 'Corporate action', why: 'Corporate actions change what you receive as a shareholder.' },
  { re: /\b(downgrades?|upgrades?|rating cut|outlook (negative|positive|stable)|moody'?s|s&p|fitch|crisil|icra)\b/i, w: 8, tag: 'Rating', why: 'Rating changes shift how big investors value a company.' },
  { re: /\b(ipo|listing day|lists at|listing gains?|anchor investors)\b/i, w: 6, tag: 'IPO', why: 'New listings pull money and attention in the market.' },
];
// Tips, listicles and non-market content: pushed down so they don't crowd the top.
const NOISE = /\b(stocks? to (buy|watch|sell)|top picks?|buy or sell|should you buy|target price|technical picks|trading ideas?|trade setup|multibagger|penny stocks?|horoscope|astrology|zodiac|bollywood|cricket|ipl|box office|recipe|lifestyle|web stor(y|ies)|in pics|photos|quiz|wordle|lottery)\b/i;
const BREAKING = /\b(breaking|just in|flash|alert)\b/i;

const SECTOR_WORDS = {
  IT: /\b(it stocks|nifty it|it sector|it services|it companies|tech stocks|h-1b|outsourcing)\b/i,
  Banking: /\b(bank stocks|banking sector|nifty bank|bank nifty|psu banks?|private banks?|lenders?|deposit rates?|loan growth|npa)\b/i,
  Finance: /\b(nbfcs?|insurers?|insurance sector|microfinance)\b/i,
  'PSU Finance': /\b(psu stocks|railway stocks|nbfcs?)\b/i,
  Auto: /\b(auto stocks|auto sales|nifty auto|automobile|car sales|two-wheeler|ev makers?)\b/i,
  Pharma: /\b(pharma|usfda|drug ?makers?|healthcare stocks)\b/i,
  Metal: /\b(metal stocks|nifty metal|steel prices?|aluminium|copper prices?|iron ore)\b/i,
  Energy: /\b(oil marketing|omcs?|crude|refiners?|natural gas)\b/i,
  FMCG: /\b(fmcg|consumer staples|rural demand)\b/i,
  Consumer: /\b(consumer stocks|retail sales|discretionary)\b/i,
  Power: /\b(power stocks|power sector|electricity demand|power demand)\b/i,
  Infra: /\b(infra stocks|infrastructure|capex|defence stocks|order book)\b/i,
  Cement: /\b(cement)\b/i,
  Telecom: /\b(telecom|tariff hikes?|5g|spectrum)\b/i,
  Realty: /\b(realty|real estate|housing sales|home sales)\b/i,
  Defence: /\b(defence stocks|defence orders?|defence sector)\b/i,
};

// How headlines usually refer to common holdings (the symbol alone rarely appears).
const ALIASES = {
  RELIANCE: 'Reliance|RIL', HDFCBANK: 'HDFC Bank', ICICIBANK: 'ICICI Bank', INFY: 'Infosys', TCS: 'TCS|Tata Consultancy', ITC: 'ITC',
  LT: 'L&T|Larsen', BHARTIARTL: 'Bharti Airtel|Airtel', SBIN: 'SBI(?! Life| Card| Mutual| MF| Funds)|State Bank of India', AXISBANK: 'Axis Bank',
  KOTAKBANK: 'Kotak', HINDUNILVR: 'HUL|Hindustan Unilever', BAJFINANCE: 'Bajaj Finance', 'M&M': 'M&M|Mahindra & Mahindra|Mahindra and Mahindra',
  SUNPHARMA: 'Sun Pharma', MARUTI: 'Maruti', TATAMOTORS: 'Tata Motors', NTPC: 'NTPC', HCLTECH: 'HCL Tech|HCLTech', TITAN: 'Titan',
  ULTRACEMCO: 'UltraTech', POWERGRID: 'Power Grid', ASIANPAINT: 'Asian Paints', TATASTEEL: 'Tata Steel', ONGC: 'ONGC',
  ADANIPORTS: 'Adani Ports', COALINDIA: 'Coal India', BAJAJFINSV: 'Bajaj Finserv', NESTLEIND: 'Nestle', JSWSTEEL: 'JSW Steel',
  GRASIM: 'Grasim', TECHM: 'Tech Mahindra', WIPRO: 'Wipro', HINDALCO: 'Hindalco', CIPLA: 'Cipla', DRREDDY: "Dr Reddy|Dr\\. Reddy",
  'BAJAJ-AUTO': 'Bajaj Auto', EICHERMOT: 'Eicher|Royal Enfield', HEROMOTOCO: 'Hero MotoCorp', BRITANNIA: 'Britannia',
  APOLLOHOSP: 'Apollo Hospitals', TATACONSUM: 'Tata Consumer', SBILIFE: 'SBI Life', HDFCLIFE: 'HDFC Life', INDUSINDBK: 'IndusInd',
  SHRIRAMFIN: 'Shriram Finance', BEL: 'Bharat Electronics|\\bBEL\\b', TRENT: 'Trent', ADANIENT: 'Adani Enterprises', JIOFIN: 'Jio Financial',
  IRFC: 'IRFC', PFC: 'PFC|Power Finance', RECLTD: 'REC Ltd|REC Limited', HAL: 'HAL|Hindustan Aeronautics', BHEL: 'BHEL',
  IRCTC: 'IRCTC', ZOMATO: 'Zomato|Eternal', ETERNAL: 'Eternal|Zomato', DMART: 'DMart|Avenue Supermarts', VEDL: 'Vedanta',
  TATAPOWER: 'Tata Power', ADANIGREEN: 'Adani Green', DLF: 'DLF', GODREJPROP: 'Godrej Properties', LICI: 'LIC', PAYTM: 'Paytm|One97',
  NYKAA: 'Nykaa|FSN E-Commerce', LTIM: 'LTIMindtree', MPHASIS: 'Mphasis', PERSISTENT: 'Persistent Systems',
};
const GENERIC_FIRST = new Set(['tata', 'bajaj', 'hdfc', 'adani', 'state', 'bharat', 'indian', 'india', 'power', 'hindustan', 'national', 'general', 'united', 'asian', 'housing', 'the']);

// Builds one matcher per holding: its symbol, known aliases and (when given) its company name.
export function holdingMatchers(symbols, names = {}) {
  return symbols.map((s) => {
    const parts = [];
    if (s.length >= 3 && !/^(LT|ITC)$/.test(s)) parts.push(s.replace(/[&-]/g, '\\$&'));
    if (ALIASES[s]) parts.push(ALIASES[s]);
    const nm = String(names[s] || '').replace(/\b(ltd|limited|ltd\.|inc|corporation|corp|company|co|india|industries)\b\.?/gi, '').replace(/\s+/g, ' ').trim();
    if (nm.length >= 4) {
      parts.push(nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const first = nm.split(' ')[0];
      if (first.length >= 5 && !GENERIC_FIRST.has(first.toLowerCase())) parts.push(first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    }
    return { sym: s, sector: sectorOf(s), re: new RegExp(`(^|[^A-Za-z0-9])(${parts.join('|')})(?![A-Za-z0-9])`, 'i') };
  });
}

// Groups the same story from several outlets into one entry.
export function cluster(items) {
  const clusters = [];
  const sorted = items.slice().sort((a, b) => (b.time || 0) - (a.time || 0));
  for (const it of sorted) {
    const tk = tokens(it.title);
    if (tk.size < 2) continue;
    const c = clusters.find((x) => x.each.some((t) => similar(tk, t)));
    if (c) {
      c.items.push(it);
      c.each.push(tk);
      for (const w of tk) c.tk.add(w);
    } else clusters.push({ tk: new Set(tk), each: [tk], items: [it] });
  }
  return clusters;
}

const ORDER = ['Reuters', 'Business Standard', 'Economic Times', 'Moneycontrol'];

export function rank(items, { trending = [], holdings = [], now = Date.now() } = {}) {
  const trendTk = trending.map((t) => tokens(t.title));
  const mySectors = new Map();
  holdings.forEach((h) => { if (!mySectors.has(h.sector)) mySectors.set(h.sector, []); mySectors.get(h.sector).push(h.sym); });

  const out = cluster(items).map((c) => {
    const outlets = Array.from(new Set(c.items.map((i) => i.source)));
    // headline: the clearest version (wire > newspaper > portal), newest wins ties
    const lead = c.items.slice().sort((a, b) => (ORDER.indexOf(a.source) - ORDER.indexOf(b.source)) || ((b.time || 0) - (a.time || 0)))[0];
    const first = Math.min(...c.items.map((i) => i.time || now));
    const latest = Math.max(...c.items.map((i) => i.time || 0)) || null;
    const text = c.items.map((i) => `${i.title} ${i.summary || ''}`).join(' ');
    const head = c.items.map((i) => i.title).join(' ');

    let score = 0;
    const tags = new Set();
    const why = [];

    const mine = holdings.filter((h) => h.re.test(head) || h.re.test(text)).map((h) => h.sym);
    if (mine.length) { score += 40; tags.add('Your stock'); why.push(`Mentions your holding${mine.length > 1 ? 's' : ''} ${mine.join(', ')}.`); }

    const hits = RULES.filter((r) => r.re.test(head)).concat(RULES.filter((r) => !r.re.test(head) && r.re.test(text)).map((r) => ({ ...r, w: Math.round(r.w / 2) })));
    hits.sort((a, b) => b.w - a.w).slice(0, 3).forEach((r, i) => { score += i === 0 ? r.w : Math.round(r.w / 2); tags.add(r.tag); });
    if (hits.length && !mine.length) why.push(hits[0].why);

    if (!mine.length) {
      for (const [sector, syms] of mySectors) {
        const re = SECTOR_WORDS[sector];
        if (re && re.test(head)) { score += 12; tags.add('Your sector'); why.unshift(`Affects your ${sector} holdings (${syms.join(', ')}).`); break; }
      }
    }

    if (outlets.length > 1) { score += (outlets.length - 1) * 12; why.push(`Reported by ${outlets.length} of the 4 outlets.`); }
    const top = c.items.some((i) => i.top);
    if (top) score += 8;
    const isTrending = trendTk.some((t) => c.each.some((e) => similar(t, e)));
    if (isTrending) { score += 14; tags.add('Trending'); why.push('Leading India’s business news right now.'); }
    if (BREAKING.test(head)) score += 10;
    if (NOISE.test(head)) { score -= 18; tags.add('Tips'); }

    const ageH = Math.max(0, (now - (latest || first)) / 3600e3);
    score -= ageH * 2.5;
    const bigNews = hits.some((r) => r.w >= 14 && r.re.test(head));
    const breaking = (now - first) < 40 * 60e3 && !NOISE.test(head) && (outlets.length >= 2 || BREAKING.test(head) || ((isTrending || top) && bigNews));

    return {
      id: lead.link,
      title: lead.title,
      summary: (c.items.find((i) => i.summary && i.summary.length > 40) || lead).summary || '',
      link: lead.link,
      source: lead.source,
      outlets,
      links: outlets.map((o) => { const it = c.items.find((i) => i.source === o); return { source: o, link: it.link }; }),
      time: latest,
      first: isFinite(first) ? first : null,
      score: Math.round(score),
      breaking,
      trending: isTrending,
      editorsPick: top,
      symbols: mine,
      tags: Array.from(tags),
      why: why[0] || '',
    };
  });

  return out.sort((a, b) => b.score - a.score || (b.time || 0) - (a.time || 0));
}

// The handful worth reading first: recent, high-scoring, not tips, and not five versions of the same theme.
export function pickTop(ranked, n = 6, now = Date.now()) {
  const picks = [];
  const perTag = {};
  for (const r of ranked) {
    if (picks.length >= n) break;
    if (r.score < 12 || r.tags.includes('Tips') || (r.time && now - r.time > 18 * 3600e3)) continue;
    const t = r.tags.find((x) => x !== 'Trending' && x !== 'Your stock') || 'Other';
    if (!r.symbols.length && (perTag[t] || 0) >= 2) continue;
    perTag[t] = (perTag[t] || 0) + 1;
    picks.push(r);
  }
  return picks;
}
