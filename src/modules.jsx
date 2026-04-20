/* ------------------------------------------------------------------
 * Module views
 * ------------------------------------------------------------------ */

function visibleHacks() {
  return (window.HACKS || []).filter((hack) => !hack.hidden);
}

function hackFormState(hack = null) {
  return {
    id: hack?.id || null,
    name: hack?.name || '',
    host: hack?.host || '',
    website: hack?.website || '',
    location: hack?.location || '',
    attendanceMode: hack?.attendance_mode || 'unknown',
    starts: hack?.starts || '—',
    ends: hack?.ends || hack?.starts || '—',
    prize: hack?.prize || '—',
    sourceUrl: hack?.source_url || '',
    tracksRaw: (hack?.tracks || []).join(', '),
  };
}

function sourceFormState(source = null) {
  return {
    id: source?.id || null,
    kind: source?.kind || 'luma',
    label: source?.label || '',
    url: source?.url || '',
    note: source?.note || '',
    enabled: source?.enabled ?? true,
  };
}

function entryFormState(entry = null) {
  return {
    id: entry?.id || null,
    title: entry?.title || '',
    project: entry?.project || '',
    tagline: entry?.tagline || '',
    hack: entry?.hack || '',
    contestName: entry?.contest_name || '',
    contestHost: entry?.contest_host || '',
    contestUrl: entry?.contest_url || '',
    contestDeadline: entry?.contest_deadline || '',
    contestPrize: entry?.contest_prize || '',
    repoUrl: entry?.repo_url || '',
    demoUrl: entry?.demo_url || '',
    stage: entry?.stage || 'Idea',
    progress: String(entry?.progress ?? 0),
    deadline: entry?.deadline || '',
    risk: entry?.risk || 'low',
    teamRaw: (entry?.team || []).join(', '),
    tasksRaw: (entry?.tasks || []).map((task) => task.t).join('\n'),
    notes: entry?.notes || '',
  };
}

function groupRows(rows, field) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row[field] || '').trim();
    if (!key) continue;
    const group = map.get(key) || { key, total: 0, hidden: 0, websites: new Set(), sources: new Set() };
    group.total += 1;
    if (row.hidden) group.hidden += 1;
    if (row.website) group.websites.add(row.website);
    if (row.source) group.sources.add(row.source);
    map.set(key, group);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

function matchesSourceRow(hack, source) {
  if (!hack || !source) return false;
  if (hack.source_key && hack.source_key === source.url) return true;
  if (source.kind === 'luma') return hack.source === 'luma' && (hack.tracks || []).includes(source.url);
  if (source.kind === 'headless') return hack.website === 'cerebralvalley.ai';
  if (source.kind === 'devpost') return hack.website === 'devpost.com';
  return false;
}

/* =========================== OVERVIEW ============================ */
function Overview({ go }) {
  const HACKS = visibleHacks();
  const ENTRIES = window.ENTRIES || [];
  const CREDITS = window.CREDITS || [];

  // Real numbers only — no hardcoded deltas.
  const nowMs = Date.now();
  const soon = HACKS
    .filter(h => h.due && h.due !== '—')
    .map(h => ({ ...h, _ts: new Date(h.due).getTime() }))
    .filter(h => !isNaN(h._ts) && h._ts > nowMs && h._ts < nowMs + 7 * 86400e3);

  const activeEntries = ENTRIES.filter((entry) => entry.stage !== 'Submitted');
  const submittedEntries = ENTRIES.filter((entry) => entry.stage === 'Submitted');
  const usd = (v) => { const m = String(v||'').match(/\$\s?([\d,]+)/); return m ? Number(m[1].replace(/,/g,'')) : 0; };
  const pendingUsd = CREDITS.filter(c => c.action !== 'granted' && c.action !== 'archived').reduce((s, c) => s + (c.value_usd || usd(c.value)), 0);
  const bankedUsd  = CREDITS.filter(c => c.action === 'granted').reduce((s, c) => s + (c.value_usd || usd(c.value)), 0);

  const stats = [
    { k:'Active submissions', v: String(activeEntries.length) },
    { k:'Submitted',          v: String(submittedEntries.length) },
    { k:'Open credit leads',  v: String(CREDITS.filter(c => c.action !== 'granted' && c.action !== 'archived').length) },
    { k:'Pending value',      v: '$' + pendingUsd.toLocaleString() },
    { k:'Banked',             v: '$' + bankedUsd.toLocaleString() },
  ];

  const agents = window.__vh_agents || [];
  const running = agents.filter(a => a.runs > 0).length;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">Overview</div>
        <div className="page-meta mono">{activeEntries.length} active submission{activeEntries.length===1?'':'s'} · {CREDITS.length} credit lead{CREDITS.length===1?'':'s'}</div>
      </div>
      <div className="page-sub">A quick pulse on the contests you are actively building for, plus the support signals around them.</div>

      <StatStrip stats={stats} />

      <div className="cols-2">
        <Sec title="Next up" sub={soon.length > 0 ? `${soon.length} starting in 7 days` : 'upcoming'} actions={<button className="btn" onClick={() => go('entries')}>Open submissions →</button>}>
          <table className="tbl">
            <thead><tr><th>Event</th><th>Host</th><th>When</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(soon.length > 0 ? soon.sort((a,b)=>a._ts-b._ts) : HACKS.filter(h => h.status !== 'closed')).slice(0,5).map(h => (
                <tr key={h.id}>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <Logo name={h.host} />
                      <div>
                        {h.source_url ? (
                          <a href={h.source_url} target="_blank" rel="noopener noreferrer"
                             style={{fontWeight:500, color:'var(--fg)', textDecoration:'none', borderBottom:'1px dotted var(--border-2)'}}
                             onMouseEnter={(e)=>e.currentTarget.style.color='var(--accent)'}
                             onMouseLeave={(e)=>e.currentTarget.style.color='var(--fg)'}
                             title={h.source_url}>
                            {h.name} <span style={{fontSize:10, color:'var(--fg-4)', marginLeft:4}}>↗</span>
                          </a>
                        ) : (
                          <div style={{fontWeight:500}}>{h.name}</div>
                        )}
                        <div className="mono" style={{fontSize:11,color:'var(--fg-3)'}}>{h.code} · {h.tracks.join(' / ')}</div>
                      </div>
                    </div>
                  </td>
                  <td className="muted">{h.host}</td>
                  <td className="mono">{h.starts} → {h.ends}</td>
                  <td>
                    {h.status === 'open' ? <Chip tone="ok">open</Chip>
                      : h.status === 'upcoming' ? <Chip tone="info">upcoming</Chip>
                      : <Chip>closed</Chip>}
                  </td>
                  <td style={{textAlign:'right'}}>
                    {h.source_url
                      ? <a href={h.source_url} target="_blank" rel="noopener noreferrer" className="rowbtn" style={{textDecoration:'none'}}>open ↗</a>
                      : <button className="rowbtn" onClick={() => go('admin')}>open</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sec>

        <Sec title="Admin log" sub="live" actions={<Chip tone="ok">{running}/{agents.length} agents</Chip>}>
          <AgentLog />
        </Sec>
      </div>

      <div style={{height:20}} />

      <div className="cols-2">
        <Sec title="Credit pipeline" sub="top unread" actions={<button className="btn" onClick={()=>go('credits')}>Open inbox →</button>}>
          <table className="tbl">
            <thead><tr><th>Provider</th><th>Offer</th><th>Value</th><th>Source</th><th></th></tr></thead>
            <tbody>
              {CREDITS.filter(c => c.unread).slice(0,6).map(c => (
                <tr key={c.id}>
                  <td style={{display:'flex',alignItems:'center',gap:10}}>
                    <Logo name={c.provider} />
                    <span style={{fontWeight:600}}>{c.provider}</span>
                  </td>
                  <td className="muted" style={{maxWidth:280, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{c.subject}</td>
                  <td><span className="mono" style={{fontWeight:600}}>{c.value}</span></td>
                  <td className="mono muted">{c.source}</td>
                  <td style={{textAlign:'right'}}>
                    {c.source_url
                      ? <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="rowbtn" style={{textDecoration:'none'}}>open ↗</a>
                      : <button className="rowbtn" onClick={() => go('credits')}>open</button>}
                  </td>
                </tr>
              ))}
              {CREDITS.filter(c => c.unread).length === 0 && (
                <tr><td colSpan={5} style={{padding:'16px', color:'var(--fg-3)', fontSize:12, textAlign:'center'}}>no unread credits</td></tr>
              )}
            </tbody>
          </table>
        </Sec>
      </div>
    </div>
  );
}

/* =========================== DISCOVERY =========================== */
function Discovery() {
  const allHacks = window.HACKS || [];
  const hacks = visibleHacks();
  const [filter, setFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sourceModal, setSourceModal] = useState({ open: false, data: sourceFormState() });
  const [hackModal, setHackModal] = useState({ open: false, data: hackFormState() });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filters, setFilters] = useState({ track:'', attendance:'all', source:'all', host:'', website:'' });

  const sourceKinds = [...new Set((window.SOURCES || []).map((s) => s.kind).filter(Boolean))];
  const hosts = [...new Set(hacks.map((h) => h.host).filter(Boolean))].sort();
  const websites = [...new Set(hacks.map((h) => h.website).filter(Boolean))].sort();

  const rows = useMemo(() => {
    let next = hacks;
    if (filter === 'open') next = next.filter((h) => h.status === 'open');
    if (filter === 'upcoming') next = next.filter((h) => h.status === 'upcoming');
    if (filter === 'registered') next = next.filter((h) => h.registered);
    if (filter === 'closed') next = next.filter((h) => h.status === 'closed');
    if (filters.track.trim()) next = next.filter((h) => (h.tracks || []).some((t) => t.toLowerCase().includes(filters.track.trim().toLowerCase())));
    if (filters.attendance !== 'all') next = next.filter((h) => (h.attendance_mode || 'unknown') === filters.attendance);
    if (filters.source !== 'all') next = next.filter((h) => (h.source || 'unknown') === filters.source);
    if (filters.host) next = next.filter((h) => h.host === filters.host);
    if (filters.website) next = next.filter((h) => h.website === filters.website);
    return next;
  }, [filter, hacks, filters]);

  const count = (k) => {
    if (k === 'all') return hacks.length;
    if (k === 'registered') return hacks.filter((h) => h.registered).length;
    return hacks.filter((h) => h.status === k).length;
  };

  const saveHack = async (e) => {
    e?.preventDefault?.();
    const data = hackModal.data;
    if (!data.name.trim()) return;
    const body = {
      name: data.name.trim(),
      host: data.host.trim(),
      website: data.website.trim(),
      location: data.location.trim(),
      attendanceMode: data.attendanceMode,
      starts: data.starts.trim() || '—',
      ends: data.ends.trim() || data.starts.trim() || '—',
      prize: data.prize.trim() || '—',
      sourceUrl: data.sourceUrl.trim(),
      tracks: data.tracksRaw.split(',').map((t) => t.trim()).filter(Boolean),
    };
    if (data.id) await window.__vh_mut(`/api/hacks/${data.id}`, { method:'PATCH', body });
    else await window.__vh_mut('/api/hacks', { body });
    setHackModal({ open: false, data: hackFormState() });
  };

  const addSubmissionFromHack = async (hack) => {
    await window.__vh_mut('/api/entries', {
      body: {
        title: hack.name,
        tagline: `Submission for ${hack.name}`,
        hack: hack.code,
        contestName: hack.name,
        contestHost: hack.host,
        contestUrl: hack.source_url || '',
        contestDeadline: hack.due || hack.ends || '',
        contestPrize: hack.prize || '',
        stage: 'Idea',
        progress: 0,
      },
    });
    window.__vh_toast?.(`Added ${hack.name} to submissions`, 'ok');
  };

  const saveSource = async (e) => {
    e?.preventDefault?.();
    const data = sourceModal.data;
    if (!data.url.trim()) return;
    const body = { kind: data.kind, label: data.label.trim(), url: data.url.trim(), note: data.note.trim(), enabled: !!data.enabled };
    if (data.id) {
      await window.__vh_mut(`/api/sources/${data.id}`, { method:'PATCH', body });
    } else {
      await window.__vh_mut('/api/sources', { body });
      try {
        const worker = data.kind === 'devpost' ? 'hackathons' : data.kind === 'headless' ? 'vibe_events' : 'vibe_events';
        await fetch(`/api/workers/${worker}/run`, { method:'POST' });
      } catch {}
      await window.__vh_refresh();
    }
    setSourceModal({ open: false, data: sourceFormState() });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">Discovery</div>
        <div className="page-meta mono">{(() => {
          const sources = [...new Set(hacks.map((h) => h.source).filter(Boolean))];
          return sources.length ? `tracking ${sources.join(' · ')} · ${allHacks.length - hacks.length} hidden` : 'no sources configured';
        })()}</div>
      </div>
      <div className="page-sub">Hackathons and contests Vibehack is tracking for you. Irrelevant meetups are hidden by default, and you can now edit events or push source rules from the new module.</div>

      <Sec title="Calendar" sub={window.MONTH.name} actions={<>
        <button className="btn" style={{background:'var(--bg-3)'}}>month</button>
        <button className="btn" onClick={() => setFilter('upcoming')}>list</button>
      </>}>
        <div className="cal" style={{border:0,borderRadius:0}}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div className="dow" key={d}>{d}</div>)}
          {Array.from({length: window.MONTH.dayOffset}).map((_,i) => <div className="d out" key={'o'+i}></div>)}
          {Array.from({length: window.MONTH.days}).map((_, i) => {
            const n = i + 1;
            const evs = window.CAL_EVENTS[n] || [];
            const isToday = n === window.MONTH.today;
            return (
              <div className="d" key={n}>
                <span className={`n ${isToday ? 'today' : ''}`}>{n}</span>
                {evs.map((e, j) => <span key={j} className={`ev ${e.kind}`}>{e.label}</span>)}
              </div>
            );
          })}
        </div>
      </Sec>

      <div style={{height:20}} />

      <Sec
        title="Hackathons & contests"
        sub={`${rows.length} visible results`}
        actions={<>
          <button className="btn" onClick={() => setFiltersOpen(true)}>Filters</button>
          <button className="btn" onClick={() => setSourceModal({ open: true, data: sourceFormState() })}>+ Add source</button>
          <button className="btn btn-primary" onClick={() => setHackModal({ open: true, data: hackFormState() })}>+ new hackathon</button>
        </>}
      >
        <div className="filt">
          {[['all','All'],['open','Open'],['upcoming','Upcoming'],['registered','Registered'],['closed','Closed']].map(([k,l]) => (
            <div key={k} className="tab" aria-selected={filter===k} onClick={() => setFilter(k)}>
              {l} <span className="ct mono">{count(k)}</span>
            </div>
          ))}
          <div className="gap" />
          <span className="mono" style={{fontSize:11, color:'var(--fg-3)'}}>
            {filters.track || filters.attendance !== 'all' || filters.source !== 'all' || filters.host || filters.website ? 'filters active' : 'sort: starts soonest'}
          </span>
        </div>

        <table className="tbl">
          <thead>
            <tr>
              <th>Event</th>
              <th>Window</th>
              <th>Prize</th>
              <th>Tracks</th>
              <th>Mode</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id}>
                <td style={{minWidth:280}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <Logo name={h.host} />
                    <div>
                      {h.source_url ? (
                        <a href={h.source_url} target="_blank" rel="noopener noreferrer"
                           style={{fontWeight:500, color:'var(--fg)', textDecoration:'none', borderBottom:'1px dotted var(--border-2)'}}
                           onMouseEnter={(e)=>e.currentTarget.style.color='var(--accent)'}
                           onMouseLeave={(e)=>e.currentTarget.style.color='var(--fg)'}
                           title={h.source_url}>
                          {h.name} <span style={{fontSize:10, color:'var(--fg-4)', marginLeft:4}}>↗</span>
                        </a>
                      ) : (
                        <div style={{fontWeight:500}}>{h.name}</div>
                      )}
                      <div className="mono" style={{fontSize:11,color:'var(--fg-3)'}}>{[h.code, h.host, h.website].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                </td>
                <td className="mono">{h.starts} — {h.ends}</td>
                <td className="mono" style={{fontWeight:600}}>{h.prize}</td>
                <td>
                  <div style={{display:'flex',gap:4, flexWrap:'wrap'}}>
                    {(h.tracks || []).map((t) => <span key={t} className="tag">{t}</span>)}
                  </div>
                </td>
                <td>
                  <Chip tone={h.attendance_mode === 'online' ? 'ok' : h.attendance_mode === 'hybrid' ? 'info' : h.attendance_mode === 'in_person' ? 'warn' : ''}>
                    {(h.attendance_mode || 'unknown').replace('_', ' ')}
                  </Chip>
                </td>
                <td>
                  {h.status === 'open' ? <Chip tone="ok">open</Chip>
                    : h.status === 'upcoming' ? <Chip tone="info">upcoming</Chip>
                    : <Chip>closed</Chip>}
                </td>
                <td style={{textAlign:'right', whiteSpace:'nowrap'}}>
                  <button className="rowbtn" onClick={() => addSubmissionFromHack(h)}>add to submissions</button>
                  {h.registered
                    ? <button className="rowbtn" style={{marginLeft:4}} onClick={() => window.__vh_mut(`/api/hacks/${h.id}/register`)}>unregister</button>
                    : <button className="rowbtn primary" style={{marginLeft:4}} onClick={() => window.__vh_mut(`/api/hacks/${h.id}/register`)}>register</button>}
                  <button className="rowbtn" style={{marginLeft:4}} onClick={() => setHackModal({ open: true, data: hackFormState(h) })}>edit</button>
                  <button className="copy-btn" style={{marginLeft:4}} title="delete" onClick={() => setDeleteTarget(h)}>×</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{padding:'18px 16px', textAlign:'center', color:'var(--fg-3)'}}>No visible events match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </Sec>

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Discovery filters"
        sub="Trim the list to online, relevant, and trusted sources."
        footer={(
          <>
            <button className="copy-btn" onClick={() => setFilters({ track:'', attendance:'all', source:'all', host:'', website:'' })}>reset</button>
            <span style={{flex:1}} />
            <button className="rowbtn primary" onClick={() => setFiltersOpen(false)}>done</button>
          </>
        )}
      >
        <div className="vh-grid-2">
          <Field label="Track contains">
            <input value={filters.track} onChange={(e) => setFilters((prev) => ({ ...prev, track: e.target.value }))} placeholder="agents, rag, coding..." />
          </Field>
          <Field label="Attendance mode">
            <select value={filters.attendance} onChange={(e) => setFilters((prev) => ({ ...prev, attendance: e.target.value }))}>
              <option value="all">All</option>
              <option value="online">Online</option>
              <option value="hybrid">Hybrid</option>
              <option value="in_person">In person</option>
              <option value="unknown">Unknown</option>
            </select>
          </Field>
          <Field label="Source kind">
            <select value={filters.source} onChange={(e) => setFilters((prev) => ({ ...prev, source: e.target.value }))}>
              <option value="all">All</option>
              {sourceKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
          </Field>
          <Field label="Host">
            <select value={filters.host} onChange={(e) => setFilters((prev) => ({ ...prev, host: e.target.value }))}>
              <option value="">All</option>
              {hosts.map((host) => <option key={host} value={host}>{host}</option>)}
            </select>
          </Field>
          <Field label="Website">
            <select value={filters.website} onChange={(e) => setFilters((prev) => ({ ...prev, website: e.target.value }))}>
              <option value="">All</option>
              {websites.map((website) => <option key={website} value={website}>{website}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={sourceModal.open}
        onClose={() => setSourceModal({ open: false, data: sourceFormState() })}
        title={sourceModal.data.id ? 'Edit source' : 'Add source'}
        sub="Manage what the event agents are allowed to scan."
        footer={(
          <>
            <button className="copy-btn" onClick={() => setSourceModal({ open: false, data: sourceFormState() })}>cancel</button>
            <span style={{flex:1}} />
            <button className="rowbtn primary" onClick={saveSource}>{sourceModal.data.id ? 'save source' : 'add source'}</button>
          </>
        )}
      >
        <form onSubmit={saveSource} style={{ display:'grid', gap:12 }}>
          <div className="vh-grid-2">
            <Field label="Source type">
              <select value={sourceModal.data.kind} onChange={(e) => setSourceModal((prev) => ({ ...prev, data: { ...prev.data, kind: e.target.value } }))}>
                <option value="luma">Lu.ma calendar</option>
                <option value="headless">Website watch</option>
                <option value="devpost">Devpost index</option>
              </select>
            </Field>
            <Field label="Label">
              <input value={sourceModal.data.label} onChange={(e) => setSourceModal((prev) => ({ ...prev, data: { ...prev.data, label: e.target.value } }))} placeholder="Optional name" />
            </Field>
          </div>
          <Field label="Slug or URL" hint="For Lu.ma, paste the calendar slug or URL. For website watches, use the full URL.">
            <input autoFocus value={sourceModal.data.url} onChange={(e) => setSourceModal((prev) => ({ ...prev, data: { ...prev.data, url: e.target.value } }))} placeholder="genai-collective or https://..." />
          </Field>
          <Field label="Note">
            <textarea value={sourceModal.data.note} onChange={(e) => setSourceModal((prev) => ({ ...prev, data: { ...prev.data, note: e.target.value } }))} placeholder="Why this source matters" />
          </Field>
          <button type="submit" style={{ display:'none' }} />
        </form>
      </Modal>

      <Modal
        open={hackModal.open}
        onClose={() => setHackModal({ open: false, data: hackFormState() })}
        title={hackModal.data.id ? 'Edit event' : 'New hackathon'}
        sub="Manual events now use the same real form as edits."
        footer={(
          <>
            <button className="copy-btn" onClick={() => setHackModal({ open: false, data: hackFormState() })}>cancel</button>
            <span style={{flex:1}} />
            <button className="rowbtn primary" onClick={saveHack}>{hackModal.data.id ? 'save changes' : 'create event'}</button>
          </>
        )}
      >
        <form onSubmit={saveHack} style={{ display:'grid', gap:12 }}>
          <Field label="Name">
            <input autoFocus value={hackModal.data.name} onChange={(e) => setHackModal((prev) => ({ ...prev, data: { ...prev.data, name: e.target.value } }))} placeholder="Hackathon name" />
          </Field>
          <div className="vh-grid-2">
            <Field label="Host"><input value={hackModal.data.host} onChange={(e) => setHackModal((prev) => ({ ...prev, data: { ...prev.data, host: e.target.value } }))} placeholder="Modal, MLH, Lu.ma..." /></Field>
            <Field label="Website"><input value={hackModal.data.website} onChange={(e) => setHackModal((prev) => ({ ...prev, data: { ...prev.data, website: e.target.value } }))} placeholder="devpost.com" /></Field>
            <Field label="Starts"><input value={hackModal.data.starts} onChange={(e) => setHackModal((prev) => ({ ...prev, data: { ...prev.data, starts: e.target.value } }))} placeholder="May 02" /></Field>
            <Field label="Ends"><input value={hackModal.data.ends} onChange={(e) => setHackModal((prev) => ({ ...prev, data: { ...prev.data, ends: e.target.value } }))} placeholder="May 04" /></Field>
            <Field label="Location"><input value={hackModal.data.location} onChange={(e) => setHackModal((prev) => ({ ...prev, data: { ...prev.data, location: e.target.value } }))} placeholder="Remote or city" /></Field>
            <Field label="Attendance mode">
              <select value={hackModal.data.attendanceMode} onChange={(e) => setHackModal((prev) => ({ ...prev, data: { ...prev.data, attendanceMode: e.target.value } }))}>
                <option value="unknown">Unknown</option>
                <option value="online">Online</option>
                <option value="hybrid">Hybrid</option>
                <option value="in_person">In person</option>
              </select>
            </Field>
          </div>
          <div className="vh-grid-2">
            <Field label="Prize"><input value={hackModal.data.prize} onChange={(e) => setHackModal((prev) => ({ ...prev, data: { ...prev.data, prize: e.target.value } }))} placeholder="$10,000" /></Field>
            <Field label="Source URL"><input value={hackModal.data.sourceUrl} onChange={(e) => setHackModal((prev) => ({ ...prev, data: { ...prev.data, sourceUrl: e.target.value } }))} placeholder="https://..." /></Field>
          </div>
          <Field label="Tracks" hint="Comma-separated">
            <input value={hackModal.data.tracksRaw} onChange={(e) => setHackModal((prev) => ({ ...prev, data: { ...prev.data, tracksRaw: e.target.value } }))} placeholder="Agents, Coding, RAG" />
          </Field>
          <button type="submit" style={{ display:'none' }} />
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await window.__vh_mut(`/api/hacks/${deleteTarget.id}`, { method:'DELETE' });
          setDeleteTarget(null);
        }}
        title="Delete event"
        body={deleteTarget ? `Remove "${deleteTarget.name}" from the event list?` : ''}
        confirmLabel="delete"
      />
    </div>
  );
}

function SourcesPanel() {
  const hacks = window.HACKS || [];
  const sources = window.SOURCES || [];
  const [tab, setTab] = useState('hosts');
  const [sourceModal, setSourceModal] = useState({ open: false, data: sourceFormState() });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const hostGroups = useMemo(() => groupRows(hacks, 'host'), [hacks]);
  const websiteGroups = useMemo(() => groupRows(hacks, 'website'), [hacks]);
  const sourceRows = useMemo(() => sources.map((source) => {
    const related = hacks.filter((hack) => matchesSourceRow(hack, source));
    return {
      ...source,
      total: related.length,
      hiddenCount: related.filter((hack) => hack.hidden).length,
    };
  }), [sources, hacks]);

  const saveSource = async (e) => {
    e?.preventDefault?.();
    const data = sourceModal.data;
    if (!data.url.trim()) return;
    const body = { kind: data.kind, label: data.label.trim(), url: data.url.trim(), note: data.note.trim(), enabled: !!data.enabled };
    if (data.id) await window.__vh_mut(`/api/sources/${data.id}`, { method:'PATCH', body });
    else await window.__vh_mut('/api/sources', { body });
    setSourceModal({ open: false, data: sourceFormState() });
  };

  const setGroupVisibility = async (field, value, hidden) => {
    await window.__vh_mut('/api/hacks/visibility', { method:'PATCH', body:{ field, value, hidden } });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">Source rules</div>
        <div className="page-meta mono">{sources.length} source rows · {hacks.filter((h) => h.hidden).length} hidden events</div>
      </div>
      <div className="page-sub">Group noisy events by host or website, hide them from the event views, and disable source rows so the bots stop pulling them in.</div>

      <Sec title="Rules" sub="hosts, websites, and source rows" actions={<>
        <button className="btn" onClick={() => setTab('hosts')}>hosts</button>
        <button className="btn" onClick={() => setTab('websites')}>websites</button>
        <button className="btn" onClick={() => setTab('sources')}>sources</button>
        <button className="btn btn-primary" onClick={() => setSourceModal({ open: true, data: sourceFormState() })}>+ add source</button>
      </>}>
        {tab === 'hosts' && (
          <table className="tbl">
            <thead><tr><th>Host</th><th>Websites</th><th>Events</th><th>Hidden</th><th></th></tr></thead>
            <tbody>
              {hostGroups.map((group) => (
                <tr key={group.key}>
                  <td style={{fontWeight:600}}>{group.key}</td>
                  <td className="mono muted">{Array.from(group.websites).join(' · ') || '—'}</td>
                  <td className="mono">{group.total}</td>
                  <td className="mono">{group.hidden}</td>
                  <td style={{textAlign:'right'}}>
                    <button className="rowbtn" onClick={() => setGroupVisibility('host', group.key, group.hidden < group.total)}>{group.hidden < group.total ? 'hide events' : 'show events'}</button>
                  </td>
                </tr>
              ))}
              {hostGroups.length === 0 && <tr><td colSpan={5} style={{padding:'18px 16px', textAlign:'center', color:'var(--fg-3)'}}>No hosts yet.</td></tr>}
            </tbody>
          </table>
        )}

        {tab === 'websites' && (
          <table className="tbl">
            <thead><tr><th>Website</th><th>Events</th><th>Hidden</th><th>Sources</th><th></th></tr></thead>
            <tbody>
              {websiteGroups.map((group) => (
                <tr key={group.key}>
                  <td className="mono" style={{fontWeight:600}}>{group.key}</td>
                  <td className="mono">{group.total}</td>
                  <td className="mono">{group.hidden}</td>
                  <td className="mono muted">{Array.from(group.sources).join(' · ') || '—'}</td>
                  <td style={{textAlign:'right'}}>
                    <button className="rowbtn" onClick={() => setGroupVisibility('website', group.key, group.hidden < group.total)}>{group.hidden < group.total ? 'hide events' : 'show events'}</button>
                  </td>
                </tr>
              ))}
              {websiteGroups.length === 0 && <tr><td colSpan={5} style={{padding:'18px 16px', textAlign:'center', color:'var(--fg-3)'}}>No websites yet.</td></tr>}
            </tbody>
          </table>
        )}

        {tab === 'sources' && (
          <table className="tbl">
            <thead><tr><th>Source</th><th>Type</th><th>Events</th><th>Bot status</th><th></th></tr></thead>
            <tbody>
              {sourceRows.map((source) => (
                <tr key={source.id}>
                  <td>
                    <div style={{fontWeight:600}}>{source.label || source.url}</div>
                    <div className="mono" style={{fontSize:11, color:'var(--fg-3)'}}>{source.url}</div>
                  </td>
                  <td className="mono">{source.kind}</td>
                  <td className="mono">{source.total} total · {source.hiddenCount} hidden</td>
                  <td>{source.enabled ? <Chip tone="ok">scanning</Chip> : <Chip tone="warn">ignored</Chip>}</td>
                  <td style={{textAlign:'right', whiteSpace:'nowrap'}}>
                    <button className="rowbtn" onClick={() => setSourceModal({ open: true, data: sourceFormState(source) })}>edit</button>
                    <button className="rowbtn" style={{marginLeft:4}} onClick={() => window.__vh_mut(`/api/sources/${source.id}`, { method:'PATCH', body:{ enabled: !source.enabled } })}>{source.enabled ? 'bots ignore' : 'resume scans'}</button>
                    <button className="rowbtn" style={{marginLeft:4}} onClick={() => setGroupVisibility('source_key', source.url, source.hiddenCount < source.total)}>{source.hiddenCount < source.total ? 'hide events' : 'show events'}</button>
                    <button className="copy-btn" style={{marginLeft:4}} onClick={() => setConfirmDelete(source)}>×</button>
                  </td>
                </tr>
              ))}
              {sourceRows.length === 0 && <tr><td colSpan={5} style={{padding:'18px 16px', textAlign:'center', color:'var(--fg-3)'}}>No source rows yet.</td></tr>}
            </tbody>
          </table>
        )}
      </Sec>

      <Modal
        open={sourceModal.open}
        onClose={() => setSourceModal({ open: false, data: sourceFormState() })}
        title={sourceModal.data.id ? 'Edit source rule' : 'Add source rule'}
        sub="Disable a source to stop future bot scans."
        footer={(
          <>
            <button className="copy-btn" onClick={() => setSourceModal({ open: false, data: sourceFormState() })}>cancel</button>
            <span style={{flex:1}} />
            <button className="rowbtn primary" onClick={saveSource}>{sourceModal.data.id ? 'save rule' : 'add rule'}</button>
          </>
        )}
      >
        <form onSubmit={saveSource} style={{display:'grid', gap:12}}>
          <div className="vh-grid-2">
            <Field label="Source type">
              <select value={sourceModal.data.kind} onChange={(e) => setSourceModal((prev) => ({ ...prev, data: { ...prev.data, kind: e.target.value } }))}>
                <option value="luma">Lu.ma calendar</option>
                <option value="headless">Website watch</option>
                <option value="devpost">Devpost index</option>
              </select>
            </Field>
            <Field label="Label">
              <input value={sourceModal.data.label} onChange={(e) => setSourceModal((prev) => ({ ...prev, data: { ...prev.data, label: e.target.value } }))} placeholder="Friendly name" />
            </Field>
          </div>
          <Field label="Slug or URL">
            <input autoFocus value={sourceModal.data.url} onChange={(e) => setSourceModal((prev) => ({ ...prev, data: { ...prev.data, url: e.target.value } }))} placeholder="genai-collective or https://..." />
          </Field>
          <Field label="Note">
            <textarea value={sourceModal.data.note} onChange={(e) => setSourceModal((prev) => ({ ...prev, data: { ...prev.data, note: e.target.value } }))} placeholder="Why keep or ignore this source" />
          </Field>
          <label style={{display:'flex', alignItems:'center', gap:8, fontSize:12.5}}>
            <input type="checkbox" checked={!!sourceModal.data.enabled} onChange={(e) => setSourceModal((prev) => ({ ...prev, data: { ...prev.data, enabled: e.target.checked } }))} />
            <span>Allow bots to scan this source</span>
          </label>
          <button type="submit" style={{display:'none'}} />
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await window.__vh_mut(`/api/sources/${confirmDelete.id}`, { method:'DELETE' });
          setConfirmDelete(null);
        }}
        title="Delete source row"
        body={confirmDelete ? `Remove "${confirmDelete.label || confirmDelete.url}" from source rules?` : ''}
        confirmLabel="delete"
      />
    </div>
  );
}

function AgentAdminPanel() {
  const agents = window.__vh_agents || [];
  const runAgent = async (agent) => {
    const label = agent.label || agent.name;
    window.__vh_toast?.(`${label}: running…`, 'info');
    try {
      const r = await fetch(`/api/workers/${agent.name}/run`, { method:'POST' });
      const j = await r.json();
      const detail = j.result?.added != null
        ? `+${j.result.added} new`
        : j.result?.skipped
          ? `skipped (${j.result.reason})`
          : j.result?.error
            ? `error: ${j.result.error}`
            : 'done';
      window.__vh_toast?.(`${label}: ${detail}`, j.result?.skipped ? 'warn' : j.result?.error ? 'bad' : 'ok');
    } catch (e) {
      window.__vh_toast?.(`${label}: ${e.message}`, 'bad');
    }
    window.__vh_refresh();
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">Agent controls</div>
        <div className="page-meta mono">{agents.length} admin agents</div>
      </div>
      <div className="page-sub">Search and ingestion live here now, separate from the submission workflow.</div>

      <Sec title="Agents" sub="manual runs only">
        <table className="tbl">
          <thead><tr><th>Agent</th><th>Members</th><th>Status</th><th>Runs</th><th></th></tr></thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.name}>
                <td style={{fontWeight:600}}>{agent.label || agent.name}</td>
                <td className="mono muted">{(agent.members || []).join(' · ')}</td>
                <td><Chip tone={agent.state === 'error' ? 'bad' : agent.state === 'busy' ? 'warn' : agent.state === 'running' ? 'ok' : ''}>{agent.state}</Chip></td>
                <td className="mono">{agent.runs}</td>
                <td style={{textAlign:'right'}}><button className="rowbtn" onClick={() => runAgent(agent)}>run now</button></td>
              </tr>
            ))}
            {agents.length === 0 && <tr><td colSpan={5} style={{padding:'18px 16px', textAlign:'center', color:'var(--fg-3)'}}>No agents loaded.</td></tr>}
          </tbody>
        </table>
      </Sec>
    </div>
  );
}

function AdminPanel() {
  const [tab, setTab] = useState('discovery');
  return (
    <div>
      <div className="page" style={{paddingBottom:0}}>
        <div className="page-head">
          <div className="page-title">Admin</div>
          <div className="page-meta mono">search, curation, and source controls</div>
        </div>
        <div className="page-sub">Use this area to search, curate, and selectively admit contests into the main submission system.</div>
        <div className="filt" style={{border:'1px solid var(--border)', borderRadius:8, marginBottom:20}}>
          {[['discovery','Discovery'],['sources','Source rules'],['agents','Agents']].map(([key, label]) => (
            <div key={key} className="tab" aria-selected={tab===key} onClick={() => setTab(key)}>{label}</div>
          ))}
        </div>
      </div>
      {tab === 'discovery' && <Discovery />}
      {tab === 'sources' && <SourcesPanel />}
      {tab === 'agents' && <AgentAdminPanel />}
    </div>
  );
}

/* ============================ ENTRIES ============================ */
function Entries() {
  const [expanded, setExpanded] = useState(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [entryModal, setEntryModal] = useState({ open:false, data: entryFormState(), importing:false, warning:'' });
  const [deleteEntry, setDeleteEntry] = useState(null);
  const entries = window.ENTRIES || [];
  const active = entries.filter((entry) => entry.stage !== 'Submitted');
  const done = entries.filter((entry) => entry.stage === 'Submitted');

  const now = Date.now();
  const upcoming = active
    .map((entry) => ({ ...entry, _ts: new Date(entry.deadline || entry.contest_deadline).getTime() }))
    .filter((entry) => !isNaN(entry._ts) && entry._ts > now)
    .sort((a, b) => a._ts - b._ts);
  const nextDeadline = upcoming[0];
  const within72h = upcoming.filter((entry) => entry._ts - now < 72 * 3600e3).length;
  const fmtRemaining = (ms) => {
    const h = Math.floor(ms / 3600e3);
    if (h < 48) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  const stats = [
    { k:'Active submissions', v: String(active.length) },
    { k:'Submitted', v: String(done.length) },
    { k:'Avg progress', v: Math.round(active.reduce((sum, entry) => sum + (entry.progress || 0), 0) / Math.max(active.length, 1)) + '%' },
    { k:'Next deadline', v: nextDeadline ? fmtRemaining(nextDeadline._ts - now) : '—', d: nextDeadline ? `${nextDeadline.title} · ${nextDeadline.contest_name || nextDeadline.hack}` : null },
    { k:'Needs focus', v: String(within72h) },
  ];

  const setEntryField = (field, value) => setEntryModal((prev) => ({ ...prev, data: { ...prev.data, [field]: value } }));

  const saveEntry = async (e) => {
    e?.preventDefault?.();
    const data = entryModal.data;
    if (!data.title.trim()) return;
    const existingEntry = data.id ? entries.find((entry) => entry.id === data.id) : null;
    const existingTaskState = new Map((existingEntry?.tasks || []).map((task) => [task.t, !!task.d]));
    const body = {
      title: data.title.trim(),
      project: data.project.trim() || data.title.trim().toLowerCase().replace(/\W+/g, '-'),
      tagline: data.tagline.trim(),
      hack: data.hack.trim(),
      contestName: data.contestName.trim(),
      contestHost: data.contestHost.trim(),
      contestUrl: data.contestUrl.trim(),
      contestDeadline: data.contestDeadline.trim(),
      contestPrize: data.contestPrize.trim(),
      repoUrl: data.repoUrl.trim(),
      demoUrl: data.demoUrl.trim(),
      stage: data.stage,
      progress: Number(data.progress) || 0,
      deadline: data.deadline.trim(),
      risk: data.risk,
      team: data.teamRaw.split(',').map((item) => item.trim()).filter(Boolean),
      tasks: data.tasksRaw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).map((task) => ({ t: task, d: existingTaskState.get(task) || false })),
      notes: data.notes,
    };
    if (data.id) await window.__vh_mut(`/api/entries/${data.id}`, { method:'PATCH', body });
    else await window.__vh_mut('/api/entries', { body });
    setEntryModal({ open:false, data: entryFormState(), importing:false, warning:'' });
  };

  const importContest = async () => {
    const url = entryModal.data.contestUrl.trim();
    if (!url) return;
    setEntryModal((prev) => ({ ...prev, importing:true, warning:'' }));
    try {
      const response = await fetch('/api/import-url', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      setEntryModal((prev) => ({
        ...prev,
        importing:false,
        warning: data.warning || '',
        data: {
          ...prev.data,
          contestUrl: data.url || prev.data.contestUrl,
          contestName: data.matchedHack?.name || data.title || prev.data.contestName,
          contestHost: data.matchedHack?.host || data.host || prev.data.contestHost,
          hack: data.hackCode || prev.data.hack,
          contestDeadline: data.contestDeadline || prev.data.contestDeadline,
          contestPrize: data.contestPrize || prev.data.contestPrize,
        },
      }));
    } catch (err) {
      setEntryModal((prev) => ({ ...prev, importing:false, warning: err.message }));
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">Submissions</div>
        <div className="page-meta mono">{active.length} active · {within72h} deadline{within72h===1?'':'s'} &lt; 72h</div>
      </div>
      <div className="page-sub">Track each contest, your build status, delivery links, and the details you actually need while shipping.</div>

      <StatStrip stats={stats} />

      <Sec title="Active submissions" sub={`${active.length} in flight`} actions={<>
        <button className="btn" onClick={() => setBoardOpen(true)}>board view</button>
        <button className="btn btn-primary" onClick={() => setEntryModal({ open:true, data: entryFormState(), importing:false, warning:'' })}>+ new submission</button>
      </>}>
        <table className="tbl">
          <thead>
            <tr><th>Project</th><th>Contest</th><th>Stage</th><th style={{minWidth:180}}>Progress</th><th>Build due</th><th>Contest due</th><th>Risk</th><th></th></tr>
          </thead>
          <tbody>
            {active.map((entry) => {
              const isOpen = expanded === entry.id;
              const doneCount = entry.tasks.filter((task) => task.d).length;
              return (
                <React.Fragment key={entry.id}>
                  <tr>
                    <td style={{minWidth:240}}>
                      <div style={{fontWeight:600}}>{entry.title}</div>
                      <div className="muted" style={{fontSize:12, marginTop:2, maxWidth:320, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{entry.tagline || entry.project}</div>
                    </td>
                    <td>
                      <div style={{fontWeight:500}}>{entry.contest_name || entry.hack || '—'}</div>
                      <div className="mono" style={{fontSize:11, color:'var(--fg-3)'}}>{[entry.contest_host, entry.contest_prize].filter(Boolean).join(' · ') || 'manual entry'}</div>
                    </td>
                    <td><Chip tone={entry.stage==='Building'?'ok':entry.stage==='Scoping'?'info':''}>{entry.stage.toLowerCase()}</Chip></td>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <Bar value={entry.progress} tone={entry.progress > 75 ? 'ok' : entry.progress < 25 ? 'warn' : ''} />
                        <span className="mono" style={{fontSize:11,color:'var(--fg-3)', minWidth:34, textAlign:'right'}}>{entry.progress}%</span>
                      </div>
                    </td>
                    <td className="mono">{entry.deadline || '—'}</td>
                    <td className="mono">{entry.contest_deadline || '—'}</td>
                    <td>{entry.risk==='low' ? <Chip tone="ok">low</Chip> : entry.risk==='med' ? <Chip tone="warn">med</Chip> : entry.risk==='high' ? <Chip tone="bad">high</Chip> : <Chip tone="info">done</Chip>}</td>
                    <td style={{textAlign:'right'}}><button className="rowbtn" onClick={() => setExpanded(isOpen ? null : entry.id)}>{isOpen ? 'close' : `open · ${doneCount}/${entry.tasks.length}`}</button></td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={8} style={{background:'var(--bg-2)', padding:'14px 18px'}}>
                        <div style={{display:'grid', gridTemplateColumns:'1.1fr 1fr', gap:20}}>
                          <div>
                            <div className="mono" style={{fontSize:10.5, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8}}>Build checklist</div>
                            <div style={{display:'flex', flexDirection:'column', gap:4}}>
                              {entry.tasks.map((task, idx) => (
                                <label key={idx} style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13}}>
                                  <input type="checkbox" checked={!!task.d} onChange={() => window.__vh_mut(`/api/entries/${entry.id}/tasks/${idx}`, { method:'PATCH' })} />
                                  <span style={{textDecoration: task.d ? 'line-through' : 'none', color: task.d ? 'var(--fg-3)' : 'var(--fg)'}}>{task.t}</span>
                                </label>
                              ))}
                              {entry.tasks.length === 0 && <span className="muted" style={{fontSize:12}}>no tasks yet</span>}
                            </div>
                            {entry.notes && (
                              <div style={{marginTop:14}}>
                                <div className="mono" style={{fontSize:10.5, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6}}>Notes</div>
                                <div style={{fontSize:12.5, color:'var(--fg-2)', whiteSpace:'pre-wrap'}}>{entry.notes}</div>
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="mono" style={{fontSize:10.5, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8}}>Contest + project info</div>
                            <div style={{fontSize:12.5, color:'var(--fg-2)', lineHeight:1.7}}>
                              <div><b>Project:</b> {entry.project || '—'}</div>
                              <div><b>Contest:</b> {entry.contest_name || entry.hack || '—'}</div>
                              <div><b>Host:</b> {entry.contest_host || '—'}</div>
                              <div><b>Build due:</b> <span className="mono">{entry.deadline || '—'}</span></div>
                              <div><b>Contest due:</b> <span className="mono">{entry.contest_deadline || '—'}</span></div>
                              <div><b>Prize:</b> {entry.contest_prize || '—'}</div>
                              <div><b>Team:</b> {entry.team.join(', ') || '—'}</div>
                            </div>
                            <div style={{marginTop:10, display:'flex', flexWrap:'wrap', gap:6}}>
                              {entry.contest_url && <a href={entry.contest_url} target="_blank" rel="noopener noreferrer" className="rowbtn" style={{textDecoration:'none'}}>contest ↗</a>}
                              {entry.repo_url && <a href={entry.repo_url} target="_blank" rel="noopener noreferrer" className="rowbtn" style={{textDecoration:'none'}}>repo ↗</a>}
                              {entry.demo_url && <a href={entry.demo_url} target="_blank" rel="noopener noreferrer" className="rowbtn" style={{textDecoration:'none'}}>demo ↗</a>}
                            </div>
                            <div style={{marginTop:12, display:'flex', gap:6}}>
                              <button className="rowbtn" onClick={() => setEntryModal({ open:true, data: entryFormState(entry), importing:false, warning:'' })}>edit</button>
                              <button className="rowbtn" onClick={() => setDeleteEntry(entry)}>delete</button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {active.length === 0 && <tr><td colSpan={8} style={{padding:'18px 16px', textAlign:'center', color:'var(--fg-3)'}}>No active submissions yet.</td></tr>}
          </tbody>
        </table>
      </Sec>

      <Sec title="Archive" sub="submitted" actions={<span className="mono" style={{fontSize:11,color:'var(--fg-3)'}}>{done.length} submissions</span>}>
        <table className="tbl">
          <thead><tr><th>Project</th><th>Contest</th><th>Result</th><th>Links</th><th></th></tr></thead>
          <tbody>
            {done.map((entry) => {
              const isOpen = expanded === entry.id;
              return (
                <React.Fragment key={entry.id}>
                  <tr>
                    <td style={{fontWeight:500}}>{entry.title}</td>
                    <td className="mono">{entry.contest_name || entry.hack || '—'}</td>
                    <td><Chip tone="info">submitted</Chip></td>
                    <td className="mono muted">{[entry.repo_url && 'repo', entry.demo_url && 'demo', entry.contest_url && 'contest'].filter(Boolean).join(' · ') || '—'}</td>
                    <td style={{textAlign:'right'}}><button className="rowbtn" onClick={() => setExpanded(isOpen ? null : entry.id)}>{isOpen ? 'close' : 'retro'}</button></td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={5} style={{background:'var(--bg-2)', padding:'14px 18px'}}>
                        <div style={{fontSize:12.5, color:'var(--fg-2)', lineHeight:1.7}}>
                          <div><b>Contest:</b> {entry.contest_name || entry.hack || '—'}</div>
                          <div><b>Deadline hit:</b> <span className="mono">{entry.contest_deadline || entry.deadline || '—'}</span></div>
                          <div><b>Tasks shipped:</b> {entry.tasks.filter((task) => task.d).length}/{entry.tasks.length}</div>
                          {entry.notes && <div><b>Notes:</b> {entry.notes}</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {done.length === 0 && <tr><td colSpan={5} style={{padding:'18px 16px', textAlign:'center', color:'var(--fg-3)'}}>No submitted projects yet.</td></tr>}
          </tbody>
        </table>
      </Sec>

      <Modal open={boardOpen} onClose={() => setBoardOpen(false)} title="Submission board" sub="Grouped by current stage." footer={<button className="rowbtn primary" onClick={() => setBoardOpen(false)}>close</button>}>
        <div style={{display:'grid', gap:12}}>
          {Object.entries(active.reduce((map, entry) => ((map[entry.stage] ||= []).push(entry), map), {})).map(([stage, items]) => (
            <div key={stage} style={{border:'1px solid var(--border)', borderRadius:8, padding:12, background:'var(--bg-2)'}}>
              <div className="mono" style={{fontSize:11, color:'var(--fg-3)', marginBottom:8}}>{stage}</div>
              <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                {items.map((item) => <span key={item.id} className="tag">{item.title} · {item.contest_name || item.hack || 'manual'}</span>)}
              </div>
            </div>
          ))}
          {active.length === 0 && <div className="muted">No active submissions yet.</div>}
        </div>
      </Modal>

      <Modal
        open={entryModal.open}
        onClose={() => setEntryModal({ open:false, data: entryFormState(), importing:false, warning:'' })}
        title={entryModal.data.id ? 'Edit submission' : 'New submission'}
        sub="Capture contest details manually or import the basics from a URL."
        width={760}
        footer={(
          <>
            <button className="copy-btn" onClick={() => setEntryModal({ open:false, data: entryFormState(), importing:false, warning:'' })}>cancel</button>
            <span style={{flex:1}} />
            <button className="rowbtn primary" onClick={saveEntry}>{entryModal.data.id ? 'save submission' : 'create submission'}</button>
          </>
        )}
      >
        <form onSubmit={saveEntry} style={{display:'grid', gap:12}}>
          <div className="vh-grid-2">
            <Field label="Project title"><input autoFocus value={entryModal.data.title} onChange={(e) => setEntryField('title', e.target.value)} placeholder="Gradient Scout" /></Field>
            <Field label="Project slug"><input value={entryModal.data.project} onChange={(e) => setEntryField('project', e.target.value)} placeholder="gradient-scout" /></Field>
          </div>
          <Field label="Tagline"><textarea value={entryModal.data.tagline} onChange={(e) => setEntryField('tagline', e.target.value)} placeholder="One-line project pitch" /></Field>
          <div className="vh-grid-2">
            <Field label="Contest URL" hint="Paste a contest URL and import the page title or a known tracked contest.">
              <input value={entryModal.data.contestUrl} onChange={(e) => setEntryField('contestUrl', e.target.value)} placeholder="https://..." />
            </Field>
            <Field label="Contest code"><input value={entryModal.data.hack} onChange={(e) => setEntryField('hack', e.target.value)} placeholder="LFH-044" /></Field>
          </div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <button type="button" className="rowbtn" onClick={importContest} disabled={entryModal.importing}>{entryModal.importing ? 'importing…' : 'import from URL'}</button>
            {entryModal.warning && <span className="mono" style={{fontSize:11, color:'var(--warn)'}}>{entryModal.warning}</span>}
          </div>
          <div className="vh-grid-2">
            <Field label="Contest name"><input value={entryModal.data.contestName} onChange={(e) => setEntryField('contestName', e.target.value)} placeholder="Contest name" /></Field>
            <Field label="Host"><input value={entryModal.data.contestHost} onChange={(e) => setEntryField('contestHost', e.target.value)} placeholder="Devpost, Lu.ma, sponsor" /></Field>
            <Field label="Contest deadline"><input value={entryModal.data.contestDeadline} onChange={(e) => setEntryField('contestDeadline', e.target.value)} placeholder="May 04 23:59 UTC" /></Field>
            <Field label="Prize"><input value={entryModal.data.contestPrize} onChange={(e) => setEntryField('contestPrize', e.target.value)} placeholder="$10,000" /></Field>
          </div>
          <div className="vh-grid-2">
            <Field label="Stage">
              <select value={entryModal.data.stage} onChange={(e) => setEntryField('stage', e.target.value)}>
                <option value="Idea">Idea</option>
                <option value="Scoping">Scoping</option>
                <option value="Building">Building</option>
                <option value="Polish">Polish</option>
                <option value="Submitted">Submitted</option>
              </select>
            </Field>
            <Field label="Progress %"><input type="number" min="0" max="100" value={entryModal.data.progress} onChange={(e) => setEntryField('progress', e.target.value)} /></Field>
            <Field label="Build deadline"><input value={entryModal.data.deadline} onChange={(e) => setEntryField('deadline', e.target.value)} placeholder="Internal ship date" /></Field>
            <Field label="Risk">
              <select value={entryModal.data.risk} onChange={(e) => setEntryField('risk', e.target.value)}>
                <option value="low">low</option>
                <option value="med">med</option>
                <option value="high">high</option>
                <option value="done">done</option>
              </select>
            </Field>
          </div>
          <div className="vh-grid-2">
            <Field label="Repo URL"><input value={entryModal.data.repoUrl} onChange={(e) => setEntryField('repoUrl', e.target.value)} placeholder="https://github.com/..." /></Field>
            <Field label="Demo URL"><input value={entryModal.data.demoUrl} onChange={(e) => setEntryField('demoUrl', e.target.value)} placeholder="https://..." /></Field>
          </div>
          <Field label="Team" hint="Comma-separated"><input value={entryModal.data.teamRaw} onChange={(e) => setEntryField('teamRaw', e.target.value)} placeholder="ila, m.lin, d.okon" /></Field>
          <Field label="Tasks" hint="One task per line"><textarea value={entryModal.data.tasksRaw} onChange={(e) => setEntryField('tasksRaw', e.target.value)} placeholder={"Pick track\nSubmit video\nPolish demo"} /></Field>
          <Field label="Notes"><textarea value={entryModal.data.notes} onChange={(e) => setEntryField('notes', e.target.value)} placeholder="Any contest details, blockers, judging notes, or reminders." /></Field>
          <button type="submit" style={{display:'none'}} />
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteEntry} onClose={() => setDeleteEntry(null)} onConfirm={async () => {
        if (!deleteEntry) return;
        await window.__vh_mut(`/api/entries/${deleteEntry.id}`, { method:'DELETE' });
        setDeleteEntry(null);
      }} title="Delete submission" body={deleteEntry ? `Delete "${deleteEntry.title}"?` : ''} confirmLabel="delete" />
    </div>
  );
}

/* ============================ CREDITS ============================ */
function Credits() {
  const CR = window.CREDITS || [];
  const [tab, setTab] = useState('inbox');
  const [sel, setSel] = useState(CR[0]?.id ?? null);
  const [applyAllOpen, setApplyAllOpen] = useState(false);
  const list = useMemo(() => {
    if (tab === 'unread')    return CR.filter(c => c.unread);
    if (tab === 'applied')   return CR.filter(c => c.action === 'confirm' || c.action === 'apply');
    if (tab === 'granted')   return CR.filter(c => c.action === 'granted' || c.action === 'claim');
    return CR;
  }, [tab, CR]);
  const count = (k) => {
    if (k==='inbox') return CR.length;
    if (k==='unread') return CR.filter(c=>c.unread).length;
    if (k==='applied') return CR.filter(c=>c.action==='confirm'||c.action==='apply').length;
    if (k==='granted') return CR.filter(c=>c.action==='granted'||c.action==='claim').length;
    return 0;
  };
  const picked = CR.find(c => c.id === sel) || CR[0] || null;

  // Extract a number from "$400" / "$5,000" / "2× quota" — returns 0 if non-dollar
  const usd = (v) => {
    const m = String(v || '').match(/\$\s?([\d,]+)/);
    return m ? Number(m[1].replace(/,/g, '')) : 0;
  };
  const pendingUsd = CR.filter(c => c.action !== 'granted' && c.action !== 'archived').reduce((s, c) => s + usd(c.value), 0);
  const bankedUsd  = CR.filter(c => c.action === 'granted').reduce((s, c) => s + usd(c.value), 0);
  const providers = new Set(CR.map(c => c.provider).filter(Boolean));
  const sources   = new Set(CR.map(c => c.source).filter(Boolean));

  const stats = [
    { k:'Pending value', v: '$' + pendingUsd.toLocaleString() },
    { k:'Banked',        v: '$' + bankedUsd.toLocaleString() },
    { k:'Open leads',    v: String(count('inbox')) },
    { k:'Providers',     v: String(providers.size) },
    { k:'Unread',        v: String(count('unread')) },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">Credit hunter</div>
        <div className="page-meta mono">{providers.size} provider{providers.size===1?'':'s'} · {sources.size} source{sources.size===1?'':'s'}</div>
      </div>
      <div className="page-sub">Every GPU, token, and API credit opportunity Vibehack has scouted. Quick-apply from the list.</div>

      <StatStrip stats={stats} />

      <div className="split">
        <Sec title="Inbox" actions={<>
          <button className="btn" onClick={async () => {
            try { await fetch('/api/workers/gmail/run', {method:'POST'}); } catch {}
            window.__vh_refresh();
          }}>scan now</button>
          <button className="btn btn-primary" onClick={() => setApplyAllOpen(true)}>auto-apply all</button>
        </>}>
          <div className="filt">
            {[['inbox','All'],['unread','Unread'],['applied','Applied'],['granted','Granted']].map(([k,l]) => (
              <div key={k} className="tab" aria-selected={tab===k} onClick={()=>setTab(k)}>
                {l} <span className="ct mono">{count(k)}</span>
              </div>
            ))}
            <div className="gap" />
            <span className="mono" style={{fontSize:11, color:'var(--fg-3)'}}>sort: deadline</span>
          </div>
          <div className="inbox">
            {list.map(c => (
              <div key={c.id} className={`inbox-row ${c.unread ? 'unread' : ''}`} onClick={()=>{
                setSel(c.id);
                if (c.unread) fetch(`/api/credits/${c.id}/read`, {method:'POST'});
              }}>
                <span className={`dot-u ${c.unread ? '' : 'seen'}`} />
                <div className="from">
                  <Logo name={c.provider} />
                  <div className="name">
                    {c.from}
                    <div className="mono" style={{fontSize:10.5, color:'var(--fg-3)', fontWeight:400}}>{c.fromTag}</div>
                  </div>
                </div>
                <div className="sub">
                  <div className="line1">
                    <b>{c.subject}</b>
                    {c.tags.map(t => <span key={t} className="tag">{t}</span>)}
                  </div>
                  <div className="snip">{c.snippet}</div>
                </div>
                <div className="val">{c.value}</div>
                <div className="when">{c.deadline} · {c.when}</div>
                <div className="cta" onClick={(e)=>e.stopPropagation()}>
                  {c.action === 'quick-apply' && <button className="rowbtn primary" onClick={()=>window.__vh_mut(`/api/credits/${c.id}/apply`, {body:{action:'quick-apply'}})}>quick-apply</button>}
                  {c.action === 'confirm'     && <button className="rowbtn primary" onClick={()=>window.__vh_mut(`/api/credits/${c.id}/apply`, {body:{action:'confirm'}})}>confirm</button>}
                  {c.action === 'apply'       && <button className="rowbtn" onClick={()=>window.__vh_mut(`/api/credits/${c.id}/apply`, {body:{action:'apply'}})}>apply</button>}
                  {c.action === 'claim'       && <button className="rowbtn" onClick={()=>window.__vh_mut(`/api/credits/${c.id}/apply`, {body:{action:'claim'}})}>claim</button>}
                  {c.action === 'copy'        && <button className="rowbtn" onClick={()=>window.__vh_mut(`/api/credits/${c.id}/apply`, {body:{action:'copy'}})}>copy</button>}
                  {c.action === 'applied'     && <Chip tone="info">applied</Chip>}
                  {c.action === 'copied'      && <Chip tone="info">copied</Chip>}
                  {c.action === 'granted'     && <Chip tone="ok">granted</Chip>}
                </div>
              </div>
            ))}
          </div>
        </Sec>

        <div>
          <Sec title="Selected" sub={picked?.provider || '—'}>
            {picked ? (
              <div style={{padding:'14px 16px'}}>
                <div style={{display:'flex',alignItems:'center',gap:10, marginBottom:10}}>
                  <Logo name={picked.provider} />
                  <div>
                    <div style={{fontWeight:600}}>{picked.from}</div>
                    <div className="mono" style={{fontSize:11, color:'var(--fg-3)'}}>{picked.fromTag}</div>
                  </div>
                  <div style={{flex:1}} />
                  <Chip tone="accent">{picked.value}</Chip>
                </div>
                <div style={{fontWeight:500, marginBottom:6}}>
                  {picked.source_url ? (
                    <a href={picked.source_url} target="_blank" rel="noopener noreferrer"
                       style={{color:'var(--fg)', textDecoration:'none', borderBottom:'1px dotted var(--border-2)'}}
                       title={picked.source_url}>
                      {picked.subject} <span style={{fontSize:10, color:'var(--fg-4)'}}>↗</span>
                    </a>
                  ) : picked.subject}
                </div>
                <div style={{fontSize:12.5, color:'var(--fg-2)', lineHeight:1.55}}>{picked.snippet}</div>
                <div style={{marginTop:14, display:'grid', gridTemplateColumns:'80px 1fr', rowGap:6, fontSize:12}}>
                  <span className="mono" style={{color:'var(--fg-3)'}}>DEADLINE</span>
                  <span className="mono">{picked.deadline}</span>
                  <span className="mono" style={{color:'var(--fg-3)'}}>TAGS</span>
                  <span>{(picked.tags || []).map(t => <span key={t} className="tag" style={{marginRight:4}}>{t}</span>)}</span>
                  <span className="mono" style={{color:'var(--fg-3)'}}>SOURCE</span>
                  <span className="mono">{picked.source || '—'}</span>
                </div>
                <div style={{marginTop:14, display:'flex', gap:6}}>
                  <button className="rowbtn primary" onClick={() => window.__vh_mut(`/api/credits/${picked.id}/apply`, {body:{action: picked.action}})}>{picked.action === 'granted' ? 'granted' : (picked.action === 'applied' ? 're-apply' : 'apply')}</button>
                  <button className="rowbtn" onClick={() => {
                    const m = (picked.from || '').match(/<([^>]+)>/);
                    const to = m ? m[1] : '';
                    const subject = encodeURIComponent('Re: ' + (picked.subject || ''));
                    const body = encodeURIComponent(`Hi ${picked.from?.split(' ')[0] || 'team'},\n\n— ila (via Vibehack)`);
                    window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_blank');
                  }}>draft reply</button>
                  <button className="rowbtn" onClick={() => window.__vh_mut(`/api/credits/${picked.id}/archive`)}>archive</button>
                </div>
              </div>
            ) : (
              <div style={{padding:'24px 16px', color:'var(--fg-3)', fontSize:12.5, textAlign:'center'}}>
                No credit leads yet. Click <b>scan now</b> above, or trigger a source agent from the sidebar.
              </div>
            )}
          </Sec>
          <div style={{height:16}} />
          <Sec title="Pipeline" sub={`${CR.length} total`}>
            <div style={{padding:'14px 16px', display:'grid', gap:10, fontSize:12.5}}>
              {(() => {
                const buckets = {
                  'Unread':   CR.filter(c => c.unread).length,
                  'To apply': CR.filter(c => c.action === 'quick-apply' || c.action === 'apply' || c.action === 'confirm').length,
                  'Applied':  CR.filter(c => c.action === 'applied').length,
                  'Granted':  CR.filter(c => c.action === 'granted').length,
                  'Archived': CR.filter(c => c.action === 'archived').length,
                };
                const tones = { 'Unread':'warn', 'To apply':'', 'Applied':'', 'Granted':'ok', 'Archived':'bad' };
                const max = Math.max(1, ...Object.values(buckets));
                return Object.entries(buckets).map(([l, n]) => ({ l, n, tone: tones[l] || '', pct: (n / max) * 100 }));
              })().map(({l, n, tone, pct}, i) => (
                <div key={i} style={{display:'grid', gridTemplateColumns:'80px 1fr 32px', gap:10, alignItems:'center'}}>
                  <span className="mono" style={{color:'var(--fg-3)'}}>{l}</span>
                  <Bar value={pct} tone={tone} />
                  <span className="mono" style={{textAlign:'right'}}>{n}</span>
                </div>
              ))}
              {CR.length === 0 && <div className="muted" style={{fontSize:12, padding:'8px 0'}}>no credits yet — scan a source above</div>}
            </div>
          </Sec>
        </div>
      </div>

      <ConfirmDialog
        open={applyAllOpen}
        onClose={() => setApplyAllOpen(false)}
        onConfirm={async () => {
          const targets = (window.CREDITS || []).filter((c) => c.action === 'quick-apply' || c.action === 'apply' || c.action === 'confirm');
          await Promise.all(targets.map((c) => fetch(`/api/credits/${c.id}/apply`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action: c.action})})));
          setApplyAllOpen(false);
          window.__vh_refresh();
        }}
        title="Auto-apply credits"
        body={`Apply to ${(window.CREDITS || []).filter((c) => c.action === 'quick-apply' || c.action === 'apply' || c.action === 'confirm').length} credit offer(s)?`}
        confirmLabel="apply all"
      />
    </div>
  );
}

/* =========================== SCRATCHPAD =========================== */
function NoteEditor({ note, onClose }) {
  const [ttl, setTtl] = useState(note.ttl);
  const [tag, setTag] = useState(note.tag || '');
  const [body, setBody] = useState(note.body || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try { await window.__vh_mut(`/api/notes/${note.id}`, {method:'PATCH', body:{ttl, tag, body}}); } catch {}
    setSaving(false);
    onClose();
  };

  return (
    <div className="note" style={{borderColor:'var(--accent-weak-2)', boxShadow:'0 0 0 2px var(--accent-weak)'}}>
      <input value={ttl} onChange={(e)=>setTtl(e.target.value)} className="mono" style={{fontWeight:600, fontSize:13, border:'1px solid var(--border)', borderRadius:5, padding:'4px 8px', background:'var(--bg-2)', width:'100%'}} />
      <input value={tag} onChange={(e)=>setTag(e.target.value)} placeholder="tag" className="mono" style={{fontSize:11, border:'1px solid var(--border)', borderRadius:5, padding:'3px 8px', background:'var(--bg-2)', width:'100%'}} />
      <textarea value={body} onChange={(e)=>setBody(e.target.value)} style={{flex:1, minHeight:100, border:'1px solid var(--border)', borderRadius:5, padding:'6px 8px', background:'var(--bg-2)', fontFamily:'var(--sans)', fontSize:12.5, color:'var(--fg-2)', resize:'vertical'}} />
      <div className="note-ft" style={{marginTop:4}}>
        <button className="copy-btn" onClick={onClose}>cancel</button>
        <span style={{flex:1}} />
        <button className="copy-btn" style={{background:'var(--accent)', color:'var(--accent-fg)', borderColor:'transparent'}} disabled={saving} onClick={save}>{saving ? 'saving…' : 'save'}</button>
      </div>
    </div>
  );
}

function Scratchpad() {
  const allNotes = window.NOTES || [];
  const [editing, setEditing] = useState(null);
  const [tagFilter, setTagFilter] = useState(null);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState({ ttl:'', tag:'', body:'' });
  const [deleteNote, setDeleteNote] = useState(null);
  const tags = useMemo(() => Array.from(new Set(allNotes.map((n) => n.tag).filter(Boolean))), [allNotes]);
  const notes = tagFilter ? allNotes.filter((n) => n.tag === tagFilter) : allNotes;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">Scratchpad</div>
        <div className="page-meta mono">{allNotes.length} notes · synced</div>
      </div>
      <div className="page-sub">Fast capture for ideas, plans, and half-formed bets. Tag by hackathon to pull them into entries.</div>

      {tags.length > 0 && (
        <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:16}}>
          <button className={`tag mono`} style={{cursor:'pointer', background: tagFilter===null ? 'var(--accent-weak)' : undefined, color: tagFilter===null ? 'var(--accent)' : undefined, borderColor: tagFilter===null ? 'var(--accent-weak-2)' : undefined}} onClick={() => setTagFilter(null)}>all</button>
          {tags.map(t => (
            <button key={t} className="tag mono" style={{cursor:'pointer', background: tagFilter===t ? 'var(--accent-weak)' : undefined, color: tagFilter===t ? 'var(--accent)' : undefined, borderColor: tagFilter===t ? 'var(--accent-weak-2)' : undefined}} onClick={() => setTagFilter(tagFilter===t ? null : t)}>{t}</button>
          ))}
        </div>
      )}

      <Sec title="Notes" actions={<>
        <button className="btn" onClick={() => setTagFilter(null)}>{tagFilter ? `clear (${tagFilter})` : 'tags'}</button>
        <button className="btn btn-primary" onClick={() => setNewNoteOpen(true)}>+ new note</button>
      </>}>
        <div className="notes">
          {notes.map(n => (
            editing === n.id ? (
              <NoteEditor key={n.id} note={n} onClose={() => setEditing(null)} />
            ) : (
              <div className="note" key={n.id}>
                <div className="note-hd">
                  <div className="note-ttl">{n.ttl}</div>
                  <div style={{flex:1}} />
                  <span className="tag mono">{n.tag}</span>
                </div>
                <div className="note-body">{n.body}</div>
                <div className="note-ft">
                  <span>{n.updated_at || 'just now'}</span>
                  <span style={{flex:1}} />
                  <button className="copy-btn" onClick={() => setDeleteNote(n)}>delete</button>
                  <button className="copy-btn" style={{marginLeft:4}} onClick={() => setEditing(n.id)}>open</button>
                </div>
              </div>
            )
          ))}
        </div>
      </Sec>

      <Modal
        open={newNoteOpen}
        onClose={() => setNewNoteOpen(false)}
        title="New note"
        sub="Capture ideas in a real form."
        footer={(
          <>
            <button className="copy-btn" onClick={() => setNewNoteOpen(false)}>cancel</button>
            <span style={{flex:1}} />
            <button className="rowbtn primary" onClick={async () => {
              if (!noteDraft.ttl.trim()) return;
              await window.__vh_mut('/api/notes', { body:{ ttl: noteDraft.ttl.trim(), tag: noteDraft.tag.trim(), body: noteDraft.body } });
              setNoteDraft({ ttl:'', tag:'', body:'' });
              setNewNoteOpen(false);
            }}>create note</button>
          </>
        )}
      >
        <div style={{display:'grid', gap:12}}>
          <Field label="Title"><input autoFocus value={noteDraft.ttl} onChange={(e) => setNoteDraft((prev) => ({ ...prev, ttl: e.target.value }))} placeholder="Note title" /></Field>
          <Field label="Tag"><input value={noteDraft.tag} onChange={(e) => setNoteDraft((prev) => ({ ...prev, tag: e.target.value }))} placeholder="LFH-044 or meta" /></Field>
          <Field label="Body"><textarea value={noteDraft.body} onChange={(e) => setNoteDraft((prev) => ({ ...prev, body: e.target.value }))} placeholder="Write anything" /></Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteNote}
        onClose={() => setDeleteNote(null)}
        onConfirm={async () => {
          if (!deleteNote) return;
          await window.__vh_mut(`/api/notes/${deleteNote.id}`, { method:'DELETE' });
          setDeleteNote(null);
        }}
        title="Delete note"
        body={deleteNote ? `Delete "${deleteNote.ttl}"?` : ''}
        confirmLabel="delete"
      />
    </div>
  );
}

Object.assign(window, { Overview, Discovery, SourcesPanel, AgentAdminPanel, AdminPanel, Entries, Credits, Scratchpad });
