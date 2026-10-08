import { useState } from 'react';
import { Panel, Tile, Range, Legend, Empty } from '../ui.jsx';
import { inr, sInr, upct, col } from '../lib/format.js';
import { bs } from '../lib/stats.js';

const STRATS = [
  { name: 'Long call', view: 'Bullish', legs: [{ t: 'c', k: 0, q: 1 }] },
  { name: 'Long put', view: 'Bearish', legs: [{ t: 'p', k: 0, q: 1 }] },
  { name: 'Protective put', view: 'Own + insure', legs: [{ t: 's', k: 0, q: 1 }, { t: 'p', k: -3, q: 1 }] },
  { name: 'Covered call', view: 'Mildly bullish', legs: [{ t: 's', k: 0, q: 1 }, { t: 'c', k: 3, q: -1 }] },
  { name: 'Bull call spread', view: 'Bullish, capped', legs: [{ t: 'c', k: 0, q: 1 }, { t: 'c', k: 4, q: -1 }] },
  { name: 'Long straddle', view: 'Big move either way', legs: [{ t: 'c', k: 0, q: 1 }, { t: 'p', k: 0, q: 1 }] },
  { name: 'Short iron condor', view: 'Range-bound', legs: [{ t: 'p', k: -6, q: 1 }, { t: 'p', k: -3, q: -1 }, { t: 'c', k: 3, q: -1 }, { t: 'c', k: 6, q: 1 }] },
];
const r = 0.065;

export default function Deriv({ M, breadth }) {
  const [si, setSi] = useState(0);
  const [ivP, setIv] = useState(14);
  const [dte, setDte] = useState(30);
  const [hp, setHp] = useState(50);
  const [lot, setLot] = useState(75);
  const [putPct, setPutPct] = useState(95);
  const S0 = Math.round(breadth && breadth.index ? breadth.index.ltp : 24860);
  const iv = ivP / 100, T = dte / 365;
  const legs = STRATS[si].legs.map((l) => { const K = l.t === 's' ? S0 : Math.round((S0 * (1 + l.k / 100)) / 50) * 50; return { ...l, K, prem: bs(S0, K, T, iv, r, l.t) }; });
  const val = (S, Tt, v) => legs.reduce((a, l) => a + l.q * (bs(S, l.K, Tt, v, r, l.t) - l.prem), 0);
  const lo = S0 * 0.88, hi = S0 * 1.12, xs = [], ex = [], nw = [];
  for (let i = 0; i <= 120; i++) { const x = lo + ((hi - lo) * i) / 120; xs.push(x); ex.push(val(x, 0, iv)); nw.push(val(x, T, iv)); }
  let ymin = Math.min(...ex, ...nw, 0), ymax = Math.max(...ex, ...nw, 0);
  const pad = (ymax - ymin) * 0.08 || 10; ymin -= pad; ymax += pad;
  const Y = (v) => (250 - ((v - ymin) / (ymax - ymin)) * 240).toFixed(1);
  const X = (k) => ((k / 120) * 720).toFixed(1);
  const zy = Y(0);
  const line = (a) => a.map((v, k) => X(k) + ',' + Y(v)).join(' ');
  const maxP = Math.max(...ex), maxL = Math.min(...ex), iP = ex.indexOf(maxP), iL = ex.indexOf(maxL);
  const maxPText = iP === 120 && ex[120] > ex[119] + 0.01 ? 'Unlimited' : iP === 0 && ex[0] > ex[1] + 0.01 ? 'Large on a crash' : maxP.toFixed(0) + ' pts';
  const maxLText = iL === 120 && ex[120] < ex[119] - 0.01 ? 'Unlimited' : iL === 0 && ex[0] < ex[1] - 0.01 ? 'Large on a crash' : Math.abs(maxL).toFixed(0) + ' pts';
  const bes = [];
  for (let j = 1; j <= 120; j++) if ((ex[j - 1] < 0) !== (ex[j] < 0)) { const f = ex[j - 1] / (ex[j - 1] - ex[j]); bes.push(Math.round(xs[j - 1] + (xs[j] - xs[j - 1]) * f).toLocaleString('en-IN')); }
  const netPrem = legs.reduce((a, l) => a + (l.t === 's' ? 0 : l.q * l.prem), 0);
  const h = S0 * 0.002;
  const greeks = [
    ['Delta', ((val(S0 + h, T, iv) - val(S0 - h, T, iv)) / (2 * h)).toFixed(2)],
    ['Gamma', (((val(S0 + h, T, iv) - 2 * val(S0, T, iv) + val(S0 - h, T, iv)) / (h * h)) * 1000).toFixed(2) + 'm'],
    ['Theta', (T > 1 / 365 ? val(S0, T - 1 / 365, iv) - val(S0, T, iv) : 0).toFixed(1)],
    ['Vega', (val(S0, T, iv + 0.01) - val(S0, T, iv)).toFixed(1)],
  ];

  let hedge = null;
  if (!M.empty) {
    const notional = M.total * M.beta * (hp / 100), units = notional / S0, lots = units / lot;
    const Kp = (S0 * putPct) / 100, putCost = bs(S0, Kp, 30 / 365, iv, r, 'p') * units;
    const outcome = (label, move) => {
      const port = M.total * M.beta * move, fut = port - notional * move, put = port + units * Math.max(Kp - S0 * (1 + move), 0) - putCost;
      return { label, port, fut, put };
    };
    hedge = { notional, units, lots, Kp, putCost, rows: [outcome('Nifty −20%', -0.2), outcome('Nifty −5%', -0.05), outcome('Nifty +10%', 0.1)] };
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <Panel title="Options strategy lab · Nifty 50" right={<span className="num mut small">Spot {S0.toLocaleString('en-IN')} · Black-Scholes model</span>}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STRATS.map((s, k) => (
            <button key={s.name} type="button" onClick={() => setSi(k)} aria-pressed={si === k} style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minHeight: 44, padding: '6px 12px', borderRadius: 6, border: `1px solid ${si === k ? '#4FB3D9' : '#2E3A48'}`, background: si === k ? 'rgba(79,179,217,.14)' : '#151D26', color: si === k ? '#BEE6F5' : '#C9D4DE', boxShadow: si === k ? '0 0 14px rgba(79,179,217,.35)' : 'none' }}>
              <span>{s.name}</span><span style={{ fontSize: 10, opacity: 0.75 }}>{s.view}</span>
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 18 }}>
          <div className="col" style={{ flex: '999 1 520px', gap: 6 }}>
            <svg viewBox="0 0 720 260" preserveAspectRatio="none" style={{ width: '100%', height: 260, display: 'block' }} role="img" aria-label="Payoff diagram of the selected option strategy">
              <polygon points={`0,${zy} ${ex.map((v, k) => X(k) + ',' + Y(Math.max(v, 0))).join(' ')} 720,${zy}`} fill="#3DDC97" fillOpacity="0.18" />
              <polygon points={`0,${zy} ${ex.map((v, k) => X(k) + ',' + Y(Math.min(v, 0))).join(' ')} 720,${zy}`} fill="#FF6363" fillOpacity="0.18" />
              <line x1="0" y1={zy} x2="720" y2={zy} stroke="#3A4859" vectorEffect="non-scaling-stroke" />
              <line x1={X(60)} y1="0" x2={X(60)} y2="260" stroke="#F2A93B" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
              <polyline points={line(nw)} fill="none" stroke="#A68BF0" strokeWidth="1.6" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
              <polyline points={line(ex)} fill="none" stroke="#4FB3D9" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="num mut tiny" style={{ display: 'flex', justifyContent: 'space-between' }}>{[0, 30, 60, 90, 120].map((k) => <span key={k}>{Math.round(xs[k]).toLocaleString('en-IN')}</span>)}</div>
            <Legend items={[{ label: 'At expiry', color: '#4FB3D9' }, { label: 'Today', color: '#A68BF0', dashed: true }, { label: 'Spot', color: '#F2A93B', dashed: true }]} />
          </div>
          <div className="col" style={{ flex: '1 1 280px', gap: 10 }}>
            <Range id="iv" label="Implied volatility" value={ivP} display={ivP + '%'} min={8} max={40} step={1} onChange={setIv} />
            <Range id="dte" label="Days to expiry" value={dte} display={dte} min={1} max={60} step={1} onChange={setDte} />
            <div className="grid2">
              <Tile label={netPrem >= 0 ? 'Net debit' : 'Net credit'} value={Math.abs(netPrem).toFixed(1) + ' pts'} />
              <Tile label="Breakeven" value={bes.length ? bes.join(' / ') : '—'} valueStyle={{ fontSize: 13 }} />
              <Tile label="Max profit" value={maxPText} valueStyle={{ color: '#5FE3A8' }} />
              <Tile label="Max loss" value={maxLText} valueStyle={{ color: '#FF8A8A' }} />
            </div>
            <div className="grid4">{greeks.map(([n, v]) => <div key={n} className="tile" style={{ padding: 8, alignItems: 'center' }}><span className="lbl">{n}</span><span className="num" style={{ fontSize: 13, fontWeight: 600 }}>{v}</span></div>)}</div>
            <div className="col" style={{ gap: 4 }}>
              {legs.map((l, k) => <span key={k} className="num small" style={{ color: l.q > 0 ? '#8FD3EE' : '#F5BD62' }}>{l.q > 0 ? 'BUY' : 'SELL'} 1 · {l.t === 's' ? `NIFTY (futures/ETF) @ ${l.K.toLocaleString('en-IN')}` : `${l.t === 'c' ? 'CALL' : 'PUT'} ${l.K.toLocaleString('en-IN')} @ ${l.prem.toFixed(1)}`}</span>)}
            </div>
          </div>
        </div>
        <p className="note">Values in index points per unit — multiply by the exchange lot size for rupees. Premiums are model prices from the sliders, not live option quotes.</p>
      </Panel>

      {hedge ? (
        <Panel title="Portfolio hedge desk" right={<span className="num mut small">NAV {inr(M.total)} · β {M.beta.toFixed(2)}</span>} bodyStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
          <div className="col" style={{ flex: '1 1 300px', gap: 10 }}>
            <Range id="hp" label="Hedge ratio" value={hp} display={hp + '%'} min={0} max={100} step={10} onChange={setHp} />
            <Range id="lot" label="Nifty lot size (check NSE)" value={lot} display={lot} min={25} max={100} step={5} onChange={setLot} />
            <Range id="pp" label="Put strike (% of spot)" value={putPct} display={putPct + '%'} min={85} max={100} step={1} onChange={setPutPct} />
            <div className="grid2">
              <Tile label="Hedge notional" value={inr(hedge.notional)} />
              <Tile label="Futures lots" value={hedge.lots.toFixed(2)} />
              <Tile label="Put strike" value={Math.round(hedge.Kp).toLocaleString('en-IN')} />
              <Tile label="Put cost · 30D" value={`${inr(hedge.putCost)} (${upct((hedge.putCost / M.total) * 100, 2)})`} valueStyle={{ color: '#F5BD62', fontSize: 14 }} />
            </div>
          </div>
          <div className="col" style={{ flex: '2 1 460px', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px,1fr) repeat(3,minmax(0,1fr))', gap: 10, fontSize: 13, alignItems: 'center' }}>
              <span className="lbl">Scenario</span><span className="lbl">Unhedged</span><span className="lbl">Futures hedge</span><span className="lbl">Put hedge</span>
              {hedge.rows.map((rw) => [
                <span key={rw.label}>{rw.label}</span>,
                <span key={rw.label + 1} className="num" style={{ color: col(rw.port) }}>{sInr(rw.port)}</span>,
                <span key={rw.label + 2} className="num" style={{ color: col(rw.fut) }}>{sInr(rw.fut)}</span>,
                <span key={rw.label + 3} className="num" style={{ color: col(rw.put) }}>{sInr(rw.put)}</span>,
              ])}
            </div>
            <p className="box para">Hedging {hp}% of your beta-adjusted exposure means shorting about {inr(hedge.notional)} of Nifty. One futures lot is roughly {inr(lot * S0)}, so this hedge is {hedge.lots.toFixed(2)} lots.{hedge.lots < 1 ? ' That is smaller than one lot — real hedges need a bigger account, but the maths is what a fund desk runs.' : ''} Futures remove both downside and upside; puts keep the upside but cost a premium.</p>
          </div>
        </Panel>
      ) : <Empty>Add holdings to use the hedge desk.</Empty>}
    </div>
  );
}
