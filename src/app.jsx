/* ------------------------------------------------------------------
 * App shell — sidebar + header + module router
 * ------------------------------------------------------------------ */

const ROUTES = new Set(['contests', 'entries', 'admin']);

function normalizeRoute(value) {
  const route = String(value || '').replace(/^#\/?/, '');
  if (route === 'credits') return 'entries';
  if (route === 'discovery') return 'contests';
  if (route === 'sources') return 'admin';
  return ROUTES.has(route) ? route : 'contests';
}

function Sidebar({ route, go }) {
  const modules = [
    { k:'contests',  l:'Contests',     kbd:'G C' },
    { k:'entries',   l:'Submissions',  kbd:'G E' },
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
          <button key={m.k} type="button" className="sb-item" aria-current={route===m.k ? 'page' : undefined} onClick={() => go(m.k)}>
            <span className="dot" />
            <span>{m.l}</span>
            <span className="k">{m.kbd}</span>
          </button>
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

  return (
    <div style={{position:'relative'}}>
      <button className="btn" onClick={() => setOpen(o => !o)}>activity</button>
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
            <button type="button" className="dim" style={{fontSize:10.5, cursor:'pointer', border:0, background:'transparent', padding:0}} onClick={() => setOpen(false)}>close</button>
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

function TopBar({ route, go }) {
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const newMenuRef = useRef(null);
  const newButtonRef = useRef(null);
  const crumbs = {
    entries: ['Home','Submissions'],
    contests: ['Home','Contests'],
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

  useEffect(() => {
    if (!newOpen) return;
    const onPointerDown = (e) => {
      if (!newMenuRef.current?.contains(e.target)) {
        setNewOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setNewOpen(false);
        newButtonRef.current?.focus();
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [newOpen]);

  const newItems = [
    { type:'contest', label:'New contest', route:'contests' },
    { type:'submission', label:'New submission', route:'entries' },
    { type:'import_url', label:'Import URL', route:'entries' },
    { type:'source', label:'Add source', route:'admin' },
  ];

  const openNew = (item) => {
    go(item.route);
    setNewOpen(false);
    newButtonRef.current?.focus();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('vh:new', { detail: { type: item.type } }));
    }, 0);
  };

  const results = useMemo(() => {
    if (!search || search.length < 2) return null;
    const q = search.toLowerCase();
    const hit = (s) => String(s || '').toLowerCase().includes(q);
    return [
      ...(window.ENTRIES || []).filter(e => hit(e.title) || hit(e.project) || hit(e.contest_name) || hit(e.hack)).slice(0,5).map(e => ({ kind:'submission', route:'entries', label: e.title, sub: [e.contest_name || e.hack, e.stage].filter(Boolean).join(' · ') })),
      ...(window.HACKS || []).filter(h => !h.hidden && (hit(h.name) || hit(h.code) || hit(h.host) || hit(h.website))).slice(0,5).map(h => ({ kind:'contest', route:'contests', label: `${h.code} · ${h.name}`, sub: [h.host, h.website].filter(Boolean).join(' · ') })),
    ];
  }, [search]);

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
      <button type="button" className="hd-search" style={{cursor:'pointer'}} onClick={() => setSearchOpen(true)}>
        <span>⌕</span>
        <span>search submissions and contests…</span>
        <span style={{flex:1}} />
        <span className="kbd">⌘K</span>
      </button>
      <div className="hd-right">
        <NotificationsBell />
        <div ref={newMenuRef} style={{position:'relative'}}>
          <button
            ref={newButtonRef}
            type="button"
            className="btn btn-primary"
            aria-haspopup="menu"
            aria-expanded={newOpen}
            onClick={() => setNewOpen(o => !o)}
          >+ New</button>
          {newOpen && (
            <div
              role="menu"
              aria-label="Create new"
              style={{
                position:'absolute', right:0, top:'calc(100% + 6px)', zIndex:45,
                minWidth:180, background:'var(--bg)', border:'1px solid var(--border-2)',
                borderRadius:8, boxShadow:'0 10px 30px -10px oklch(0% 0 0 / 0.12)',
                padding:6
              }}
            >
              {newItems.map(item => (
                <button
                  key={item.type}
                  type="button"
                  role="menuitem"
                  onClick={() => openNew(item)}
                  style={{
                    display:'block', width:'100%', border:0, background:'transparent', color:'var(--fg)',
                    textAlign:'left', padding:'8px 10px', borderRadius:6, fontSize:13, cursor:'pointer'
                  }}
                >{item.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {searchOpen && (
        <div role="presentation" onClick={() => setSearchOpen(false)} style={{
          position:'fixed', inset:0, background:'oklch(20% 0 0 / 0.25)', zIndex:50,
          display:'flex', justifyContent:'center', alignItems:'flex-start', paddingTop:'12vh'
        }}>
          <div role="dialog" aria-modal="true" aria-label="Search submissions and contests" onClick={(e)=>e.stopPropagation()} style={{
            width:560, background:'var(--bg)', borderRadius:10, border:'1px solid var(--border-2)',
            boxShadow:'0 20px 60px -10px oklch(0% 0 0 / 0.25)', overflow:'hidden'
          }}>
            <div style={{padding:'12px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10}}>
              <span className="mono" style={{color:'var(--fg-3)'}}>⌕</span>
                <input aria-label="Search submissions and contests" autoFocus value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="search submissions and contests…"
                       style={{flex:1, border:0, outline:'none', fontSize:14, background:'transparent', color:'var(--fg)'}} />
              <span className="kbd">esc</span>
            </div>
            <div style={{maxHeight:400, overflow:'auto'}}>
              {results === null && <div className="dim" style={{padding:14, fontSize:12}}>type at least 2 characters</div>}
              {results && results.length === 0 && <div className="dim" style={{padding:14, fontSize:12}}>no matches</div>}
              {results && results.map((r,i) => (
                <button key={i} type="button" onClick={() => { go(r.route); setSearchOpen(false); setSearch(''); }} style={{padding:'10px 14px', border:0, borderBottom:'1px solid var(--border)', background:'transparent', color:'var(--fg)', width:'100%', display:'grid', gridTemplateColumns:'72px 1fr', gap:12, cursor:'pointer', textAlign:'left'}}>
                  <span className="mono" style={{fontSize:10.5, color:'var(--fg-3)', textTransform:'uppercase'}}>{r.kind}</span>
                  <div>
                    <div style={{fontWeight:500, fontSize:13}}>{r.label}</div>
                    <div className="mono" style={{fontSize:11, color:'var(--fg-3)', marginTop:2}}>{r.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function App() {
  const [route, setRoute] = useState(() => {
    const hashRoute = normalizeRoute(window.location.hash);
    if (window.location.hash) return hashRoute;
    return normalizeRoute(localStorage.getItem('vh:route') || 'contests');
  });
  const [, bump] = useState(0);
  useEffect(() => {
    localStorage.setItem('vh:route', route);
    if (window.location.hash !== `#${route}`) window.history.replaceState(null, '', `#${route}`);
  }, [route]);
  useEffect(() => {
    const onHash = () => setRoute(normalizeRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const h = () => bump(v => v + 1);
    window.addEventListener('vh:refresh', h);
    return () => window.removeEventListener('vh:refresh', h);
  }, []);
  const go = (k) => setRoute(normalizeRoute(k));

  // Keyboard shortcuts — G then C/E/A
  useEffect(() => {
    let gPending = 0;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'g' || e.key === 'G') { gPending = Date.now(); return; }
      if (gPending && Date.now() - gPending < 1200) {
        const m = { c:'contests', e:'entries', a:'admin' }[e.key.toLowerCase()];
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
        <TopBar route={route} go={go} />
        {route === 'contests'  && <Contests />}
        {route === 'entries'   && <Entries />}
        {route === 'admin'     && <AdminPanel />}
      </main>
    </>
  );
}

window.__vh_bootstrap().then(() => {
  ReactDOM.createRoot(document.getElementById('app')).render(<App />);
});
