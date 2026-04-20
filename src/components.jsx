/* ------------------------------------------------------------------
 * Shared primitives
 * ------------------------------------------------------------------ */
const { useState, useEffect, useRef, useMemo } = React;

function Chip({ tone='', children, dot=true, className='' }) {
  return (
    <span className={`chip ${tone} ${className}`}>
      {dot && <span className="dot" />}
      <span>{children}</span>
    </span>
  );
}

function Bar({ value, tone='' }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`bar ${tone}`}><span style={{ width: v + '%' }} /></div>
  );
}

/* deterministic 2-letter glyph for striped placeholder squares */
function Logo({ name }) {
  const seed = (name || '??').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  const letters = seed.slice(0,2) || '??';
  return <div className="logo-sq" aria-hidden>{letters}</div>;
}

/* tiny sparkline svg from a list of 0–100 numbers */
function Spark({ data, tone='accent' }) {
  const pts = data.map((v,i) => `${(i/(data.length-1))*100},${100 - v}`).join(' ');
  const stroke = tone === 'ok' ? 'var(--ok)' : tone === 'bad' ? 'var(--bad)' : 'var(--accent)';
  return (
    <svg className="spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* stats strip */
function StatStrip({ stats }) {
  return (
    <div className="stats">
      {stats.map((s,i) => (
        <div key={i} className="stat">
          <div className="stat-k">{s.k}</div>
          <div className="stat-v mono">{s.v}{s.u && <span className="u">{s.u}</span>}</div>
          {s.d && <div className="stat-d">{s.d}</div>}
        </div>
      ))}
    </div>
  );
}

/* section card */
function Sec({ title, sub, actions, children }) {
  return (
    <div className="sec">
      <div className="sec-hd">
        <div className="sec-ttl">{title}</div>
        {sub && <div className="sec-sub">{sub}</div>}
        <div className="spacer" />
        {actions}
      </div>
      <div className="sec-body">{children}</div>
    </div>
  );
}

function Modal({ open, onClose, title, sub, width = 560, footer, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="vh-modal-backdrop" onClick={() => onClose?.()}>
      <div className="vh-modal" style={{ width }} onClick={(e) => e.stopPropagation()}>
        <div className="vh-modal-hd">
          <div>
            <div className="vh-modal-ttl">{title}</div>
            {sub && <div className="vh-modal-sub">{sub}</div>}
          </div>
          <button className="copy-btn" onClick={() => onClose?.()}>close</button>
        </div>
        <div className="vh-modal-body">{children}</div>
        {footer && <div className="vh-modal-ft">{footer}</div>}
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="vh-field">
      <span className="vh-field-label">{label}</span>
      {children}
      {hint && <span className="vh-field-hint">{hint}</span>}
    </label>
  );
}

function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'confirm', tone = '' }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={460}
      footer={(
        <>
          <button className="copy-btn" onClick={onClose}>cancel</button>
          <span style={{ flex: 1 }} />
          <button className={`rowbtn ${tone}`} onClick={onConfirm}>{confirmLabel}</button>
        </>
      )}
    >
      <div style={{ fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.55 }}>{body}</div>
    </Modal>
  );
}

/* live agent log — subscribes to /api/log/stream via EventSource */
function AgentLog() {
  const [lines, setLines] = useState(() => (window.AGENT_LOG || []).slice(-14));
  const ref = useRef(null);

  useEffect(() => {
    let es = null;
    let closed = false;

    const connect = () => {
      const feedOn = (document.documentElement.getAttribute('data-feed') || 'on') === 'on';
      if (!feedOn) return;
      try {
        es = new EventSource('/api/log/stream');
        es.addEventListener('log', (ev) => {
          try {
            const row = JSON.parse(ev.data);
            setLines((prev) => [...prev, row].slice(-14));
          } catch {}
        });
        es.onerror = () => {
          if (closed) return;
          es?.close();
          es = null;
          setTimeout(connect, 3000);
        };
      } catch (e) {
        console.warn('[AgentLog] SSE unavailable:', e.message);
      }
    };

    const onFeedChange = () => {
      const on = (document.documentElement.getAttribute('data-feed') || 'on') === 'on';
      if (on && !es) connect();
      if (!on && es) { es.close(); es = null; }
    };
    const mo = new MutationObserver(onFeedChange);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-feed'] });

    connect();
    return () => {
      closed = true;
      mo.disconnect();
      es?.close();
    };
  }, []);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <div className="log" ref={ref}>
      {lines.map((l, i) => (
        <div className="l" key={l.id ?? i}>
          <span className="ts">{l.ts}</span>
          <span className={`lv ${l.lv}`}>[{String(l.lv || 'info').toUpperCase()}]</span>
          <span>{l.text}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Chip, Bar, Logo, Spark, StatStrip, Sec, Modal, Field, ConfirmDialog, AgentLog });
