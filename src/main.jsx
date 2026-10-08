import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { api, loadManual, saveManual, normaliseHolding } from './lib/data.js';
import { DEMO_HOLDINGS, demoHistory, initSim, stepSim } from './lib/demo.js';
import { buildModel } from './lib/model.js';
import { createEngine, stepEngine, dailyBreadth, pushEvent } from './lib/breadth.js';
import { UNIVERSE, sectorOf } from '../lib/universe.js';
import { inr, sInr, pct, col, upct, marketOpen, istClock, RED, GREEN } from './lib/format.js';
import { Pill } from './ui.jsx';
import Core from './tabs/Core.jsx';
import Command from './tabs/Command.jsx';
import Risk from './tabs/Risk.jsx';
import Stress from './tabs/Stress.jsx';
import Optimizer from './tabs/Optimizer.jsx';
import Deriv from './tabs/Deriv.jsx';
import Alpha from './tabs/Alpha.jsx';
import Positions from './tabs/Positions.jsx';
import Tools from './tabs/Tools.jsx';
import Connect from './tabs/Connect.jsx';
import Charts from './tabs/Charts.jsx';
import Screener from './tabs/Screener.jsx';
import News from './tabs/News.jsx';

const TABS = [
  ['core', 'Market core'], ['command', 'Command'], ['news', 'News & brief'], ['charts', 'Charts'], ['screener', 'Screener'],
  ['risk', 'Risk'], ['stress', 'Stress'], ['opt', 'Optimizer'], ['deriv', 'Derivatives & hedge'], ['alpha', 'Alpha lab'],
  ['positions', 'Positions'], ['tools', 'Tools'], ['connect', 'Connect'],
];

function Login({ onDone, configError, totp }) {
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api('/api/auth?action=login', { method: 'POST', body: JSON.stringify({ password: pw, code }) }); onDone(); }
    catch (x) { setErr(x.message); setCode(''); }
    setBusy(false);
  };
  return (
    <div className="login">
      <form className="pn" onSubmit={submit} style={{ width: '100%', maxWidth: 400 }}>
        <div className="pb" style={{ gap: 16, padding: 28 }}>
          <Brand />
          {configError ? (
            <p className="para" style={{ color: RED }}>Setup needed: {configError} See the setup guide (README).</p>
          ) : (
            <>
              <label htmlFor="pw" className="lbl">Password</label>
              <input id="pw" className="field" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
              {totp && (
                <>
                  <label htmlFor="code" className="lbl">6-digit code from your authenticator app</label>
                  <input id="code" className="field num" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} style={{ letterSpacing: '.4em', fontSize: 20, textAlign: 'center' }} />
                </>
              )}
              {err && <p className="para" style={{ color: RED }} role="alert">{err}</p>}
              <button className="btn primary" type="submit" disabled={busy || !pw || (totp && code.length !== 6)}>{busy ? 'Checking…' : 'Open terminal'}</button>
              <p className="note">Private terminal. Protected by password{totp ? ' + authenticator code' : ''}; broker accounts are read-only.</p>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 8, background: '#F2A93B', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#0A0E13" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3,17 9,11 13,15 21,7" /><polyline points="15,7 21,7 21,13" /></svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <h1 style={{ margin: 0, fontFamily: "'Chakra Petch', sans-serif", fontSize: 24, fontWeight: 700, letterSpacing: '.08em', textShadow: '0 0 18px rgba(242,169,59,.35)' }}>MARKET DESK <span style={{ color: '#F2A93B' }}>PRO</span></h1>
        <span className="mut small">Risk &amp; analytics terminal · NSE / BSE</span>
      </div>
    </div>
  );
}

function readHash() {
  const h = window.location.hash.replace(/^#/, '');
  const [tab, qs] = h.split('?');
  return { tab: TABS.some((t) => t[0] === tab) ? tab : null, params: new URLSearchParams(qs || '') };
}

function Dashboard({ onLogout }) {
  const [tab, setTab] = useState(() => readHash().tab || 'core');
  const [flash, setFlash] = useState(null);
  const [status, setStatus] = useState(null);
  const [broker, setBroker] = useState({ holdings: [], errors: [], loaded: false });
  const [manual, setManual] = useState(loadManual);
  const [market, setMarket] = useState({ source: null, stocks: {}, index: null, warnings: [] });
  const [hist, setHist] = useState(null);
  const [daily, setDaily] = useState(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tick, setTick] = useState(0);
  const simRef = useRef(null);
  const srcRef = useRef(null);
  const [uhist, setUhist] = useState(null);
  const engRef = useRef(createEngine());
  const [breadth, setBreadth] = useState(null);

  // hash routing + broker-redirect messages
  useEffect(() => {
    const onHash = () => {
      const { tab: t, params } = readHash();
      if (t) setTab(t);
      if (params.get('ok')) setFlash({ kind: 'ok', text: `${{ kite: 'Zerodha', upstox: 'Upstox', angel: 'Angel One' }[params.get('ok')] || 'Broker'} connected. Holdings are loading.` });
      if (params.get('err')) setFlash({ kind: 'err', text: params.get('err') });
      if (params.get('ok') || params.get('err')) history.replaceState(null, '', '#' + (t || 'connect'));
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (t) => { setTab(t); history.replaceState(null, '', '#' + t); window.scrollTo({ top: 0 }); };

  const authFail = useCallback((e) => { if (e && e.status === 401) onLogout(); }, [onLogout]);

  const loadStatus = useCallback(() => api('/api/status').then(setStatus).catch(authFail), [authFail]);
  const loadPortfolio = useCallback(() => api('/api/portfolio').then((j) => setBroker({ ...j, loaded: true })).catch((e) => { authFail(e); setBroker((b) => ({ ...b, loaded: true })); }), [authFail]);
  useEffect(() => { loadStatus(); loadPortfolio(); const id = setInterval(loadPortfolio, 120000); return () => clearInterval(id); }, [loadStatus, loadPortfolio]);

  const realList = broker.holdings.length || manual.length;
  const demo = broker.loaded && !realList;

  // live quotes
  const extra = useMemo(() => manual.map((m) => m.symbol).concat(broker.holdings.map((h) => h.symbol)).join(','), [manual, broker.holdings]);
  useEffect(() => {
    let stop = false;
    let timer = null;
    const pull = () => {
      api('/api/market?extra=' + encodeURIComponent(extra)).then((j) => {
        if (stop) return;
        setMarket(j);
        srcRef.current = j.source;
        if (j.source && !engRef.current.sourced) { engRef.current.sourced = true; pushEvent(engRef.current, `Live feed connected via ${j.source}`, 'info'); }
      }).catch(authFail).finally(() => {
        if (stop) return;
        const fast = marketOpen() ? (srcRef.current === 'Yahoo' ? 20000 : 5000) : 60000;
        timer = setTimeout(pull, fast);
      });
    };
    const pullWrap = () => { if (document.hidden) { timer = setTimeout(pullWrap, 5000); return; } pull(); };
    pullWrap();
    return () => { stop = true; clearTimeout(timer); };
  }, [extra, authFail]);

  // holdings (live-priced)
  const holdings = useMemo(() => {
    if (demo) return DEMO_HOLDINGS;
    const q = market.stocks || {};
    const list = broker.holdings.map((h) => normaliseHolding({ ...h, sector: sectorOf(h.symbol) }, q[h.symbol]));
    const have = new Set(list.map((h) => h.symbol));
    manual.forEach((m) => { if (!have.has(m.symbol)) list.push(normaliseHolding(m, q[m.symbol])); });
    return list;
  }, [demo, broker.holdings, manual, market.stocks]);

  // history (once per holdings set)
  const symKey = holdings.map((h) => h.symbol).sort().join(',');
  useEffect(() => {
    if (demo) { setHist(demoHistory()); return; }
    if (!symKey) { setHist(null); return; }
    let stop = false;
    api('/api/history?symbols=' + encodeURIComponent(symKey)).then((j) => { if (!stop) setHist(j); }).catch(authFail);
    return () => { stop = true; };
  }, [demo, symKey, authFail]);

  // ~1y history for the 50-stock universe (+ watchlist): feeds daily breadth and the screener. Loaded once, when first needed.
  const [watch, setWatch] = useState(loadWatch);
  const needUniverse = tab === 'core' || tab === 'screener';
  const uKey = Array.from(new Set(watch.concat(demo ? [] : holdings.map((h) => h.symbol)))).sort().join(',');
  useEffect(() => {
    if (!needUniverse) return;
    if (uhist && uhist.key === uKey) return;
    let stop = false;
    api('/api/history?universe=1&symbols=' + encodeURIComponent(uKey)).then((j) => {
      if (stop) return;
      setUhist({ ...j, key: uKey });
      setDaily(dailyBreadth(j.series || {}, UNIVERSE.map((u) => u.sym)));
    }).catch(authFail);
    return () => { stop = true; };
  }, [needUniverse, uKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveWatchList = (list) => { setWatch(list); try { localStorage.setItem('md_watch_v1', JSON.stringify(list)); } catch { /* ignore */ } };

  // breadth tick: real quotes when available, otherwise simulation
  const live = !!market.source;
  useEffect(() => {
    if (live || paused) return;
    if (!simRef.current) simRef.current = initSim();
    const id = setInterval(() => { for (let i = 0; i < speed; i++) stepSim(simRef.current); setTick((t) => t + 1); }, 1000);
    return () => clearInterval(id);
  }, [live, paused, speed]);

  useEffect(() => {
    let stocks;
    if (live) {
      stocks = UNIVERSE.filter((u) => market.stocks[u.sym]).map((u) => {
        const q = market.stocks[u.sym];
        return { sym: u.sym, sector: u.sector, chg: q.prevClose ? (q.ltp / q.prevClose - 1) * 100 : 0, volume: q.volume || 0, ltp: q.ltp };
      });
    } else {
      if (!simRef.current) simRef.current = initSim();
      stocks = simRef.current.stocks;
    }
    if (!stocks.length) return;
    const b = stepEngine(engRef.current, stocks);
    const idx = live ? market.index : simRef.current.index;
    b.index = idx ? { ltp: idx.ltp, chg: idx.prevClose ? (idx.ltp / idx.prevClose - 1) * 100 : idx.chg || 0 } : null;
    b.live = live;
    b.source = market.source;
    b.stocks = stocks;
    setBreadth(b);
  }, [tick, market.at, live]); // eslint-disable-line react-hooks/exhaustive-deps

  const M = useMemo(() => buildModel(holdings, hist), [holdings, hist]);

  const addManual = (list) => { const next = mergeManual(manual, list); setManual(next); saveManual(next); };
  const removeManual = (sym) => { const next = manual.filter((m) => m.symbol !== sym); setManual(next); saveManual(next); };
  const clearManual = () => { setManual([]); saveManual([]); };

  const [chartSym, setChartSym] = useState('NIFTY');
  const openChart = (sym) => { setChartSym(sym); go('charts'); };
  const logout = async () => { await api('/api/auth?action=logout', { method: 'POST' }).catch(() => {}); onLogout(); };

  // auto-logout after 30 minutes without activity
  useEffect(() => {
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const ev = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    ev.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const id = setInterval(() => { if (Date.now() - last > 30 * 60000) logout(); }, 30000);
    return () => { clearInterval(id); ev.forEach((e) => window.removeEventListener(e, bump)); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const names = useMemo(() => Object.fromEntries(Object.entries(market.stocks || {}).filter(([, q]) => q.name).map(([k, q]) => [k, q.name])), [market.stocks]);
  const ctx = { M, holdings, hist, uhist, breadth, daily, market, status, demo, go, live, paused, setPaused, speed, setSpeed, broker, manual, addManual, removeManual, clearManual, loadStatus, loadPortfolio, setFlash, watch, saveWatchList, names, chartSym, setChartSym, openChart };

  const pnlT = M.empty ? 0 : M.total - M.invested;
  const kpis = M.empty ? [] : [
    { label: 'Net asset value', value: inr(M.total), sub: 'Invested ' + inr(M.invested) },
    { label: 'Day P&L', value: sInr(M.day), sub: pct((M.day / M.total) * 100) + ' today', color: col(M.day) },
    { label: 'Total P&L', value: sInr(pnlT), sub: pct((pnlT / M.invested) * 100) + ' since buying', color: col(pnlT) },
    { label: 'VaR 95% · 1 day', value: inr(M.var95), sub: upct((M.var95 / M.total) * 100, 2) + ' of NAV', color: '#F5BD62' },
    { label: 'Beta vs Nifty', value: M.beta.toFixed(2), sub: M.hasHist ? (demo ? '1-year, demo prices' : '1-year, from real prices') : 'Assumed (no history yet)' },
    { label: 'Sharpe · 1Y', value: M.real ? M.real.sharpe.toFixed(2) : '—', sub: M.real ? 'Sortino ' + M.real.sortino.toFixed(2) : 'Needs price history' },
    { label: 'Max drawdown · 1Y', value: M.real ? pct(M.real.maxDD * 100, 1) : '—', sub: 'Worst peak-to-trough fall', color: RED },
    { label: 'Health score', value: M.health + '/100', sub: `${M.counts.Risky} risky · ${M.counts.Watch} watch`, color: M.health >= 80 ? GREEN : M.health >= 60 ? '#F5BD62' : RED },
  ];

  const tape = [];
  if (breadth && breadth.index) tape.push({ sym: 'NIFTY 50', px: Math.round(breadth.index.ltp).toLocaleString('en-IN'), chg: breadth.index.chg });
  holdings.forEach((h) => tape.push({ sym: h.symbol, px: inr(h.ltp), chg: h.prevClose ? (h.ltp / h.prevClose - 1) * 100 : 0 }));

  return (
    <>
      <div style={{ background: '#06090D', borderBottom: '1px solid #222C38', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 28, padding: '8px 20px', whiteSpace: 'nowrap', fontSize: 12 }}>
          {tape.map((t) => (
            <span key={t.sym} className="num" style={{ display: 'inline-flex', gap: 8 }}>
              <span style={{ color: '#C9D4DE', fontWeight: 600 }}>{t.sym}</span><span>{t.px}</span><span style={{ color: col(t.chg) }}>{pct(t.chg)}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="wrap">
        <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <Brand />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {live ? <Pill kind="Safe"><span className="ldot" />LIVE · {market.source}{market.delayed ? ' (may be delayed)' : ''} · {istClock()}</Pill>
              : <Pill kind="Watch"><span className="ldot off" />SIMULATED MARKET</Pill>}
            {demo ? <Pill kind="Watch">DEMO PORTFOLIO</Pill> : <Pill kind="Info">{holdings.length} HOLDINGS</Pill>}
            {!marketOpen() && <Pill kind="Off">MARKET CLOSED</Pill>}
            <button className="btn small" type="button" onClick={logout}>Log out</button>
          </div>
        </header>

        {flash && (
          <div className="banner" role="status" style={{ background: flash.kind === 'ok' ? 'rgba(61,190,139,.12)' : 'rgba(240,106,106,.12)', color: flash.kind === 'ok' ? '#5FD3A3' : '#FF8A8A' }}>
            <span>{flash.text}</span><button className="btn small" type="button" onClick={() => setFlash(null)}>Dismiss</button>
          </div>
        )}
        {demo && (
          <div className="banner" style={{ background: 'rgba(242,169,59,.10)', color: '#F5BD62' }}>
            <span>You're looking at a demo portfolio. Connect a broker or import a holdings file to see your own.</span>
            <button className="btn small primary" type="button" onClick={() => go('connect')}>Connect accounts</button>
          </div>
        )}
        {broker.errors && broker.errors.map((e) => (
          <div key={e.broker} className="banner" style={{ background: 'rgba(240,106,106,.10)', color: '#FF8A8A' }}>
            <span>{e.broker}: {e.expired ? 'session expired — log in to the broker again (tokens reset every morning).' : e.error}</span>
            <button className="btn small" type="button" onClick={() => go('connect')}>Reconnect</button>
          </div>
        ))}

        <nav className="tabs" aria-label="Terminal sections">
          {TABS.map(([id, label]) => <button key={id} type="button" className={'tab' + (tab === id ? ' on' : '')} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>{label}</button>)}
        </nav>

        {!M.empty && (
          <div className="kpis">
            {kpis.map((k) => (
              <div key={k.label} className="pn" style={{ padding: '12px 14px', gap: 6 }}>
                <p className="lbl">{k.label}</p>
                <span className="num" style={{ fontSize: 20, fontWeight: 600, color: k.color }}>{k.value}</span>
                <span className="mut tiny">{k.sub}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'core' && <Core {...ctx} />}
        {tab === 'command' && <Command {...ctx} />}
        {tab === 'risk' && <Risk {...ctx} />}
        {tab === 'stress' && <Stress {...ctx} />}
        {tab === 'opt' && <Optimizer {...ctx} />}
        {tab === 'deriv' && <Deriv {...ctx} />}
        {tab === 'alpha' && <Alpha {...ctx} />}
        {tab === 'positions' && <Positions {...ctx} />}
        {tab === 'tools' && <Tools {...ctx} />}
        {tab === 'connect' && <Connect {...ctx} />}
        {tab === 'charts' && <Charts {...ctx} />}
        {tab === 'screener' && <Screener {...ctx} />}
        {tab === 'news' && <News {...ctx} />}

        <footer className="note" style={{ borderTop: '1px solid #222C38', paddingTop: 12 }}>
          For learning only — not investment advice. Market Desk Pro reads data and never places orders.
          {hist && hist.source && <> Price history: {hist.source}.</>} {live ? `Quotes: ${market.source}${market.delayed ? ' (free feed, may be delayed)' : ''}.` : 'Market core is simulated until a price feed is reachable.'}
        </footer>
      </div>
    </>
  );
}

function loadWatch() {
  try { return JSON.parse(localStorage.getItem('md_watch_v1') || '[]'); } catch { return []; }
}

function mergeManual(cur, add) {
  const map = Object.fromEntries(cur.map((m) => [m.symbol, m]));
  add.forEach((a) => { map[a.symbol] = a; });
  return Object.values(map);
}

function App() {
  const [state, setState] = useState({ checking: true, loggedIn: false, configError: null });
  const check = useCallback(() => {
    fetch('/api/auth?action=me', { credentials: 'same-origin' })
      .then((r) => r.json().then((j) => setState({ checking: false, loggedIn: !!j.loggedIn, configError: j.configError || null, totp: !!j.totp })))
      .catch(() => setState({ checking: false, loggedIn: false, configError: 'Server not reachable.' }));
  }, []);
  useEffect(check, [check]);
  if (state.checking) return <div className="login"><span className="mut">Loading…</span></div>;
  if (!state.loggedIn) return <Login onDone={check} configError={state.configError} totp={state.totp} />;
  return <Dashboard onLogout={() => setState({ checking: false, loggedIn: false, configError: null })} />;
}

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
