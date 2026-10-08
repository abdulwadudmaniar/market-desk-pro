// One serverless function for every /api/<name> route (Vercel's free plan allows max 12 functions).
// Each route's code lives in /handlers/<name>.js.
import angelCallback from '../handlers/angel-callback.js';
import ask from '../handlers/ask.js';
import auth from '../handlers/auth.js';
import chart from '../handlers/chart.js';
import connect from '../handlers/connect.js';
import history from '../handlers/history.js';
import kiteCallback from '../handlers/kite-callback.js';
import market from '../handlers/market.js';
import news from '../handlers/news.js';
import portfolio from '../handlers/portfolio.js';
import resolve from '../handlers/resolve.js';
import status from '../handlers/status.js';
import upstoxCallback from '../handlers/upstox-callback.js';

export const ROUTES = {
  'angel-callback': angelCallback, ask, auth, chart, connect, history, 'kite-callback': kiteCallback,
  market, news, portfolio, resolve, status, 'upstox-callback': upstoxCallback,
};

export default async function handler(req, res) {
  const fromPath = new URL(req.url, 'http://local').pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  const name = (req.query && typeof req.query.route === 'string' && ROUTES[req.query.route]) ? req.query.route : fromPath;
  const fn = Object.prototype.hasOwnProperty.call(ROUTES, name) ? ROUTES[name] : null;
  if (!fn) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Not found' }));
  }
  try {
    return await fn(req, res);
  } catch (e) {
    console.error(name, e);
    if (!res.headersSent) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); }
    res.end(JSON.stringify({ error: 'Server error' }));
  }
}
