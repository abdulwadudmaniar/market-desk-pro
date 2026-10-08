// Upstox redirects here after login: /api/upstox-callback?code=...
import { query, redirect, cookie, addCookies, publicOrigin } from '../lib/http.js';
import { isLoggedIn, seal, nextIstTime, BROKER_COOKIES } from '../lib/auth.js';
import { upstoxCreateSession } from '../lib/upstox.js';

export default async function handler(req, res) {
  if (!isLoggedIn(req)) return redirect(res, '/');
  const { code } = query(req);
  if (!code) return redirect(res, '/#connect?err=' + encodeURIComponent('Upstox login was cancelled.'));
  try {
    const accessToken = await upstoxCreateSession(code, publicOrigin(req));
    const exp = nextIstTime(3, 30);
    addCookies(res, [cookie(req, BROKER_COOKIES.upstox, seal({ t: accessToken, exp }), Math.floor((exp - Date.now()) / 1000))]);
    return redirect(res, '/#connect?ok=upstox');
  } catch (e) {
    return redirect(res, '/#connect?err=' + encodeURIComponent(e.message));
  }
}
