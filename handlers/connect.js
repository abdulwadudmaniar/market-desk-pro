// /api/connect?b=kite|upstox — sends the browser to the broker's own login page.
// /api/connect?b=angel — shows a small Angel One login page (newer SmartAPI keys can't use the redirect login).
// /api/connect?b=angel&action=login (POST) — signs in to Angel One with client ID + PIN + authenticator code.
// /api/connect?b=...&action=disconnect (POST) — forgets the broker token in this browser.
import crypto from 'node:crypto';
import { send, query, redirect, publicOrigin, cookie, addCookies } from '../lib/http.js';
import { isLoggedIn, sameOrigin, BROKER_COOKIES, seal, nextIstTime, clientIp, lockedFor, recordFailure, clearFailures } from '../lib/auth.js';
import { kiteConfigured, kiteLoginUrl } from '../lib/kite.js';
import { upstoxConfigured, upstoxLoginUrl } from '../lib/upstox.js';
import { angelConfigured, angelLogin } from '../lib/angel.js';

const STATE_COOKIE = 'md_oauth_state';
const NAMES = { kite: 'Zerodha', upstox: 'Upstox', angel: 'Angel One' };

export default async function handler(req, res) {
  const { b, action, err } = query(req);
  if (!isLoggedIn(req)) return redirect(res, '/');
  if (!BROKER_COOKIES[b]) return send(res, 400, { error: 'Unknown broker' });

  if (action === 'disconnect') {
    if (req.method !== 'POST' || !sameOrigin(req)) return send(res, 403, { error: 'Blocked request.' });
    addCookies(res, [cookie(req, BROKER_COOKIES[b], '', 0)]);
    return send(res, 200, { ok: true });
  }

  const configured = { kite: kiteConfigured, upstox: upstoxConfigured, angel: angelConfigured }[b]();
  if (!configured) return redirect(res, '/#connect?err=' + encodeURIComponent(`${NAMES[b]} API keys are not set on the server yet.`));

  if (b === 'angel') {
    if (action === 'login') return angelSubmit(req, res);
    return angelPage(res, err);
  }

  // One-time state value, checked on the way back, so nobody can slip their own broker account into this session.
  const state = crypto.randomBytes(16).toString('hex');
  addCookies(res, [cookie(req, STATE_COOKIE, `${b}:${state}`, 600)]);

  if (b === 'kite') return redirect(res, kiteLoginUrl());
  return redirect(res, `${upstoxLoginUrl(publicOrigin(req))}&state=${state}`);
}

async function readForm(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let s = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString() : '';
  if (!s && req.body == null) {
    const chunks = [];
    let size = 0;
    for await (const c of req) { size += c.length; if (size > 10_000) throw new Error('Too large'); chunks.push(c); }
    s = Buffer.concat(chunks).toString();
  }
  return Object.fromEntries(new URLSearchParams(s));
}

async function angelSubmit(req, res) {
  const back = (msg) => redirect(res, '/api/connect?b=angel&err=' + encodeURIComponent(msg));
  if (req.method !== 'POST' || !sameOrigin(req)) return send(res, 403, { error: 'Blocked request.' });
  const ip = clientIp(req);
  const wait = lockedFor(ip);
  if (wait) return back(`Too many attempts. Try again in ${wait} min.`);
  let f;
  try { f = await readForm(req); } catch { return back('Something went wrong. Try again.'); }
  const clientcode = String(f.clientcode || '').trim().toUpperCase();
  const pin = String(f.pin || '').trim();
  const totp = String(f.totp || '').replace(/\s/g, '');
  if (!/^[A-Z0-9]{3,20}$/.test(clientcode) || !/^\d{4,6}$/.test(pin) || !/^\d{6}$/.test(totp)) {
    return back('Enter your client ID, your 4-digit PIN and the 6-digit code from your authenticator app.');
  }
  try {
    const token = await angelLogin({ clientcode, pin, totp });
    clearFailures(ip);
    const exp = nextIstTime(5, 0);
    addCookies(res, [cookie(req, BROKER_COOKIES.angel, seal({ t: token, exp }), Math.floor((exp - Date.now()) / 1000))]);
    return redirect(res, '/#connect?ok=angel');
  } catch (e) {
    recordFailure(ip);
    return back(`Angel One said: ${e.message}`);
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function angelPage(res, err) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Connect Angel One · Market Desk Pro</title><meta name="robots" content="noindex">
<style>
*{box-sizing:border-box;margin:0}body{background:#04070B;color:#E8EEF3;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px}
main{width:100%;max-width:400px;background:#0B121A;border:1px solid #1C2733;border-radius:14px;padding:24px}
h1{font-size:20px;margin-bottom:4px}.sub{color:#8A9AA8;font-size:14px;margin-bottom:20px}
label{display:block;font-size:13px;color:#8A9AA8;margin:14px 0 6px}
input{width:100%;background:#04070B;border:1px solid #2E3A48;border-radius:8px;color:#E8EEF3;font-size:17px;padding:12px;letter-spacing:.04em}
input:focus{outline:2px solid #F2A93B;border-color:transparent}
.row{display:flex;gap:12px}.row>div{flex:1}
button{width:100%;margin-top:20px;background:#F2A93B;color:#04070B;border:0;border-radius:8px;font-size:16px;font-weight:700;padding:13px;cursor:pointer}
.err{background:rgba(240,123,110,.12);color:#F49A8F;border-radius:8px;padding:10px 12px;font-size:14px;margin-bottom:6px}
.note{color:#8A9AA8;font-size:13px;margin-top:16px}a{color:#8A9AA8}
</style></head><body><main>
<h1>Connect Angel One</h1>
<p class="sub">Read-only access to your holdings. Market Desk Pro can't place orders.</p>
${err ? `<p class="err" role="alert">${esc(err)}</p>` : ''}
<form method="post" action="/api/connect?b=angel&amp;action=login" autocomplete="off">
<label for="c">Angel One client ID</label><input id="c" name="clientcode" required autocapitalize="characters" placeholder="e.g. A12345">
<div class="row">
<div><label for="p">PIN</label><input id="p" name="pin" type="password" inputmode="numeric" maxlength="6" required></div>
<div><label for="t">Authenticator code</label><input id="t" name="totp" inputmode="numeric" maxlength="6" placeholder="6 digits" autocomplete="one-time-code" required></div>
</div>
<button type="submit">Log in to Angel One</button>
</form>
<p class="note">Your details go straight to Angel One over a secure connection. Your PIN is never saved; only today's read-only access is kept, encrypted, in this browser. You'll need to log in again each day.</p>
<p class="note"><a href="/#connect">← Back to the dashboard</a></p>
</main></body></html>`);
}
