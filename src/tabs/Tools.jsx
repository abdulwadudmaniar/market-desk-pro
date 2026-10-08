import { useState } from 'react';
import { Panel, Range } from '../ui.jsx';
import { inr, upct } from '../lib/format.js';

export default function Tools() {
  const [cap, setCap] = useState(200000);
  const [rp, setRp] = useState(1);
  const [entry, setEntry] = useState(720);
  const [stopPct, setStopPct] = useState(6);
  const [amt, setAmt] = useState(5000);
  const [yrs, setYrs] = useState(10);
  const [ret, setRet] = useState(12);

  const riskAmt = (cap * rp) / 100, stopPx = entry * (1 - stopPct / 100), perSh = entry - stopPx;
  const shares = Math.floor(riskAmt / perSh), pos = shares * entry;
  const i = ret / 100 / 12, n = yrs * 12;
  const fvAt = (m) => amt * ((Math.pow(1 + i, m) - 1) / i) * (1 + i);
  const fv = fvAt(n), inv = amt * n;
  const bars = Array.from({ length: yrs }, (_, k) => { const v = fvAt((k + 1) * 12), iv = amt * (k + 1) * 12; return { k, v, iv }; });

  return (
    <div className="row">
      <Panel title="Position sizing calculator" style={{ flex: '1 1 420px' }}>
        <Range id="cap" label="Trading capital" value={cap} display={inr(cap)} min={10000} max={1000000} step={10000} onChange={setCap} />
        <Range id="rp" label="Risk per trade" value={rp} display={`${upct(rp)} = ${inr(riskAmt)}`} min={0.5} max={5} step={0.5} onChange={setRp} />
        <Range id="en" label="Entry price" value={entry} display={inr(entry)} min={50} max={3000} step={10} onChange={setEntry} />
        <Range id="sl" label="Stop-loss below entry" value={stopPct} display={`${stopPct}% → ${inr(stopPx)}`} min={1} max={20} step={1} onChange={setStopPct} />
        <div className="grid3">
          <div className="box"><p className="lbl">Buy</p><span className="num" style={{ fontSize: 22, fontWeight: 600, color: '#F2A93B' }}>{shares}</span><span className="mut tiny"> shares</span></div>
          <div className="box"><p className="lbl">Position</p><span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{inr(pos)} ({upct((pos / cap) * 100, 0)})</span></div>
          <div className="box"><p className="lbl">Max loss</p><span className="num" style={{ fontSize: 15, fontWeight: 600, color: '#FF8A8A' }}>{inr(shares * perSh)}</span></div>
        </div>
        <p className="note">If the stop-loss hits, you lose only the amount you chose to risk — the core rule professionals use to survive bad trades.</p>
      </Panel>
      <Panel title="SIP growth calculator" style={{ flex: '1 1 420px' }}>
        <Range id="sa" label="Monthly SIP" value={amt} display={inr(amt)} min={500} max={50000} step={500} onChange={setAmt} />
        <Range id="sy" label="Years" value={yrs} display={yrs} min={1} max={30} step={1} onChange={setYrs} />
        <Range id="sr" label="Expected yearly return" value={ret} display={upct(ret)} min={4} max={18} step={0.5} onChange={setRet} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120, paddingTop: 8 }} role="img" aria-label="SIP growth by year">
          {bars.map((b) => (
            <div key={b.k} title={`Year ${b.k + 1}: ${inr(b.v)}`} style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ background: '#F2A93B', borderRadius: '2px 2px 0 0', height: (((b.v - b.iv) / fv) * 100).toFixed(1) + '%' }} />
              <div style={{ background: '#3A4859', height: ((b.iv / fv) * 100).toFixed(1) + '%' }} />
            </div>
          ))}
        </div>
        <div className="grid3">
          <div><p className="lbl">Invested</p><span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{inr(inv)}</span></div>
          <div><p className="lbl">Gains</p><span className="num" style={{ fontSize: 15, fontWeight: 600, color: '#5FE3A8' }}>{inr(fv - inv)}</span></div>
          <div><p className="lbl">Final value</p><span className="num" style={{ fontSize: 15, fontWeight: 600, color: '#F2A93B' }}>{inr(fv)}</span></div>
        </div>
      </Panel>
    </div>
  );
}
