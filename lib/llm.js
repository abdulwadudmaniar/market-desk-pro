// Picks the AI "brain" for the agents, voice and Ask box.
//   1. Google Gemini  — FREE tier (no card). Set GEMINI_API_KEY.
//   2. Claude         — paid, optional later. Set ANTHROPIC_API_KEY.
//   3. Built-in       — no key at all: rule-based analysts using the same market tools. Always free.
// AI_PROVIDER=gemini|claude|builtin forces one.
import { claude } from './claude.js';

export function aiProvider() {
  const f = String(process.env.AI_PROVIDER || '').toLowerCase();
  if (f === 'builtin') return 'builtin';
  if (f === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
  if (f === 'claude' && process.env.ANTHROPIC_API_KEY) return 'claude';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  return 'builtin';
}

export const AI_LABEL = { gemini: 'Google Gemini (free tier)', claude: 'Claude', builtin: 'Built-in analyst (free, no AI key)' };

// ---------- Gemini (REST, no SDK) ----------
const G_BASE = () => process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
const G_MODELS = () => Array.from(new Set([process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash'].filter(Boolean)));
let goodModel = null;

export async function gemini(body, { timeoutMs = 45000 } = {}) {
  const models = goodModel ? [goodModel] : G_MODELS();
  let lastErr;
  for (const m of models) {
    const r = await fetch(`${G_BASE()}/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { goodModel = m; return j; }
    const msg = (j.error && j.error.message) || `Gemini API error ${r.status}`;
    lastErr = Object.assign(new Error(r.status === 429 ? 'Free AI quota reached for now (Gemini limit) — try again in a minute.' : msg), { status: r.status });
    if (r.status !== 404) break; // only try the next model name if this one doesn't exist
  }
  throw lastErr;
}

// Anthropic-style JSON schema → Gemini OpenAPI subset
export function toGeminiSchema(s) {
  if (!s || typeof s !== 'object') return s;
  const out = {};
  if (s.type) out.type = String(s.type).toUpperCase();
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.minimum != null) out.minimum = s.minimum;
  if (s.maximum != null) out.maximum = s.maximum;
  if (s.items) out.items = toGeminiSchema(s.items);
  if (s.properties) out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
  if (s.required) out.required = s.required;
  return out;
}

export const geminiText = (j) => ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');

// One-shot text answer from whichever AI is configured (used by /api/ask).
export async function aiText({ system, user, maxTokens = 700 }) {
  const p = aiProvider();
  if (p === 'gemini') {
    const j = await gemini({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { maxOutputTokens: Math.max(maxTokens * 4, 3000) } });
    return geminiText(j);
  }
  if (p === 'claude') {
    const j = await claude({ max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] });
    return (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  }
  throw Object.assign(new Error('No AI key set. Add a free GEMINI_API_KEY in Vercel to enable free-form answers.'), { status: 400 });
}
