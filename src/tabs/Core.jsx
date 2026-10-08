import { useMemo } from 'react';
import { Panel, Tile, Pill, Seg, DivBar } from '../ui.jsx';
import { pct, col, upct, pts, GREEN, RED } from '../lib/format.js';

// Fibonacci-sphere positions, fixed per universe slot so DOM nodes stay stable (CSS 3D animations keep running).
function spherePos(i, N) {
  const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), ph = i * 2.399963;
  return { x: Math.cos(ph) * r, y, z: Math.sin(ph) * r, size: 7 + ((i * 37) % 8) };
}

const REGIME_NOTE = {
  'RISK-ON': 'Broad participation: most stocks are rising, volume is flowing into advancers and breadth momentum is positive. Rallies with wide breadth tend to last longer.',
  'RISK-OFF': 'Selling is broad-based: decliners lead and down-volume dominates. Weak breadth is a warning even when the index itself looks flat.',
  BALANCED: 'Mixed signals: the index and the crowd of stocks are not moving together. Watch whether breadth confirms the next index move.',
};

export default function Core({ breadth: B, daily, live, paused, setPaused, speed, setSpeed, market }) {
  const R = 170;
  const nodes = useMemo(() => (B ? B.stocks.map((s, i) => ({ ...s, ...spherePos(i, B.stocks.length) })) : []), [B]);
  if (!B) return <Panel title="Market core"><p className="para">Starting the breadth engine…</p></Panel>;

  const net = B.net, cc = net >= 0 ? '61,220,151' : '255,99,99', csz = 60 + (Math.abs(net) / B.N) * 110;
  const regimeKind = B.score >= 2 ? 'Safe' : B.score <= -2 ? 'Risky' : 'Watch';
  const h = B.hist.length > 1 ? B.hist : [0, 0];
  const hmn = Math.min(...h, 0), hmx = Math.max(...h, 0);
  const adPts = pts(h, 300, 60, 4, hmn, hmx);
  const tiles = [
    { label: 'A/D ratio', value: B.adr.toFixed(2), sub: `${B.adv} up · ${B.dec} down`, c: col(B.adr - 1) },
    { label: 'TRIN (Arms)', value: B.trin == null ? '—' : B.trin.toFixed(2), sub: 'Below 1 = buying pressure', c: B.trin == null ? undefined : col(1 - B.trin) },
    { label: 'Breadth momentum', value: (B.mcc >= 0 ? '+' : '−') + Math.abs(B.mcc).toFixed(1), sub: 'Intraday McClellan-style', c: col(B.mcc) },
    { label: 'Up volume', value: upct(B.upVolPct, 0), sub: 'Volume in advancers', c: col(B.upVolPct - 50) },
    { label: '% above 50-DMA', value: daily ? upct(daily.p50, 0) : '—', sub: daily ? 'Short-term trend health' : 'Needs Upstox history' },
    { label: '% above 200-DMA', value: daily ? upct(daily.p200, 0) : '—', sub: daily ? 'Long-term trend health' : 'Needs Upstox history' },
    { label: '52-wk highs / lows', value: daily ? `${daily.highs} / ${daily.lows}` : '—', sub: daily ? `Across ${daily.n} stocks` : 'Needs Upstox history' },
    { label: 'Net breadth', value: (net >= 0 ? '+' : '−') + Math.abs(net), sub: 'Advancers − decliners', c: col(net) },
  ];
  const mover = (s) => (
    <div key={s.sym} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span className="num" style={{ fontWeight: 600 }}>{s.sym}</span><span className="num" style={{ color: col(s.chg) }}>{pct(s.chg)}</span></div>
      <div style={{ height: 4, borderRadius: 2, transition: 'width .8s ease', width: Math.min(100, (Math.abs(s.chg) / 3) * 100) + '%', background: s.chg >= 0 ? '#3DDC97' : '#FF6363', boxShadow: `0 0 8px ${s.chg >= 0 ? 'rgba(61,220,151,.6)' : 'rgba(255,99,99,.6)'}` }} />
    </div>
  );

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row">
        <section className="pn" style={{ flex: '999 1 640px', overflow: 'hidden' }}>
          <div className="ph">
            <h2 className="pt"><span className={'ldot' + (live ? '' : ' off')} />Market core · {live ? 'live breadth' : 'simulated breadth'}</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {!live && <button type="button" className={'seg' + (paused ? ' on' : '')} onClick={() => setPaused(!paused)}>{paused ? 'Resume sim' : 'Pause sim'}</button>}
              {!live && <Seg label="Speed" options={[{ value: 1, label: '1×' }, { value: 5, label: '5×' }]} value={speed} onChange={setSpeed} />}
            </div>
          </div>
          <div className={'stage' + (paused && !live ? ' paused' : '')}>
            <div className="scan" />
            <div className="corner" style={{ left: 14, top: 14, borderLeftWidth: 2, borderTopWidth: 2 }} />
            <div className="corner" style={{ right: 14, top: 14, borderRightWidth: 2, borderTopWidth: 2 }} />
            <div className="corner" style={{ left: 14, bottom: 14, borderLeftWidth: 2, borderBottomWidth: 2 }} />
            <div className="corner" style={{ right: 14, bottom: 14, borderRightWidth: 2, borderBottomWidth: 2 }} />
            <div className="hud" style={{ left: 28, top: 28, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="lbl" style={{ color: '#8FD3EE' }}>Nifty 50 · {live ? market.source : 'sim'}</span>
              <span className="num" style={{ fontSize: 24, fontWeight: 600, textShadow: '0 0 14px rgba(79,179,217,.5)' }}>{B.index ? Math.round(B.index.ltp).toLocaleString('en-IN') : '—'}</span>
              {B.index && <span className="num" style={{ fontSize: 13, color: col(B.index.chg) }}>{pct(B.index.chg)} today</span>}
            </div>
            <div className="hud" style={{ right: 28, top: 28, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <Pill kind={regimeKind}>{B.regime}</Pill>
              <span className="num mut small">A/D {B.adr.toFixed(2)}{B.trin != null && ` · TRIN ${B.trin.toFixed(2)}`}</span>
            </div>
            <div className="hud mut" style={{ left: 28, bottom: 26, display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11 }}>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#3DDC97', boxShadow: '0 0 8px #3DDC97', display: 'inline-block' }} />Advancing</span>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#FF6363', boxShadow: '0 0 8px #FF6363', display: 'inline-block' }} />Declining</span>
              <span>Size &amp; glow = size of move · Core = net breadth</span>
            </div>
            <div className="globe">
              <div className="spin">
                <div className="ring" style={{ left: -R, top: -R, width: 2 * R, height: 2 * R, border: '1px solid rgba(79,179,217,.32)', transform: 'rotateX(90deg)' }} />
                {[0, 60, 120].map((a) => <div key={a} className="ring" style={{ left: -R, top: -R, width: 2 * R, height: 2 * R, border: '1px solid rgba(79,179,217,.14)', transform: `rotateY(${a}deg)` }} />)}
                {[118, -118].map((z) => <div key={z} className="ring" style={{ left: -118, top: -118, width: 236, height: 236, border: '1px solid rgba(79,179,217,.18)', transform: `rotateX(90deg) translateZ(${z}px)` }} />)}
                <div className="ring" style={{ left: -222, top: -222, width: 444, height: 444, border: '1px dashed rgba(242,169,59,.4)', transform: 'rotateX(78deg) rotateY(14deg)' }} />
                <div className="node"><div className="bb">
                  <div style={{ position: 'absolute', left: -csz, top: -csz, width: csz * 2, height: csz * 2, borderRadius: '50%', transition: 'all 1s ease', background: `radial-gradient(circle, rgba(${cc},.45) 0%, rgba(${cc},.12) 40%, rgba(${cc},0) 70%)`, animation: 'pulse 2.6s ease-in-out infinite' }} />
                  <div style={{ position: 'absolute', left: -csz / 2, top: -csz / 2, width: csz, height: csz, borderRadius: '50%', transition: 'all 1s ease', background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.95) 0%, rgba(${cc},1) 24%, rgba(${cc},.5) 58%, rgba(4,7,11,.3) 100%)`, boxShadow: `0 0 50px rgba(${cc},.65), inset 0 0 22px rgba(0,0,0,.45)` }} />
                </div></div>
                {nodes.map((s) => {
                  const a = Math.min(1, Math.abs(s.chg) / 2.5), c = s.chg >= 0 ? '61,220,151' : '255,99,99', sz = s.size + a * 9;
                  return (
                    <div key={s.sym} className="node" style={{ transform: `translate3d(${(s.x * R).toFixed(1)}px,${(s.y * R).toFixed(1)}px,${(s.z * R).toFixed(1)}px)` }}>
                      <div className="bb">
                        <div className="dot" title={`${s.sym} ${pct(s.chg)}`} style={{ left: -sz / 2, top: -sz / 2, width: sz, height: sz, background: `rgba(${c},${(0.3 + a * 0.7).toFixed(2)})`, border: `1px solid rgba(${c},.95)`, boxShadow: `0 0 ${(6 + a * 18).toFixed(0)}px rgba(${c},${(0.35 + a * 0.5).toFixed(2)})` }} />
                        {a > 0.72 && <span className="nlabel" style={{ left: sz / 2 + 5, color: `rgb(${c})` }}>{s.sym} {pct(s.chg, 1)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="hud" style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 3 }}>
              <span className="num" style={{ fontSize: 30, fontWeight: 600, color: '#fff', textShadow: `0 0 14px rgba(${cc},.9), 0 0 3px #000` }}>{(net >= 0 ? '+' : '−') + Math.abs(net)}</span>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.18em', color: '#fff', textShadow: '0 0 6px #000' }}>NET ADV</span>
            </div>
          </div>
        </section>

        <Panel title="Breadth gauges" right={<Pill kind={regimeKind}>{B.regime}</Pill>} style={{ flex: '1 1 360px' }}>
          <div className="col" style={{ gap: 6 }}>
            <div style={{ display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden', gap: 2 }}>
              <div style={{ transition: 'flex .8s ease', background: '#3DDC97', boxShadow: '0 0 10px rgba(61,220,151,.6)', flex: `${B.adv} 0 0` }} />
              <div style={{ transition: 'flex .8s ease', background: '#3A4859', flex: `${Math.max(B.unch, 0.2)} 0 0` }} />
              <div style={{ transition: 'flex .8s ease', background: '#FF6363', boxShadow: '0 0 10px rgba(255,99,99,.6)', flex: `${B.dec} 0 0` }} />
            </div>
            <div className="num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: GREEN }}>▲ {B.adv} adv</span><span className="mut">{B.unch} unch</span><span style={{ color: RED }}>▼ {B.dec} dec</span>
            </div>
          </div>
          <div className="grid2">{tiles.map((t) => <Tile key={t.label} label={t.label} value={t.value} sub={t.sub} valueStyle={{ color: t.c }} />)}</div>
          <p className="lbl">Advance–decline line · this session</p>
          <svg viewBox="0 0 300 60" preserveAspectRatio="none" style={{ width: '100%', height: 60, display: 'block' }} role="img" aria-label="Cumulative advance decline line">
            <polygon points={`0,60 ${adPts} 300,60`} fill="#4FB3D9" fillOpacity="0.14" />
            <polyline points={adPts} fill="none" stroke="#4FB3D9" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
          </svg>
          <p className="para small">{REGIME_NOTE[B.regime]}</p>
        </Panel>
      </div>

      <div className="row">
        <Panel title="Sector breadth" right={<span className="mut small">Average move</span>} style={{ flex: '1 1 340px' }} bodyStyle={{ gap: 9 }}>
          {B.sectors.map((s) => (
            <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr) 56px', gap: 10, alignItems: 'center', fontSize: 12 }}>
              <span>{s.name}</span><DivBar v={s.v} max={2.5} /><span className="num" style={{ textAlign: 'right', color: col(s.v) }}>{pct(s.v)}</span>
            </div>
          ))}
        </Panel>
        <Panel title="Movers" style={{ flex: '1 1 340px' }} bodyStyle={{ flexDirection: 'row', gap: 16 }}>
          <div className="col" style={{ flex: '1 1 0', gap: 8 }}><p className="lbl" style={{ color: GREEN }}>Leaders</p>{B.sorted.slice(0, 5).map(mover)}</div>
          <div className="col" style={{ flex: '1 1 0', gap: 8 }}><p className="lbl" style={{ color: RED }}>Laggards</p>{B.sorted.slice(-5).reverse().map(mover)}</div>
        </Panel>
        <Panel title="Event tape" live={live} style={{ flex: '1 1 380px' }} bodyStyle={{ gap: 0 }}>
          {B.feed.length === 0 && <p className="note">Events appear when a stock crosses ±2% on the day.</p>}
          {B.feed.map((f) => (
            <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '66px minmax(0,1fr)', gap: 8, fontSize: 12, padding: '7px 0', borderBottom: '1px solid rgba(79,179,217,.08)' }}>
              <span className="num mut">{f.time}</span><span style={{ color: f.kind === 'up' ? GREEN : f.kind === 'down' ? RED : '#8FD3EE' }}>{f.msg}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
