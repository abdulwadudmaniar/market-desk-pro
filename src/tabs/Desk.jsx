import { useEffect, useRef, useState } from 'react';
import { Panel, Pill } from '../ui.jsx';
import { Markdown, plainText } from '../lib/md.jsx';
import { buildContext, runAgent, approxCost, speak, stopSpeaking, SpeechRec } from '../lib/agentClient.js';

export const AGENTS = [
  { id: 'analyst', name: 'Research Analyst', icon: 'RA', blurb: 'Full one-page report on a stock: business, numbers, news, bull vs bear case, key levels.', examples: ['Write a full report on Tata Motors', 'Compare HDFC Bank and ICICI Bank'] },
  { id: 'technical', name: 'Technical Analyst', icon: 'TA', blurb: 'Trend, momentum, support/resistance — every signal checked against 5 years of history.', examples: ['Technical view on Reliance with backtests', 'Is Infosys oversold? What happened historically?'] },
  { id: 'news', name: 'News Desk', icon: 'ND', blurb: 'Latest results, filings and headlines that could move a stock or the market, with sources.', examples: ['What is the latest news on my holdings?', 'Why did IT stocks move today?'] },
  { id: 'risk', name: 'Risk Manager', icon: 'RM', blurb: 'Reviews your portfolio for concentration, volatility and drawdown risk, with numbers.', examples: ['Review my portfolio risk', 'What happens to me if the Nifty falls 10%?'] },
  { id: 'scout', name: 'Market Scout', icon: 'MS', blurb: 'Scans the Nifty 50 + watchlist for setups worth studying, with historical evidence.', examples: ['Find momentum stocks worth studying', 'Which large caps are near 52-week highs?'] },
  { id: 'coach', name: 'Trading Coach', icon: 'TC', blurb: 'Checks a trade plan before you act: reason, stop-loss, size, risk-reward and evidence.', examples: ['I want to buy 20 SBIN at ₹800 with stop ₹760 — review my plan', 'How should I size a trade with ₹50,000 capital?'] },
];

const KEY = 'md_desk_history_v1';
const loadHist = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const saveHist = (h) => { try { localStorage.setItem(KEY, JSON.stringify(h.slice(0, 20))); } catch { /* ignore */ } };

export default function Desk(props) {
  const { status, deskReq, setDeskReq, go, openChart } = props;
  const [role, setRole] = useState('analyst');
  const [task, setTask] = useState('');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [hist, setHist] = useState(loadHist);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const enabled = true; // built-in analysts work with no key
  const ai = (status && status.ai) || { provider: 'builtin', label: 'Built-in analyst (free, no AI key)' };

  const run = async (t = task, r = role) => {
    if (!t.trim() || busy) return;
    setBusy(true); setErr(''); setResult(null); setElapsed(0);
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    try {
      const j = await runAgent({ task: t.trim(), role: r, context: buildContext(props) });
      const item = { id: Date.now(), at: Date.now(), role: r, task: t.trim(), ...j };
      setResult(item);
      const h = [item].concat(hist.filter((x) => x.id !== item.id)).slice(0, 20);
      setHist(h); saveHist(h);
    } catch (e) { setErr(e.message); }
    clearInterval(timer);
    setBusy(false);
  };

  // requests coming from the voice assistant ("analyse Reliance")
  useEffect(() => {
    if (!deskReq) return;
    setRole(deskReq.role || 'analyst');
    setTask(deskReq.task || '');
    if (deskReq.run && enabled) run(deskReq.task, deskReq.role || 'analyst');
    setDeskReq(null);
  }, [deskReq]); // eslint-disable-line react-hooks/exhaustive-deps

  const dictate = () => {
    if (!SpeechRec) { setErr('Voice input works in Chrome, Edge and Safari.'); return; }
    if (listening) { recRef.current && recRef.current.stop(); return; }
    const rec = new SpeechRec();
    rec.lang = 'en-IN'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (e) => setTask((t) => (t ? t + ' ' : '') + e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec; setListening(true); rec.start();
  };

  const A = AGENTS.find((a) => a.id === role);
  const shown = result;
  const nav = shown && shown.actions && shown.actions.find((a) => a.type === 'navigate');

  return (
    <div className="col" style={{ gap: 14 }}>
      {ai.provider === 'builtin' ? (
        <div className="banner" style={{ background: 'rgba(242,169,59,.10)', color: '#F5BD62' }}>
          <span>Running on the <strong>free built-in analysts</strong> (real data, fixed-format reports). For AI-written reports that answer any question, add a free <strong>GEMINI_API_KEY</strong> in Vercel → Environment Variables, then Redeploy. Still ₹0.</span>
        </div>
      ) : (
        <p className="note" style={{ margin: 0 }}>Brain: <strong>{ai.label}</strong>{ai.provider === 'gemini' ? ' · ₹0 — if the free daily limit is reached, the built-in analysts take over automatically.' : ''}</p>
      )}
      <Panel title="Your AI research team" right={<span className="mut small">Agents use live prices, 5-year backtests, filings & news</span>}>
        <div className="auto" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
          {AGENTS.map((a) => (
            <button key={a.id} type="button" onClick={() => setRole(a.id)} aria-pressed={role === a.id}
              style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 12, padding: 12, borderRadius: 8, border: `1px solid ${role === a.id ? '#F2A93B' : '#222C38'}`, background: role === a.id ? 'rgba(242,169,59,.10)' : '#10161D', color: '#E6EDF3', boxShadow: role === a.id ? '0 0 18px rgba(242,169,59,.18)' : 'none' }}>
              <span style={{ flex: '0 0 auto', width: 38, height: 38, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, background: role === a.id ? '#F2A93B' : '#151D26', color: role === a.id ? '#0A0E13' : '#F2A93B' }}>{a.icon}</span>
              <span className="col" style={{ gap: 3 }}><strong style={{ fontSize: 14 }}>{a.name}</strong><span className="mut small" style={{ lineHeight: 1.4 }}>{a.blurb}</span></span>
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); run(); }} className="col" style={{ gap: 8 }}>
          <label htmlFor="task" className="lbl">Task for the {A.name}</label>
          <textarea id="task" className="field" rows={3} value={task} onChange={(e) => setTask(e.target.value)} placeholder={A.examples[0]} style={{ padding: 12, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {A.examples.map((x) => <button key={x} type="button" className="chip" onClick={() => setTask(x)}>{x}</button>)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button type="submit" className="btn primary" disabled={!enabled || busy || !task.trim()}>{busy ? `${A.name} is working… ${elapsed}s` : 'Assign task'}</button>
            <button type="button" className={'btn' + (listening ? ' primary' : '')} onClick={dictate} aria-pressed={listening}>{listening ? '● Listening… tap to stop' : '🎙 Dictate'}</button>
            <span className="mut small">{ai.provider === 'builtin' ? 'Reports take 5–15 seconds.' : 'Deep tasks take 20–50 seconds.'} Ctrl + Enter to send.</span>
          </div>
        </form>
        {busy && (
          <div className="box col" style={{ gap: 6 }}>
            <span className="small" style={{ color: '#F5BD62' }}><span className="ldot" style={{ background: '#F2A93B', boxShadow: '0 0 10px #F2A93B', marginRight: 8 }} />{A.name} is pulling prices, running backtests{role === 'analyst' || role === 'news' ? ', reading news and filings' : ''}…</span>
          </div>
        )}
        {err && <p className="para" style={{ color: '#FF8A8A' }}>{err}</p>}
      </Panel>

      {shown && (
        <Panel title={<>{(AGENTS.find((a) => a.id === shown.role) || A).name} · report</>} live right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn small" onClick={() => speak(plainText(shown.answer))}>🔊 Read aloud</button>
            <button type="button" className="btn small" onClick={stopSpeaking}>Stop</button>
            <button type="button" className="btn small" onClick={() => { try { navigator.clipboard.writeText(shown.answer); } catch { /* ignore */ } }}>Copy</button>
          </div>
        }>
          <p className="note" style={{ margin: 0 }}>Task: “{shown.task}” · {new Date(shown.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })} IST{shown.ms ? ` · ${Math.round(shown.ms / 1000)}s` : ''}{shown.provider === 'claude' && shown.usage ? ` · ≈ $${approxCost(shown.usage).toFixed(3)}` : shown.provider ? ` · ${shown.provider === 'gemini' ? 'Gemini' : 'built-in'} · free` : ''}</p>
          <Markdown text={shown.answer} />
          {nav && <button type="button" className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => (nav.tab === 'charts' && nav.symbol ? openChart(nav.symbol) : go(nav.tab))}>Open {nav.symbol || nav.tab}</button>}
          {shown.sources && shown.sources.length > 0 && (
            <div className="col" style={{ gap: 4 }}>
              <p className="lbl">Sources</p>
              {shown.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</a>)}
            </div>
          )}
          {shown.steps && shown.steps.length > 0 && (
            <details>
              <summary className="small mut" style={{ cursor: 'pointer' }}>How the agent worked ({shown.steps.length} steps)</summary>
              <ol className="small mut" style={{ margin: '8px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {shown.steps.map((s, i) => <li key={i} className="num" style={{ color: s.kind === 'error' ? '#FF8A8A' : undefined }}>{s.text}</li>)}
              </ol>
            </details>
          )}
          <p className="note">AI analysis can be wrong and nobody can predict prices. Use it to understand and question — decisions are yours.</p>
        </Panel>
      )}

      <Panel title="Task history" right={hist.length > 0 && <button type="button" className="btn small" onClick={() => { setHist([]); saveHist([]); }}>Clear</button>}>
        {hist.length === 0 && <p className="para">Finished reports appear here (saved in this browser).</p>}
        <div className="col" style={{ gap: 0 }}>
          {hist.map((h) => (
            <button key={h.id} type="button" onClick={() => { setResult(h); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              style={{ textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid #18212B', padding: '10px 0', color: '#E6EDF3', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center' }}>
              <Pill kind="Info">{(AGENTS.find((a) => a.id === h.role) || { icon: '•' }).icon}</Pill>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{h.task}</span>
              <span className="mut tiny">{new Date(h.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
