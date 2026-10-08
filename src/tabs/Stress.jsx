import { useState } from 'react';
import { Panel, Seg, DivBar, Range, Empty } from '../ui.jsx';
import { inr, sInr, pct, upct, col, pts } from '../lib/format.js';
import { ncdf } from '../lib/stats.js';

// Approximate sector moves. "idx" is the Nifty move used for stocks without a sector override (scaled by beta).
const SCEN = [
  { name: 'COVID crash 2020', kind: 'Historical · approx. Feb–Mar 2020', idx: -38, desc: 'Markets fell sharply in weeks as lockdowns began. Banks and autos were hit hardest; consumer staples held up best.', s: { Energy: -35, Banking: -45, IT: -30, Auto: -45, FMCG: -20, 'Index ETF': -38, 'PSU Finance': -40, Finance: -45, Pharma: -15, Metal: -45, Infra: -42 } },
  { name: 'Global financial crisis 2008', kind: 'Historical · approx. 2008', idx: -60, desc: 'A worldwide credit crisis. Indian stocks lost more than half their value at the worst point.', s: { Energy: -60, Banking: -65, IT: -55, Auto: -70, FMCG: -30, 'Index ETF': -60, 'PSU Finance': -65, Finance: -65, Pharma: -35, Metal: -75, Infra: -70, Realty: -85 } },
  { name: 'RBI hikes rates +100 bp', kind: 'Hypothetical', idx: -5, desc: 'Higher borrowing costs hurt lenders, rate-sensitive autos, realty and PSU finance most.', s: { Banking: -6, Auto: -8, 'PSU Finance': -12, Finance: -9, Realty: -12, IT: -2, FMCG: -3 } },
  { name: 'Crude oil +30%', kind: 'Hypothetical', idx: -4, desc: 'India imports most of its oil. Costs rise for autos, paints and consumer companies; inflation worries spread.', s: { Energy: -3, Auto: -9, FMCG: -5, Consumer: -7, IT: 1 } },
  { name: 'Rupee falls 5% vs USD', kind: 'Hypothetical', idx: -1, desc: 'Exporters like IT and pharma gain because they earn in dollars; importers lose.', s: { IT: 7, Pharma: 4, Energy: -2, Auto: -3 } },
  { name: 'Election-result shock', kind: 'Hypothetical', idx: -6, desc: 'A surprise result can hit government-linked (PSU) stocks hardest in a single day.', s: { 'PSU Finance': -15, Banking: -8, Infra: -10, Power: -10, Energy: -7, IT: -2, FMCG: -2 } },
];

export default function Stress({ M }) {
  const [si, setSi] = useState(0);
  const [shock, setShock] = useState(-10);
  const [H, setH] = useState(5);
  if (M.empty) return <Empty>No holdings yet.</Empty>;
  const sc = SCEN[si];
  const rows = M.rows.map((r) => {
    const move = sc.s[r.sector] != null ? sc.s[r.sector] : sc.idx * r.beta;
    return { sym: r.symbol, imp: (r.value * move) / 100, move, how: sc.s[r.sector] != null ? 'sector' : 'beta' };
  }).sort((a, b) => a.imp - b.imp);
  const tot = rows.reduce((s, r) => s + r.imp, 0);
  const sMax = Math.max(...rows.map((r) => Math.abs(r.imp)), 1);
  const shockImp = (M.beta * shock * M.total) / 100;

  const steps = H * 12, zs = [-1.645, -0.674, 0, 0.674, 1.645], L = zs.map(() => []), base = [];
  const drift = M.mu - (M.sigma * M.sigma) / 2;
  for (let s = 0; s <= steps; s++) { const t = s / 12; zs.forEach((z, k) => L[k].push(M.total * Math.exp(drift * t + z * M.sigma * Math.sqrt(t)))); base.push(M.total); }
  const fmin = Math.min(...L[0]), fmax = Math.max(...L[4]);
  const fp = (a) => pts(a, 720, 220, 10, fmin, fmax);
  const rev = (s) => s.split(' ').reverse().join(' ');
  const probLoss = ncdf(-(drift * H) / (M.sigma * Math.sqrt(H)));

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row">
        <Panel title="Scenarios" style={{ flex: '1 1 300px' }} bodyStyle={{ gap: 6 }}>
          {SCEN.map((s, i) => (
            <button key={s.name} type="button" onClick={() => setSi(i)} aria-pressed={si === i} style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px', minHeight: 44, borderRadius: 6, border: `1px solid ${si === i ? '#F2A93B' : '#222C38'}`, background: si === i ? 'rgba(242,169,59,.12)' : '#151D26', color: si === i ? '#F5BD62' : '#E6EDF3' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span><span style={{ fontSize: 11, opacity: 0.8 }}>{s.kind}</span>
            </button>
          ))}
        </Panel>
        <Panel title={'Impact · ' + sc.name} right={<span className="mut small">{sc.kind}</span>} style={{ flex: '999 1 620px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end' }}>
            <div className="col" style={{ gap: 4 }}><p className="lbl">Portfolio hit</p><span className="num" style={{ fontSize: 26, fontWeight: 600, color: col(tot) }}>{sInr(tot)}</span></div>
            <div className="col" style={{ gap: 4 }}><p className="lbl">As %</p><span className="num" style={{ fontSize: 22, fontWeight: 600, color: col(tot) }}>{pct((tot / M.total) * 100, 1)}</span></div>
            <div className="col" style={{ gap: 4 }}><p className="lbl">Value after</p><span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{inr(M.total + tot)}</span></div>
          </div>
          <p className="para">{sc.desc}</p>
          <div className="col" style={{ gap: 8 }}>
            {rows.map((r) => (
              <div key={r.sym} style={{ display: 'grid', gridTemplateColumns: '100px minmax(0,1fr) 110px', gap: 10, alignItems: 'center', fontSize: 12 }}>
                <span className="num" style={{ fontWeight: 600 }}>{r.sym}</span><DivBar v={r.imp} max={sMax} height={14} />
                <span className="num" style={{ textAlign: 'right', color: col(r.imp) }} title={r.how === 'beta' ? 'Estimated from beta × index move' : 'Sector move'}>{sInr(r.imp)}</span>
              </div>
            ))}
          </div>
          <p className="note">Approximate sector moves; stocks outside the listed sectors use beta × the index move. A teaching tool, not a forecast.</p>
        </Panel>
      </div>
      <div className="row">
        <Panel title="Custom shock · beta model" style={{ flex: '1 1 380px' }}>
          <Range id="shock" label="If the Nifty 50 moves" value={shock} display={pct(shock, 0)} min={-30} max={30} step={1} onChange={setShock} />
          <div className="box col" style={{ gap: 6 }}>
            <p className="lbl">Expected portfolio move</p>
            <span className="num" style={{ fontSize: 24, fontWeight: 600, color: col(shockImp) }}>{sInr(shockImp)} ({pct(M.beta * shock, 1)})</span>
            <span className="mut small">Portfolio beta {M.beta.toFixed(2)} — moves about {M.beta.toFixed(2)}× the index.</span>
          </div>
        </Panel>
        <Panel title="Monte Carlo projection" right={<Seg label="Horizon" options={[{ value: 1, label: '1Y' }, { value: 3, label: '3Y' }, { value: 5, label: '5Y' }]} value={H} onChange={setH} />} style={{ flex: '999 1 620px' }}>
          <svg viewBox="0 0 720 220" preserveAspectRatio="none" style={{ width: '100%', height: 220, display: 'block' }} role="img" aria-label="Fan chart of projected portfolio value">
            <polygon points={fp(L[4]) + ' ' + rev(fp(L[0]))} fill="#4FB3D9" fillOpacity="0.12" />
            <polygon points={fp(L[3]) + ' ' + rev(fp(L[1]))} fill="#4FB3D9" fillOpacity="0.22" />
            <polyline points={fp(L[2])} fill="none" stroke="#4FB3D9" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <polyline points={fp(base)} fill="none" stroke="#8D9AA8" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))' }}>
            <div><p className="lbl">Bad case (5%)</p><span className="num" style={{ fontSize: 16, fontWeight: 600, color: '#FF8A8A' }}>{inr(L[0][steps])}</span></div>
            <div><p className="lbl">Middle</p><span className="num" style={{ fontSize: 16, fontWeight: 600 }}>{inr(L[2][steps])}</span></div>
            <div><p className="lbl">Good case (95%)</p><span className="num" style={{ fontSize: 16, fontWeight: 600, color: '#5FE3A8' }}>{inr(L[4][steps])}</span></div>
            <div><p className="lbl">Chance of a loss</p><span className="num" style={{ fontSize: 16, fontWeight: 600 }}>{upct(probLoss * 100, 0)}</span></div>
          </div>
          <p className="note">Uses expected return {upct(M.mu * 100)} and volatility {upct(M.sigma * 100)} a year (half from real history, half from a market-risk assumption). Real markets have fatter tails than this model.</p>
        </Panel>
      </div>
    </div>
  );
}
