/* ------------------------------------------------------------------
 * Module views
 * ------------------------------------------------------------------ */

function visibleHacks() {
  return (window.HACKS || []).filter((hack) => !hack.hidden);
}

function hackFormState(hack = null) {
  const registrationStatus = hack?.registration_status || (hack?.registered ? 'registered' : 'candidate');
  return {
    id: hack?.id || null,
    name: hack?.name || '',
    host: hack?.host || '',
    website: hack?.website || '',
    location: hack?.location || '',
    attendanceMode: hack?.attendance_mode || 'unknown',
    starts: hack?.starts || '—',
    ends: hack?.ends || hack?.starts || '—',
    status: hack?.status || 'upcoming',
    due: hack?.due || '',
    prize: hack?.prize || '—',
    sourceUrl: hack?.source_url || '',
    registered: !!hack?.registered || ['registered', 'submitted'].includes(registrationStatus),
    registrationStatus,
    hidden: !!hack?.hidden,
    tracksRaw: (hack?.tracks || []).join(', '),
  };
}

const REGISTRATION_STATUSES = ['candidate', 'interested', 'registered', 'waitlisted', 'submitted', 'not_applying'];

function hackRegistrationStatus(hack = {}) {
  const status = hack.registration_status || (hack.registered ? 'registered' : 'candidate');
  return status === 'unregistered' || status === 'not_started' ? 'candidate' : status;
}

function isHackRegistered(hack = {}) {
  return !!hack.registered || ['registered', 'submitted'].includes(hackRegistrationStatus(hack));
}

function registrationTone(status) {
  if (status === 'registered' || status === 'submitted') return 'ok';
  if (status === 'interested' || status === 'waitlisted') return 'info';
  if (status === 'not_applying') return 'warn';
  return '';
}

function deadlineText(row = {}, textFields = [], atFields = []) {
  for (const field of textFields) if (row[field] && row[field] !== '—') return row[field];
  for (const field of atFields) if (row[field]) return row[field];
  return '—';
}

function deadlineMs(row = {}, atFields = [], textFields = []) {
  for (const field of atFields) {
    const ts = new Date(row[field] || '').getTime();
    if (!isNaN(ts)) return ts;
  }
  for (const field of textFields) {
    const ts = new Date(row[field] || '').getTime();
    if (!isNaN(ts)) return ts;
  }
  return NaN;
}

function TimeLabel({ value, at }) {
  if (!value || value === '—') return <>—</>;
  const display = at && value === at
    ? new Date(at).toLocaleString('en-US', { month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' })
    : value;
  return at ? <time dateTime={at}>{display}</time> : <>{display}</>;
}

function linkedEntryForHack(hack, entries = []) {
  return entries.find((entry) => entry.hack_id === hack.id)
    || entries.find((entry) => hack.code && entry.hack === hack.code)
    || entries.find((entry) => hack.source_url && entry.contest_url === hack.source_url)
    || null;
}

function openEntriesRoute(entry = null) {
  if (entry?.id) sessionStorage.setItem('vh:focus-entry', entry.id);
  window.location.hash = '#entries';
}

function sourceHealthDetails(source = {}) {
  return [
    source.last_checked_at && `checked ${source.last_checked_at}`,
    source.last_success_at && `success ${source.last_success_at}`,
    source.last_error_at && `error at ${source.last_error_at}`,
    source.last_error && `error ${source.last_error}`,
    source.last_count != null && `count ${source.last_count}`,
    source.last_added != null && `+${source.last_added}`,
    source.last_updated != null && `${source.last_updated} updated`,
    source.last_added_count != null && `+${source.last_added_count}`,
    source.last_updated_count != null && `${source.last_updated_count} updated`,
  ].filter(Boolean).join(' · ');
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

const SUPPORTED_HEADLESS_SOURCES = [
  { url: 'https://cerebralvalley.ai/hackathons', label: 'Cerebral Valley' },
  { url: 'https://lablab.ai/event', label: 'lablab.ai' },
];
const DEVPOST_SOURCE = { url: 'https://devpost.com/hackathons', label: 'Devpost AI' };

function normalizeLumaSourceUrl(value = '') {
  return String(value || '').trim().replace(/^https?:\/\/lu\.ma\//, '').replace(/^\/+|\/+$/g, '').split('?')[0];
}

function sourceDefaultsForKind(kind, data = {}) {
  if (kind === 'headless') {
    const target = SUPPORTED_HEADLESS_SOURCES.find((source) => source.url === data.url) || SUPPORTED_HEADLESS_SOURCES[0];
    return { ...data, kind, url: target.url, label: data.kind === 'headless' ? data.label : target.label };
  }
  if (kind === 'devpost') {
    return { ...data, kind, url: DEVPOST_SOURCE.url, label: data.kind === 'devpost' ? data.label : DEVPOST_SOURCE.label };
  }
  return { ...data, kind: 'luma', url: data.kind === 'luma' ? normalizeLumaSourceUrl(data.url) : '', label: data.kind === 'luma' ? data.label : '' };
}

function sourcePayload(data) {
  const kind = data.kind || 'luma';
  const note = (data.note || '').trim();
  const enabled = !!data.enabled;
  if (kind === 'headless') {
    const target = SUPPORTED_HEADLESS_SOURCES.find((source) => source.url === data.url) || SUPPORTED_HEADLESS_SOURCES[0];
    return { kind, url: target.url, label: (data.label || '').trim() || target.label, note, enabled };
  }
  if (kind === 'devpost') return { kind, url: DEVPOST_SOURCE.url, label: (data.label || '').trim() || DEVPOST_SOURCE.label, note, enabled };
  return { kind: 'luma', url: normalizeLumaSourceUrl(data.url), label: (data.label || '').trim(), note, enabled };
}

function sourceVisibilityKey(source) {
  return source.kind === 'luma' ? normalizeLumaSourceUrl(source.url) : source.url;
}

function SourceUrlField({ data, setData, autoFocus = false }) {
  if (data.kind === 'headless') {
    return (
      <Field label="Supported website" hint="Website watches are limited to implemented scanners.">
        <select autoFocus={autoFocus} value={data.url} onChange={(e) => {
          const target = SUPPORTED_HEADLESS_SOURCES.find((source) => source.url === e.target.value) || SUPPORTED_HEADLESS_SOURCES[0];
          setData({ url: target.url, label: data.label || target.label });
        }}>
          {SUPPORTED_HEADLESS_SOURCES.map((source) => <option key={source.url} value={source.url}>{source.label}</option>)}
        </select>
      </Field>
    );
  }
  if (data.kind === 'devpost') {
    return (
      <Field label="Devpost index" hint="Devpost scanning currently uses the canonical hackathons index.">
        <select autoFocus={autoFocus} value={DEVPOST_SOURCE.url} onChange={() => {}}>
          <option value={DEVPOST_SOURCE.url}>{DEVPOST_SOURCE.url}</option>
        </select>
      </Field>
    );
  }
  return (
    <Field label="Lu.ma slug or URL" hint="Paste a calendar slug or lu.ma URL.">
      <input autoFocus={autoFocus} value={data.url} onChange={(e) => setData({ url: e.target.value })} placeholder="genai-collective or https://lu.ma/..." />
    </Field>
  );
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
    hackId: entry?.hack_id || '',
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
  if (source.kind === 'luma') {
    const slug = normalizeLumaSourceUrl(source.url);
    return hack.source === 'luma' && (hack.source_key === slug || (hack.tracks || []).includes(slug));
  }
  if (source.kind === 'headless') {
    const website = String(source.url || '').replace(/^https?:\/\/(www\.)?/, '').split(/[/?#]/)[0];
    return hack.source_key === source.url || hack.website === website;
  }
  if (source.kind === 'devpost') return hack.website === 'devpost.com';
  return false;
}

/* =========================== CONTESTS =========================== */
function Contests() {
  const allHacks = window.HACKS || [];
  const hacks = visibleHacks();
  const [filter, setFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sourceModal, setSourceModal] = useState({ open: false, data: sourceFormState() });
  const [hackModal, setHackModal] = useState({ open: false, data: hackFormState() });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filters, setFilters] = useState({ track:'', attendance:'all', source:'all', host:'', website:'' });
  const listRef = useRef(null);

  const sourceValues = [...new Set(hacks.map((h) => h.source).filter(Boolean))].sort();
  const hosts = [...new Set(hacks.map((h) => h.host).filter(Boolean))].sort();
  const websites = [...new Set(hacks.map((h) => h.website).filter(Boolean))].sort();
  const entries = window.ENTRIES || [];
  const nowMs = Date.now();
  const soon = hacks
    .map((h) => ({ ...h, _ts: deadlineMs(h, ['due_at', 'ends_at'], ['due', 'ends']) }))
    .filter((h) => !isNaN(h._ts) && h._ts > nowMs && h._ts < nowMs + 7 * 86400e3)
    .sort((a, b) => a._ts - b._ts);
  const activeEntries = entries.filter((entry) => entry.stage !== 'Submitted');
  const submittedEntries = entries.filter((entry) => entry.stage === 'Submitted');
  const registeredHacks = hacks.filter(isHackRegistered);
  const openContests = hacks.filter((hack) => hack.status === 'open' || hack.status === 'upcoming');
  const stats = [
    { k:'Tracked contests', v: String(hacks.length) },
    { k:'Registered', v: String(registeredHacks.length) },
    { k:'Starting soon', v: String(soon.length) },
    { k:'Active submissions', v: String(activeEntries.length) },
    { k:'Submitted', v: String(submittedEntries.length) },
  ];

  const jumpToList = (nextFilter) => {
    setFilter(nextFilter);
    listRef.current?.scrollIntoView({ behavior:'smooth', block:'start' });
  };

  const rows = useMemo(() => {
    let next = hacks;
    if (filter === 'open') next = next.filter((h) => h.status === 'open');
    if (filter === 'upcoming') next = next.filter((h) => h.status === 'upcoming');
    if (filter === 'registered') next = next.filter(isHackRegistered);
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
    if (k === 'registered') return hacks.filter(isHackRegistered).length;
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
      status: data.status,
      due: data.due.trim() || '—',
      prize: data.prize.trim() || '—',
      sourceUrl: data.sourceUrl.trim(),
      registered: !!data.registered,
      registrationStatus: data.registrationStatus,
      hidden: !!data.hidden,
      tracks: data.tracksRaw.split(',').map((t) => t.trim()).filter(Boolean),
    };
    if (data.id) await window.__vh_mut(`/api/hacks/${data.id}`, { method:'PATCH', body });
    else await window.__vh_mut('/api/hacks', { body });
    setHackModal({ open: false, data: hackFormState() });
  };

  const addSubmissionFromHack = async (hack) => {
    const linkedEntry = linkedEntryForHack(hack, entries);
    if (linkedEntry) {
      openEntriesRoute(linkedEntry);
      return;
    }
    await window.__vh_mut('/api/entries', {
      body: {
        title: hack.name,
        tagline: `Submission for ${hack.name}`,
        hack: hack.code,
        hackId: hack.id,
        contestName: hack.name,
        contestHost: hack.host,
        contestUrl: hack.source_url || '',
        contestDeadline: deadlineText(hack, ['due', 'ends'], ['due_at', 'ends_at']),
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
    const body = sourcePayload(data);
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

  const setRegistrationStatus = async (hack, registrationStatus) => {
    await window.__vh_mut(`/api/hacks/${hack.id}/registration`, {
      method:'PATCH',
      body:{ registrationStatus, registered: registrationStatus === 'registered' || registrationStatus === 'submitted' },
    });
  };

  useEffect(() => {
    const onNew = (event) => {
      const type = event.detail?.type;
      if (type === 'contest') setHackModal({ open: true, data: hackFormState() });
      if (type === 'source') setSourceModal({ open: true, data: sourceFormState() });
    };
    window.addEventListener('vh:new', onNew);
    return () => window.removeEventListener('vh:new', onNew);
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">Contests</div>
        <div className="page-meta mono">{(() => {
          const sources = [...new Set(hacks.map((h) => h.source).filter(Boolean))];
          return sources.length ? `tracking ${sources.join(' · ')} · ${allHacks.length - hacks.length} hidden` : 'no sources configured';
        })()}</div>
      </div>
      <div className="page-sub">Hackathons and vibe coding contests Vibehack is tracking for you. Irrelevant meetups stay hidden by default, and selected events can be pushed into submissions.</div>

      <StatStrip stats={stats} />

      <div className="cols-2">
        <Sec title="Next up" sub={soon.length > 0 ? `${soon.length} starting in 7 days` : 'upcoming'} actions={<button className="btn" onClick={() => jumpToList('upcoming')}>Open list</button>}>
          <table className="tbl responsive-card">
            <thead><tr><th>Event</th><th>Host</th><th>When</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(soon.length > 0 ? soon : hacks.filter((h) => h.status !== 'closed')).slice(0,5).map((h) => (
                <tr key={h.id}>
                  <td data-label="Event">
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
                        <div className="mono" style={{fontSize:11,color:'var(--fg-3)'}}>{[h.code, ...(h.tracks || []).slice(0, 2)].filter(Boolean).join(' · ')}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Host" className="muted">{h.host || '—'}</td>
                  <td data-label="When" className="mono"><TimeLabel value={h.starts} at={h.starts_at} /> → <TimeLabel value={h.ends} at={h.ends_at} /></td>
                  <td data-label="Status">
                    {h.status === 'open' ? <Chip tone="ok">open</Chip>
                      : h.status === 'upcoming' ? <Chip tone="info">upcoming</Chip>
                      : <Chip>closed</Chip>}
                    {linkedEntryForHack(h, entries) && <Chip tone="info">submission</Chip>}
                  </td>
                  <td data-label="Actions" style={{textAlign:'right'}}>
                    {linkedEntryForHack(h, entries)
                      ? <button className="rowbtn" onClick={() => openEntriesRoute(linkedEntryForHack(h, entries))}>view submission</button>
                      : h.source_url
                      ? <a href={h.source_url} target="_blank" rel="noopener noreferrer" className="rowbtn" style={{textDecoration:'none'}}>open ↗</a>
                      : <button className="rowbtn" onClick={() => jumpToList('all')}>view</button>}
                  </td>
                </tr>
              ))}
              {hacks.length === 0 && (
                <tr><td colSpan={5} style={{padding:'16px', color:'var(--fg-3)', fontSize:12, textAlign:'center'}}>no contests tracked yet</td></tr>
              )}
            </tbody>
          </table>
        </Sec>

        <Sec title="Registered contests" sub={`${registeredHacks.length} selected`} actions={<button className="btn" onClick={() => jumpToList('registered')}>Manage</button>}>
          <table className="tbl responsive-card">
            <thead><tr><th>Event</th><th>Window</th><th>Prize</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(registeredHacks.length ? registeredHacks : openContests).slice(0,6).map((h) => (
                <tr key={h.id}>
                  <td data-label="Event" style={{display:'flex',alignItems:'center',gap:10}}>
                    <Logo name={h.host} />
                    <span style={{fontWeight:600}}>{h.name}</span>
                  </td>
                  <td data-label="Window" className="mono"><TimeLabel value={h.starts} at={h.starts_at} /> → <TimeLabel value={h.ends} at={h.ends_at} /></td>
                  <td data-label="Prize"><span className="mono" style={{fontWeight:600}}>{h.prize}</span></td>
                  <td data-label="Status">
                    <Chip tone={registrationTone(hackRegistrationStatus(h))}>{hackRegistrationStatus(h).replace('_', ' ')}</Chip>
                    {linkedEntryForHack(h, entries) && <Chip tone="info">submission</Chip>}
                  </td>
                  <td data-label="Actions" style={{textAlign:'right'}}>
                    {linkedEntryForHack(h, entries)
                      ? <button className="rowbtn" onClick={() => openEntriesRoute(linkedEntryForHack(h, entries))}>view submission</button>
                      : h.source_url
                      ? <a href={h.source_url} target="_blank" rel="noopener noreferrer" className="rowbtn" style={{textDecoration:'none'}}>open ↗</a>
                      : <button className="rowbtn" onClick={() => jumpToList('all')}>view</button>}
                  </td>
                </tr>
              ))}
              {hacks.length === 0 && (
                <tr><td colSpan={5} style={{padding:'16px', color:'var(--fg-3)', fontSize:12, textAlign:'center'}}>no contests tracked yet</td></tr>
              )}
            </tbody>
          </table>
        </Sec>
      </div>

      <div style={{height:20}} />

      <Sec title="Calendar" sub={window.MONTH.name} actions={<>
        <span className="btn" style={{background:'var(--bg-3)'}}>month</span>
        <button className="btn" onClick={() => jumpToList('upcoming')}>show upcoming</button>
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

      <div ref={listRef}>
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
            <button key={k} type="button" className="tab" aria-selected={filter===k} style={{border:0, background:filter===k ? 'var(--bg-3)' : 'transparent', color:filter===k ? 'var(--fg)' : undefined}} onClick={() => setFilter(k)}>
              {l} <span className="ct mono">{count(k)}</span>
            </button>
          ))}
          <div className="gap" />
          <span className="mono" style={{fontSize:11, color:'var(--fg-3)'}}>
            {filters.track || filters.attendance !== 'all' || filters.source !== 'all' || filters.host || filters.website ? 'filters active' : 'sort: starts soonest'}
          </span>
        </div>

        <table className="tbl responsive-card">
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
                <td data-label="Event" style={{minWidth:280}}>
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
                <td data-label="Window" className="mono"><TimeLabel value={h.starts} at={h.starts_at} /> — <TimeLabel value={h.ends} at={h.ends_at} /></td>
                <td data-label="Prize" className="mono" style={{fontWeight:600}}>{h.prize}</td>
                <td data-label="Tracks">
                  <div style={{display:'flex',gap:4, flexWrap:'wrap'}}>
                    {(h.tracks || []).map((t) => <span key={t} className="tag">{t}</span>)}
                  </div>
                </td>
                <td data-label="Mode">
                  <Chip tone={h.attendance_mode === 'online' ? 'ok' : h.attendance_mode === 'hybrid' ? 'info' : h.attendance_mode === 'in_person' ? 'warn' : ''}>
                    {(h.attendance_mode || 'unknown').replace('_', ' ')}
                  </Chip>
                </td>
                <td data-label="Status">
                  {h.status === 'open' ? <Chip tone="ok">open</Chip>
                    : h.status === 'upcoming' ? <Chip tone="info">upcoming</Chip>
                    : <Chip>closed</Chip>}
                  <Chip tone={registrationTone(hackRegistrationStatus(h))}>{hackRegistrationStatus(h).replace('_', ' ')}</Chip>
                  {linkedEntryForHack(h, entries) && <Chip tone="info">submission</Chip>}
                </td>
                <td data-label="Actions" style={{textAlign:'right', whiteSpace:'nowrap'}}>
                  <button className="rowbtn" onClick={() => addSubmissionFromHack(h)}>{linkedEntryForHack(h, entries) ? 'view submission' : 'add to submissions'}</button>
                  <select value={hackRegistrationStatus(h)} onChange={(e) => setRegistrationStatus(h, e.target.value)} style={{marginLeft:4, width:128}} aria-label={`Registration status for ${h.name}`}>
                    {REGISTRATION_STATUSES.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
                  </select>
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
      </div>

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Contest filters"
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
          <Field label="Source">
            <select value={filters.source} onChange={(e) => setFilters((prev) => ({ ...prev, source: e.target.value }))}>
              <option value="all">All</option>
              {sourceValues.map((source) => <option key={source} value={source}>{source}</option>)}
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
              <select value={sourceModal.data.kind} onChange={(e) => setSourceModal((prev) => ({ ...prev, data: sourceDefaultsForKind(e.target.value, prev.data) }))}>
                <option value="luma">Lu.ma calendar</option>
                <option value="headless">Website watch</option>
                <option value="devpost">Devpost index</option>
              </select>
            </Field>
            <Field label="Label">
              <input value={sourceModal.data.label} onChange={(e) => setSourceModal((prev) => ({ ...prev, data: { ...prev.data, label: e.target.value } }))} placeholder="Optional name" />
            </Field>
          </div>
          <SourceUrlField data={sourceModal.data} autoFocus setData={(patch) => setSourceModal((prev) => ({ ...prev, data: { ...prev.data, ...patch } }))} />
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
            <Field label="Status">
              <select value={hackModal.data.status} onChange={(e) => setHackModal((prev) => ({ ...prev, data: { ...prev.data, status: e.target.value } }))}>
                <option value="open">Open</option>
                <option value="upcoming">Upcoming</option>
                <option value="closed">Closed</option>
              </select>
            </Field>
            <Field label="Due"><input value={hackModal.data.due} onChange={(e) => setHackModal((prev) => ({ ...prev, data: { ...prev.data, due: e.target.value } }))} placeholder="May 04 23:59 UTC" /></Field>
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
          <div style={{display:'flex', gap:16, flexWrap:'wrap'}}>
            <label style={{display:'flex', alignItems:'center', gap:8, fontSize:12.5}}>
              <span>Registration</span>
              <select value={hackModal.data.registrationStatus} onChange={(e) => setHackModal((prev) => ({ ...prev, data: { ...prev.data, registrationStatus: e.target.value, registered: e.target.value === 'registered' || e.target.value === 'submitted' } }))}>
                {REGISTRATION_STATUSES.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
              </select>
            </label>
            <label style={{display:'flex', alignItems:'center', gap:8, fontSize:12.5}}>
              <input type="checkbox" checked={!!hackModal.data.hidden} onChange={(e) => setHackModal((prev) => ({ ...prev, data: { ...prev.data, hidden: e.target.checked } }))} />
              <span>Hidden from contest views</span>
            </label>
          </div>
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
    const body = sourcePayload(data);
    if (data.id) await window.__vh_mut(`/api/sources/${data.id}`, { method:'PATCH', body });
    else await window.__vh_mut('/api/sources', { body });
    setSourceModal({ open: false, data: sourceFormState() });
  };

  const setGroupVisibility = async (field, value, hidden) => {
    await window.__vh_mut('/api/hacks/visibility', { method:'PATCH', body:{ field, value, hidden } });
  };

  useEffect(() => {
    if (sessionStorage.getItem('vh:new-source') === '1') {
      sessionStorage.removeItem('vh:new-source');
      setTab('sources');
      setSourceModal({ open: true, data: sourceFormState() });
    }
    const onNew = (event) => {
      if (event.detail?.type === 'source') {
        sessionStorage.removeItem('vh:new-source');
        setTab('sources');
        setSourceModal({ open: true, data: sourceFormState() });
      }
    };
    window.addEventListener('vh:new', onNew);
    return () => window.removeEventListener('vh:new', onNew);
  }, []);

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
          <table className="tbl responsive-card">
            <thead><tr><th>Host</th><th>Websites</th><th>Events</th><th>Hidden</th><th></th></tr></thead>
            <tbody>
              {hostGroups.map((group) => (
                <tr key={group.key}>
                  <td data-label="Host" style={{fontWeight:600}}>{group.key}</td>
                  <td data-label="Websites" className="mono muted">{Array.from(group.websites).join(' · ') || '—'}</td>
                  <td data-label="Events" className="mono">{group.total}</td>
                  <td data-label="Hidden" className="mono">{group.hidden}</td>
                  <td data-label="Actions" style={{textAlign:'right'}}>
                    <button className="rowbtn" onClick={() => setGroupVisibility('host', group.key, group.hidden < group.total)}>{group.hidden < group.total ? 'hide events' : 'show events'}</button>
                  </td>
                </tr>
              ))}
              {hostGroups.length === 0 && <tr><td colSpan={5} style={{padding:'18px 16px', textAlign:'center', color:'var(--fg-3)'}}>No hosts yet.</td></tr>}
            </tbody>
          </table>
        )}

        {tab === 'websites' && (
          <table className="tbl responsive-card">
            <thead><tr><th>Website</th><th>Events</th><th>Hidden</th><th>Sources</th><th></th></tr></thead>
            <tbody>
              {websiteGroups.map((group) => (
                <tr key={group.key}>
                  <td data-label="Website" className="mono" style={{fontWeight:600}}>{group.key}</td>
                  <td data-label="Events" className="mono">{group.total}</td>
                  <td data-label="Hidden" className="mono">{group.hidden}</td>
                  <td data-label="Sources" className="mono muted">{Array.from(group.sources).join(' · ') || '—'}</td>
                  <td data-label="Actions" style={{textAlign:'right'}}>
                    <button className="rowbtn" onClick={() => setGroupVisibility('website', group.key, group.hidden < group.total)}>{group.hidden < group.total ? 'hide events' : 'show events'}</button>
                  </td>
                </tr>
              ))}
              {websiteGroups.length === 0 && <tr><td colSpan={5} style={{padding:'18px 16px', textAlign:'center', color:'var(--fg-3)'}}>No websites yet.</td></tr>}
            </tbody>
          </table>
        )}

        {tab === 'sources' && (
          <table className="tbl responsive-card">
            <thead><tr><th>Source</th><th>Type</th><th>Events</th><th>Bot status</th><th></th></tr></thead>
            <tbody>
              {sourceRows.map((source) => (
                <tr key={source.id}>
                  <td data-label="Source">
                    <div style={{fontWeight:600}}>{source.label || source.url}</div>
                    <div className="mono" style={{fontSize:11, color:'var(--fg-3)'}}>{source.url}</div>
                    {sourceHealthDetails(source) && <div className="mono" style={{fontSize:11, color: source.last_error ? 'var(--bad)' : 'var(--fg-3)'}}>{sourceHealthDetails(source)}</div>}
                  </td>
                  <td data-label="Type" className="mono">{source.kind}</td>
                  <td data-label="Events" className="mono">{source.total} total · {source.hiddenCount} hidden</td>
                  <td data-label="Bot status">{source.enabled ? <Chip tone={source.last_error ? 'bad' : 'ok'}>{source.last_error ? 'error' : 'scanning'}</Chip> : <Chip tone="warn">ignored</Chip>}</td>
                  <td data-label="Actions" style={{textAlign:'right', whiteSpace:'nowrap'}}>
                    <button className="rowbtn" onClick={() => setSourceModal({ open: true, data: sourceFormState(source) })}>edit</button>
                    <button className="rowbtn" style={{marginLeft:4}} onClick={() => window.__vh_mut(`/api/sources/${source.id}`, { method:'PATCH', body:{ enabled: !source.enabled } })}>{source.enabled ? 'bots ignore' : 'resume scans'}</button>
                    <button className="rowbtn" style={{marginLeft:4}} onClick={() => setGroupVisibility('source_key', sourceVisibilityKey(source), source.hiddenCount < source.total)}>{source.hiddenCount < source.total ? 'hide events' : 'show events'}</button>
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
              <select value={sourceModal.data.kind} onChange={(e) => setSourceModal((prev) => ({ ...prev, data: sourceDefaultsForKind(e.target.value, prev.data) }))}>
                <option value="luma">Lu.ma calendar</option>
                <option value="headless">Website watch</option>
                <option value="devpost">Devpost index</option>
              </select>
            </Field>
            <Field label="Label">
              <input value={sourceModal.data.label} onChange={(e) => setSourceModal((prev) => ({ ...prev, data: { ...prev.data, label: e.target.value } }))} placeholder="Friendly name" />
            </Field>
          </div>
          <SourceUrlField data={sourceModal.data} autoFocus setData={(patch) => setSourceModal((prev) => ({ ...prev, data: { ...prev.data, ...patch } }))} />
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
        <table className="tbl responsive-card">
          <thead><tr><th>Agent</th><th>Members</th><th>Status</th><th>Runs</th><th></th></tr></thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.name}>
                <td data-label="Agent" style={{fontWeight:600}}>{agent.label || agent.name}</td>
                <td data-label="Members" className="mono muted">{(agent.members || []).join(' · ')}</td>
                <td data-label="Status"><Chip tone={agent.state === 'error' ? 'bad' : agent.state === 'busy' ? 'warn' : agent.state === 'running' ? 'ok' : ''}>{agent.state}</Chip></td>
                <td data-label="Runs" className="mono">{agent.runs}</td>
                <td data-label="Actions" style={{textAlign:'right'}}><button className="rowbtn" onClick={() => runAgent(agent)}>run now</button></td>
              </tr>
            ))}
            {agents.length === 0 && <tr><td colSpan={5} style={{padding:'18px 16px', textAlign:'center', color:'var(--fg-3)'}}>No agents loaded.</td></tr>}
          </tbody>
        </table>
      </Sec>
    </div>
  );
}

function AdminLogPanel() {
  const agents = window.__vh_agents || [];
  const running = agents.filter((agent) => agent.runs > 0).length;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">Admin log</div>
        <div className="page-meta mono">{running}/{agents.length} agents have run</div>
      </div>
      <div className="page-sub">Live ingestion and system activity from the scanner backend.</div>

      <Sec title="Activity" sub="live" actions={<Chip tone={agents.some((agent) => agent.state === 'error') ? 'bad' : 'ok'}>{agents.length} agents</Chip>}>
        <AgentLog />
      </Sec>
    </div>
  );
}

function AdminPanel() {
  const [tab, setTab] = useState('sources');
  useEffect(() => {
    const onNew = (event) => {
      if (event.detail?.type === 'source') {
        sessionStorage.setItem('vh:new-source', '1');
        setTab('sources');
      }
    };
    window.addEventListener('vh:new', onNew);
    return () => window.removeEventListener('vh:new', onNew);
  }, []);
  return (
    <div>
      <div className="page" style={{paddingBottom:0}}>
        <div className="page-head">
          <div className="page-title">Admin</div>
          <div className="page-meta mono">source controls, agent runs, and logs</div>
        </div>
        <div className="page-sub">Use this area to control event sources, run scanning agents manually, and monitor ingestion activity.</div>
        <div className="filt" style={{border:'1px solid var(--border)', borderRadius:8, marginBottom:20}}>
          {[['sources','Source rules'],['agents','Agents'],['log','Admin log']].map(([key, label]) => (
            <button key={key} type="button" className="tab" aria-selected={tab===key} style={{border:0, background:tab===key ? 'var(--bg-3)' : 'transparent', color:tab===key ? 'var(--fg)' : undefined}} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
      </div>
      {tab === 'sources' && <SourcesPanel />}
      {tab === 'agents' && <AgentAdminPanel />}
      {tab === 'log' && <AdminLogPanel />}
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
    .map((entry) => ({ ...entry, _ts: deadlineMs(entry, ['deadline_at', 'contest_deadline_at'], ['deadline', 'contest_deadline']) }))
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
    const linkedExisting = !data.id && entries.find((entry) => (
      (data.hackId && entry.hack_id === data.hackId)
      || (data.hack && entry.hack === data.hack)
      || (data.contestUrl && entry.contest_url === data.contestUrl)
    ));
    if (linkedExisting) {
      setEntryModal({ open:false, data: entryFormState(), importing:false, warning:'' });
      setExpanded(linkedExisting.id);
      window.__vh_toast?.(`Opened existing submission for ${linkedExisting.contest_name || linkedExisting.hack || linkedExisting.title}`, 'info');
      return;
    }
    const existingEntry = data.id ? entries.find((entry) => entry.id === data.id) : null;
    const existingTaskState = new Map((existingEntry?.tasks || []).map((task) => [task.t, !!task.d]));
    const body = {
      title: data.title.trim(),
      project: data.project.trim() || data.title.trim().toLowerCase().replace(/\W+/g, '-'),
      tagline: data.tagline.trim(),
      hack: data.hack.trim(),
      hackId: data.hackId,
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
          warning: data.matchedEntry ? 'Existing submission found; opened it instead of creating a duplicate.' : data.warning || '',
          data: {
          ...prev.data,
          ...(data.matchedEntry ? entryFormState(data.matchedEntry) : {}),
          contestUrl: data.url || prev.data.contestUrl,
          contestName: data.matchedHack?.name || data.title || prev.data.contestName,
          contestHost: data.matchedHack?.host || data.host || prev.data.contestHost,
          hack: data.hackCode || prev.data.hack,
          hackId: data.matchedHack?.id || prev.data.hackId,
          contestDeadline: data.contestDeadline || prev.data.contestDeadline,
          contestPrize: data.contestPrize || prev.data.contestPrize,
        },
      }));
      if (data.matchedEntry?.id) setExpanded(data.matchedEntry.id);
    } catch (err) {
      setEntryModal((prev) => ({ ...prev, importing:false, warning: err.message }));
    }
  };

  useEffect(() => {
    const focused = sessionStorage.getItem('vh:focus-entry');
    if (focused) {
      sessionStorage.removeItem('vh:focus-entry');
      setExpanded(focused);
    }
    const onNew = (event) => {
      const type = event.detail?.type;
      if (type === 'submission' || type === 'import_url') {
        setEntryModal({ open:true, data: entryFormState(), importing:false, warning:'' });
      }
    };
    window.addEventListener('vh:new', onNew);
    return () => window.removeEventListener('vh:new', onNew);
  }, []);

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
        <table className="tbl responsive-card">
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
                    <td data-label="Project" style={{minWidth:240}}>
                      <div style={{fontWeight:600}}>{entry.title}</div>
                      <div className="muted" style={{fontSize:12, marginTop:2, maxWidth:320, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{entry.tagline || entry.project}</div>
                    </td>
                    <td data-label="Contest">
                      <div style={{fontWeight:500}}>{entry.contest_name || entry.hack || '—'}</div>
                      <div className="mono" style={{fontSize:11, color:'var(--fg-3)'}}>{[entry.contest_host, entry.contest_prize].filter(Boolean).join(' · ') || 'manual entry'}</div>
                    </td>
                    <td data-label="Stage"><Chip tone={entry.stage==='Building'?'ok':entry.stage==='Scoping'?'info':''}>{entry.stage.toLowerCase()}</Chip></td>
                    <td data-label="Progress">
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <Bar value={entry.progress} tone={entry.progress > 75 ? 'ok' : entry.progress < 25 ? 'warn' : ''} />
                        <span className="mono" style={{fontSize:11,color:'var(--fg-3)', minWidth:34, textAlign:'right'}}>{entry.progress}%</span>
                      </div>
                    </td>
                    <td data-label="Build due" className="mono"><TimeLabel value={deadlineText(entry, ['deadline'], ['deadline_at'])} at={entry.deadline_at} /></td>
                    <td data-label="Contest due" className="mono"><TimeLabel value={deadlineText(entry, ['contest_deadline'], ['contest_deadline_at'])} at={entry.contest_deadline_at} /></td>
                    <td data-label="Risk">{entry.risk==='low' ? <Chip tone="ok">low</Chip> : entry.risk==='med' ? <Chip tone="warn">med</Chip> : entry.risk==='high' ? <Chip tone="bad">high</Chip> : <Chip tone="info">done</Chip>}</td>
                    <td data-label="Actions" style={{textAlign:'right'}}><button className="rowbtn" onClick={() => setExpanded(isOpen ? null : entry.id)}>{isOpen ? 'close' : `open · ${doneCount}/${entry.tasks.length}`}</button></td>
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
                              <div><b>Build due:</b> <span className="mono"><TimeLabel value={deadlineText(entry, ['deadline'], ['deadline_at'])} at={entry.deadline_at} /></span></div>
                              <div><b>Contest due:</b> <span className="mono"><TimeLabel value={deadlineText(entry, ['contest_deadline'], ['contest_deadline_at'])} at={entry.contest_deadline_at} /></span></div>
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
        <table className="tbl responsive-card">
          <thead><tr><th>Project</th><th>Contest</th><th>Result</th><th>Links</th><th></th></tr></thead>
          <tbody>
            {done.map((entry) => {
              const isOpen = expanded === entry.id;
              return (
                <React.Fragment key={entry.id}>
                  <tr>
                    <td data-label="Project" style={{fontWeight:500}}>{entry.title}</td>
                    <td data-label="Contest" className="mono">{entry.contest_name || entry.hack || '—'}</td>
                    <td data-label="Result"><Chip tone="info">submitted</Chip></td>
                    <td data-label="Links" className="mono muted">{[entry.repo_url && 'repo', entry.demo_url && 'demo', entry.contest_url && 'contest'].filter(Boolean).join(' · ') || '—'}</td>
                    <td data-label="Actions" style={{textAlign:'right'}}><button className="rowbtn" onClick={() => setExpanded(isOpen ? null : entry.id)}>{isOpen ? 'close' : 'retro'}</button></td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={5} style={{background:'var(--bg-2)', padding:'14px 18px'}}>
                        <div style={{fontSize:12.5, color:'var(--fg-2)', lineHeight:1.7}}>
                          <div><b>Contest:</b> {entry.contest_name || entry.hack || '—'}</div>
                          <div><b>Deadline hit:</b> <span className="mono"><TimeLabel value={deadlineText(entry, ['contest_deadline', 'deadline'], ['contest_deadline_at', 'deadline_at'])} at={entry.contest_deadline_at || entry.deadline_at} /></span></div>
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
        width={1280}
        footer={(
          <>
            <button className="copy-btn" onClick={() => setEntryModal({ open:false, data: entryFormState(), importing:false, warning:'' })}>cancel</button>
            <span style={{flex:1}} />
            <button className="rowbtn primary" onClick={saveEntry}>{entryModal.data.id ? 'save submission' : 'create submission'}</button>
          </>
        )}
      >
        <form className="entry-form" onSubmit={saveEntry} style={{display:'grid', gap:10}}>
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
          <div className="vh-grid-4">
            <Field label="Contest name"><input value={entryModal.data.contestName} onChange={(e) => setEntryField('contestName', e.target.value)} placeholder="Contest name" /></Field>
            <Field label="Host"><input value={entryModal.data.contestHost} onChange={(e) => setEntryField('contestHost', e.target.value)} placeholder="Devpost, Lu.ma, sponsor" /></Field>
            <Field label="Contest deadline"><input value={entryModal.data.contestDeadline} onChange={(e) => setEntryField('contestDeadline', e.target.value)} placeholder="May 04 23:59 UTC" /></Field>
            <Field label="Prize"><input value={entryModal.data.contestPrize} onChange={(e) => setEntryField('contestPrize', e.target.value)} placeholder="$10,000" /></Field>
          </div>
          <div className="vh-grid-4">
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

Object.assign(window, { Contests, SourcesPanel, AgentAdminPanel, AdminLogPanel, AdminPanel, Entries });
