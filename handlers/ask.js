// /api/ask — sends the question plus a compact portfolio summary to the configured AI (Gemini free tier or Claude).
import { send, readJson } from '../lib/http.js';
import { requireSession } from '../lib/auth.js';
import { aiText, aiProvider } from '../lib/llm.js';

const SYSTEM = `You are the analyst inside "Market Desk Pro", a personal dashboard for a young investor in Indian equities (NSE/BSE) who is learning the market.
Use ONLY the portfolio and market data provided in <context> plus general financial knowledge. Amounts are in Indian rupees (₹); use Indian number formatting.
Explain in plain language, short paragraphs, and define any jargon the first time you use it. Be specific to his holdings and numbers.
Explain risk, trade-offs and what to watch; do not tell him to buy or sell a specific security, and do not invent prices, news or numbers you were not given.
If the data needed to answer is missing, say what is missing. Keep answers under about 180 words unless asked for more.`;

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (aiProvider() === 'builtin') return send(res, 400, { error: 'Free-form answers need an AI key: add a free GEMINI_API_KEY in Vercel.' });
  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { error: 'Bad request' }); }
  const question = String(body.question || '').slice(0, 1500).trim();
  if (!question) return send(res, 400, { error: 'Type a question first.' });
  const context = JSON.stringify(body.context || {}).slice(0, 30000);

  let text;
  try { text = await aiText({ system: SYSTEM, user: `<context>${context}</context>\n\nQuestion: ${question}`, maxTokens: 700 }); }
  catch (e) { return send(res, e.status === 400 ? 400 : 502, { error: e.message }); }
  send(res, 200, { answer: text });
}
