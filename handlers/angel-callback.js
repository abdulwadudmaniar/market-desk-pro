// Angel One redirects here after login: /api/angel-callback?auth_token=...&feed_token=...&refresh_token=...
import { query, redirect, cookie, addCookies } from '../lib/http.js';
import { isLoggedIn, seal, nextIstTime, BROKER_COOKIES } from '../lib/auth.js';
import { checkState } from '../lib/oauthState.js';

export default async function handler(req, res) {
  if (!isLoggedIn(req)) return redirect(res, '/');
  const q = query(req);
  if (!checkState(req, res, 'angel', q.state)) return redirect(res, '/#connect?err=' + encodeURIComponent('Angel One login expired or did not start here. Try Connect again.'));
  const token = q.auth_token || q.jwtToken || q.token;
  if (!token || token.length < 20) return redirect(res, '/#connect?err=' + encodeURIComponent('Angel One login was cancelled.'));
  const exp = nextIstTime(5, 0);
  addCookies(res, [cookie(req, BROKER_COOKIES.angel, seal({ t: token, exp }), Math.floor((exp - Date.now()) / 1000))]);
  return redirect(res, '/#connect?ok=angel');
}
