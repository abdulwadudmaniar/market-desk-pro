import { useState } from 'react';
import { Panel, Pill } from '../ui.jsx';
import { api, holdingsFromCsv } from '../lib/data.js';
import { inr } from '../lib/format.js';

const BROKERS = [
  { id: 'upstox', name: 'Upstox', method: 'Official Upstox API · read-only', desc: 'Holdings, live quotes and price history. Upstox lists its data APIs as free. Login resets every morning (~3:30 AM).' },
  { id: 'kite', name: 'Zerodha', method: 'Kite Connect API · read-only', desc: 'Holdings work on the free Personal plan. Live quotes and price history need the paid Connect plan. Login resets every morning (~6 AM).' },
  { id: 'angel', name: 'Angel One', method: 'SmartAPI · read-only', desc: 'Holdings through Angel One’s official SmartAPI login. Free. Login resets every day.' },
];

export default function Connect({ status, manual, addManual, removeManual, clearManual, loadStatus, loadPortfolio, setFlash, broker }) {
  const [form, setForm] = useState({ symbol: '', qty: '', avg: '' });
  const [msg, setMsg] = useState('');

  const disconnect = async (id) => {
    await api(`/api/connect?b=${id}&action=disconnect`, { method: 'POST' }).catch(() => {});
    loadStatus(); loadPortfolio();
  };
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      let list = holdingsFromCsv(await f.text(), 'File: ' + f.name.replace(/\.[^.]+$/, ''));
      const isins = list.map((h) => h.isin).filter(Boolean);
      let fixed = 0;
      if (isins.length) {
        // Exports that list company names get matched to NSE symbols through their ISIN.
        const j = await api('/api/resolve', { method: 'POST', body: JSON.stringify({ isins }) }).catch(() => ({ map: {} }));
        list = list.map((h) => (h.isin && j.map[h.isin] ? (fixed++, { ...h, symbol: j.map[h.isin] }) : h));
      }
      addManual(list);
      setMsg(`Imported ${list.length} holdings from ${f.name}${fixed ? ` (${fixed} matched to NSE symbols by ISIN)` : ''}. Check the symbols below — they must match NSE symbols for live prices.`);
    } catch (x) { setMsg(x.message); }
    e.target.value = '';
  };
  const add = (e) => {
    e.preventDefault();
    const symbol = form.symbol.trim().toUpperCase().replace(/\s+/g, '');
    const qty = Number(form.qty), avg = Number(form.avg);
    if (!symbol || !(qty > 0) || !(avg > 0)) { setMsg('Enter a symbol, a quantity and an average price.'); return; }
    addManual([{ symbol, qty, avg, source: 'Manual' }]);
    setForm({ symbol: '', qty: '', avg: '' });
    setMsg(`Added ${symbol}.`);
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <p className="para">Connect a broker with its official login, or import a holdings file. Market Desk Pro only reads data — it can't place orders and never sees your broker password. Prices, charts and news work without any broker (free Yahoo Finance + exchange feeds).</p>
      {status && status.security && (
        <div className="banner" style={{ background: status.security.totp ? 'rgba(61,190,139,.10)' : 'rgba(242,169,59,.10)', color: status.security.totp ? '#5FD3A3' : '#F5BD62' }}>
          <span>Security: password {status.security.totp ? '+ authenticator code ✓' : 'only — add TOTP_SECRET on the server to require an authenticator code'} · sessions last {status.security.sessionDays} days · auto-logout after 30 min idle · 5 wrong tries = 15-min lock.</span>
        </div>
      )}
      <div className="auto" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
        {BROKERS.map((b) => {
          const st = status ? status[b.id] : null;
          const connected = st && st.connected;
          return (
            <div key={b.id} className="pn"><div className="pb">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 40, height: 40, borderRadius: 6, background: '#151D26', border: '1px solid #2E3A48', color: '#F2A93B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{b.name[0]}</span>
                  <div className="col" style={{ gap: 0 }}><strong>{b.name}</strong><span className="mut tiny">{b.method}</span></div>
                </div>
                {!st ? <Pill kind="Off">…</Pill> : connected ? <Pill kind="Safe">CONNECTED</Pill> : st.configured ? <Pill kind="Off">NOT LINKED</Pill> : <Pill kind="Watch">NEEDS SETUP</Pill>}
              </div>
              <p className="para">{b.desc}</p>
              {connected && st.expires && <p className="note">Session valid until {new Date(st.expires).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })} IST.</p>}
              {st && !st.configured && <p className="note">The app owner needs to add this broker's API key and secret on the server first — see the setup guide.</p>}
              {connected
                ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><a className="btn" href={`/api/connect?b=${b.id}`} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Reconnect</a><button type="button" className="btn" onClick={() => disconnect(b.id)}>Disconnect</button></div>
                : <a className={'btn' + (st && st.configured ? ' primary' : '')} aria-disabled={st && !st.configured} href={st && st.configured ? `/api/connect?b=${b.id}` : undefined} onClick={(e) => { if (!st || !st.configured) { e.preventDefault(); setFlash({ kind: 'err', text: `${b.name} API keys are not set on the server yet.` }); } }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', opacity: st && st.configured ? 1 : 0.7 }}>Connect {b.name}</a>}
            </div></div>
          );
        })}
        <div className="pn"><div className="pb">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 6, background: '#151D26', border: '1px solid #2E3A48', color: '#F2A93B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>↥</span>
            <div className="col" style={{ gap: 0 }}><strong>Groww, Dhan &amp; others</strong><span className="mut tiny">Holdings file (CSV)</span></div>
          </div>
          <p className="para">Export holdings from your broker as CSV (or save the Excel export as CSV) with columns like Symbol, Quantity and Average price. Live prices come from the free price feed automatically.</p>
          <label className="btn primary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            Choose CSV file<input type="file" accept=".csv,text/csv" onChange={onFile} className="sr" />
          </label>
        </div></div>
      </div>

      {msg && <div className="banner" role="status" style={{ background: 'rgba(79,179,217,.1)', color: '#8FD3EE' }}><span>{msg}</span><button type="button" className="btn small" onClick={() => setMsg('')}>OK</button></div>}

      <div className="row">
        <Panel title="Add a holding by hand" style={{ flex: '1 1 360px' }}>
          <form onSubmit={add} className="col" style={{ gap: 8 }}>
            <label htmlFor="ms" className="lbl">NSE symbol</label>
            <input id="ms" className="field" placeholder="e.g. HDFCBANK" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
            <div className="grid2">
              <div className="col" style={{ gap: 6 }}><label htmlFor="mq" className="lbl">Quantity</label><input id="mq" className="field" inputMode="decimal" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></div>
              <div className="col" style={{ gap: 6 }}><label htmlFor="ma" className="lbl">Average price ₹</label><input id="ma" className="field" inputMode="decimal" value={form.avg} onChange={(e) => setForm({ ...form, avg: e.target.value })} /></div>
            </div>
            <button type="submit" className="btn primary">Add holding</button>
            <p className="note">Saved in this browser only.</p>
          </form>
        </Panel>
        <Panel title="Imported & manual holdings" style={{ flex: '2 1 460px' }} right={manual.length > 0 && <button type="button" className="btn small" onClick={clearManual}>Remove all</button>}>
          {manual.length === 0 ? <p className="para">None yet.</p> : (
            <div className="col" style={{ gap: 6 }}>
              {manual.map((m) => (
                <div key={m.symbol} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto auto', gap: 12, alignItems: 'center', fontSize: 13, padding: '6px 0', borderBottom: '1px solid #18212B' }}>
                  <span className="num" style={{ fontWeight: 600 }}>{m.symbol} <span className="mut tiny">{m.source}</span></span>
                  <span className="num">{m.qty}</span><span className="num">{inr(m.avg)}</span>
                  <button type="button" className="btn small" onClick={() => removeManual(m.symbol)} aria-label={`Remove ${m.symbol}`}>Remove</button>
                </div>
              ))}
            </div>
          )}
          {broker.holdings.length > 0 && <p className="note">{broker.holdings.length} holdings are also coming from your connected broker{broker.holdings.length > 1 ? 's' : ''}. If a symbol appears in both, the broker's numbers win.</p>}
        </Panel>
      </div>
    </div>
  );
}
