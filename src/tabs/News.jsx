import { useEffect, useMemo, useState } from 'react';
import { Panel, Pill, Seg } from '../ui.jsx';
import { api } from '../lib/data.js';
import { inr, sInr, pct, col } from '../lib/format.js';
import { claudeContext } from '../lib/model.js';

const ago = (t) => {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};
const KIND = { filing: ['Watch', 'FILING'], holding: ['Info', 'YOUR STOCK'], market: ['Off', 'MARKET'] };

export default function News({ M, holdings, demo, breadth, status, names, openChart }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('mine');
  const [q, setQ] = useState('');
  const [ai, setAi] = useState({ busy: false, text: '', error: '' });

  const syms = useMemo(() => (demo ? [] : holdings.map((h) => h.symbol)), [holdings, demo]);
  const load = () => {
    setErr('');
    const nm = syms.map((s) => (names[s] || '').replace(/\b(Ltd|Limited|Ltd\.)\b/gi, '').trim()).join('|');
    api(`/api/news?symbols=${encodeURIComponent(syms.join(','))}&names=${encodeURIComponent(nm)}`).then(setData).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); const id = setInterval(load, 5 * 60000); return () => clearInterval(id); }, [syms.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = data ? data.items : [];
  const mine = items.filter((i) => i.symbols && i.symbols.length);
  const shown = items.filter((i) => {
    if (filter === 'mine' && !(i.symbols && i.symbols.length)) return false;
    if (filter === 'filing' && i.kind !== 'filing') return false;
    if (filter === 'market' && i.kind !== 'market') return false;
    if (q && !i.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).slice(0, 120);

  // ---- morning brief (computed locally, no AI needed)
  const brief = [];
  if (breadth && breadth.index) brief.push({ k: 'Market', v: `Nifty 50 ${Math.round(breadth.index.ltp).toLocaleString('en-IN')} (${pct(breadth.index.chg)}) · breadth ${breadth.regime.toLowerCase()} — ${breadth.adv} up / ${breadth.dec} down${breadth.live ? '' : ' (simulated)'}` });
  if (!M.empty) {
    const byDay = M.rows.slice().sort((a, b) => b.chg - a.chg);
    brief.push({ k: 'Portfolio', v: `${inr(M.total)} · today ${sInr(M.day)} (${pct((M.day / M.total) * 100)}). Best ${byDay[0].symbol} ${pct(byDay[0].chg, 1)}, worst ${byDay[byDay.length - 1].symbol} ${pct(byDay[byDay.length - 1].chg, 1)}.` });
    const risky = M.rows.filter((r) => r.status === 'Risky');
    brief.push({ k: 'Risk', v: risky.length ? `${risky.length} risky holding${risky.length > 1 ? 's' : ''}: ${risky.map((r) => r.symbol).join(', ')}. 1-day VaR 95% ${inr(M.var95)}.` : `No holdings flagged risky. 1-day VaR 95% ${inr(M.var95)}.` });
  }
  const filingsMine = mine.filter((i) => i.kind === 'filing');
  brief.push({ k: 'Filings', v: demo ? 'Connect your holdings to see their exchange filings.' : filingsMine.length ? `${filingsMine.length} new filing${filingsMine.length > 1 ? 's' : ''} for your stocks — ${filingsMine.slice(0, 3).map((i) => i.symbols[0]).join(', ')}.` : 'No new exchange filings for your stocks in the last 2 days.' });
  brief.push({ k: 'Headlines', v: demo ? 'Showing general market news (demo portfolio).' : `${mine.length} headline${mine.length === 1 ? '' : 's'} mention your stocks.` });

  const writeBrief = async () => {
    setAi({ busy: true, text: '', error: '' });
    try {
      const ctx = claudeContext(M, breadth ? { regime: breadth.regime, adRatio: +breadth.adr.toFixed(2), niftyTodayPct: breadth.index ? +breadth.index.chg.toFixed(2) : null, live: breadth.live } : null);
      ctx.headlines = (mine.length ? mine : items).slice(0, 25).map((i) => ({ title: i.title, source: i.source, symbols: i.symbols, time: i.time ? new Date(i.time).toISOString() : null }));
      if (demo) ctx.note = 'Demo portfolio with sample data.';
      const j = await api('/api/ask', { method: 'POST', body: JSON.stringify({ question: 'Write my morning brief: 1) market mood, 2) what matters for my holdings today from these headlines and filings, 3) the 2–3 risks to watch. Use short bullet points.', context: ctx }) });
      setAi({ busy: false, text: j.answer, error: '' });
    } catch (e) { setAi({ busy: false, text: '', error: e.message }); }
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <Panel title="Morning brief" live right={<span className="mut small">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}</span>}>
        <div className="col" style={{ gap: 8 }}>
          {brief.map((b) => (
            <div key={b.k} style={{ display: 'grid', gridTemplateColumns: '92px minmax(0,1fr)', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
              <span className="lbl" style={{ color: '#F2A93B', paddingTop: 3 }}>{b.k}</span><span>{b.v}</span>
            </div>
          ))}
        </div>
        {status && status.claude ? (
          <div className="col" style={{ gap: 8 }}>
            <button type="button" className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={writeBrief} disabled={ai.busy || !data}>{ai.busy ? 'AI is writing…' : 'Write my brief with AI'}</button>
            {ai.error && <p className="para" style={{ color: '#FF8A8A' }}>{ai.error}</p>}
            {ai.text && <div className="box"><p className="lbl" style={{ color: '#F2A93B' }}>AI ›</p><p className="para" style={{ color: '#E6EDF3', whiteSpace: 'pre-line', fontSize: 14 }}>{ai.text}</p></div>}
          </div>
        ) : <p className="note">Add a free GEMINI_API_KEY in Vercel to get a written brief from AI.</p>}
      </Panel>

      <Panel title="News & exchange filings" right={<button type="button" className="btn small" onClick={load}>Refresh</button>}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <Seg label="Filter" value={filter} onChange={setFilter} options={[{ value: 'mine', label: `My stocks ${mine.length}` }, { value: 'filing', label: 'Filings' }, { value: 'market', label: 'Market' }, { value: 'all', label: 'All' }]} />
          <label htmlFor="nq" className="sr">Search news</label>
          <input id="nq" className="field" style={{ flex: '1 1 200px' }} placeholder="Search headlines" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {data && <p className="note">Sources loaded: {data.loaded.join(' · ') || 'none'}{data.failed.length ? ` · unavailable right now: ${data.failed.map((f) => f.split(':')[0]).filter((v, i, a) => a.indexOf(v) === i).join(', ')}` : ''}. Refreshes every 5 minutes.</p>}
        {err && <p className="para" style={{ color: '#FF8A8A' }}>{err}</p>}
        {!data && !err && <p className="para">Loading news…</p>}
        {data && !shown.length && <p className="para">{filter === 'mine' ? (demo ? 'Connect your holdings to see news about your stocks.' : 'No recent news mentions your stocks. Try "All".') : 'Nothing here right now.'}</p>}
        <div className="col" style={{ gap: 0 }}>
          {shown.map((i) => (
            <article key={i.link + i.title} style={{ padding: '12px 0', borderBottom: '1px solid #18212B', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <Pill kind={KIND[i.kind] ? KIND[i.kind][0] : 'Off'}>{KIND[i.kind] ? KIND[i.kind][1] : i.kind.toUpperCase()}</Pill>
                {(i.symbols || []).map((s) => <button key={s} type="button" className="pill" onClick={() => openChart(s)} style={{ background: 'rgba(242,169,59,.16)', color: '#F5BD62', border: 0, cursor: 'pointer' }}>{s}</button>)}
                <span className="mut tiny">{i.source} · {ago(i.time)}</span>
              </div>
              <a href={i.link} target="_blank" rel="noopener noreferrer nofollow" style={{ color: '#E6EDF3', textDecoration: 'none', fontSize: 14, lineHeight: 1.45, fontWeight: 500 }}>{i.title}</a>
              {i.summary && <p className="note" style={{ margin: 0 }}>{i.summary}</p>}
            </article>
          ))}
        </div>
      </Panel>
      <p className="note">Headlines link to the original publisher. Exchange filings come straight from BSE/NSE; some sources may block requests at times. News is information, not a trading signal.</p>
    </div>
  );
}

export { col };
