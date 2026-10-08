import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, Seg, Tile } from '../ui.jsx';
import { api } from '../lib/data.js';
import { inr, pct, col, upct } from '../lib/format.js';
import { UNIVERSE } from '../../lib/universe.js';

const RANGES = [{ value: '1d', label: '1D' }, { value: '5d', label: '5D' }, { value: '1mo', label: '1M' }, { value: '6mo', label: '6M' }, { value: '1y', label: '1Y' }, { value: '5y', label: '5Y' }];
const W = 1000, PH = 320, VH = 70, RH = 90, GAP = 14, PADL = 8, PADR = 64;

const smaArr = (v, n) => v.map((_, i) => (i + 1 < n ? null : v.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n));
function rsiArr(c, n = 14) {
  const out = c.map(() => null);
  let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    if (i <= n) { if (d > 0) g += d; else l -= d; if (i === n) { g /= n; l /= n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } continue; }
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
const fmtT = (t, range) => {
  const d = new Date(t + 5.5 * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  const mon = d.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' });
  if (range === '1d') return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  if (range === '5d' || range === '1mo') return `${d.getUTCDate()} ${mon} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  return `${d.getUTCDate()} ${mon} ${String(d.getUTCFullYear()).slice(2)}`;
};

export default function Charts({ holdings, watch, chartSym, setChartSym, demo }) {
  const [range, setRange] = useState('1y');
  const [input, setInput] = useState(chartSym);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [ov, setOv] = useState({ s20: true, s50: true, s200: false, bb: false, vol: true, rsi: true });
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  useEffect(() => { setInput(chartSym); }, [chartSym]);
  useEffect(() => {
    let stop = false;
    setBusy(true); setErr('');
    api(`/api/chart?symbol=${encodeURIComponent(chartSym)}&range=${range}`)
      .then((j) => { if (!stop) { setData(j); setHover(null); } })
      .catch((e) => { if (!stop) { setErr(e.message); setData(null); } })
      .finally(() => { if (!stop) setBusy(false); });
    return () => { stop = true; };
  }, [chartSym, range]);

  const quick = useMemo(() => Array.from(new Set(['NIFTY'].concat((demo ? [] : holdings.map((h) => h.symbol)), watch))).slice(0, 18), [holdings, watch, demo]);
  const all = useMemo(() => Array.from(new Set(['NIFTY'].concat(holdings.map((h) => h.symbol), watch, UNIVERSE.map((u) => u.sym)))), [holdings, watch]);

  const view = useMemo(() => {
    if (!data || !data.candles || data.candles.length < 2) return null;
    const cs = data.candles;
    const closes = cs.map((c) => c.c);
    const s20 = smaArr(closes, 20), s50 = smaArr(closes, 50), s200 = smaArr(closes, 200);
    const sd20 = closes.map((_, i) => (s20[i] == null ? null : Math.sqrt(closes.slice(i - 19, i + 1).reduce((a, b) => a + (b - s20[i]) ** 2, 0) / 20)));
    const bbU = s20.map((m, i) => (m == null ? null : m + 2 * sd20[i])), bbL = s20.map((m, i) => (m == null ? null : m - 2 * sd20[i]));
    const rsi = rsiArr(closes);
    const vals = cs.flatMap((c) => [c.h, c.l]).concat(ov.bb ? bbU.concat(bbL).filter((x) => x != null) : []);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.05 || 1; lo -= pad; hi += pad;
    const n = cs.length, iw = (W - PADL - PADR) / n;
    const X = (i) => PADL + iw * (i + 0.5);
    const Y = (v) => (1 - (v - lo) / (hi - lo)) * PH;
    const vMax = Math.max(...cs.map((c) => c.v || 0), 1);
    const line = (arr) => arr.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean).join(' ');
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + (hi - lo) * f);
    const first = cs[0].c, last = cs[n - 1].c;
    return { cs, n, iw, X, Y, lo, hi, vMax, s20: line(s20), s50: line(s50), s200: line(s200), bbU: line(bbU), bbL: line(bbL), rsi, rsiLine: rsi.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${((1 - v / 100) * RH).toFixed(1)}`)).filter(Boolean).join(' '), ticks, chg: (last / first - 1) * 100, last, lastRsi: rsi[n - 1], s20v: s20[n - 1], s50v: s50[n - 1], s200v: s200[n - 1] };
  }, [data, ov.bb]);

  const totalH = PH + (ov.vol ? GAP + VH : 0) + (ov.rsi ? GAP + RH : 0) + 22;
  const onMove = (e) => {
    if (!view || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(view.n - 1, Math.floor((x - PADL) / view.iw)));
    setHover(i);
  };
  const hc = view && hover != null ? view.cs[hover] : null;
  const go = (e) => { e.preventDefault(); const s = input.trim().toUpperCase().replace(/\.NS$/, ''); if (s) setChartSym(s); };
  const toggle = (k) => setOv({ ...ov, [k]: !ov[k] });

  return (
    <div className="col" style={{ gap: 14 }}>
      <Panel title={<>Chart · <span className="num" style={{ color: '#F2A93B' }}>{chartSym}</span>{data && data.name && <span className="mut small" style={{ textTransform: 'none', letterSpacing: 0 }}>{data.name}</span>}</>}
        right={<Seg label="Range" options={RANGES} value={range} onChange={setRange} />}>
        <form onSubmit={go} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <label htmlFor="sym" className="sr">NSE symbol</label>
          <input id="sym" className="field num" list="symlist" style={{ flex: '1 1 200px' }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="NSE symbol, e.g. TCS" />
          <datalist id="symlist">{all.map((s) => <option key={s} value={s} />)}</datalist>
          <button className="btn primary" type="submit">Load</button>
        </form>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {quick.map((s) => <button key={s} type="button" className={'chip' + (s === chartSym ? ' on' : '')} onClick={() => setChartSym(s)}>{s}</button>)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="group" aria-label="Overlays">
          {[['s20', 'SMA 20', '#4FB3D9'], ['s50', 'SMA 50', '#F2A93B'], ['s200', 'SMA 200', '#A68BF0'], ['bb', 'Bollinger', '#8D9AA8'], ['vol', 'Volume', '#3A4859'], ['rsi', 'RSI 14', '#5FD3A3']].map(([k, l, c]) => (
            <button key={k} type="button" className={'seg' + (ov[k] ? ' on' : '')} aria-pressed={ov[k]} onClick={() => toggle(k)}><span style={{ display: 'inline-block', width: 10, height: 3, background: c, marginRight: 6, verticalAlign: 'middle' }} />{l}</button>
          ))}
        </div>

        {err && <p className="para" style={{ color: '#FF8A8A' }}>{err}</p>}
        {busy && !view && <p className="para">Loading chart…</p>}
        {view && (
          <>
            <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
              <Tile label="Last" value={inr(view.last)} />
              <Tile label={`Change · ${RANGES.find((r) => r.value === range).label}`} value={pct(view.chg)} valueStyle={{ color: col(view.chg) }} />
              <Tile label="52-wk high / low" value={data.high52 ? `${inr(data.high52)} / ${inr(data.low52)}` : '—'} valueStyle={{ fontSize: 14 }} />
              <Tile label="RSI 14" value={view.lastRsi != null ? view.lastRsi.toFixed(0) : '—'} sub={view.lastRsi > 70 ? 'Overbought zone' : view.lastRsi < 30 ? 'Oversold zone' : 'Neutral'} />
              <Tile label="vs SMA 50" value={view.s50v ? pct((view.last / view.s50v - 1) * 100, 1) : '—'} valueStyle={{ color: view.s50v ? col(view.last - view.s50v) : undefined }} />
              <Tile label="vs SMA 200" value={view.s200v ? pct((view.last / view.s200v - 1) * 100, 1) : '—'} sub={view.s200v ? (view.last > view.s200v ? 'Long-term uptrend' : 'Below long-term trend') : 'Needs 200 bars'} valueStyle={{ color: view.s200v ? col(view.last - view.s200v) : undefined }} />
            </div>
            <div className="num small" style={{ minHeight: 18, color: '#B7C3CF' }}>
              {hc ? <>{fmtT(hc.t, range)} · O {inr(hc.o)} · H {inr(hc.h)} · L {inr(hc.l)} · C <span style={{ color: col(hc.c - hc.o) }}>{inr(hc.c)}</span> · Vol {(hc.v || 0).toLocaleString('en-IN')}{view.rsi[hover] != null && <> · RSI {view.rsi[hover].toFixed(0)}</>}</> : <span className="mut">Hover or tap the chart to inspect a candle.</span>}
            </div>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${totalH}`} style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'pan-y' }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`Candlestick chart of ${chartSym}`}>
              {view.ticks.map((v, i) => <g key={i}><line x1={PADL} y1={view.Y(v)} x2={W - PADR} y2={view.Y(v)} stroke="#18212B" /><text x={W - PADR + 6} y={view.Y(v) + 4} fill="#8D9AA8" fontSize="12" fontFamily="IBM Plex Mono">{Math.round(v).toLocaleString('en-IN')}</text></g>)}
              {ov.bb && <><polyline points={view.bbU} fill="none" stroke="#8D9AA8" strokeDasharray="3 3" /><polyline points={view.bbL} fill="none" stroke="#8D9AA8" strokeDasharray="3 3" /></>}
              {view.cs.map((c, i) => {
                const up = c.c >= c.o, x = view.X(i), w = Math.max(1, view.iw * 0.62), clr = up ? '#3DDC97' : '#FF6363';
                const y1 = view.Y(Math.max(c.o, c.c)), y2 = view.Y(Math.min(c.o, c.c));
                return <g key={i}><line x1={x} y1={view.Y(c.h)} x2={x} y2={view.Y(c.l)} stroke={clr} strokeWidth="1" /><rect x={x - w / 2} y={y1} width={w} height={Math.max(1, y2 - y1)} fill={up ? 'rgba(61,220,151,.85)' : 'rgba(255,99,99,.85)'} /></g>;
              })}
              {ov.s20 && <polyline points={view.s20} fill="none" stroke="#4FB3D9" strokeWidth="1.6" />}
              {ov.s50 && <polyline points={view.s50} fill="none" stroke="#F2A93B" strokeWidth="1.6" />}
              {ov.s200 && <polyline points={view.s200} fill="none" stroke="#A68BF0" strokeWidth="1.6" />}
              <line x1={PADL} y1={view.Y(view.last)} x2={W - PADR} y2={view.Y(view.last)} stroke="#F2A93B" strokeDasharray="2 4" />
              <rect x={W - PADR + 2} y={view.Y(view.last) - 10} width={PADR - 4} height={20} rx="3" fill="#F2A93B" />
              <text x={W - PADR + 6} y={view.Y(view.last) + 4} fill="#0A0E13" fontSize="12" fontWeight="700" fontFamily="IBM Plex Mono">{Math.round(view.last).toLocaleString('en-IN')}</text>
              {ov.vol && (
                <g transform={`translate(0 ${PH + GAP})`}>
                  {view.cs.map((c, i) => { const h = ((c.v || 0) / view.vMax) * VH, w = Math.max(1, view.iw * 0.62); return <rect key={i} x={view.X(i) - w / 2} y={VH - h} width={w} height={h} fill={c.c >= c.o ? 'rgba(61,220,151,.35)' : 'rgba(255,99,99,.35)'} />; })}
                  <text x={W - PADR + 6} y={12} fill="#8D9AA8" fontSize="11">VOL</text>
                </g>
              )}
              {ov.rsi && (
                <g transform={`translate(0 ${PH + (ov.vol ? GAP + VH : 0) + GAP})`}>
                  <rect x={PADL} y={0.3 * RH} width={W - PADR - PADL} height={0.4 * RH} fill="rgba(79,179,217,.06)" />
                  <line x1={PADL} y1={0.3 * RH} x2={W - PADR} y2={0.3 * RH} stroke="#FF6363" strokeDasharray="3 3" strokeOpacity=".6" />
                  <line x1={PADL} y1={0.7 * RH} x2={W - PADR} y2={0.7 * RH} stroke="#3DDC97" strokeDasharray="3 3" strokeOpacity=".6" />
                  <polyline points={view.rsiLine} fill="none" stroke="#5FD3A3" strokeWidth="1.5" />
                  <text x={W - PADR + 6} y={0.3 * RH + 4} fill="#8D9AA8" fontSize="11">70</text>
                  <text x={W - PADR + 6} y={0.7 * RH + 4} fill="#8D9AA8" fontSize="11">30</text>
                </g>
              )}
              {hover != null && <line x1={view.X(hover)} y1="0" x2={view.X(hover)} y2={totalH - 22} stroke="#C9D4DE" strokeOpacity=".35" />}
              {[0, Math.floor(view.n / 3), Math.floor((2 * view.n) / 3), view.n - 1].map((i) => <text key={i} x={view.X(i)} y={totalH - 4} fill="#8D9AA8" fontSize="11" textAnchor="middle" fontFamily="IBM Plex Mono">{fmtT(view.cs[i].t, range)}</text>)}
            </svg>
            <p className="note">Prices from Yahoo Finance (free, may be delayed). SMA = simple moving average; RSI above 70 is often called overbought, below 30 oversold — signals to study, not instructions.</p>
          </>
        )}
      </Panel>
    </div>
  );
}

export { upct };
