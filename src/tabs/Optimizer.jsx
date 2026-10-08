import { Panel, HBar, Empty } from '../ui.jsx';
import { upct } from '../lib/format.js';
import { RF } from '../lib/model.js';

export default function Optimizer({ M }) {
  if (M.empty) return <Empty>No holdings yet.</Empty>;
  if (M.n < 2) return <Empty>The optimizer needs at least two holdings.</Empty>;
  const cl = M.cloud;
  const sMin = Math.min(...cl.map((c) => c.sig), M.cur.sig) * 0.9, sMx = Math.max(...cl.map((c) => c.sig), M.cur.sig) * 1.03;
  const mMin = Math.min(...cl.map((c) => c.mu), M.cur.mu) - 0.002, mMx = Math.max(...cl.map((c) => c.mu), M.cur.mu) + 0.002;
  const fx = (s) => 56 + ((s - sMin) / (sMx - sMin)) * 648;
  const fy = (m) => 300 - ((m - mMin) / (mMx - mMin)) * 284;
  const shs = cl.map((c) => c.sh), shMin = Math.min(...shs), shMax = Math.max(...shs);
  const gx = [], gy = [];
  const stepX = (sMx - sMin) / 4, stepY = (mMx - mMin) / 4;
  for (let i = 0; i <= 4; i++) { gx.push(sMin + stepX * i); gy.push(mMin + stepY * i); }
  const ms = M.maxSh;
  const cmlX2 = Math.min(sMx, (mMx - RF) / ms.sh);
  const cards = [['Yours', M.cur, '#F5BD62', 'rgba(242,169,59,.08)'], ['Best ratio', ms, '#C3B1F7', 'rgba(166,139,240,.08)'], ['Lowest risk', M.minVol, '#5FD3A3', 'rgba(61,190,139,.08)']];
  return (
    <div className="row">
      <Panel title={`Efficient frontier · 400 simulated mixes of your ${M.n} holdings`} style={{ flex: '999 1 620px' }}>
        <svg viewBox="0 0 720 340" style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Scatter of risk versus return for simulated portfolios">
          {gx.map((v, i) => <g key={'x' + i}><line x1={fx(v)} y1="16" x2={fx(v)} y2="300" stroke="#18212B" /><text x={fx(v)} y="318" textAnchor="middle" fill="#8D9AA8" fontSize="11" fontFamily="IBM Plex Mono">{upct(v * 100, 0)}</text></g>)}
          {gy.map((v, i) => <g key={'y' + i}><line x1="56" y1={fy(v)} x2="704" y2={fy(v)} stroke="#18212B" /><text x="48" y={fy(v) + 4} textAnchor="end" fill="#8D9AA8" fontSize="11" fontFamily="IBM Plex Mono">{upct(v * 100, 1)}</text></g>)}
          <text x="380" y="336" textAnchor="middle" fill="#8D9AA8" fontSize="11">Risk (annual volatility) →</text>
          <line x1={fx(ms.sig * 0.7)} y1={fy(RF + ms.sh * ms.sig * 0.7)} x2={fx(cmlX2)} y2={fy(Math.min(mMx, RF + ms.sh * cmlX2))} stroke="#A68BF0" strokeDasharray="5 4" />
          {cl.map((c, i) => { const a = (c.sh - shMin) / (shMax - shMin || 1); return <circle key={i} cx={fx(c.sig)} cy={fy(c.mu)} r="2.6" fill={a > 0.66 ? '#8FD3EE' : a > 0.33 ? '#4F8FB0' : '#33566B'} fillOpacity="0.75" />; })}
          <circle cx={fx(M.minVol.sig)} cy={fy(M.minVol.mu)} r="7" fill="#5FD3A3" stroke="#0A0E13" strokeWidth="2" />
          <circle cx={fx(ms.sig)} cy={fy(ms.mu)} r="7" fill="#A68BF0" stroke="#0A0E13" strokeWidth="2" />
          <circle cx={fx(M.cur.sig)} cy={fy(M.cur.mu)} r="8" fill="#F2A93B" stroke="#0A0E13" strokeWidth="2" />
        </svg>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12 }}>
          {[['#F2A93B', 'Your portfolio'], ['#A68BF0', 'Best return per unit of risk'], ['#5FD3A3', 'Lowest risk']].map(([c, l]) => <span key={l} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />{l}</span>)}
          <span className="mut">Dots coloured by Sharpe ratio (brighter = better)</span>
        </div>
      </Panel>
      <Panel title="Mix comparison" style={{ flex: '1 1 420px' }}>
        <div className="grid3">
          {cards.map(([name, s, c, bg]) => (
            <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 10, borderRadius: 6, border: `1px solid ${c}`, background: bg }}>
              <p className="lbl" style={{ color: c }}>{name}</p>
              <span className="num small">Return {upct(s.mu * 100)}</span><span className="num small">Risk {upct(s.sig * 100)}</span><span className="num small">Sharpe {s.sh.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '96px repeat(3,minmax(0,1fr))', gap: '6px 8px', fontSize: 12, alignItems: 'center' }}>
          <span className="lbl">Stock</span><span className="lbl" style={{ color: '#F5BD62' }}>Yours</span><span className="lbl" style={{ color: '#C3B1F7' }}>Best ratio</span><span className="lbl" style={{ color: '#5FD3A3' }}>Lowest risk</span>
          {M.rows.map((r, i) => [
            <span key={r.symbol + 'a'} className="num" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.symbol}</span>,
            <div key={r.symbol + 'b'} className="col" style={{ gap: 2 }}><span className="num">{upct(M.w[i] * 100, 0)}</span><HBar p={M.w[i] * 200} color="#F2A93B" /></div>,
            <div key={r.symbol + 'c'} className="col" style={{ gap: 2 }}><span className="num">{upct(ms.w[i] * 100, 0)}</span><HBar p={ms.w[i] * 200} color="#A68BF0" /></div>,
            <div key={r.symbol + 'd'} className="col" style={{ gap: 2 }}><span className="num">{upct(M.minVol.w[i] * 100, 0)}</span><HBar p={M.minVol.w[i] * 200} color="#3DBE8B" /></div>,
          ])}
        </div>
        <p className="note">Model output from {M.hasHist ? 'one year of real prices, with expected returns pulled halfway toward a market-risk assumption' : 'assumed risk and return'}. Past returns don't repeat — this shows how mixing changes risk, not what to buy.</p>
      </Panel>
    </div>
  );
}
