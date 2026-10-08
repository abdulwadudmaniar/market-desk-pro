// /api/connect?b=kite|upstox|angel — sends the browser to the broker's own login page.
// /api/connect?b=...&action=disconnect (POST) — forgets the broker token in this browser.
import crypto from 'node:crypto';
import { send, query, redirect, publicOrigin, cookie, addCookies } from '../lib/http.js';
import { isLoggedIn, sameOrigin, BROKER_COOKIES } from '../lib/auth.js';
import { kiteConfigured, kiteLoginUrl } from '../lib/kite.js';
import { upstoxConfigured, upstoxLoginUrl } from '../lib/upstox.js';
import { angelConfigured, angelLoginUrl } from '../lib/angel.js';

const STATE_COOKIE = 'md_oauth_state';
const NAMES = { kite: 'Zerodha', upstox: 'Upstox', angel: 'Angel One' };

export default async function handler(req, res) {
  const { b, action } = query(req);
  if (!isLoggedIn(req)) return redirect(res, '/');
  if (!BROKER_COOKIES[b]) return send(res, 400, { error: 'Unknown broker' });

  if (action === 'disconnect') {
    if (req.method !== 'POST' || !sameOrigin(req)) return send(res, 403, { error: 'Blocked request.' });
    addCookies(res, [cookie(req, BROKER_COOKIES[b], '', 0)]);
    return send(res, 200, { ok: true });
  }

  const configured = { kite: kiteConfigured, upstox: upstoxConfigured, angel: angelConfigured }[b]();
  if (!configured) return redirect(res, '/#connect?err=' + encodeURIComponent(`${NAMES[b]} API keys are not set on the server yet.`));

  // One-time state value, checked on the way back, so nobody can slip their own broker account into this session.
  const state = crypto.randomBytes(16).toString('hex');
  addCookies(res, [cookie(req, STATE_COOKIE, `${b}:${state}`, 600)]);

  if (b === 'kite') return redirect(res, kiteLoginUrl());
  if (b === 'angel') return redirect(res, `${angelLoginUrl()}&state=${state}`);
  return redirect(res, `${upstoxLoginUrl(publicOrigin(req))}&state=${state}`);
}
