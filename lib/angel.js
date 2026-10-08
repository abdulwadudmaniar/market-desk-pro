// Angel One SmartAPI — read-only holdings via the official publisher login.
// Docs: https://smartapi.angelone.in/docs
const BASE = process.env.ANGEL_BASE_URL || 'https://apiconnect.angelone.in';

export const angelConfigured = () => !!process.env.ANGEL_API_KEY;

export function angelLoginUrl() {
  const login = process.env.ANGEL_LOGIN_URL || 'https://smartapi.angelone.in/publisher-login';
  return `${login}?api_key=${encodeURIComponent(process.env.ANGEL_API_KEY)}`;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': '127.0.0.1',
    'X-MACAddress': '00:00:00:00:00:00',
    'X-PrivateKey': process.env.ANGEL_API_KEY,
  };
}

export async function angelHoldings(token) {
  const r = await fetch(`${BASE}/rest/secure/angelbroking/portfolio/v1/getHolding`, { headers: headers(token), cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.status === false) {
    throw Object.assign(new Error(j.message || `Angel One error ${r.status}`), { status: r.status === 200 ? 401 : r.status });
  }
  return (j.data || []).map((x) => ({
    broker: 'Angel One',
    symbol: String(x.tradingsymbol || '').replace(/-(EQ|BE|BZ|SM|ST)$/i, ''),
    exchange: x.exchange,
    isin: x.isin,
    qty: Number(x.quantity || 0) + Number(x.t1quantity || 0),
    avg: Number(x.averageprice || 0),
    ltp: Number(x.ltp || 0),
    prevClose: Number(x.close || x.ltp || 0),
  }));
}
