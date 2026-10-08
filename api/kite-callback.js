// Zerodha redirects here after login: /api/kite-callback?request_token=...&status=success
import { query, redirect, cookie, addCookies } from '../lib/http.js';
import { isLoggedIn, seal, nextIstTime, BROKER_COOKIES } from '../lib/auth.js';
import { kiteCreateSession } from '../lib/kite.js';

export default async function handler(req, res) {
  if (!isLoggedIn(req)) return redirect(res, '/');
  const { request_token: rt, status } = query(req);
  if (status !== 'success' || !rt) return redirect(res, '/#connect?err=' + encodeURIComponent('Zerodha login was cancelled.'));
  try {
    const accessToken = await kiteCreateSession(rt);
    const exp = nextIstTime(6, 0);
    addCookies(res, [cookie(req, BROKER_COOKIES.kite, seal({ t: accessToken, exp }), Math.floor((exp - Date.now()) / 1000))]);
    return redirect(res, '/#connect?ok=kite');
  } catch (e) {
    return redirect(res, '/#connect?err=' + encodeURIComponent(e.message));
  }
}
