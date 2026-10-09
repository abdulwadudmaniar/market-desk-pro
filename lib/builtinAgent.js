// Built-in analysts: no AI key, no cost. They run the same market tools as the AI agents
// (live quotes, technicals, 5-year backtests, probability ranges, news, screens) and write
// the report from fixed rules. Less conversational than an AI, but every number is real.
import { runTool } from './agentTools.js';
import { rssFeeds } from './news.js';
import { findSymbols } from '../src/lib/symbols.js';

const inr = (x) => (x == null || !isFinite(x) ? '—' : (x < 0 ? '-' : '') + '₹' + Math.abs(Number(x)).toLocaleString('en-IN', { maximumFractionDigits: Math.abs(x) >= 1000 ? 0 : 2 }));
const pc = (x, d = 1) => (x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : '') + Number(x).toFixed(d) + '%');
const n1 = (x) => (x == null || !isFinite(x) ? '—' : Number(x).toFixed(1));
const day = (t) => { try { return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }); } catch { return ''; } };

const SETUP_TEXT = {
  rsi_below_30: 'RSI fell below 30 (oversold)', rsi_above_70: 'RSI rose above 70 (overbought)', new_52w_high: 'a new 52-week high',
  near_52w_low: 'price within 2% of its 52-week low', cross_above_200dma: 'price crossed above the 200-day average', cross_below_200dma: 'price crossed below the 200-day average',
  drop_5pct_day: 'a 5%+ one-day fall', gain_5pct_day: 'a 5%+ one-day jump', golden_cross_50_200: 'a golden cross (50-day above 200-day)', death_cross_50_200: 'a death cross (50-day below 200-day)',
};
const PRESET_TEXT = {
  momentum_leaders: 'Momentum leaders (up 10%+ in 3 months and above the 200-day average)', near_52w_high: 'Within 3% of the 52-week high', pullback_in_uptrend: 'Pullback in an uptrend (above 200-day, below 50-day)',
  oversold: 'Oversold (RSI under 35)', volume_spike: 'Volume spike (1.8× normal volume)', near_52w_low: 'Near the 52-week low', breakdown_risk: 'Breakdown risk (below 200-day, down 10%+ in 3 months)', low_volatility: 'Lowest volatility (steadiest stocks)',
};

async function tool(steps, name, input) {
  steps.push({ kind: 'tool', text: `${name} ${JSON.stringify(input).slice(0, 100)}` });
  try { return (await runTool(name, input)).result; } catch (e) { steps.push({ kind: 'error', text: `${name} failed: ${e.message}` }); return null; }
}

// Which past setups match the stock right now — these are the ones worth back-testing.
function setupsFor(t) {
  const s = [];
  if (t.rsi14 != null && t.rsi14 < 32) s.push('rsi_below_30');
  if (t.rsi14 != null && t.rsi14 > 68) s.push('rsi_above_70');
  if (t.pct_from_52w_high != null && t.pct_from_52w_high > -2) s.push('new_52w_high');
  if (t.pct_from_52w_low != null && t.pct_from_52w_low < 4) s.push('near_52w_low');
  if (t.returns_pct && t.returns_pct['1W'] != null && t.returns_pct['1W'] < -6) s.push('drop_5pct_day');
  if (!s.length) s.push(t.above_sma200 ? 'cross_above_200dma' : 'cross_below_200dma');
  return s.slice(0, 2);
}

function trendWords(t) {
  if (t.above_sma50 && t.above_sma200) return 'in an **uptrend** (above both its 50-day and 200-day averages)';
  if (!t.above_sma50 && t.above_sma200) return 'in a **pullback within a longer uptrend** (below the 50-day, above the 200-day average)';
  if (t.above_sma50 && !t.above_sma200) return 'trying to **recover** (above the 50-day but still below the 200-day average)';
  if (t.above_sma200 === false) return 'in a **downtrend** (below both its 50-day and 200-day averages)';
  return 'without enough history to judge the long-term trend';
}
const rsiWords = (r) => (r == null ? '' : r < 30 ? 'oversold — selling has been heavy' : r > 70 ? 'overbought — buying has been heavy, pullbacks are common' : r < 45 ? 'on the weak side' : r > 55 ? 'on the strong side' : 'neutral');

function btLine(b) {
  if (!b || !b.after_setup) return null;
  const a = b.after_setup, base = b.all_periods_baseline || {};
  if (!a.count) return `- **${SETUP_TEXT[b.setup] || b.setup}**: has not happened in the last 5 years, so there is no history to learn from.`;
  return `- After **${SETUP_TEXT[b.setup] || b.setup}** (${a.count} times in 5 yrs), the stock was higher ${b.horizon_trading_days} trading days later **${a.pct_positive}%** of the time, average ${pc(a.avg_return_pct)} (worst ${pc(a.worst_pct)}, best ${pc(a.best_pct)}). Any random ${b.horizon_trading_days}-day window: higher ${base.pct_positive}% of the time, average ${pc(base.avg_return_pct)}.${b.caution ? ' _Small sample — weak evidence._' : ''}`;
}

function keyLevels(t, pr) {
  const out = [`- Support (60-day low): **${inr(t.support_60d)}** · Resistance (60-day high): **${inr(t.resistance_60d)}**`, `- 50-day avg **${inr(t.sma50)}** · 200-day avg **${inr(t.sma200)}** · 52-week range ${inr(t.low_52w)} – ${inr(t.high_52w)}`];
  if (pr) out.push(`- Statistical 1-month range (90% of outcomes, from its own volatility): **${inr(pr.price_percentiles.p5)} – ${inr(pr.price_percentiles.p95)}**, middle half ${inr(pr.price_percentiles.p25)} – ${inr(pr.price_percentiles.p75)}`);
  return out;
}

function risksFor(t) {
  const r = [];
  if (t.annual_volatility_pct > 35) r.push(`High volatility (${n1(t.annual_volatility_pct)}% a year) — big swings both ways; size positions smaller.`);
  if (t.beta_vs_nifty > 1.2) r.push(`High beta (${t.beta_vs_nifty}) — tends to fall more than the Nifty in a sell-off.`);
  if (t.max_drawdown_1y_pct < -25) r.push(`Fell ${pc(t.max_drawdown_1y_pct)} from peak to trough within the last year.`);
  if (t.rsi14 > 70) r.push('Overbought on RSI — short-term pullbacks are common from here.');
  if (t.above_sma200 === false) r.push('Below its 200-day average — the long-term trend is down until that changes.');
  if (t.pct_from_52w_high > -3) r.push('Near its 52-week high — some holders take profits at these levels.');
  if (!r.length) r.push('No major technical red flags; company news, results and the overall market remain the main risks.');
  return r;
}

async function stockReport(sym, steps, { withNews = true, technicalFocus = false } = {}) {
  const [q, t, pr, news] = await Promise.all([
    tool(steps, 'get_quotes', { symbols: [sym, 'NIFTY'] }),
    tool(steps, 'get_technicals', { symbol: sym }),
    tool(steps, 'probability_range', { symbol: sym, days: 21 }),
    withNews ? tool(steps, 'get_news', { symbol: sym }) : null,
  ]);
  if (!t) return { text: `I could not load price history for **${sym}**. Check the symbol (NSE code, e.g. TATAMOTORS) or try again in a minute — the free price feed may be busy.`, sources: [] };
  const bts = await Promise.all(setupsFor(t).map((s) => tool(steps, 'backtest_setup', { symbol: sym, setup: s, horizon_days: 20 })));
  const quote = q && q.quotes && q.quotes[sym];
  const nifty = q && q.quotes && q.quotes.NIFTY;
  const R = t.returns_pct || {};
  const L = [];
  const mood = t.above_sma200 && t.above_sma50 ? 'strong' : t.above_sma200 ? 'mixed but still positive long-term' : 'weak';
  L.push(`**Bottom line:** ${sym}'s price action is **${mood}** — it is ${trendWords(t).replace(/\*\*/g, '')}, RSI ${n1(t.rsi14)} (${rsiWords(t.rsi14)}). Past patterns below show the odds, not a promise.`);
  L.push('', '## Price now');
  L.push(`- Last **${inr(quote ? quote.price : t.last)}**${quote ? ` (${pc(quote.change_pct, 2)} today)` : ''}${nifty ? ` · Nifty 50 ${pc(nifty.change_pct, 2)} today` : ''}`);
  L.push(`- Returns: 1 week ${pc(R['1W'])} · 1 month ${pc(R['1M'])} · 3 months ${pc(R['3M'])} · 6 months ${pc(R['6M'])} · 1 year **${pc(R['1Y'])}**`);
  L.push(`- ${t.sector ? `Sector: ${t.sector} · ` : ''}Volatility ${n1(t.annual_volatility_pct)}%/yr · Beta ${t.beta_vs_nifty ?? '—'} · Worst fall in 1 yr ${pc(t.max_drawdown_1y_pct)}${t.volume_vs_20d_avg ? ` · Today's volume ${t.volume_vs_20d_avg}× normal` : ''}`);
  L.push('', '## Trend & momentum');
  L.push(`- The stock is ${trendWords(t)}.`);
  L.push(`- RSI (14-day) is **${n1(t.rsi14)}** — ${rsiWords(t.rsi14)}. RSI measures how strong recent buying vs selling has been (0–100).`);
  L.push(`- It is ${pc(t.pct_from_52w_high)} from its 52-week high and ${pc(t.pct_from_52w_low)} above its 52-week low.`);
  L.push('', '## What history says (5-year backtest)');
  bts.filter(Boolean).forEach((b) => L.push(btLine(b)));
  if (!bts.some(Boolean)) L.push('- Backtest data was unavailable right now.');
  L.push('', '## Key levels');
  keyLevels(t, pr).forEach((x) => L.push(x));
  const sources = [];
  if (news) {
    const items = (news.bse_filings || []).map((f) => ({ ...f, source: 'BSE filing' })).concat(news.headlines || []).slice(0, technicalFocus ? 3 : 5);
    L.push('', '## Latest news & filings');
    if (!items.length) L.push('- No fresh headlines found in the free feeds.');
    items.forEach((h) => { L.push(`- ${h.time ? day(h.time) + ' · ' : ''}${h.link ? `[${h.title}](${h.link})` : h.title}${h.source ? ` — ${h.source}` : ''}`); if (h.link) sources.push({ title: h.title, url: h.link }); });
  }
  L.push('', '## Main risks');
  risksFor(t).forEach((x) => L.push('- ' + x));
  L.push('', '## What would change the picture');
  L.push(t.above_sma200 ? `- A close below the 200-day average (${inr(t.sma200)}) would weaken the long-term trend.` : `- A close back above the 200-day average (${inr(t.sma200)}) would be the first sign of a turn.`);
  L.push(`- A break above ${inr(t.resistance_60d)} or below ${inr(t.support_60d)} would show which side is winning.`);
  if (!technicalFocus) L.push('- Quarterly results, management commentary and sector news — check the News tab around result dates.');
  return { text: L.join('\n'), sources, t };
}

function riskReport(ctx, steps) {
  const H = (ctx && ctx.holdings) || [];
  const P = (ctx && ctx.portfolio) || {};
  steps.push({ kind: 'tool', text: `portfolio review of ${H.length} holdings` });
  if (!H.length) return 'No holdings are loaded yet. Connect Angel One (or import a holdings file) on the Connect tab, then ask me again.';
  const byW = H.slice().sort((a, b) => b.weightPct - a.weightPct);
  const top3 = byW.slice(0, 3).reduce((s, h) => s + h.weightPct, 0);
  const sectors = {};
  H.forEach((h) => { sectors[h.sector || 'Other'] = (sectors[h.sector || 'Other'] || 0) + h.weightPct; });
  const secs = Object.entries(sectors).sort((a, b) => b[1] - a[1]);
  const risky = H.filter((h) => h.flag === 'Risky'), watch = H.filter((h) => h.flag === 'Watch');
  const fall10 = P.value && P.beta ? P.value * P.beta * 0.10 : null;
  const L = [];
  const level = top3 > 60 || secs[0][1] > 40 || risky.length >= 2 ? 'elevated' : top3 > 45 || secs[0][1] > 30 || risky.length ? 'moderate' : 'reasonable';
  L.push(`**Bottom line:** Overall risk looks **${level}** — health score ${P.healthScore ?? '—'}/100, ${risky.length} holding(s) flagged risky and ${watch.length} to watch.${ctx.note ? ' _(Demo portfolio — connect your account for real numbers.)_' : ''}`);
  L.push('', '## Size of the bet');
  L.push(`- Portfolio value **${inr(P.value)}** (invested ${inr(P.invested)}) · today ${inr(P.todayPnL)}`);
  L.push(`- One-day 95% VaR **${inr(P.oneDayVaR95)}** — on 1 day in 20 you could lose at least this much.`);
  if (fall10) L.push(`- Beta ${P.beta}: if the Nifty fell 10%, this portfolio would typically fall about **${inr(fall10)}** (${pc(-P.beta * 10)}).`);
  L.push(`- Volatility ${P.annualVolatilityPct ?? '—'}% a year${P.oneYear && P.oneYear.maxDrawdownPct != null ? ` · worst 1-yr fall ${pc(P.oneYear.maxDrawdownPct)}` : ''}`);
  L.push('', '## Concentration');
  L.push(`- Top 3 holdings = **${n1(top3)}%** of the portfolio (${byW.slice(0, 3).map((h) => `${h.symbol} ${n1(h.weightPct)}%`).join(', ')}). Above ~50% means a few stocks decide your results.`);
  L.push(`- Biggest sector: **${secs[0][0]} ${n1(secs[0][1])}%**${secs[1] ? `, then ${secs[1][0]} ${n1(secs[1][1])}%` : ''}. Above ~35% in one sector is a concentrated bet.`);
  const riskShare = H.slice().sort((a, b) => b.riskSharePct - a.riskSharePct)[0];
  if (riskShare) L.push(`- ${riskShare.symbol} is ${n1(riskShare.weightPct)}% of the money but **${n1(riskShare.riskSharePct)}% of the risk**.`);
  L.push('', '## Holdings that need attention');
  if (!risky.length && !watch.length) L.push('- None flagged right now.');
  risky.concat(watch).slice(0, 6).forEach((h) => L.push(`- **${h.symbol}** (${h.flag}) — P&L ${pc(h.pnlPct)}, volatility ${h.volPct}%/yr, beta ${h.beta}, ${n1(h.weightPct)}% of portfolio`));
  L.push('', '## Options to consider');
  if (top3 > 50) L.push('- Cap any single stock at ~10–15% so one bad result can\'t sink the portfolio.');
  if (secs[0][1] > 35) L.push(`- Add exposure outside ${secs[0][0]} to spread sector risk.`);
  if (risky.length) L.push('- For risky names, decide in advance the price where your reason for owning them would be wrong (a stop-loss level).');
  L.push('- Use the **Stress** tab to see crash scenarios and the **Optimizer** tab to compare allocations.');
  return L.join('\n');
}

async function scoutReport(task, extra, steps) {
  const t = task.toLowerCase();
  const pick = [];
  if (/momentum|strong|leader|trend/.test(t)) pick.push('momentum_leaders');
  if (/52.?w(ee)?k? high|new high|breakout/.test(t)) pick.push('near_52w_high');
  if (/oversold|beaten|cheap|fallen|down a lot/.test(t)) pick.push('oversold');
  if (/pullback|dip/.test(t)) pick.push('pullback_in_uptrend');
  if (/volume|unusual/.test(t)) pick.push('volume_spike');
  if (/52.?w(ee)?k? low/.test(t)) pick.push('near_52w_low');
  if (/breakdown|weak|avoid|danger/.test(t)) pick.push('breakdown_risk');
  if (/safe|stable|low vol|defensive|steady/.test(t)) pick.push('low_volatility');
  if (!pick.length) pick.push('momentum_leaders', 'pullback_in_uptrend');
  const res = await Promise.all(pick.slice(0, 3).map((p) => tool(steps, 'screen_market', { preset: p, extra_symbols: extra, limit: 6 })));
  const L = [];
  const total = res.reduce((s, r) => s + (r ? r.matches : 0), 0);
  L.push(`**Bottom line:** Scanned the Nifty 50 large caps${extra.length ? ' plus your watchlist/holdings' : ''} — **${total}** stock(s) matched. These are ideas to **study**, not buy signals.`);
  res.forEach((r, i) => {
    L.push('', `## ${PRESET_TEXT[pick[i]]}`);
    if (!r) { L.push('- Scan unavailable right now (free price feed busy).'); return; }
    if (!r.results.length) { L.push(`- Nothing matched today (${r.scanned} scanned).`); return; }
    r.results.slice(0, 6).forEach((x) => L.push(`- **${x.symbol}** ${inr(x.price)} — 1M ${pc(x.r1m)}, 3M ${pc(x.r3m)}, RSI ${n1(x.rsi14)}, ${pc(x.pct_from_52w_high)} from high${x.volume_x ? `, volume ${x.volume_x}×` : ''}${x.sector ? ` · ${x.sector}` : ''}`));
  });
  L.push('', '## Next step');
  L.push('- Pick one name and ask the **Technical Analyst** for a backtest, or open its chart. Check results dates and news before acting.');
  return L.join('\n');
}

function parsePlan(task) {
  const t = task.replace(/,/g, '').toLowerCase();
  const num = (re) => { const m = t.match(re); return m ? parseFloat(m[1]) : null; };
  return {
    qty: num(/(?:buy|sell|short)?\s*(\d+)\s*(?:shares|qty|quantity|stocks?)?\s*(?:of\s+)?[a-z&-]*\s*(?:at|@)/),
    entry: num(/(?:at|@|entry|price)\s*₹?\s*(\d+(?:\.\d+)?)/),
    stop: num(/(?:stop(?:\s*-?loss)?|sl)\s*(?:at|of|@)?\s*₹?\s*(\d+(?:\.\d+)?)/),
    target: num(/(?:target|tgt|tp)\s*(?:at|of|@)?\s*₹?\s*(\d+(?:\.\d+)?)/),
    capital: num(/(?:capital|account|portfolio|have|with)\s*(?:of)?\s*₹?\s*(\d+(?:\.\d+)?)\s*(k|lakh|l)?/) ,
    short: /\b(sell|short)\b/.test(t),
  };
}

async function coachReport(task, sym, ctx, steps) {
  const p = parsePlan(task);
  if (/lakh/.test(task.toLowerCase()) && p.capital && p.capital < 1000) p.capital *= 100000;
  if (/\d+\s*k\b/i.test(task) && p.capital && p.capital < 1000) p.capital *= 1000;
  const cap = p.capital || (ctx && ctx.portfolio && ctx.portfolio.value) || null;
  const L = [];
  let t = null, pr = null;
  if (sym) [t, pr] = await Promise.all([tool(steps, 'get_technicals', { symbol: sym }), tool(steps, 'probability_range', { symbol: sym, days: 10 })]);
  const entry = p.entry || (t && t.last);
  if (!entry || !p.stop) {
    L.push('**Bottom line:** To review a trade I need at least the **stock, entry price and stop-loss**. Example: _"Buy 20 SBIN at 800, stop 760, target 900, capital 50000"_.');
    L.push('', '## Position-sizing rule of thumb');
    L.push('- Risk no more than **1–2% of your capital** on one trade. Risk = (entry − stop) × quantity.');
    L.push('- So with ₹50,000 capital and a ₹40 stop distance, 1% risk (₹500) means about **12 shares**.');
    L.push('- Aim for a target at least **2×** the distance to your stop (2:1 reward-to-risk).');
    return L.join('\n');
  }
  const perShare = Math.abs(entry - p.stop);
  const qty = p.qty || (cap ? Math.floor((cap * 0.01) / perShare) : null);
  const risk = qty ? perShare * qty : null;
  const rr = p.target ? Math.abs(p.target - entry) / perShare : null;
  const dailyVol = pr ? pr.daily_volatility_pct : null;
  const stopPct = (perShare / entry) * 100;
  const issues = [];
  if (cap && risk && risk / cap > 0.02) issues.push(`You'd risk **${n1((risk / cap) * 100)}%** of capital — above the usual 1–2% limit. A size of about **${Math.floor((cap * 0.015) / perShare)} shares** keeps it near 1.5%.`);
  if (rr != null && rr < 1.5) issues.push(`Reward-to-risk is only **${rr.toFixed(1)}:1** — you need to be right more than ${Math.round(100 / (1 + rr))}% of the time just to break even.`);
  if (dailyVol && stopPct < dailyVol * 1.2) issues.push(`Your stop is ${n1(stopPct)}% away, but the stock moves about ${n1(dailyVol)}% on a normal day — normal noise could hit it. Consider a wider stop with a smaller size.`);
  if (!p.short && t && t.above_sma200 === false) issues.push('You are buying a stock that is below its 200-day average (long-term downtrend) — be clear why you expect a turn.');
  if (!p.target) issues.push('No target set — decide in advance where you will take profit or review.');
  L.push(`**Bottom line:** ${issues.length ? `Plan has **${issues.length} thing(s) to fix** before acting.` : 'The plan is **well structured** on risk — the decision is yours.'}`);
  L.push('', '## Your plan in numbers');
  L.push(`- ${p.short ? 'Sell/short' : 'Buy'} ${qty ?? '?'} × ${sym || 'stock'} at **${inr(entry)}**, stop **${inr(p.stop)}** (${n1(stopPct)}% away)${p.target ? `, target **${inr(p.target)}**` : ''}`);
  if (risk) L.push(`- Money at risk if the stop hits: **${inr(risk)}**${cap ? ` = ${n1((risk / cap) * 100)}% of ${inr(cap)} capital` : ''}`);
  if (p.target && qty) L.push(`- Profit if the target hits: **${inr(Math.abs(p.target - entry) * qty)}** · reward-to-risk **${rr.toFixed(1)}:1**`);
  if (!p.qty && qty) L.push(`- (No quantity given — sized at 1% risk of capital.)`);
  if (t) {
    L.push('', '## What the chart says');
    L.push(`- ${sym} is ${trendWords(t)}; RSI ${n1(t.rsi14)} (${rsiWords(t.rsi14)}).`);
    if (pr) L.push(`- Over the next 2 weeks, 90% of statistical outcomes fall between **${inr(pr.price_percentiles.p5)} and ${inr(pr.price_percentiles.p95)}** — your stop is ${p.stop < pr.price_percentiles.p5 ? 'outside that range (only a bigger-than-usual move would hit it)' : 'inside that range (normal swings could hit it)'}${p.target ? `; your target is ${p.target > pr.price_percentiles.p95 ? 'beyond it, so ambitious for 2 weeks' : 'within it'}` : ''}.`);
  }
  L.push('', '## Things to fix');
  if (!issues.length) L.push('- Nothing major. Stick to the stop once you are in.');
  issues.forEach((x) => L.push('- ' + x));
  L.push('', '## Checklist before you act');
  L.push('- Can you explain the reason for this trade in one sentence?', '- Any results or big news due in the next 2 weeks?', '- Will you actually exit at the stop, without moving it?', '- Is this trade sized so a loss won\'t upset you?');
  return L.join('\n');
}

async function marketNews(steps) {
  steps.push({ kind: 'tool', text: 'market RSS feeds' });
  const feeds = await rssFeeds().catch(() => []);
  const items = feeds.flatMap((f) => f.items || []).sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 8);
  const L = ['**Bottom line:** The latest market headlines from free feeds (Moneycontrol, ET Markets) — open the **News & brief** tab for the full list and filings.', '', '## Top headlines'];
  if (!items.length) L.push('- News feeds are not reachable right now.');
  items.forEach((h) => L.push(`- ${h.time ? day(h.time) + ' · ' : ''}${h.link ? `[${h.title}](${h.link})` : h.title}${h.source ? ` — ${h.source}` : ''}`));
  return { text: L.join('\n'), sources: items.filter((i) => i.link).map((i) => ({ title: i.title, url: i.link })) };
}

async function voiceAnswer(task, sym, ctx, steps) {
  const t = task.toLowerCase();
  const H = (ctx && ctx.holdings) || [];
  if (/my (stocks|holdings|portfolio)|which of my/.test(t) && H.length) {
    const s = H.slice().sort((a, b) => a.todayPct - b.todayPct);
    if (/(rose|gain|up|best|top)/.test(t) && !/fell|down|worst/.test(t)) { const b = s[s.length - 1]; return `Your best performer today is ${b.symbol}, ${pc(b.todayPct, 2)}. Your portfolio is ${inr(ctx.portfolio.todayPnL)} for the day.`; }
    return `Your weakest holding today is ${s[0].symbol} at ${pc(s[0].todayPct, 2)}, and the best is ${s[s.length - 1].symbol} at ${pc(s[s.length - 1].todayPct, 2)}. The portfolio is ${inr(ctx.portfolio.todayPnL)} today.`;
  }
  if (sym && sym !== 'NIFTY') {
    const [q, tt] = await Promise.all([tool(steps, 'get_quotes', { symbols: [sym] }), tool(steps, 'get_technicals', { symbol: sym })]);
    const qq = q && q.quotes && q.quotes[sym];
    if (!qq && !tt) return `I couldn't get prices for ${sym} right now.`;
    return `${sym} is at ${inr(qq ? qq.price : tt.last)}${qq ? `, ${pc(qq.change_pct, 2)} today` : ''}.${tt ? ` It is ${trendWords(tt).replace(/\*\*/g, '').replace(/\s*\(.*\)/, '')}, with RSI ${n1(tt.rsi14)}.` : ''}`;
  }
  const q = await tool(steps, 'get_quotes', { symbols: ['NIFTY'] });
  const n = q && q.quotes && q.quotes.NIFTY;
  const m = ctx && ctx.market;
  return `${n ? `The Nifty 50 is at ${Number(n.price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}, ${pc(n.change_pct, 2)} today.` : 'I could not reach the index feed right now.'}${m && m.adRatio ? ` Breadth: ${m.adRatio} stocks rising for every one falling, regime ${m.regime}.` : ''}`;
}

export async function runBuiltin({ task, role, voice, context }) {
  const steps = [];
  const extra = ((context && context.holdings) || []).map((h) => h.symbol).concat((context && context.watchlist) || []);
  const syms = findSymbols(task, extra);
  const sym = syms[0];
  if (voice) return { answer: await voiceAnswer(task, sym, context, steps), steps, sources: [] };
  let text = '', sources = [];
  if (role === 'risk') text = riskReport(context, steps);
  else if (role === 'scout') text = await scoutReport(task, extra.slice(0, 30), steps);
  else if (role === 'coach') text = await coachReport(task, sym, context, steps);
  else if (role === 'news') {
    if (sym) {
      const r = await tool(steps, 'get_news', { symbol: sym });
      const items = r ? (r.bse_filings || []).map((f) => ({ ...f, source: 'BSE filing' })).concat(r.headlines || []) : [];
      text = [`**Bottom line:** ${items.length} recent item(s) found for **${sym}** in free news feeds and BSE filings.`, '', '## Latest', ...(items.length ? items.slice(0, 10).map((h) => `- ${h.time ? day(h.time) + ' · ' : ''}${h.link ? `[${h.title}](${h.link})` : h.title}${h.source ? ` — ${h.source}` : ''}`) : ['- Nothing fresh found.'])].join('\n');
      sources = items.filter((i) => i.link).map((i) => ({ title: i.title, url: i.link }));
    } else if (/my (holdings|stocks|portfolio)/i.test(task) && extra.length) {
      const per = await Promise.all(extra.slice(0, 6).map((s) => tool(steps, 'get_news', { symbol: s }).then((r) => [s, r])));
      const L = ['**Bottom line:** Latest headlines for your holdings from free news feeds and BSE filings.'];
      per.forEach(([s, r]) => {
        const items = r ? (r.bse_filings || []).map((f) => ({ ...f, source: 'BSE filing' })).concat(r.headlines || []).slice(0, 3) : [];
        L.push('', `## ${s}`);
        if (!items.length) L.push('- Nothing fresh.');
        items.forEach((h) => { L.push(`- ${h.time ? day(h.time) + ' · ' : ''}${h.link ? `[${h.title}](${h.link})` : h.title}${h.source ? ` — ${h.source}` : ''}`); if (h.link) sources.push({ title: h.title, url: h.link }); });
      });
      text = L.join('\n');
    } else ({ text, sources } = await marketNews(steps));
  } else if (sym) {
    const parts = await Promise.all(syms.slice(0, role === 'analyst' && /compare|vs|versus/i.test(task) ? 2 : 1).map((s) => stockReport(s, steps, { withNews: role !== 'technical' || true, technicalFocus: role === 'technical' })));
    text = parts.map((p) => p.text).join('\n\n---\n\n');
    sources = parts.flatMap((p) => p.sources);
    if (parts.length === 2 && parts[0].t && parts[1].t) {
      const [a, b] = parts.map((p) => p.t);
      text = `**Comparison:** ${syms[0]} 1-yr ${pc(a.returns_pct['1Y'])} vs ${syms[1]} ${pc(b.returns_pct['1Y'])}; volatility ${n1(a.annual_volatility_pct)}% vs ${n1(b.annual_volatility_pct)}%; RSI ${n1(a.rsi14)} vs ${n1(b.rsi14)}.\n\n` + text;
    }
  } else {
    text = 'Tell me which stock to look at — e.g. _"Full report on Tata Motors"_ or _"Technical view on Reliance"_. For ideas across the market, use the **Market Scout**; for your portfolio, the **Risk Manager**.';
  }
  return { answer: text, steps, sources };
}
