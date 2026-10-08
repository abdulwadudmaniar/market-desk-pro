import { useMemo, useState } from 'react';
import { Panel, Pill, Spark } from '../ui.jsx';
import { inr, pct, col, upct } from '../lib/format.js';
import { UNIVERSE, sectorOf } from '../../lib/universe.js';
import { sd, returns, mean } from '../lib/stats.js';

const PRESETS = [
  { id: 'all', label: 'All stocks', test: () => true, sort: ['r3m', -1], note: 'Everything in the scan.' },
  { id: 'momentum', label: 'Momentum leaders', test: (r) => r.r3m > 10 && r.above200, sort: ['r3m', -1], note: 'Up more than 10% in 3 months and above the 200-day average.' },
  { id: 'high', label: 'Near 52-wk high', test: (r) => r.fromHigh > -3, sort: ['fromHigh', -1], note: 'Within 3% of the 52-week high — possible breakouts.' },
  { id: 'pullback', label: 'Pullback in uptrend', test: (r) => r.above200 && !r.above50, sort: ['rsi', 1], note: 'Long-term uptrend (above 200-day) but dipped below the 50-day.' },
  { id: 'oversold', label: 'Oversold (RSI < 35)', test: (r) => r.rsi < 35, sort: ['rsi', 1], note: 'Fell fast recently. Oversold can stay oversold — check why.' },
  { id: 'volume', label: 'Volume spike', test: (r) => r.volx > 1.8, sort: ['volx', -1], note: 'Latest volume is 1.8× the 20-day average — something is happening.' },
  { id: 'low', label: 'Near 52-wk low', test: (r) => r.fromLow < 5, sort: ['fromLow', 1], note: 'Within 5% of the 52-week low.' },
  { id: 'breakdown', label: 'Breakdown risk', test: (r) => !r.above200 && r.r3m < -10, sort: ['r3m', 1], note: 'Below the 200-day average and down more than 10% in 3 months.' },
];

const COLS = [
  ['sym', 'Symbol'], ['price', 'Price'], ['d1', '1D'], ['r1w', '1W'], ['r1m', '1M'], ['r3m', '3M'], ['r1y', '1Y'],
  ['fromHigh', 'From 52W high'], ['rsi', 'RSI'], ['trend', 'Trend'], ['vol', 'Volatility'], ['volx', 'Vol ×20D'], ['spark', '3M'],
];

function metrics(sym, s, q) {
  const c = s.map((x) => x[1]).filter((x) => x != null);
  const v = s.map((x) => x[2] || 0);
  const L = c.length;
  if (L < 30) return null;
  const last = q && q.ltp ? q.ltp : c[L - 1];
  const back = (n) => (L > n ? (last / c[L - 1 - n] - 1) * 100 : null);
  const yr = c.slice(-252);
  const hi = Math.max(...yr, last), lo = Math.min(...yr, last);
  let g = 0, l = 0;
  for (let i = L - 14; i < L; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  const rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  const s50 = L >= 50 ? mean(c.slice(-50)) : null, s200 = L >= 200 ? mean(c.slice(-200)) : null;
  const vol20 = mean(v.slice(-21, -1));
  return {
    sym, sector: sectorOf(sym), price: last,
    d1: q && q.prevClose ? (q.ltp / q.prevClose - 1) * 100 : (c[L - 1] / c[L - 2] - 1) * 100,
    r1w: back(5), r1m: back(21), r3m: back(63), r1y: (last / yr[0] - 1) * 100,
    fromHigh: (last / hi - 1) * 100, fromLow: (last / lo - 1) * 100, rsi,
    above50: s50 ? last > s50 : false, above200: s200 ? last > s200 : false, has200: !!s200,
    vol: sd(returns(c.slice(-61))) * Math.sqrt(252) * 100,
    volx: vol20 ? v[L - 1] / vol20 : 0,
    spark: c.slice(-63),
  };
}

export default function Screener({ uhist, market, holdings, demo, watch, saveWatchList, openChart }) {
  const [preset, setPreset] = useState('all');
  const [sector, setSector] = useState('All');
  const [scope, setScope] = useState('all');
  const [sort, setSort] = useState(null);
  const [add, setAdd] = useState('');

  const held = useMemo(() => new Set(demo ? [] : holdings.map((h) => h.symbol)), [holdings, demo]);
  const rows = useMemo(() => {
    if (!uhist || !uhist.series) return [];
    return Object.entries(uhist.series).map(([sym, s]) => metrics(sym, s, market.stocks && market.stocks[sym])).filter(Boolean);
  }, [uhist, market.stocks]);

  const P = PRESETS.find((p) => p.id === preset);
  const sectors = ['All'].concat(Array.from(new Set(rows.map((r) => r.sector))).sort());
  const [sk, sd2] = sort || P.sort;
  const list = rows
    .filter(P.test)
    .filter((r) => sector === 'All' || r.sector === sector)
    .filter((r) => scope === 'all' || (scope === 'held' ? held.has(r.sym) : watch.includes(r.sym)))
    .sort((a, b) => {
      const x = sk === 'trend' ? (a.above200 ? 2 : 0) + (a.above50 ? 1 : 0) : a[sk], y = sk === 'trend' ? (b.above200 ? 2 : 0) + (b.above50 ? 1 : 0) : b[sk];
      if (typeof x === 'string') return x.localeCompare(y) * sd2;
      return ((x ?? -1e9) - (y ?? -1e9)) * sd2;
    });

  const addSym = (e) => {
    e.preventDefault();
    const s = add.trim().toUpperCase().replace(/\.NS$/, '').replace(/[^A-Z0-9&\-]/g, '');
    if (!s || watch.includes(s)) return;
    saveWatchList(watch.concat(s).slice(0, 60));
    setAdd('');
  };
  const header = (k, l) => (
    <th key={k}>
      {k === 'spark' ? l : <button type="button" onClick={() => setSort([k, sk === k ? -sd2 : -1])} style={{ background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0, letterSpacing: 'inherit', textTransform: 'inherit' }} aria-label={`Sort by ${l}`}>{l}{sk === k ? (sd2 < 0 ? ' ▼' : ' ▲') : ''}</button>}
    </th>
  );
  const cell = (v, d = 1) => (v == null ? <span className="mut">—</span> : <span style={{ color: col(v) }}>{pct(v, d)}</span>);

  return (
    <div className="col" style={{ gap: 14 }}>
      <Panel title="Stock screener" right={<span className="mut small">{uhist ? `${rows.length} stocks scanned · daily data ${uhist.source ? 'via ' + uhist.source : ''}` : 'Loading ~1 year of prices…'}</span>}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRESETS.map((p) => <button key={p.id} type="button" className={'chip' + (preset === p.id ? ' on' : '')} onClick={() => { setPreset(p.id); setSort(null); }}>{p.label}</button>)}
        </div>
        <p className="note">{P.note} Click any row to open its chart.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <label className="small mut" htmlFor="sect">Sector</label>
          <select id="sect" className="field" value={sector} onChange={(e) => setSector(e.target.value)}>{sectors.map((s) => <option key={s}>{s}</option>)}</select>
          <label className="small mut" htmlFor="scope">Show</label>
          <select id="scope" className="field" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">Nifty 50 + watchlist + holdings</option><option value="held">Only my holdings</option><option value="watch">Only my watchlist</option>
          </select>
          <span className="mut small" style={{ marginLeft: 'auto' }}>{list.length} match{list.length === 1 ? '' : 'es'}</span>
        </div>
      </Panel>

      <section className="pn">
        <div className="scroll">
          <table className="tbl" style={{ minWidth: 1180 }}>
            <thead><tr>{COLS.map(([k, l]) => header(k, l))}</tr></thead>
            <tbody>
              {!uhist && <tr><td colSpan={COLS.length} style={{ textAlign: 'left' }} className="mut">Loading prices for the Nifty 50 and your list — the first load takes a few seconds.</td></tr>}
              {uhist && !list.length && <tr><td colSpan={COLS.length} style={{ textAlign: 'left' }} className="mut">No stocks match this screen right now.</td></tr>}
              {list.map((r) => (
                <tr key={r.sym} onClick={() => openChart(r.sym)} style={{ cursor: 'pointer' }} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') openChart(r.sym); }}>
                  <td><div className="col" style={{ gap: 2 }}><strong className="num">{r.sym} {held.has(r.sym) && <Pill kind="Info" style={{ marginLeft: 4 }}>HELD</Pill>}{watch.includes(r.sym) && <Pill kind="Watch" style={{ marginLeft: 4 }}>WATCH</Pill>}</strong><span className="mut tiny">{r.sector}</span></div></td>
                  <td className="num">{inr(r.price)}</td>
                  <td className="num">{cell(r.d1, 2)}</td>
                  <td className="num">{cell(r.r1w)}</td>
                  <td className="num">{cell(r.r1m)}</td>
                  <td className="num">{cell(r.r3m)}</td>
                  <td className="num">{cell(r.r1y)}</td>
                  <td className="num">{cell(r.fromHigh)}</td>
                  <td className="num" style={{ color: r.rsi > 70 ? '#FF8A8A' : r.rsi < 30 ? '#5FE3A8' : undefined }}>{r.rsi.toFixed(0)}</td>
                  <td className="num">{!r.has200 ? <span className="mut">—</span> : r.above200 ? (r.above50 ? <span style={{ color: '#5FE3A8' }}>Strong up</span> : <span style={{ color: '#F5BD62' }}>Up, dipping</span>) : (r.above50 ? <span style={{ color: '#F5BD62' }}>Recovering</span> : <span style={{ color: '#FF8A8A' }}>Down</span>)}</td>
                  <td className="num">{upct(r.vol, 0)}</td>
                  <td className="num" style={{ color: r.volx > 1.8 ? '#F5BD62' : undefined }}>{r.volx ? r.volx.toFixed(1) + '×' : '—'}</td>
                  <td><Spark data={r.spark} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Panel title="My watchlist" right={<span className="mut small">Added to every scan · saved in this browser</span>}>
        <form onSubmit={addSym} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <label htmlFor="wadd" className="sr">Add NSE symbol</label>
          <input id="wadd" className="field num" style={{ flex: '1 1 200px' }} placeholder="Add NSE symbol, e.g. ZOMATO, HAL, DMART" value={add} onChange={(e) => setAdd(e.target.value)} />
          <button className="btn primary" type="submit">Add</button>
        </form>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {watch.length === 0 && <span className="mut small">Empty. Add stocks you want to track beyond the Nifty 50.</span>}
          {watch.map((s) => (
            <span key={s} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'default' }}>
              <button type="button" onClick={() => openChart(s)} style={{ background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}>{s}</button>
              <button type="button" aria-label={`Remove ${s}`} onClick={() => saveWatchList(watch.filter((x) => x !== s))} style={{ background: 'none', border: 0, color: '#FF8A8A', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
        {uhist && uhist.errors && uhist.errors.length > 0 && <p className="note">Couldn't load: {uhist.errors.slice(0, 8).join(' · ')}{uhist.errors.length > 8 ? ' …' : ''}. Check the symbols are NSE trading symbols.</p>}
      </Panel>
      <p className="note">Universe: {UNIVERSE.length} large caps + your holdings + watchlist. Technical screen only — it shows how prices behave, not whether a company is good value.</p>
    </div>
  );
}
