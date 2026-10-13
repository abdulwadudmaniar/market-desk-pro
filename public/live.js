// Live News Desk: polls /api/live-news, ticks the clock every second, highlights stories that just arrived.
const POLL_MS = 20_000;
const OUTLETS = ['Moneycontrol', 'Economic Times', 'Business Standard', 'Reuters'];
const SHORT = { Moneycontrol: 'MC', 'Economic Times': 'ET', 'Business Standard': 'BS', Reuters: 'Reuters' };
const TOPICS = [
  ['all', 'All'], ['mine', 'My stocks'], ['policy', 'Policy & economy'], ['global', 'Global'], ['company', 'Companies'], ['market', 'Market'],
];
const TOPIC_TAGS = {
  policy: ['Policy', 'Regulation', 'Economy', 'Flows'],
  global: ['Global'],
  company: ['Earnings', 'Deal', 'Corporate action', 'Rating', 'Red flag', 'IPO'],
  market: ['Market', 'Your sector'],
};

const $ = (id) => document.getElementById(id);
const state = { data: null, symbols: [], src: 'all', topic: 'all', q: '', seen: new Set(), fresh: new Map(), firstLoad: true, unread: 0, lastOk: 0, error: '' };

// Tiny DOM helper: never uses innerHTML, so headlines can't inject markup.
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
  return el;
}
const ext = (href, cls, ...kids) => h('a', { href, class: cls, target: '_blank', rel: 'noopener noreferrer nofollow' }, ...kids);

const ago = (t) => {
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const hr = Math.floor(m / 60);
  return hr < 24 ? `${hr}h ${m % 60 ? (m % 60) + 'm ' : ''}ago` : `${Math.round(hr / 24)}d ago`;
};
const hhmm = (t) => (t ? new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : '');

// ---------- holdings (broker + imported/manual), so "your stocks" ranks first ----------
async function loadSymbols() {
  const set = new Set();
  try {
    const manual = JSON.parse(localStorage.getItem('md_manual_holdings_v1') || '[]');
    manual.forEach((m) => m && m.symbol && set.add(String(m.symbol).toUpperCase()));
  } catch { /* storage unavailable */ }
  try {
    const r = await fetch('/api/portfolio', { credentials: 'same-origin' });
    if (r.status === 401) return { signedOut: true, symbols: [] };
    const j = await r.json();
    (j.holdings || []).forEach((x) => x.symbol && set.add(x.symbol));
  } catch { /* holdings are optional */ }
  return { signedOut: false, symbols: Array.from(set) };
}

// ---------- fetch ----------
async function poll() {
  try {
    const r = await fetch(`/api/live-news?symbols=${encodeURIComponent(state.symbols.join(','))}`, { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 401) { $('signin').hidden = false; state.error = 'signed out'; return; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    $('signin').hidden = true;
    const all = d.top.concat(d.items);
    let added = 0;
    for (const it of all) {
      if (!state.seen.has(it.id)) {
        state.seen.add(it.id);
        if (!state.firstLoad) { state.fresh.set(it.id, Date.now()); added++; }
      }
    }
    state.firstLoad = false;
    if (added && document.hidden) { state.unread += added; document.title = `(${state.unread}) Live News Desk`; }
    state.data = d;
    state.lastOk = Date.now();
    state.error = '';
    render();
  } catch (e) {
    state.error = e.message || 'offline';
  }
}

// ---------- render ----------
function tagPills(it, { withNew = true } = {}) {
  const out = [];
  if (it.breaking) out.push(h('span', { class: 'pill t-brk' }, 'BREAKING'));
  if (withNew && state.fresh.has(it.id)) out.push(h('span', { class: 'pill t-new' }, 'NEW'));
  it.symbols.forEach((s) => out.push(h('span', { class: 'pill t-mine' }, s)));
  if (it.trending) out.push(h('span', { class: 'pill t-trend' }, 'TRENDING'));
  it.tags.filter((t) => !['Your stock', 'Trending', 'Tips'].includes(t)).slice(0, 2).forEach((t) => out.push(h('span', { class: 'pill t-tag' }, t)));
  return out;
}
const stamp = (t, prefix) => h('span', { class: 'mut tiny', 'data-t': t || 0, 'data-p': prefix }, prefix + ago(t));
const srcLinks = (it) => it.links.map((l) => ext(l.link, `src s-${l.source.replace(/\s+/g, '-')}`, SHORT[l.source] || l.source));

function renderBreaking(d) {
  const box = $('brk');
  box.replaceChildren(...d.breaking.slice(0, 3).map((b) => ext(b.link, '', h('span', { class: 'tagb' }, 'BREAKING'), h('span', {}, b.title))));
  box.hidden = !d.breaking.length;
}

function renderTop(d) {
  const box = $('top');
  if (!d.top.length) { box.replaceChildren(h('p', { class: 'empty' }, 'Nothing important enough to flag right now. All the latest headlines are below.')); return; }
  box.replaceChildren(...d.top.map((it, i) => h('article', { class: 'card' + (it.symbols.length ? ' mine' : '') },
    h('span', { class: 'rank', 'aria-hidden': 'true' }, String(i + 1)),
    h('div', { class: 'tags' }, tagPills(it)),
    h('h3', {}, ext(it.link, '', it.title)),
    it.why ? h('p', { class: 'why' }, it.why) : null,
    h('div', { class: 'foot' }, srcLinks(it), stamp(it.time, `· ${it.outlets.length > 1 ? it.outlets.length + ' outlets · ' : ''}`)),
  )));
  $('topnote').textContent = state.symbols.length ? `Handpicked for your ${state.symbols.length} holdings` : 'Handpicked market news · connect holdings to get stories about your stocks first';
}

function matches(it) {
  if (state.src !== 'all' && !it.outlets.includes(state.src)) return false;
  if (state.topic === 'mine' && !it.symbols.length) return false;
  if (TOPIC_TAGS[state.topic] && !it.tags.some((t) => TOPIC_TAGS[state.topic].includes(t))) return false;
  if (state.q && !it.title.toLowerCase().includes(state.q)) return false;
  return true;
}

function renderList(d) {
  const all = d.top.concat(d.items).sort((a, b) => (b.time || 0) - (a.time || 0));
  const shown = all.filter(matches).slice(0, 150);
  $('count').textContent = `${shown.length} of ${all.length} stories`;
  const list = $('list');
  if (!shown.length) { list.replaceChildren(h('p', { class: 'empty' }, state.topic === 'mine' && !state.symbols.length ? 'Connect a broker or import holdings on the dashboard to see news about your stocks.' : 'No stories match these filters right now.')); return; }
  list.replaceChildren(...shown.map((it) => h('div', { class: 'li' + (state.fresh.has(it.id) ? ' fresh' : '') },
    h('span', { class: 'tm' }, hhmm(it.time)),
    h('div', {},
      ext(it.link, 'tt', it.title),
      h('div', { class: 'meta' }, tagPills(it), srcLinks(it), stamp(it.time, '')),
    ),
  )));
}

function renderStatus(d) {
  $('status').replaceChildren(h('span', {}, 'Sources:'), ...OUTLETS.map((o) => {
    const s = d.status[o] || {};
    return h('span', {}, h('b', {}, o), ' ', s.ok ? h('span', { class: 'ok' }, `✓ ${s.count}${s.via ? ' via ' + s.via : ''}`) : h('span', { class: 'bad' }, 'unavailable right now'));
  }));
}

function renderFilters() {
  const seg = (on, label, fn) => h('button', { type: 'button', class: 'seg' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: fn }, label);
  $('f-src').replaceChildren(...[['all', 'All outlets']].concat(OUTLETS.map((o) => [o, o])).map(([v, l]) => seg(state.src === v, l, () => { state.src = v; renderFilters(); render(); })));
  $('f-topic').replaceChildren(...TOPICS.map(([v, l]) => seg(state.topic === v, l, () => { state.topic = v; renderFilters(); render(); })));
}

function render() {
  const d = state.data;
  if (!d) return;
  renderBreaking(d); renderTop(d); renderList(d); renderStatus(d);
}

// ---------- every second: clock, "updated Xs ago", relative times, fade the NEW marks ----------
function tick() {
  $('clk').textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
  const dot = $('dot');
  if (state.error && state.error !== 'signed out' && Date.now() - state.lastOk > 90_000) { dot.className = 'pulse err'; $('upd').textContent = 'Reconnecting…'; }
  else if (state.data) {
    dot.className = document.hidden ? 'pulse off' : 'pulse';
    const s = Math.round((Date.now() - state.data.at) / 1000);
    const next = Math.max(0, Math.round((state.data.nextAt - Date.now()) / 1000));
    $('upd').textContent = `Sources checked ${s < 5 ? 'just now' : s + 's ago'}${next ? ` · next in ${next}s` : ' · checking…'}`;
  }
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = (el.dataset.p || '') + ago(Number(el.dataset.t)); });
  let faded = false;
  for (const [id, at] of state.fresh) if (Date.now() - at > 5 * 60_000) { state.fresh.delete(id); faded = true; }
  if (faded) render();
}

// ---------- start ----------
let timer = null;
function schedule() { clearInterval(timer); timer = setInterval(() => { if (!document.hidden) poll(); }, POLL_MS); }
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { state.unread = 0; document.title = 'Live News Desk · Market Desk Pro'; poll(); }
});
$('q').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); if (state.data) renderList(state.data); });

renderFilters();
tick();
setInterval(tick, 1000);
loadSymbols().then(({ signedOut, symbols }) => {
  if (signedOut) { $('signin').hidden = false; $('upd').textContent = 'Signed out'; return; }
  state.symbols = symbols;
  poll();
  schedule();
  setInterval(() => loadSymbols().then((r) => { if (!r.signedOut) state.symbols = r.symbols; }), 10 * 60_000);
});
