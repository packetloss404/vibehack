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

const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

let modalIdCounter = 0;
let bodyScrollLockCount = 0;
let previousBodyOverflow = '';

function getModalFocusable(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(MODAL_FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  });
}

function lockBodyScroll() {
  if (bodyScrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  bodyScrollLockCount += 1;
  return () => {
    bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
    if (bodyScrollLockCount === 0) document.body.style.overflow = previousBodyOverflow;
  };
}

function useModalId(prefix) {
  const idRef = useRef('');
  if (!idRef.current) {
    modalIdCounter += 1;
    idRef.current = `${prefix}-${modalIdCounter}`;
  }
  return idRef.current;
}

function Modal({ open, onClose, title, sub, width = 560, footer, children }) {
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);
  const titleId = useModalId('vh-modal-title');
  const subId = useModalId('vh-modal-sub');

  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlockBodyScroll = lockBodyScroll();

    window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = getModalFocusable(dialog);
      const target = focusables.find((el) => el.hasAttribute('autofocus')) || focusables[0] || dialog;
      target.focus({ preventScroll: true });
    });

    const onKey = (e) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusables = getModalFocusable(dialog);
      if (!focusables.length) {
        e.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    const onFocusIn = (e) => {
      const dialog = dialogRef.current;
      if (!dialog || dialog.contains(e.target)) return;
      const focusables = getModalFocusable(dialog);
      (focusables[0] || dialog).focus({ preventScroll: true });
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      unlockBodyScroll();
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="vh-modal-backdrop" onClick={() => onClose?.()}>
      <div
        ref={dialogRef}
        className="vh-modal"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={sub ? subId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vh-modal-hd">
          <div>
            <div className="vh-modal-ttl" id={title ? titleId : undefined}>{title}</div>
            {sub && <div className="vh-modal-sub" id={subId}>{sub}</div>}
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

Object.assign(window, { Chip, Bar, Logo, StatStrip, Sec, Modal, Field, ConfirmDialog, AgentLog });
