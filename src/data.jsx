/* ------------------------------------------------------------------
 * Vibehack seed data — dummy content for a Linear/Notion-style console
 * ------------------------------------------------------------------ */

const HACKS = [
  { id:'h1', code:'LFH-044', name:'Latent Futures Hackathon', host:'Latent Labs + Groq', starts:'Apr 24', ends:'Apr 28', prize:'$48,000', tracks:['Agents','RAG','Voice'], status:'open', registered:true, registration_status:'registered', registration_url:'https://latent-labs.example/hackathon/register', registration_notes:'Team checked in.', registered_at:'2026-04-20T18:30:00.000Z', teammates:3, progress:62, you:'In progress', due:'Apr 27 23:59 UTC', source:'seed', source_url:'https://latent-labs.example/hackathons/latent-futures', source_key:'manual', source_url_key:'latent-labs.example/hackathons/latent-futures', website:'latent-labs.example', location:'Online', attendance_mode:'online', hidden:false, starts_at:'2026-04-24T00:00:00.000Z', ends_at:'2026-04-28T00:00:00.000Z', due_at:'2026-04-27T23:59:00.000Z' },
  { id:'h2', code:'EDG-012', name:'Edge Model Jam', host:'Modal', starts:'Apr 26', ends:'Apr 29', prize:'$25,000', tracks:['On-device','Eval'], status:'open', registered:true, registration_status:'registered', registration_url:'https://modal.example/edge-model-jam', registration_notes:'Project linked from Submissions.', registered_at:'2026-04-23T15:15:00.000Z', teammates:2, progress:18, you:'Scoping', due:'Apr 29 17:00 PT', source:'seed', source_url:'https://modal.example/events/edge-model-jam', source_key:'manual', source_url_key:'modal.example/events/edge-model-jam', website:'modal.example', location:'Online', attendance_mode:'online', hidden:false, starts_at:'2026-04-26T00:00:00.000Z', ends_at:'2026-04-29T00:00:00.000Z', due_at:'2026-04-30T01:00:00.000Z' },
  { id:'h3', code:'ORB-007', name:'Orbit Build Weekend', host:'Orbit AI', starts:'May 02', ends:'May 04', prize:'$15,000', tracks:['Agents','Tools'], status:'upcoming', registered:true, registration_status:'registered', registration_url:'https://orbit.example/build-weekend', registration_notes:'Solo entry.', registered_at:'2026-04-24T10:00:00.000Z', teammates:1, progress:4, you:'Idea phase', due:'May 04 20:00 UTC', source:'seed', source_url:'https://orbit.example/events/build-weekend', source_key:'manual', source_url_key:'orbit.example/events/build-weekend', website:'orbit.example', location:'Online', attendance_mode:'online', hidden:false, starts_at:'2026-05-02T00:00:00.000Z', ends_at:'2026-05-04T00:00:00.000Z', due_at:'2026-05-04T20:00:00.000Z' },
  { id:'h4', code:'NMP-221', name:'Neural Mini-Prix', host:'Neurosphere', starts:'May 09', ends:'May 10', prize:'$8,000', tracks:['Speedrun','Eval'], status:'upcoming', registered:false, registration_status:'interested', registration_url:'https://neurosphere.example/mini-prix', registration_notes:'Waiting on team availability.', registered_at:null, teammates:0, progress:0, you:'—', due:'—', source:'seed', source_url:'https://neurosphere.example/events/neural-mini-prix', source_key:'manual', source_url_key:'neurosphere.example/events/neural-mini-prix', website:'neurosphere.example', location:'Online', attendance_mode:'online', hidden:false, starts_at:'2026-05-09T00:00:00.000Z', ends_at:'2026-05-10T00:00:00.000Z', due_at:null },
  { id:'h5', code:'BOB-033', name:'Build On Base', host:'Basecamp AI', starts:'May 15', ends:'May 22', prize:'$60,000', tracks:['Agents','Coding','RAG'], status:'upcoming', registered:false, registration_status:'candidate', registration_url:'https://basecamp.example/build-on-base', registration_notes:'', registered_at:null, teammates:0, progress:0, you:'—', due:'—', source:'seed', source_url:'https://basecamp.example/hackathons/build-on-base', source_key:'manual', source_url_key:'basecamp.example/hackathons/build-on-base', website:'basecamp.example', location:'Online', attendance_mode:'online', hidden:false, starts_at:'2026-05-15T00:00:00.000Z', ends_at:'2026-05-22T00:00:00.000Z', due_at:null },
  { id:'h6', code:'TRC-108', name:'Transcoder Throwdown', host:'Replicate', starts:'Apr 18', ends:'Apr 20', prize:'$12,000', tracks:['Video','Audio'], status:'closed', registered:true, registration_status:'submitted', registration_url:'https://replicate.example/transcoder-throwdown', registration_notes:'Submission complete.', registered_at:'2026-04-18T16:00:00.000Z', teammates:2, progress:100, you:'Submitted', due:'Apr 20 23:59 UTC', source:'seed', source_url:'https://replicate.example/hackathons/transcoder-throwdown', source_key:'manual', source_url_key:'replicate.example/hackathons/transcoder-throwdown', website:'replicate.example', location:'Online', attendance_mode:'online', hidden:false, starts_at:'2026-04-18T00:00:00.000Z', ends_at:'2026-04-20T00:00:00.000Z', due_at:'2026-04-20T23:59:00.000Z' },
  { id:'h7', code:'PLN-061', name:'Planner Benchmarks Cup', host:'Evals.ai', starts:'Apr 11', ends:'Apr 14', prize:'$20,000', tracks:['Eval','Agents'], status:'closed', registered:true, registration_status:'submitted', registration_url:'https://evals.example/planner-cup', registration_notes:'Placed 7th.', registered_at:'2026-04-11T12:00:00.000Z', teammates:4, progress:100, you:'Placed 7th', due:'Apr 14 23:59 UTC', source:'seed', source_url:'https://evals.example/contests/planner-benchmarks-cup', source_key:'manual', source_url_key:'evals.example/contests/planner-benchmarks-cup', website:'evals.example', location:'Online', attendance_mode:'online', hidden:false, starts_at:'2026-04-11T00:00:00.000Z', ends_at:'2026-04-14T00:00:00.000Z', due_at:'2026-04-14T23:59:00.000Z' },
];

const ENTRIES = [
  { id:'e1', hack:'LFH-044', hack_id:'h1', contest_name:'Latent Futures Hackathon', contest_host:'Latent Labs + Groq', contest_url:'https://latent-labs.example/hackathons/latent-futures', contest_url_key:'latent-labs.example/hackathons/latent-futures', contest_deadline:'Apr 27 23:59 UTC', contest_deadline_at:'2026-04-27T23:59:00.000Z', contest_prize:'$48,000', repo_url:'https://github.com/example/gradient-scout', demo_url:'', notes:'Linked to contest record from fallback data.', project:'gradient-scout', title:'Gradient Scout', tagline:'Multi-agent RAG over internal wikis.', team:['ila','m.lin','d.okon'], progress:62, stage:'Building', deadline:'Apr 27 18:00 UTC', deadline_at:'2026-04-27T18:00:00.000Z', risk:'med', tasks:[{t:'Eval harness', d:true},{t:'Voice wrapper', d:true},{t:'Submit video', d:false},{t:'Write tech memo', d:false}] },
  { id:'e2', hack:'EDG-012', hack_id:'h2', contest_name:'Edge Model Jam', contest_host:'Modal', contest_url:'https://modal.example/events/edge-model-jam', contest_url_key:'modal.example/events/edge-model-jam', contest_deadline:'Apr 29 17:00 PT', contest_deadline_at:'2026-04-30T01:00:00.000Z', contest_prize:'$25,000', repo_url:'', demo_url:'', notes:'Imported from linked contest.', project:'bramble', title:'Bramble', tagline:'Phi-3 on-device planner w/ WebGPU.', team:['ila','k.vas'], progress:18, stage:'Scoping', deadline:'Apr 29 12:00 PT', deadline_at:'2026-04-29T20:00:00.000Z', risk:'low', tasks:[{t:'Baseline bench', d:true},{t:'UX sketch', d:false},{t:'Quantize + ship', d:false}] },
  { id:'e3', hack:'ORB-007', hack_id:'h3', contest_name:'Orbit Build Weekend', contest_host:'Orbit AI', contest_url:'https://orbit.example/events/build-weekend', contest_url_key:'orbit.example/events/build-weekend', contest_deadline:'May 04 20:00 UTC', contest_deadline_at:'2026-05-04T20:00:00.000Z', contest_prize:'$15,000', repo_url:'', demo_url:'', notes:'', project:'candlewick', title:'Candlewick', tagline:'TBD — tool-calling puzzle solver.', team:['ila'], progress:4, stage:'Idea', deadline:'May 04 16:00 UTC', deadline_at:'2026-05-04T16:00:00.000Z', risk:'low', tasks:[{t:'Pick track', d:false},{t:'Sketch loop', d:false}] },
  { id:'e4', hack:'TRC-108', hack_id:'h6', contest_name:'Transcoder Throwdown', contest_host:'Replicate', contest_url:'https://replicate.example/hackathons/transcoder-throwdown', contest_url_key:'replicate.example/hackathons/transcoder-throwdown', contest_deadline:'Apr 20 23:59 UTC', contest_deadline_at:'2026-04-20T23:59:00.000Z', contest_prize:'$12,000', repo_url:'https://github.com/example/loop-jockey', demo_url:'https://loop-jockey.example/demo', notes:'Final submission sent.', project:'loop-jockey', title:'Loop Jockey', tagline:'Beat-matched transcoder for DJ sets.', team:['ila','r.pesh'], progress:100, stage:'Submitted', deadline:'Apr 20 20:00 UTC', deadline_at:'2026-04-20T20:00:00.000Z', risk:'done', tasks:[{t:'Submit', d:true}] },
];

const SOURCES = [
  { id:1, kind:'luma', url:'genai-collective', url_key:'genai-collective', label:'GenAI Collective', note:'default lu.ma watch', enabled:true, added_at:'2026-04-24T14:00:00.000Z', last_checked_at:null, last_success_at:null, last_error:'' },
  { id:2, kind:'devpost', url:'https://devpost.com/hackathons', url_key:'devpost.com/hackathons', label:'Devpost AI', note:'default website watch', enabled:true, added_at:'2026-04-24T14:00:00.000Z', last_checked_at:null, last_success_at:null, last_error:'' },
  { id:3, kind:'headless', url:'https://cerebralvalley.ai/hackathons', url_key:'cerebralvalley.ai/hackathons', label:'Cerebral Valley', note:'default website watch', enabled:true, added_at:'2026-04-24T14:00:00.000Z', last_checked_at:null, last_success_at:null, last_error:'' },
];

const AGENT_LOG = [
  { ts:'14:02:11', lv:'info', text:'scan.luma genai-collective — 14 events seen, 2 hackish' },
  { ts:'14:03:08', lv:'info', text:'scan.devpost — 2 new hackathons, queued for review' },
  { ts:'14:04:40', lv:'warn', text:'scan.headless cerebralvalley — page rendered slowly, retry scheduled' },
  { ts:'14:06:33', lv:'info', text:'calendar.generated — contest and submission dates refreshed' },
  { ts:'14:08:45', lv:'ok',   text:'contest added to submissions: Edge Model Jam' },
  { ts:'14:10:02', lv:'info', text:'scan.luma build-club — 9 events seen, none new' },
];

/* calendar — Apr 2026 (Apr 1 is Wed). today = Apr 24 (Fri) */
const MONTH = { name: 'April 2026', dayOffset: 3, days: 30, today: 24 };
const CAL_EVENTS = {
  20: [{kind:'due', label:'TRC-108 due'}],
  21: [{kind:'start', label:'PLN-061 start'}],
  24: [{kind:'start', label:'LFH-044 start'}],
  26: [{kind:'start', label:'EDG-012 start'}],
  27: [{kind:'due', label:'LFH-044 due'}],
  29: [{kind:'due', label:'EDG-012 due'}],
};

/* Fetch live data from /api/*, with the hardcoded arrays above as offline fallback. */
window.__vh_bootstrap = async function () {
  const tryFetch = async (path, fallback) => {
    try {
      const r = await fetch(path);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      console.warn('[vh] offline fallback for ' + path + ':', e.message);
      return fallback;
    }
  };
  const [h, e, al, cal, sources] = await Promise.all([
    tryFetch('/api/hacks',    HACKS),
    tryFetch('/api/entries',  ENTRIES),
    tryFetch('/api/log',      AGENT_LOG),
    tryFetch('/api/calendar', { month: MONTH, events: CAL_EVENTS }),
    tryFetch('/api/sources',  SOURCES),
  ]);
  Object.assign(window, {
    HACKS: h, ENTRIES: e, AGENT_LOG: al,
    MONTH: (cal && cal.month) || MONTH,
    CAL_EVENTS: (cal && cal.events) || CAL_EVENTS,
    SOURCES: sources,
  });
};

/* Re-fetch then broadcast so the React tree re-reads window.* */
window.__vh_refresh = async function () {
  await window.__vh_bootstrap();
  window.dispatchEvent(new CustomEvent('vh:refresh'));
};

/* Fetch helper for button handlers */
window.__vh_mut = async function (url, opts = {}) {
  const body = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
  const r = await fetch(url, {
    method: opts.method || 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body,
  });
  if (r.ok) await window.__vh_refresh();
  return r.ok ? r.json().catch(() => ({})) : Promise.reject(new Error('HTTP ' + r.status));
};

/* Minimal toast host — one div, stack of messages that auto-dismiss. */
window.__vh_toast = function (message, tone = 'info') {
  let host = document.getElementById('vh-toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'vh-toasts';
    Object.assign(host.style, {
      position: 'fixed', right: '18px', top: '60px', zIndex: 1000,
      display: 'flex', flexDirection: 'column', gap: '8px',
      pointerEvents: 'none', fontFamily: 'var(--mono)',
    });
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  const border = tone === 'ok' ? 'var(--ok)' : tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : 'var(--accent)';
  Object.assign(el.style, {
    padding: '8px 12px', background: 'var(--bg)', color: 'var(--fg)',
    border: '1px solid var(--border-2)', borderLeft: `3px solid ${border}`,
    borderRadius: '6px', fontSize: '12px',
    boxShadow: '0 8px 24px -8px oklch(0% 0 0 / 0.15)',
    transition: 'opacity 200ms, transform 200ms',
    opacity: '0', transform: 'translateY(-4px)',
    minWidth: '240px', maxWidth: '420px',
  });
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
  setTimeout(() => {
    el.style.opacity = '0'; el.style.transform = 'translateY(-4px)';
    setTimeout(() => el.remove(), 220);
  }, 3600);
};
