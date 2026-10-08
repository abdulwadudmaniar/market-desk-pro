import { pts, PILL } from './lib/format.js';

export function Panel({ title, right, children, style, bodyStyle, live }) {
  return (
    <section className="pn" style={style}>
      <div className="ph">
        <h2 className="pt">{live && <span className="ldot" />}{title}</h2>
        {right}
      </div>
      <div className="pb" style={bodyStyle}>{children}</div>
    </section>
  );
}

export function Tile({ label, value, sub, valueStyle }) {
  return (
    <div className="tile">
      <p className="lbl">{label}</p>
      <span className="num" style={{ fontSize: 17, fontWeight: 600, ...valueStyle }}>{value}</span>
      {sub && <span className="mut tiny">{sub}</span>}
    </div>
  );
}

export function Pill({ kind = 'Info', children, style }) {
  return <span className="pill" style={{ ...PILL[kind], ...style }}>{children}</span>;
}

export function Seg({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {options.map((o) => {
        const v = typeof o === 'object' ? o.value : o;
        const l = typeof o === 'object' ? o.label : o;
        return <button key={String(v)} type="button" className={'seg' + (value === v ? ' on' : '')} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>;
      })}
    </div>
  );
}

export function Spark({ data, w = 96, h = 28 }) {
  if (!data || data.length < 2) return <span className="mut tiny">—</span>;
  const mn = Math.min(...data), mx = Math.max(...data);
  const up = data[data.length - 1] >= data[0];
  return (
    <svg viewBox="0 0 100 30" style={{ width: w, height: h, display: 'block', marginLeft: 'auto' }} aria-hidden="true">
      <polyline points={pts(data, 100, 30, 3, mn, mx)} fill="none" stroke={up ? '#5FE3A8' : '#FF8A8A'} strokeWidth="1.6" />
    </svg>
  );
}

export function DivBar({ v, max, pos = '#3DDC97', neg = '#FF6363', height = 10 }) {
  const w = Math.min(50, (Math.abs(v) / (max || 1)) * 50);
  return (
    <div style={{ position: 'relative', height, background: '#151D26', borderRadius: 2 }}>
      <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: '#3A4859' }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 2, width: w + '%', ...(v < 0 ? { right: '50%', background: neg } : { left: '50%', background: pos }), transition: 'width .6s ease' }} />
    </div>
  );
}

export function HBar({ p, color, h = 6 }) {
  return <div style={{ height: h, borderRadius: 2, width: Math.max(1, Math.min(100, p)) + '%', background: color, transition: 'width .6s ease' }} />;
}

export function Range({ id, label, value, display, min, max, step, onChange }) {
  return (
    <>
      <label htmlFor={id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span>{label}</span><strong className="num">{display}</strong>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </>
  );
}

export function Empty({ children }) {
  return <div className="box para" style={{ textAlign: 'center', padding: 24 }}>{children}</div>;
}

export function Legend({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12 }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 16, height: it.dashed ? 0 : 2, borderTop: it.dashed ? `2px dashed ${it.color}` : 'none', background: it.dashed ? 'none' : it.color, display: 'inline-block' }} />
          {it.label}{it.value && <span className="num" style={it.valueStyle}>{it.value}</span>}
        </span>
      ))}
    </div>
  );
}
