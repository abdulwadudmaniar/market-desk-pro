// /api/ask — sends the question plus a compact portfolio summary to the Claude API.
import { send, readJson } from '../lib/http.js';
import { requireSession } from '../lib/auth.js';

const SYSTEM = `You are the analyst inside "Market Desk Pro", a personal dashboard for a young investor in Indian equities (NSE/BSE) who is learning the market.
Use ONLY the portfolio and market data provided in <context> plus general financial knowledge. Amounts are in Indian rupees (₹); use Indian number formatting.
Explain in plain language, short paragraphs, and define any jargon the first time you use it. Be specific to his holdings and numbers.
Explain risk, trade-offs and what to watch; do not tell him to buy or sell a specific security, and do not invent prices, news or numbers you were not given.
If the data needed to answer is missing, say what is missing. Keep answers under about 180 words unless asked for more.`;

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return send(res, 400, { error: 'Ask Claude is off: add ANTHROPIC_API_KEY on the server.' });
  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { error: 'Bad request' }); }
  const question = String(body.question || '').slice(0, 1500).trim();
  if (!question) return send(res, 400, { error: 'Type a question first.' });
  const context = JSON.stringify(body.context || {}).slice(0, 30000);

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: 'user', content: `<context>${context}</context>\n\nQuestion: ${question}` }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return send(res, 502, { error: (j.error && j.error.message) || `Claude API error ${r.status}` });
  const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  send(res, 200, { answer: text });
}
