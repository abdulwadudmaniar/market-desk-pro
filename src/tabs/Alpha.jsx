import { useMemo, useState } from 'react';
import { Panel, Tile, Range, DivBar, Spark, Pill, Empty } from '../ui.jsx';
import { pct, upct, col, inr, signed, GREEN, RED } from '../lib/format.js';
import { scanSignals, pairStats } from '../lib/model.js';

const KIND = { 'Trend up': 'Safe', Oversold: 'Safe', Neutral: 'Info', Overbought: 'Watch', 'Trend down': 'Risky' };

export default function Alpha({ M }) {
  const scan = useMemo(() => (M.empty ? [] : scanSignals(M.rows)), [M]);
  const withHist = M.empty ? [] : M.rows.filter((r) => r.prices);
  const [a, setA] = useState(0);
  const [b, setB] = useState(1);
  const [W, setW] = useState(50);
  const [R, setR] = useState(1.8);
  const A = withHist[Math.min(a, withHist.length - 1)], B = withHist[Math.min(b, withHist.length - 1)];
  const pair = useMemo(() => (A && B && A !== B ? pairStats(A.prices, B.prices) : null), [A, B]);

  const wr = W / 100, k = wr - (1 - wr) / R, edge = wr * R - (1 - wr);
  let zPts = '', zNow = 0, sig = '';
  const zy = (v) => (110 - (Math.max(-3.5, Math.min(3.5, v)) / 3.5) * 100).toFixed(1);
  if (pair && pair.z.length > 1) {
    zPts = pair.z.map((v, i) => ((i / (pair.z.length - 1)) * 720).toFixed(1) + ',' + zy(v)).join(' ');
    zNow = pair.z[pair.z.length - 1];
    const zt = signed(zNow);
    sig = zNow > 2 ? `Spread is stretched HIGH (z ${zt}). The textbook stat-arb setup would be short ${A.symbol} / long ${B.symbol} in the hedge ratio, exiting as z returns toward 0 — only if the two genuinely move together.`
      : zNow < -2 ? `Spread is stretched LOW (z ${zt}). The textbook setup would be long ${A.symbol} / short ${B.symbol}, exiting as z returns toward 0 — only if the two genuinely move together.`
      : Math.abs(zNow) > 1 ? `Spread is drifting from normal (z ${zt}) — on watch, no setup yet.` : `Spread is near its average (z ${zt}) — no edge right now.`;
    if (pair.corr < 0.5) sig += ` Note: correlation is only ${pair.corr.toFixed(2)}, so these two may not be a real pair.`;
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <Panel title="Signal scanner · your holdings" right={<span className="mut small">Ranked by composite score · daily closes</span>} bodyStyle={{ padding: 0 }}>
        {scan.length ? (
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Symbol</th><th>Price</th><th>RSI 14</th><th>Z-score 20D</th><th>Momentum 3M</th><th>MACD</th><th>SMA 20/50</th><th>60D</th><th>Composite</th><th>Signal</th></tr></thead>
              <tbody>
                {scan.map((s) => (
                  <tr key={s.sym}>
                    <td><strong className="num">{s.sym}</strong></td>
                    <td className="num">{inr(s.px)}</td>
                    <td className="num" style={{ color: s.rsi > 70 ? RED : s.rsi < 30 ? GREEN : undefined }}>{s.rsi.toFixed(0)}</td>
                    <td className="num">{signed(s.z)}</td>
                    <td className="num" style={{ color: col(s.mom) }}>{pct(s.mom, 1)}</td>
                    <td className="num" style={{ color: s.bull ? GREEN : RED }}>{s.bull ? 'Bullish' : 'Bearish'}</td>
                    <td className="num">{s.up ? 'Up' : 'Down'}</td>
                    <td><Spark data={s.spark} /></td>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}><div style={{ width: 90 }}><DivBar v={s.score} max={4} /></div><span className="num">{signed(s.score, 1)}</span></div></td>
                    <td><Pill kind={KIND[s.label]}>{s.label}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="pb"><p className="para">Signals need at least 60 days of price history. Connect Upstox (free history) or Zerodha's paid Connect plan.</p></div>}
      </Panel>

      <div className="row">
        <Panel title="Pair trading · statistical arbitrage" style={{ flex: '999 1 620px' }}>
          {withHist.length >= 2 ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <label className="sr" htmlFor="pa">First stock</label>
                <select id="pa" className="field" value={a} onChange={(e) => setA(Number(e.target.value))}>{withHist.map((r, i) => <option key={r.symbol} value={i}>{r.symbol}</option>)}</select>
                <span className="mut">vs</span>
                <label className="sr" htmlFor="pb2">Second stock</label>
                <select id="pb2" className="field" value={b} onChange={(e) => setB(Number(e.target.value))}>{withHist.map((r, i) => <option key={r.symbol} value={i}>{r.symbol}</option>)}</select>
              </div>
              {pair ? (
                <>
                  <svg viewBox="0 0 720 220" preserveAspectRatio="none" style={{ width: '100%', height: 220, display: 'block' }} role="img" aria-label="Z-score of the pair spread over time">
                    <rect x="0" y="0" width="720" height={zy(2)} fill="#FF6363" fillOpacity="0.06" />
                    <rect x="0" y={zy(-2)} width="720" height={220 - zy(-2)} fill="#3DDC97" fillOpacity="0.06" />
                    <line x1="0" y1={zy(2)} x2="720" y2={zy(2)} stroke="#FF6363" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                    <line x1="0" y1={zy(-2)} x2="720" y2={zy(-2)} stroke="#3DDC97" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                    <line x1="0" y1={zy(0)} x2="720" y2={zy(0)} stroke="#3A4859" vectorEffect="non-scaling-stroke" />
                    <polyline points={zPts} fill="none" stroke="#4FB3D9" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div className="num mut tiny" style={{ display: 'flex', justifyContent: 'space-between' }}><span>{pair.z.length} days ago</span><span>±2σ bands</span><span>Today</span></div>
                  <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))' }}>
                    <Tile label="Z-score now" value={signed(zNow)} valueStyle={{ color: Math.abs(zNow) > 2 ? '#F5BD62' : undefined }} />
                    <Tile label="Hedge ratio β" value={pair.beta.toFixed(2)} />
                    <Tile label="Half-life" value={isFinite(pair.hl) ? pair.hl.toFixed(1) + ' days' : 'No mean reversion'} />
                    <Tile label="Return correlation" value={pair.corr.toFixed(2)} />
                  </div>
                  <p className="box para"><span style={{ color: '#F2A93B', fontWeight: 600 }}>{A.symbol} / {B.symbol} ›</span> {sig}</p>
                </>
              ) : <p className="para">Pick two different stocks.</p>}
            </>
          ) : <p className="para">Needs price history for at least two holdings.</p>}
        </Panel>
        <Panel title="Kelly position sizing" style={{ flex: '1 1 360px' }}>
          <Range id="wr" label="Win rate of the strategy" value={W} display={W + '%'} min={30} max={70} step={1} onChange={setW} />
          <Range id="po" label="Average win ÷ average loss" value={R} display={R.toFixed(1) + '×'} min={0.5} max={3} step={0.1} onChange={setR} />
          <div className="grid3">
            <Tile label="Full Kelly" value={k > 0 ? upct(k * 100) : 'No edge'} />
            <Tile label="Half Kelly" value={k > 0 ? upct(k * 50) : '0%'} valueStyle={{ color: '#F5BD62' }} />
            <Tile label="Edge / trade" value={signed(edge) + 'R'} valueStyle={{ color: col(edge) }} />
          </div>
          <p className="note">{k > 0 ? `Kelly says risk up to ${upct(k * 100)} of capital per trade. Most professionals use half Kelly or less, because the win rate is only an estimate and full Kelly swings wildly.` : 'With these numbers the strategy loses money on average — Kelly says don’t trade it.'}</p>
        </Panel>
      </div>
    </div>
  );
}
