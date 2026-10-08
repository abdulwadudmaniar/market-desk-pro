import { useState } from 'react';
import { Panel, Pill, Seg, Legend, Empty } from '../ui.jsx';
import { inr, sInr, pct, upct, col, pts, PILL } from '../lib/format.js';
import { claudeContext } from '../lib/model.js';
import { api } from '../lib/data.js';

const PALETTE = ['#4FB3D9', '#F2A93B', '#3DBE8B', '#A68BF0', '#F06A6A', '#8D9AA8', '#E5D36B', '#5FD3A3', '#C3B1F7', '#FF9F6B'];

export function sectorWeights(M) {
  const s = {};
  M.rows.forEach((r) => { s[r.sector] = (s[r.sector] || 0) + r.weight; });
  return Object.keys(s).map((k) => ({ name: k, w: s[k] })).sort((a, b) => b.w - a.w);
}

function quickAnswers(M) {
  const rows = M.rows;
  const byRisk = rows.slice().sort((a, b) => b.rc - a.rc);
  const losers = rows.filter((r) => r.pnl < 0).sort((a, b) => a.pnl - b.pnl);
  const winners = rows.filter((r) => r.pnl >= 0);
  const largest = rows.slice().sort((a, b) => b.weight - a.weight)[0];
  const top2 = byRisk.slice(0, 2);
  return [
    { q: 'Where is my risk coming from?', a: `${top2.map((r) => r.symbol).join(' and ')} carry ${upct(top2.reduce((s, r) => s + r.rc * 100, 0))} of total risk while holding ${upct(top2.reduce((s, r) => s + r.weight, 0))} of the money.\nThey are the biggest drivers of how much your portfolio swings day to day.` },
    { q: 'Why am I up or down?', a: losers.length ? `${losers.slice(0, 2).map((r) => `${r.symbol} (${sInr(r.pnl)})`).join(' and ')} explain most of the losses.\nYour ${winners.length} winning holdings are up ${sInr(winners.reduce((s, r) => s + r.pnl, 0))} together.` : 'Every holding is above its average buy price right now.' },
    { q: 'What could I lose on a bad day?', a: `On a bad day (1 in 20) the model says you could lose about ${inr(M.var95)}. On a very bad day (1 in 100), about ${inr(M.var99)}.${M.real ? `\nOver the past year the worst 5% of real days lost more than ${inr(M.real.hvar95)}.` : ''}` },
    { q: 'Am I too concentrated?', a: `Your largest position is ${largest.symbol} at ${upct(largest.weight)}${largest.weight > 20 ? ', above the 20% guideline' : ''}. You hold ${sectorWeights(M).length} sectors.` },
  ];
}

export default function Command({ M, status, breadth, go, demo }) {
  const [range, setRange] = useState('1Y');
  const [q, setQ] = useState(0);
  const [text, setText] = useState('');
  const [ai, setAi] = useState({ busy: false, answer: '', error: '' });
  if (M.empty) return <Empty>No holdings yet. <a href="#connect" onClick={() => go('connect')}>Connect a broker or import a file</a>.</Empty>;

  const QA = quickAnswers(M);
  const sectors = sectorWeights(M);
  const C = 2 * Math.PI * 60;
  let acc = 0;

  let chart = null;
  if (M.port) {
    const len = { '1M': 22, '6M': 127, '1Y': M.port.length }[range];
    const pS = M.port.slice(-len), nS0 = M.nifty.slice(-len), nS = nS0.map((v) => (v * pS[0]) / nS0[0]);
    const mn = Math.min(...pS, ...nS), mx = Math.max(...pS, ...nS);
    const pp = pts(pS, 720, 220, 12, mn, mx);
    const pr = (pS[pS.length - 1] / pS[0] - 1) * 100, nr = (nS[nS.length - 1] / nS[0] - 1) * 100;
    let pk = pS[0];
    const dds = pS.map((v) => { pk = Math.max(pk, v); return v / pk - 1; });
    const ddMin = Math.min(...dds, -0.01);
    const ddLine = dds.map((v, i) => ((i / (dds.length - 1)) * 720).toFixed(1) + ',' + (1 + (v / ddMin) * 66).toFixed(1)).join(' ');
    chart = { pp, np: pts(nS, 720, 220, 12, mn, mx), pr, nr, ddLine, ddMin };
  }

  const ask = async (question) => {
    setAi({ busy: true, answer: '', error: '' });
    try {
      const ctx = claudeContext(M, breadth ? { regime: breadth.regime, adRatio: +breadth.adr.toFixed(2), niftyTodayPct: breadth.index ? +breadth.index.chg.toFixed(2) : null, live: breadth.live } : null);
      if (demo) ctx.note = 'This is a demo portfolio with sample data.';
      const j = await api('/api/ask', { method: 'POST', body: JSON.stringify({ question, context: ctx }) });
      setAi({ busy: false, answer: j.answer, error: '' });
    } catch (e) { setAi({ busy: false, answer: '', error: e.message }); }
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row">
        <Panel title="Performance vs Nifty 50 · drawdown" style={{ flex: '999 1 620px' }} right={M.port && <Seg label="Time range" options={['1M', '6M', '1Y']} value={range} onChange={setRange} />}>
          {chart ? (
            <>
              <Legend items={[
                { label: 'Portfolio', color: '#4FB3D9', value: pct(chart.pr, 1), valueStyle: { color: col(chart.pr) } },
                { label: 'Nifty 50', color: '#F2A93B', dashed: true, value: pct(chart.nr, 1), valueStyle: { color: col(chart.nr) } },
                { label: 'Difference', color: 'transparent', value: pct(chart.pr - chart.nr, 1), valueStyle: { color: col(chart.pr - chart.nr) } },
              ]} />
              <svg viewBox="0 0 720 220" preserveAspectRatio="none" style={{ width: '100%', height: 230, display: 'block' }} role="img" aria-label="Portfolio value versus Nifty 50">
                {[55, 110, 165].map((y) => <line key={y} x1="0" y1={y} x2="720" y2={y} stroke="#18212B" />)}
                <polygon points={`${chart.pp} 720,220 0,220`} fill="#4FB3D9" fillOpacity="0.10" />
                <polyline points={chart.np} fill="none" stroke="#F2A93B" strokeWidth="1.6" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                <polyline points={chart.pp} fill="none" stroke="#4FB3D9" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><p className="lbl">Drawdown from peak</p><span className="num small" style={{ color: '#FF8A8A' }}>max {pct(chart.ddMin * 100, 1)}</span></div>
              <svg viewBox="0 0 720 70" preserveAspectRatio="none" style={{ width: '100%', height: 70, display: 'block' }} role="img" aria-label="Drawdown chart">
                <polygon points={`0,1 ${chart.ddLine} 720,1`} fill="#F06A6A" fillOpacity="0.35" />
              </svg>
              <p className="note">Today's holdings replayed over {demo ? 'demo' : 'real'} past prices — shows how this exact mix would have behaved.</p>
            </>
          ) : <p className="para">Price history loads once a broker is connected (Upstox, or Zerodha's paid Connect plan).</p>}
        </Panel>

        <Panel title="Allocation" right={<span className="num mut small">{inr(M.total)}</span>} style={{ flex: '1 1 340px' }} bodyStyle={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
          <svg viewBox="0 0 160 160" width="170" height="170" role="img" aria-label="Sector allocation donut" style={{ flex: '0 0 auto' }}>
            <circle cx="80" cy="80" r="60" fill="none" stroke="#18212B" strokeWidth="22" />
            {sectors.map((s, i) => {
              const L = (s.w / 100) * C;
              const el = <circle key={s.name} cx="80" cy="80" r="60" fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="22" strokeDasharray={`${Math.max(0, L - 2)} ${C - L + 2}`} strokeDashoffset={-acc} transform="rotate(-90 80 80)" />;
              acc += L;
              return el;
            })}
            <text x="80" y="76" textAnchor="middle" fill="#8D9AA8" fontSize="10">SECTORS</text>
            <text x="80" y="96" textAnchor="middle" fill="#E6EDF3" fontSize="22" fontWeight="600" fontFamily="IBM Plex Mono">{sectors.length}</text>
          </svg>
          <div className="col" style={{ flex: '1 1 140px', gap: 8 }}>
            {sectors.map((s, i) => (
              <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '10px minmax(0,1fr) auto', gap: 8, alignItems: 'center', fontSize: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: PALETTE[i % PALETTE.length] }} /><span>{s.name}</span><span className="num">{upct(s.w)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="row">
        <Panel title="Risk alerts" style={{ flex: '1 1 340px' }} bodyStyle={{ gap: 8 }} right={<span className="num small"><span style={{ color: '#5FD3A3' }}>{M.counts.Safe} SAFE</span> · <span style={{ color: '#F5BD62' }}>{M.counts.Watch} WATCH</span> · <span style={{ color: '#FF8A8A' }}>{M.counts.Risky} RISKY</span></span>}>
          {M.rows.filter((r) => r.status !== 'Safe').sort((a, b) => (b.status === 'Risky') - (a.status === 'Risky')).map((r) => (
            <button key={r.symbol} type="button" onClick={() => go('positions')} style={{ textAlign: 'left', cursor: 'pointer', background: '#151D26', border: '1px solid #222C38', borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, color: '#E6EDF3', minHeight: 44 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><strong className="num" style={{ fontSize: 13 }}>{r.symbol}</strong><span className="pill" style={PILL[r.status]}>{r.status}</span></span>
              <span className="soft small" style={{ lineHeight: 1.45 }}>{r.reasons[0]}</span>
            </button>
          ))}
          {M.counts.Watch + M.counts.Risky === 0 && <p className="para">No holdings flagged right now.</p>}
        </Panel>

        <Panel title="Ask Claude" style={{ flex: '999 1 560px' }} right={<span className="mut small">{status && status.claude ? 'Uses your holdings and risk numbers' : 'Quick answers (add an Anthropic key for free-form questions)'}</span>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {QA.map((x, i) => <button key={x.q} type="button" className={'chip' + (q === i && !ai.answer ? ' on' : '')} onClick={() => { setQ(i); setAi({ busy: false, answer: '', error: '' }); }}>{x.q}</button>)}
          </div>
          {status && status.claude && (
            <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) ask(text.trim()); }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <label htmlFor="askq" className="sr">Ask a question</label>
              <input id="askq" className="field" style={{ flex: '1 1 240px' }} placeholder="e.g. Should I worry about my auto stocks?" value={text} onChange={(e) => setText(e.target.value)} />
              <button className="btn primary" type="submit" disabled={ai.busy || !text.trim()}>{ai.busy ? 'Thinking…' : 'Ask'}</button>
            </form>
          )}
          <div className="box col" style={{ gap: 6 }}>
            <p className="lbl" style={{ color: '#F2A93B' }}>Claude ›</p>
            {ai.error ? <p className="para" style={{ color: '#FF8A8A' }}>{ai.error}</p>
              : <p className="para" style={{ fontSize: 14, color: '#E6EDF3', whiteSpace: 'pre-line' }}>{ai.busy ? 'Thinking…' : ai.answer || QA[q].a}</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
