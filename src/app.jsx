/* ------------------------------------------------------------------
 * App shell — sidebar + header + module router
 * ------------------------------------------------------------------ */

function Sidebar({ route, go }) {
  const modules = [
    { k:'entries',   l:'Submissions',  kbd:'G E' },
    { k:'overview',  l:'Overview',     kbd:'G O' },
    { k:'credits',   l:'Credit hunter',kbd:'G C' },
    { k:'scratch',   l:'Scratchpad',   kbd:'G S' },
    { k:'admin',     l:'Admin',        kbd:'G A' },
  ];

  const [agents, setAgents] = useState([]);
  useEffect(() => {
    let abort = false;
    const poll = async () => {
      try {
        const r = await fetch('/api/workers/status');
        const rows = await r.json();
        if (!abort) { setAgents(rows); window.__vh_agents = rows; }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => { abort = true; clearInterval(id); };
  }, []);

  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-logo">V</div>
        <div className="sb-wordmark">vibehack<span className="dim">/cmd</span></div>
      </div>

      <div className="sb-section">Modules</div>
      <nav className="sb-nav">
        {modules.map(m => (
          <div key={m.k} className="sb-item" aria-current={route===m.k} onClick={() => go(m.k)}>
            <span className="dot" />
            <span>{m.l}</span>
            <span className="k">{m.kbd}</span>
          </div>
        ))}
      </nav>

      <div className="sb-footer">
        <span className="pulse" />
        <span>{agents.some(a=>a.state==='error') ? 'admin needs attention' : 'all systems green'}</span>
        <span style={{marginLeft:'auto', color:'var(--fg-4)'}}>v0.3.1</span>
      </div>
    </aside>
  );
}

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!open) return;
    let abort = false;
    (async () => {
      try {
        const r = await fetch('/api/log?limit=10');
        const rows = await r.json();
        if (!abort) setItems(rows.slice(-8).reverse());
      } catch {}
    })();
    return () => { abort = true; };
  }, [open]);

  const unseen = (window.CREDITS || []).filter(c => c.unread).length;

  return (
    <div style={{position:'relative'}}>
      <button className="btn" onClick={() => setOpen(o => !o)}>notifications · {unseen}</button>
      {open && (
        <div style={{
          position:'absolute', right:0, top:'calc(100% + 6px)', zIndex:40,
          width:380, background:'var(--bg)', border:'1px solid var(--border-2)',
          borderRadius:8, boxShadow:'0 10px 30px -10px oklch(0% 0 0 / 0.12)',
          fontFamily:'var(--mono)', fontSize:11.5
        }}>
          <div style={{padding:'10px 12px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center'}}>
            <b>Recent activity</b>
            <span style={{flex:1}} />
            <span className="dim" style={{fontSize:10.5, cursor:'pointer'}} onClick={() => setOpen(false)}>close</span>
          </div>
          <div style={{maxHeight:320, overflow:'auto'}}>
            {items.length === 0 && <div style={{padding:14, color:'var(--fg-3)'}}>no activity yet</div>}
            {items.map(l => (
              <div key={l.id} style={{padding:'8px 12px', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'60px 52px 1fr', gap:8}}>
                <span style={{color:'var(--fg-4)'}}>{l.ts}</span>
                <span className={`lv ${l.lv}`} style={{color: l.lv==='ok'?'var(--ok)':l.lv==='bad'?'var(--bad)':l.lv==='warn'?'var(--warn)':'var(--fg-3)'}}>[{l.lv.toUpperCase()}]</span>
                <span style={{color:'var(--fg-2)'}}>{l.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TopBar({ route }) {
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [quickCapture, setQuickCapture] = useState({ ttl:'', tag:'inbox', body:'' });
  const crumbs = {
    overview: ['Home','Overview'],
    entries: ['Home','Submissions'],
    credits: ['Home','Credit hunter','Inbox'],
    scratch: ['Home','Scratchpad'],
    admin: ['Home','Admin'],
  }[route] || ['Home'];

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setSearchOpen(true);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    if (!search || search.length < 2) return null;
    const q = search.toLowerCase();
    const hit = (s) => String(s || '').toLowerCase().includes(q);
    return [
      ...(window.ENTRIES || []).filter(e => hit(e.title) || hit(e.project) || hit(e.contest_name) || hit(e.hack)).slice(0,5).map(e => ({ kind:'submission', label: e.title, sub: [e.contest_name || e.hack, e.stage].filter(Boolean).join(' · ') })),
      ...(window.HACKS || []).filter(h => !h.hidden && (hit(h.name) || hit(h.code) || hit(h.host) || hit(h.website))).slice(0,5).map(h => ({ kind:'hack', label: `${h.code} · ${h.name}`, sub: [h.host, h.website].filter(Boolean).join(' · ') })),
      ...(window.CREDITS || []).filter(c => hit(c.subject) || hit(c.from) || hit(c.provider)).slice(0,5).map(c => ({ kind:'credit', label: c.subject, sub: `${c.provider} · ${c.value}` })),
      ...(window.NOTES || []).filter(n => hit(n.ttl) || hit(n.body)).slice(0,5).map(n => ({ kind:'note', label: n.ttl, sub: n.tag })),
    ];
  }, [search]);

  const submitQuickCapture = async (e) => {
    e.preventDefault();
    if (!quickCapture.ttl.trim()) return;
    await window.__vh_mut('/api/notes', { body: { ttl: quickCapture.ttl.trim(), tag: quickCapture.tag.trim() || 'inbox', body: quickCapture.body } });
    setQuickCapture({ ttl:'', tag:'inbox', body:'' });
    setQuickCaptureOpen(false);
  };

  return (
    <div className="hd">
      <div className="crumb mono">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i>0 && <span style={{opacity:0.4, margin:'0 6px'}}>/</span>}
            {i === crumbs.length - 1 ? <b>{c}</b> : <span>{c}</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="hd-search" style={{cursor:'pointer'}} onClick={() => setSearchOpen(true)}>
        <span>⌕</span>
        <span>search submissions, contests, credits…</span>
        <span style={{flex:1}} />
        <span className="kbd">⌘K</span>
      </div>
      <div className="hd-right">
        <NotificationsBell />
        <button className="btn" onClick={async () => {
          try { await navigator.clipboard?.writeText(window.location.href); } catch {}
          window.__vh_toast?.('Link copied', 'ok');
        }}>share</button>
        <button className="btn btn-primary" onClick={() => setQuickCaptureOpen(true)}>+ quick capture</button>
      </div>

      {searchOpen && (
        <div onClick={() => setSearchOpen(false)} style={{
          position:'fixed', inset:0, background:'oklch(20% 0 0 / 0.25)', zIndex:50,
          display:'flex', justifyContent:'center', alignItems:'flex-start', paddingTop:'12vh'
        }}>
          <div onClick={(e)=>e.stopPropagation()} style={{
            width:560, background:'var(--bg)', borderRadius:10, border:'1px solid var(--border-2)',
            boxShadow:'0 20px 60px -10px oklch(0% 0 0 / 0.25)', overflow:'hidden'
          }}>
            <div style={{padding:'12px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10}}>
              <span className="mono" style={{color:'var(--fg-3)'}}>⌕</span>
               <input autoFocus value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="search submissions, contests, credits, notes…"
                      style={{flex:1, border:0, outline:'none', fontSize:14, background:'transparent', color:'var(--fg)'}} />
              <span className="kbd">esc</span>
            </div>
            <div style={{maxHeight:400, overflow:'auto'}}>
              {results === null && <div className="dim" style={{padding:14, fontSize:12}}>type at least 2 characters</div>}
              {results && results.length === 0 && <div className="dim" style={{padding:14, fontSize:12}}>no matches</div>}
              {results && results.map((r,i) => (
                <div key={i} style={{padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'60px 1fr', gap:12}}>
                  <span className="mono" style={{fontSize:10.5, color:'var(--fg-3)', textTransform:'uppercase'}}>{r.kind}</span>
                  <div>
                    <div style={{fontWeight:500, fontSize:13}}>{r.label}</div>
                    <div className="mono" style={{fontSize:11, color:'var(--fg-3)', marginTop:2}}>{r.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Modal
        open={quickCaptureOpen}
        onClose={() => setQuickCaptureOpen(false)}
        title="Quick capture"
        sub="Drop a note into the inbox without leaving your flow."
        footer={(
          <>
            <button className="copy-btn" onClick={() => setQuickCaptureOpen(false)}>cancel</button>
            <span style={{ flex: 1 }} />
            <button className="rowbtn primary" onClick={submitQuickCapture}>save note</button>
          </>
        )}
      >
        <form onSubmit={submitQuickCapture} style={{ display:'grid', gap:12 }}>
          <Field label="Title">
            <input autoFocus value={quickCapture.ttl} onChange={(e) => setQuickCapture((prev) => ({ ...prev, ttl: e.target.value }))} placeholder="What do you want to remember?" />
          </Field>
          <Field label="Tag">
            <input value={quickCapture.tag} onChange={(e) => setQuickCapture((prev) => ({ ...prev, tag: e.target.value }))} placeholder="inbox" />
          </Field>
          <Field label="Body">
            <textarea value={quickCapture.body} onChange={(e) => setQuickCapture((prev) => ({ ...prev, body: e.target.value }))} placeholder="Optional notes" />
          </Field>
          <button type="submit" style={{ display:'none' }} />
        </form>
      </Modal>
    </div>
  );
}

function App() {
  const [route, setRoute] = useState(() => {
    const saved = localStorage.getItem('vh:route') || 'entries';
    if (saved === 'discovery' || saved === 'sources') return 'admin';
    return saved;
  });
  const [, bump] = useState(0);
  useEffect(() => { localStorage.setItem('vh:route', route); }, [route]);
  useEffect(() => {
    const h = () => bump(v => v + 1);
    window.addEventListener('vh:refresh', h);
    return () => window.removeEventListener('vh:refresh', h);
  }, []);
  const go = (k) => setRoute(k);

  // Keyboard shortcuts — G then E/O/C/S/A
  useEffect(() => {
    let gPending = 0;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'g' || e.key === 'G') { gPending = Date.now(); return; }
      if (gPending && Date.now() - gPending < 1200) {
        const m = { e:'entries', o:'overview', c:'credits', s:'scratch', a:'admin', d:'admin', m:'admin' }[e.key.toLowerCase()];
        if (m) { setRoute(m); e.preventDefault(); gPending = 0; }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Sidebar route={route} go={go} />
      <main className="main" data-screen-label={'VH · ' + route}>
        <TopBar route={route} />
        {route === 'entries'   && <Entries />}
        {route === 'overview'  && <Overview go={go} />}
        {route === 'credits'   && <Credits />}
        {route === 'scratch'   && <Scratchpad />}
        {route === 'admin'     && <AdminPanel />}
      </main>
    </>
  );
}

window.__vh_bootstrap().then(() => {
  ReactDOM.createRoot(document.getElementById('app')).render(<App />);
});
