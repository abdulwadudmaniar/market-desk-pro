// Run anywhere with Node 18+:  node server.js   (reads settings from .env)
// Serves the built app from /public and the same /api handlers Vercel uses.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (no dependency).
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain' };
const API = new Set(['auth', 'status', 'connect', 'kite-callback', 'upstox-callback', 'portfolio', 'market', 'history', 'ask', 'resolve', 'angel-callback', 'chart', 'news']);

const SECURITY_HEADERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).headers[0].headers;

const server = http.createServer(async (req, res) => {
  try {
    for (const h of SECURITY_HEADERS) {
      if (h.key === 'Strict-Transport-Security' && !String(req.headers['x-forwarded-proto'] || '').includes('https')) continue;
      if (h.key === 'Content-Security-Policy' && !String(req.headers['x-forwarded-proto'] || '').includes('https')) { res.setHeader(h.key, h.value.replace('; upgrade-insecure-requests', '')); continue; }
      res.setHeader(h.key, h.value);
    }
    const url = new URL(req.url, 'http://local');
    const m = url.pathname.match(/^\/api\/([a-z-]+)\/?$/);
    if (m) {
      if (!API.has(m[1])) { res.statusCode = 404; return res.end('Not found'); }
      const mod = await import(pathToFileURL(path.join(ROOT, 'api', m[1] + '.js')).href);
      return await mod.default(req, res);
    }
    let file = path.normalize(path.join(ROOT, 'public', decodeURIComponent(url.pathname)));
    if (!file.startsWith(path.join(ROOT, 'public'))) { res.statusCode = 403; return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) file = path.join(ROOT, 'public', 'index.html');
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); }
    res.end(JSON.stringify({ error: 'Server error' }));
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`Market Desk Pro running on http://localhost:${port}`));
