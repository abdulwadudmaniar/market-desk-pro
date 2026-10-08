import { useState } from 'react';
import { Panel, Seg, Spark, Empty } from '../ui.jsx';
import { inr, sInr, pct, upct, col, PILL } from '../lib/format.js';

export default function Positions({ M, go }) {
  const [filter, setFilter] = useState('All');
  const [sel, setSel] = useState(null);
  if (M.empty) return <Empty>No holdings yet. <a href="#connect" onClick={() => go('connect')}>Connect accounts</a>.</Empty>;
  const rows = filter === 'All' ? M.rows : M.rows.filter((r) => r.status === filter);
  const s = M.rows.find((r) => r.symbol === sel) || M.rows.slice().sort((a, b) => (b.status === 'Risky') - (a.status === 'Risky') || b.rc - a.rc)[0];
  const cell = (label, value, style) => <div style={{ background: '#151D26', borderRadius: 6, padding: 10 }}><p className="lbl">{label}</p><span className="num" style={{ fontSize: 16, fontWeight: 600, ...style }}>{value}</span></div>;
  return (
    <div className="col" style={{ gap: 14 }}>
      <Panel title="Positions" bodyStyle={{ padding: 0 }} right={<Seg label="Filter by risk" options={['All', 'Safe', 'Watch', 'Risky'].map((f) => ({ value: f, label: `${f} ${f === 'All' ? M.rows.length : M.counts[f]}` }))} value={filter} onChange={setFilter} />}>
        <div className="scroll">
          <table className="tbl">
            <thead><tr><th>Symbol</th><th>Qty</th><th>Avg</th><th>LTP</th><th>Value</th><th>P&amp;L</th><th>Wt</th><th>Beta</th><th>Vol</th><th>30D</th><th>Signal</th><th><span className="sr">Action</span></th></tr></thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.symbol} style={{ background: s && s.symbol === h.symbol ? 'rgba(242,169,59,.07)' : undefined }}>
                  <td><div className="col" style={{ gap: 2 }}><strong className="num">{h.symbol}</strong><span className="mut tiny">{h.sector} · {h.source}{h.priced === false ? ' · no live price' : ''}</span></div></td>
                  <td className="num">{h.qty}</td>
                  <td className="num">{inr(h.avg)}</td>
                  <td className="num"><div className="col" style={{ gap: 2, alignItems: 'flex-end' }}><span>{inr(h.ltp)}</span><span className="tiny" style={{ color: col(h.chg) }}>{pct(h.chg)}</span></div></td>
                  <td className="num">{inr(h.value)}</td>
                  <td className="num"><div className="col" style={{ gap: 2, alignItems: 'flex-end' }}><span style={{ fontWeight: 600, color: col(h.pnl) }}>{sInr(h.pnl)}</span><span className="mut tiny">{pct(h.pnlPct)}</span></div></td>
                  <td className="num">{upct(h.weight)}</td>
                  <td className="num">{h.beta.toFixed(2)}</td>
                  <td className="num">{upct(h.vol * 100)}</td>
                  <td><Spark data={h.spark} /></td>
                  <td><span className="pill" style={PILL[h.status]}>{h.status}</span></td>
                  <td><button type="button" className="btn small" onClick={() => setSel(h.symbol)}>Analyse</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {s && (
        <Panel title={<>Security analysis · <span className="num" style={{ color: '#F2A93B' }}>{s.symbol}</span></>} right={<span className="pill" style={PILL[s.status]}>{s.status}</span>} bodyStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
          <div className="grid2" style={{ flex: '1 1 280px', alignContent: 'start' }}>
            {cell('Value', inr(s.value))}
            {cell('P&L', sInr(s.pnl), { color: col(s.pnl) })}
            {cell('Beta', s.beta.toFixed(2))}
            {cell('Volatility', upct(s.vol * 100))}
            {cell('Weight', upct(s.weight))}
            {cell('Risk share', upct(s.rc * 100))}
            {cell('Break-even', s.breakEven ? `${inr(s.avg)} (${pct(s.breakEven, 1)})` : 'Above ✓')}
            {cell('1-day VaR 95', inr(s.var95))}
          </div>
          <div className="col" style={{ flex: '2 1 420px' }}>
            <p className="lbl" style={{ color: '#F2A93B' }}>Why it's flagged</p>
            {s.reasons.map((r) => <div key={r} className="para" style={{ padding: '10px 12px', background: '#151D26', borderRadius: 6, color: '#E6EDF3' }}>{r}</div>)}
            <p className="lbl" style={{ color: '#F2A93B' }}>Questions before acting</p>
            {s.prompts.map((p) => <div key={p} className="para">› {p}</div>)}
            {!s.hasHist && <p className="note">Beta and volatility are assumed for this stock until price history is available.</p>}
          </div>
        </Panel>
      )}
    </div>
  );
}
