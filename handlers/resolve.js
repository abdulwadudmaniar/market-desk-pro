// /api/resolve — turns ISINs from an imported holdings file into NSE symbols.
import { send, readJson } from '../lib/http.js';
import { requireSession } from '../lib/auth.js';
import { symbolsForIsins } from '../lib/upstox.js';

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  let body = {};
  try { body = await readJson(req); } catch { return send(res, 400, { error: 'Bad request' }); }
  const isins = (Array.isArray(body.isins) ? body.isins : []).map(String).filter((s) => /^IN[A-Z0-9]{10}$/.test(s)).slice(0, 300);
  try {
    send(res, 200, { map: await symbolsForIsins(isins) });
  } catch (e) {
    send(res, 200, { map: {}, error: e.message });
  }
}
