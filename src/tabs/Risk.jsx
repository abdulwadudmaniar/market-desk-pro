import { Panel, Tile, DivBar, HBar, Empty } from '../ui.jsx';
import { inr, upct, num } from '../lib/format.js';
import { sectorWeights } from './Command.jsx';

export default function Risk({ M }) {
  if (M.empty) return <Empty>No holdings yet.</Empty>;
  const dSig = M.sigma / Math.sqrt(252);
  const X = 4 * dSig * M.total, vx = 360 - (1.645 / 4) * 360;
  const bell = [], tail = [];
  for (let b = 0; b <= 120; b++) {
    const z = -4 + (8 * b) / 120, y = 200 - Math.exp((-z * z) / 2) * 185, px = ((b / 120) * 720).toFixed(1);
    bell.push(px + ',' + y.toFixed(1));
    if ((b / 120) * 720 <= vx) tail.push(px + ',' + y.toFixed(1));
  }
  const tiles = [
    { label: 'Annual volatility', value: upct(M.sigma * 100), sub: M.hasHist ? 'From 1y of daily prices' : 'Assumed' },
    { label: 'VaR 95% · 1 day', value: inr(M.var95), sub: 'Loss exceeded 1 day in 20' },
    { label: 'VaR 99% · 1 day', value: inr(M.var99), sub: 'Loss exceeded 1 day in 100' },
    { label: 'CVaR 95% · 1 day', value: inr(M.cvar95), sub: 'Average loss on the worst 5% of days' },
    { label: 'Historical VaR 95%', value: M.real ? inr(M.real.hvar95) : '—', sub: 'From real past daily moves' },
    { label: 'Beta', value: M.beta.toFixed(2), sub: 'Sensitivity to the Nifty 50' },
    { label: 'Tracking error', value: upct(M.te * 100), sub: 'How far you drift from the index' },
    { label: 'Sharpe · Sortino', value: M.real ? `${M.real.sharpe.toFixed(2)} · ${M.real.sortino.toFixed(2)}` : '—', sub: 'Return per unit of risk (1Y)' },
  ];
  const maxRc = Math.max(...M.rows.map((r) => Math.max(r.rc * 100, r.weight)));
  const sectors = sectorWeights(M);
  const syms = M.rows.map((r) => r.symbol);

  return (
    <div className="col" style={{ gap: 14 }}>
      {!M.hasHist && <div className="banner" style={{ background: 'rgba(242,169,59,.1)', color: '#F5BD62' }}>No price history yet, so these numbers use assumed volatility (28%) and beta (1.0). Connect Upstox, or Zerodha's paid Connect plan, for real figures.</div>}
      <div className="grid4" style={{ gap: 10 }}>{tiles.map((t) => <Tile key={t.label} {...t} />)}</div>
      <div className="row">
        <Panel title="1-day P&L distribution · Value at Risk" right={<span className="mut small">Parametric, normal</span>} style={{ flex: '999 1 560px' }}>
          <svg viewBox="0 0 720 200" preserveAspectRatio="none" style={{ width: '100%', height: 200, display: 'block' }} role="img" aria-label="Bell curve of one-day profit and loss with the worst 5 percent shaded">
            <polygon points={`0,200 ${tail.join(' ')} ${vx.toFixed(1)},200`} fill="#F06A6A" fillOpacity="0.45" />
            <polyline points={bell.join(' ')} fill="none" stroke="#4FB3D9" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <line x1={vx} y1="10" x2={vx} y2="200" stroke="#F06A6A" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            <line x1="360" y1="10" x2="360" y2="200" stroke="#2E3A48" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="num mut tiny" style={{ display: 'flex', justifyContent: 'space-between' }}><span>−{inr(X)}</span><span>₹0</span><span>+{inr(X)}</span></div>
          <p className="para">On 19 days out of 20, a one-day loss should stay under <strong className="num" style={{ color: '#FF8A8A' }}>{inr(M.var95)}</strong>. On the worst 5% of days the average loss is about <strong className="num" style={{ color: '#FF8A8A' }}>{inr(M.cvar95)}</strong>.</p>
        </Panel>
        <Panel title="Risk contribution" right={<span className="mut small">Weight vs share of risk</span>} style={{ flex: '1 1 380px' }} bodyStyle={{ gap: 10 }}>
          {M.rows.slice().sort((a, b) => b.rc - a.rc).map((r) => (
            <div key={r.symbol} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr) 54px', gap: 10, alignItems: 'center', fontSize: 12 }}>
              <span className="num" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.symbol}</span>
              <div className="col" style={{ gap: 3 }}><HBar p={(r.weight / maxRc) * 100} color="#3A4859" /><HBar p={((r.rc * 100) / maxRc) * 100} color="#F2A93B" /></div>
              <span className="num" style={{ textAlign: 'right', color: r.rc * 100 > r.weight * 1.3 ? '#F5BD62' : undefined }}>{upct(r.rc * 100)}</span>
            </div>
          ))}
          <div className="mut tiny" style={{ display: 'flex', gap: 16 }}>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 12, height: 6, background: '#3A4859' }} />Weight</span>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 12, height: 6, background: '#F2A93B' }} />Risk share</span>
          </div>
        </Panel>
      </div>
      <div className="row">
        <Panel title="Correlation matrix" right={<span className="mut small">Brighter = moves together more</span>} style={{ flex: '999 1 560px' }} bodyStyle={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `96px repeat(${syms.length}, minmax(52px,1fr))`, gap: 3, minWidth: 96 + syms.length * 56 }}>
            <div />
            {syms.map((s) => <div key={s} className="num mut" style={{ fontSize: 10, textAlign: 'center', padding: '6px 0', overflow: 'hidden' }}>{s.slice(0, 7)}</div>)}
            {M.corrM.map((row, i) => [
              <div key={'h' + i} className="num" style={{ fontSize: 11, fontWeight: 600, padding: '10px 4px', color: '#C9D4DE' }}>{syms[i]}</div>,
              ...row.map((c, j) => <div key={i + '-' + j} className="num" style={{ fontSize: 12, textAlign: 'center', padding: '10px 0', borderRadius: 3, color: c > 0.6 ? '#06090D' : '#E6EDF3', background: `rgba(79,179,217,${Math.max(0.05, 0.08 + c * 0.85).toFixed(2)})` }}>{num(c)}</div>),
            ])}
          </div>
        </Panel>
        <Panel title="Sector exposure" right={<span className="mut small">vs a 1/n spread</span>} style={{ flex: '1 1 380px' }} bodyStyle={{ gap: 10 }}>
          {sectors.map((s) => {
            const tilt = s.w - 100 / sectors.length;
            return (
              <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr) 50px', gap: 10, alignItems: 'center', fontSize: 12 }}>
                <span>{s.name}</span><DivBar v={tilt} max={40} pos="#4FB3D9" neg="#F2A93B" /><span className="num" style={{ textAlign: 'right' }}>{upct(s.w)}</span>
              </div>
            );
          })}
          <p className="note">Bars show over- or under-weight versus spreading money evenly across your sectors.</p>
        </Panel>
      </div>
    </div>
  );
}
