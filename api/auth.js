// /api/auth?action=me | login | logout
import { send, query, readJson, cookie, addCookies } from '../lib/http.js';
import {
  SESSION_COOKIE, BROKER_COOKIES, configError, isLoggedIn, makeSession, sessionMaxAge, passwordMatches,
  totpEnabled, totpValid, clientIp, lockedFor, recordFailure, clearFailures, sameOrigin,
} from '../lib/auth.js';

export default async function handler(req, res) {
  const { action } = query(req);
  const cfg = configError();

  if (action === 'me') {
    if (cfg) return send(res, 200, { loggedIn: false, configError: cfg });
    return send(res, 200, { loggedIn: isLoggedIn(req), totp: totpEnabled() });
  }

  if (action === 'login') {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    if (cfg) return send(res, 500, { error: cfg });
    if (!sameOrigin(req)) return send(res, 403, { error: 'Blocked request.' });
    const ip = clientIp(req);
    const wait = lockedFor(ip);
    if (wait) return send(res, 429, { error: `Too many wrong attempts. Try again in ${wait} minute${wait > 1 ? 's' : ''}.` });
    let body = {};
    try { body = await readJson(req); } catch { /* ignore */ }
    const okPw = passwordMatches(body.password);
    const okCode = totpValid(body.code);
    if (!okPw || !okCode) {
      recordFailure(ip);
      await new Promise((r) => setTimeout(r, 900));
      return send(res, 401, { error: totpEnabled() ? 'Wrong password or authenticator code.' : 'Wrong password.' });
    }
    clearFailures(ip);
    addCookies(res, [cookie(req, SESSION_COOKIE, makeSession(), sessionMaxAge())]);
    return send(res, 200, { ok: true });
  }

  if (action === 'logout') {
    addCookies(res, [SESSION_COOKIE, ...Object.values(BROKER_COOKIES)].map((n) => cookie(req, n, '', 0)));
    return send(res, 200, { ok: true });
  }

  return send(res, 400, { error: 'Unknown action' });
}
