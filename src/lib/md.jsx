// Tiny, safe Markdown renderer → React elements (no innerHTML, so model output can't inject HTML).
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

function inline(text, keyBase) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|`[^`]+`|(?<![A-Za-z0-9])_[^_\n]+_(?![A-Za-z0-9]))/g;
  let last = 0, m, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={keyBase + k++} style={{ color: '#F5F7FA' }}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('_')) out.push(<em key={keyBase + k++} style={{ color: '#9FB0C0' }}>{t.slice(1, -1)}</em>);
    else if (t.startsWith('`')) out.push(<code key={keyBase + k++} className="num" style={{ background: '#151D26', padding: '0 4px', borderRadius: 3 }}>{t.slice(1, -1)}</code>);
    else {
      const mm = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const href = mm && safeUrl(mm[2]);
      out.push(href ? <a key={keyBase + k++} href={href} target="_blank" rel="noopener noreferrer nofollow">{mm[1]}</a> : t);
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let list = null, para = [];
  const flushPara = () => { if (para.length) { blocks.push({ t: 'p', text: para.join(' ') }); para = []; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^#{1,4}\s+(.*)$/);
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (h) { flushPara(); flushList(); blocks.push({ t: 'h', text: h[1].replace(/\*\*/g, '') }); continue; }
    if (li) { flushPara(); if (!list) list = { t: 'ul', items: [] }; list.items.push(li[1]); continue; }
    flushList(); para.push(line.trim());
  }
  flushPara(); flushList();
  return (
    <div className="col" style={{ gap: 10, fontSize: 14, lineHeight: 1.6, color: '#D7E0E8' }}>
      {blocks.map((b, i) => {
        if (b.t === 'h') return <h3 key={i} style={{ margin: '6px 0 0', fontFamily: "'Chakra Petch', sans-serif", fontSize: 15, letterSpacing: '.06em', textTransform: 'uppercase', color: '#F5BD62' }}>{b.text}</h3>;
        if (b.t === 'ul') return <ul key={i} style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>{b.items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}-`)}</li>)}</ul>;
        return <p key={i} style={{ margin: 0 }}>{inline(b.text, `${i}-`)}</p>;
      })}
    </div>
  );
}

export const plainText = (t) => String(t || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*#`>]/g, '').replace(/(^|\s)_([^_]+)_/g, '$1$2').replace(/^\s*[-•]\s+/gm, '').replace(/\n{2,}/g, '. ').replace(/\s+/g, ' ').trim();
