// App login session + encrypted broker tokens, using only Node's built-in crypto.
import crypto from 'node:crypto';
import { parseCookies, send } from './http.js';

export const SESSION_COOKIE = 'md_session';
export const BROKER_COOKIES = { kite: 'md_kite', upstox: 'md_upstox' };

export function configError() {
  if (!process.env.APP_PASSWORD) return 'APP_PASSWORD is not set on the server.';
  if ((process.env.SESSION_SECRET || '').length < 32) return 'SESSION_SECRET must be set to a random string of at least 32 characters.';
  return null;
}

function secret() {
  const s = process.env.SESSION_SECRET || '';
  if (s.length < 32) throw new Error('SESSION_SECRET missing');
  return s;
}

export function makeSession(days = 30) {
  const payload = Buffer.from(JSON.stringify({ u: 'owner', exp: Date.now() + days * 864e5 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function validSession(token) {
  try {
    if (!token) return false;
    const [payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
    if (!sig || sig.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}

export function isLoggedIn(req) {
  return validSession(parseCookies(req)[SESSION_COOKIE]);
}

export function requireSession(req, res) {
  if (isLoggedIn(req)) return true;
  send(res, 401, { error: 'Please log in again.' });
  return false;
}

export function passwordMatches(input) {
  const a = crypto.createHash('sha256').update(String(input || '')).digest();
  const b = crypto.createHash('sha256').update(String(process.env.APP_PASSWORD || '')).digest();
  return crypto.timingSafeEqual(a, b) && !!process.env.APP_PASSWORD;
}

function tokenKey() {
  return crypto.createHash('sha256').update(secret() + ':broker-tokens').digest();
}

export function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
}

export function unseal(s) {
  try {
    const b = Buffer.from(s, 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', tokenKey(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    const o = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString());
    return o.exp > Date.now() ? o : null;
  } catch {
    return null;
  }
}

export function brokerTokens(req) {
  const c = parseCookies(req);
  return {
    kite: c[BROKER_COOKIES.kite] ? unseal(c[BROKER_COOKIES.kite]) : null,
    upstox: c[BROKER_COOKIES.upstox] ? unseal(c[BROKER_COOKIES.upstox]) : null,
  };
}

// Broker access tokens expire every morning (Kite ~06:00 IST, Upstox ~03:30 IST).
export function nextIstTime(hour, minute) {
  const IST = 5.5 * 3600e3;
  const nowIst = new Date(Date.now() + IST);
  const t = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate(), hour, minute));
  if (t.getTime() <= nowIst.getTime()) t.setUTCDate(t.getUTCDate() + 1);
  return t.getTime() - IST;
}
