// /api/auth?action=me | login | logout
import { send, query, readJson, cookie, addCookies } from '../lib/http.js';
import { SESSION_COOKIE, BROKER_COOKIES, configError, isLoggedIn, makeSession, passwordMatches } from '../lib/auth.js';

export default async function handler(req, res) {
  const { action } = query(req);
  const cfg = configError();

  if (action === 'me') {
    if (cfg) return send(res, 500, { loggedIn: false, configError: cfg });
    return send(res, 200, { loggedIn: isLoggedIn(req) });
  }

  if (action === 'login') {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    if (cfg) return send(res, 500, { error: cfg });
    let body = {};
    try { body = await readJson(req); } catch { /* ignore */ }
    if (!passwordMatches(body.password)) {
      await new Promise((r) => setTimeout(r, 800));
      return send(res, 401, { error: 'Wrong password.' });
    }
    addCookies(res, [cookie(req, SESSION_COOKIE, makeSession(30), 30 * 86400)]);
    return send(res, 200, { ok: true });
  }

  if (action === 'logout') {
    addCookies(res, [SESSION_COOKIE, BROKER_COOKIES.kite, BROKER_COOKIES.upstox].map((n) => cookie(req, n, '', 0)));
    return send(res, 200, { ok: true });
  }

  return send(res, 400, { error: 'Unknown action' });
}
