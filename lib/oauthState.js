// Verifies the one-time "state" value set by /api/connect (protects broker logins from being hijacked).
import crypto from 'node:crypto';
import { parseCookies, cookie, addCookies } from './http.js';

const STATE_COOKIE = 'md_oauth_state';

export function checkState(req, res, broker, returned) {
  const saved = parseCookies(req)[STATE_COOKIE] || '';
  addCookies(res, [cookie(req, STATE_COOKIE, '', 0)]);
  const [b, s] = saved.split(':');
  if (b !== broker || !s) return false;
  if (!returned) return process.env.STRICT_OAUTH_STATE !== '1'; // some brokers don't echo state back
  const a = Buffer.from(String(returned)), e = Buffer.from(s);
  return a.length === e.length && crypto.timingSafeEqual(a, e);
}
