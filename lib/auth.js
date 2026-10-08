// App login (password + optional authenticator code), sessions and encrypted broker tokens.
// Uses only Node's built-in crypto.
import crypto from 'node:crypto';
import { parseCookies, send } from './http.js';

export const SESSION_COOKIE = 'md_session';
export const BROKER_COOKIES = { kite: 'md_kite', upstox: 'md_upstox', angel: 'md_angel' };

export function configError() {
  if (!process.env.APP_PASSWORD) return 'APP_PASSWORD is not set on the server.';
  if (process.env.APP_PASSWORD.length < 10) return 'APP_PASSWORD must be at least 10 characters.';
  if ((process.env.SESSION_SECRET || '').length < 32) return 'SESSION_SECRET must be set to a random string of at least 32 characters.';
  if (process.env.TOTP_SECRET && base32Decode(process.env.TOTP_SECRET).length < 10) return 'TOTP_SECRET is not a valid base32 key.';
  return null;
}

function secret() {
  const s = process.env.SESSION_SECRET || '';
  if (s.length < 32) throw new Error('SESSION_SECRET missing');
  return s;
}

const sessionDays = () => Math.min(30, Math.max(1, Number(process.env.SESSION_DAYS || 7)));
const sessionVersion = () => String(process.env.SESSION_VERSION || '1');

// ---------------- sessions ----------------
export function makeSession() {
  const payload = Buffer.from(JSON.stringify({ u: 'owner', v: sessionVersion(), iat: Date.now(), exp: Date.now() + sessionDays() * 864e5, n: crypto.randomBytes(8).toString('hex') })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
export const sessionMaxAge = () => sessionDays() * 86400;

export function validSession(token) {
  try {
    if (!token) return false;
    const [payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
    if (!sig || sig.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return d.exp > Date.now() && d.v === sessionVersion();
  } catch {
    return false;
  }
}

export function isLoggedIn(req) {
  return validSession(parseCookies(req)[SESSION_COOKIE]);
}

export function requireSession(req, res) {
  if (!isLoggedIn(req)) { send(res, 401, { error: 'Please log in again.' }); return false; }
  if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) { send(res, 403, { error: 'Blocked: request did not come from this app.' }); return false; }
  return true;
}

// Blocks cross-site form/fetch attacks: state-changing requests must come from our own pages.
export function sameOrigin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  const src = req.headers.origin || req.headers.referer;
  if (!src) return false;
  try { return new URL(src).host.toLowerCase() === host; } catch { return false; }
}

// ---------------- password ----------------
export function passwordMatches(input) {
  const a = crypto.createHash('sha256').update(String(input || '')).digest();
  const b = crypto.createHash('sha256').update(String(process.env.APP_PASSWORD || '')).digest();
  return crypto.timingSafeEqual(a, b) && !!process.env.APP_PASSWORD;
}

// ---------------- authenticator app (TOTP, RFC 6238) ----------------
export const totpEnabled = () => !!process.env.TOTP_SECRET;

function base32Decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(s || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0;
  const out = [];
  for (const ch of clean) {
    val = (val << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function totpAt(key, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, '0');
  return code;
}

const usedCodes = new Map(); // code+step -> time, blocks replay within this instance
export function totpValid(code) {
  if (!totpEnabled()) return true;
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  const key = base32Decode(process.env.TOTP_SECRET);
  const step = Math.floor(Date.now() / 30000);
  for (const d of [-1, 0, 1]) {
    const expect = totpAt(key, step + d);
    if (crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(c))) {
      const id = `${c}:${step + d}`;
      if (usedCodes.has(id)) return false;
      usedCodes.set(id, Date.now());
      for (const [k, t] of usedCodes) if (Date.now() - t > 120000) usedCodes.delete(k);
      return true;
    }
  }
  return false;
}

// ---------------- brute-force protection ----------------
// Per-IP counter: 5 wrong attempts → 15-minute lock. (Best effort: serverless instances don't share memory.)
const attempts = new Map();
export function clientIp(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}
export function lockedFor(ip) {
  const a = attempts.get(ip);
  return a && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 60000) : 0;
}
export function recordFailure(ip) {
  const a = attempts.get(ip) || { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= 5) { a.until = Date.now() + 15 * 60000; a.n = 0; }
  attempts.set(ip, a);
}
export function clearFailures(ip) { attempts.delete(ip); }

// ---------------- broker tokens ----------------
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
  const out = {};
  for (const [k, name] of Object.entries(BROKER_COOKIES)) out[k] = c[name] ? unseal(c[name]) : null;
  return out;
}

// Broker access tokens expire every morning (Kite ~06:00 IST, Upstox ~03:30 IST, Angel One at midnight-ish).
export function nextIstTime(hour, minute) {
  const IST = 5.5 * 3600e3;
  const nowIst = new Date(Date.now() + IST);
  const t = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate(), hour, minute));
  if (t.getTime() <= nowIst.getTime()) t.setUTCDate(t.getUTCDate() + 1);
  return t.getTime() - IST;
}
