// /api/connect?b=kite|upstox — sends the browser to the broker's own login page.
// /api/connect?b=kite|upstox&action=disconnect — forgets the broker token in this browser.
import { send, query, redirect, publicOrigin, cookie, addCookies } from '../lib/http.js';
import { isLoggedIn, BROKER_COOKIES } from '../lib/auth.js';
import { kiteConfigured, kiteLoginUrl } from '../lib/kite.js';
import { upstoxConfigured, upstoxLoginUrl } from '../lib/upstox.js';

export default async function handler(req, res) {
  const { b, action } = query(req);
  if (!isLoggedIn(req)) return redirect(res, '/');
  if (!BROKER_COOKIES[b]) return send(res, 400, { error: 'Unknown broker' });

  if (action === 'disconnect') {
    addCookies(res, [cookie(req, BROKER_COOKIES[b], '', 0)]);
    return send(res, 200, { ok: true });
  }

  if (b === 'kite') {
    if (!kiteConfigured()) return redirect(res, '/#connect?err=' + encodeURIComponent('Zerodha API keys are not set on the server yet.'));
    return redirect(res, kiteLoginUrl());
  }
  if (!upstoxConfigured()) return redirect(res, '/#connect?err=' + encodeURIComponent('Upstox API keys are not set on the server yet.'));
  return redirect(res, upstoxLoginUrl(publicOrigin(req)));
}
