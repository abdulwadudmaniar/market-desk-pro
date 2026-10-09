import { api } from './data.js';
import { claudeContext } from './model.js';

export function buildContext({ M, breadth, demo, watch }) {
  const ctx = claudeContext(M, breadth ? { regime: breadth.regime, adRatio: +breadth.adr.toFixed(2), niftyTodayPct: breadth.index ? +breadth.index.chg.toFixed(2) : null, live: breadth.live } : null);
  if (demo) ctx.note = 'The portfolio shown is a DEMO with sample data, not the user\'s real holdings.';
  if (watch && watch.length) ctx.watchlist = watch;
  return ctx;
}

export function runAgent({ task, role, mode = 'task', context }) {
  return api('/api/agent', { method: 'POST', body: JSON.stringify({ task, role, mode, context }) });
}

// Approximate API cost in USD (Sonnet-class pricing + web searches). Shown so the owner can keep an eye on spend.
export const approxCost = (u) => (u ? (u.input * 2 + u.output * 10) / 1e6 + (u.searches || 0) * 0.01 : 0);

let speaking = false;
export function speak(text, on = true) {
  if (!on || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).slice(0, 600));
    const v = window.speechSynthesis.getVoices().find((x) => /en[-_]IN/i.test(x.lang)) || window.speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    u.rate = 1.03;
    speaking = true;
    u.onend = () => { speaking = false; };
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}
export const stopSpeaking = () => { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } speaking = false; };
export const isSpeaking = () => speaking;

export const SpeechRec = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
