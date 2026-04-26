import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.VH_DB_PATH || resolve(__dirname, '..', 'vibehack.db');

const firstRun = !existsSync(dbPath);

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function ensureColumn(table, column, definition) {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function domainFromUrl(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return new URL(text.startsWith('http') ? text : `https://${text}`).hostname.replace(/^www\./, '');
  } catch {
    return text.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  }
}

export function canonicalUrlKey(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text.match(/^https?:\/\//i) ? text : `https://${text}`);
    url.hash = '';
    url.username = '';
    url.password = '';
    url.protocol = 'https:';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_|igshid$|ref$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    const search = url.searchParams.toString();
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}${search ? `?${search}` : ''}`;
  } catch {
    return text
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[#?].*$/, '')
      .replace(/\/+$/, '');
  }
}

export function normalizeDeadlineAt(value = '', baseYear = new Date().getFullYear()) {
  const text = String(value || '').trim();
  if (!text || text === '—' || /\b(tba|tbd|to be announced)\b/i.test(text)) return '';

  let working = text.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\s(?:-|–|—|to)\s/i.test(working)) {
    const parts = working.split(/\s(?:-|–|—|to)\s/i).map((part) => part.trim()).filter(Boolean);
    const first = parts[0] || '';
    const last = parts[parts.length - 1] || working;
    const firstMonth = first.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i)?.[0];
    const firstYear = first.match(/\b\d{4}\b/)?.[0];
    working = /^\d{1,2}(?:\s|$)/.test(last) && firstMonth ? `${firstMonth} ${last}` : last;
    if (!/\b\d{4}\b/.test(working) && firstYear) working = `${working} ${firstYear}`;
  }

  const tzMatch = working.match(/\b(UTC|PDT|PST|PT|EDT|EST|ET)\b/i);
  const tz = tzMatch?.[1]?.toUpperCase() || '';
  working = working.replace(/\b(UTC|PDT|PST|PT|EDT|EST|ET)\b/ig, '').replace(/\s+/g, ' ').trim();
  const hasTime = /\b\d{1,2}:\d{2}\b/.test(working);
  if (!/\b\d{4}\b/.test(working)) working = `${working} ${baseYear}`;
  if (!hasTime) working = `${working} 23:59`;

  const tzSuffix = {
    UTC: 'UTC',
    PDT: 'GMT-0700',
    PST: 'GMT-0800',
    PT: 'GMT-0800',
    EDT: 'GMT-0400',
    EST: 'GMT-0500',
    ET: 'GMT-0500',
  }[tz] || '';
  const date = new Date(`${working}${tzSuffix ? ` ${tzSuffix}` : ''}`);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

db.exec(`
  CREATE TABLE IF NOT EXISTS hacks (
    id         TEXT PRIMARY KEY,
    code       TEXT UNIQUE,
    name       TEXT NOT NULL,
    host       TEXT,
    starts     TEXT,
    ends       TEXT,
    prize      TEXT,
    tracks     TEXT,        -- JSON array
    status     TEXT,         -- open | upcoming | closed
    registered INTEGER DEFAULT 0,
    teammates  INTEGER DEFAULT 0,
    progress   INTEGER DEFAULT 0,
    you        TEXT,
    due        TEXT,
    source     TEXT,
    source_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS entries (
    id       TEXT PRIMARY KEY,
    hack     TEXT,
    project  TEXT,
    title    TEXT,
    tagline  TEXT,
    team     TEXT,
    progress INTEGER,
    stage    TEXT,
    deadline TEXT,
    risk     TEXT,
    tasks    TEXT
  );

  CREATE TABLE IF NOT EXISTS agent_log (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    ts    TEXT,
    lv    TEXT,
    text  TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_agent_log_created_at ON agent_log(created_at DESC);

  CREATE TABLE IF NOT EXISTS sources (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT,
    url  TEXT UNIQUE,
    note TEXT,
    added_at TEXT DEFAULT (datetime('now'))
  );
`);

ensureColumn('hacks', 'location', "TEXT DEFAULT ''");
ensureColumn('hacks', 'attendance_mode', "TEXT DEFAULT 'unknown'");
ensureColumn('hacks', 'website', "TEXT DEFAULT ''");
ensureColumn('hacks', 'hidden', 'INTEGER DEFAULT 0');
ensureColumn('hacks', 'source_key', "TEXT DEFAULT ''");
ensureColumn('hacks', 'registration_status', "TEXT DEFAULT ''");
ensureColumn('hacks', 'registration_url', "TEXT DEFAULT ''");
ensureColumn('hacks', 'registration_notes', "TEXT DEFAULT ''");
ensureColumn('hacks', 'registered_at', "TEXT DEFAULT ''");
ensureColumn('hacks', 'source_url_key', "TEXT DEFAULT ''");
ensureColumn('hacks', 'starts_at', "TEXT DEFAULT ''");
ensureColumn('hacks', 'ends_at', "TEXT DEFAULT ''");
ensureColumn('hacks', 'due_at', "TEXT DEFAULT ''");
ensureColumn('entries', 'contest_name', "TEXT DEFAULT ''");
ensureColumn('entries', 'contest_host', "TEXT DEFAULT ''");
ensureColumn('entries', 'contest_url', "TEXT DEFAULT ''");
ensureColumn('entries', 'contest_deadline', "TEXT DEFAULT ''");
ensureColumn('entries', 'contest_prize', "TEXT DEFAULT ''");
ensureColumn('entries', 'repo_url', "TEXT DEFAULT ''");
ensureColumn('entries', 'demo_url', "TEXT DEFAULT ''");
ensureColumn('entries', 'notes', "TEXT DEFAULT ''");
ensureColumn('entries', 'hack_id', "TEXT DEFAULT ''");
ensureColumn('entries', 'contest_url_key', "TEXT DEFAULT ''");
ensureColumn('entries', 'deadline_at', "TEXT DEFAULT ''");
ensureColumn('entries', 'contest_deadline_at', "TEXT DEFAULT ''");
ensureColumn('sources', 'label', "TEXT DEFAULT ''");
ensureColumn('sources', 'enabled', 'INTEGER DEFAULT 1');
ensureColumn('sources', 'url_key', "TEXT DEFAULT ''");
ensureColumn('sources', 'last_checked_at', "TEXT DEFAULT ''");
ensureColumn('sources', 'last_run_at', "TEXT DEFAULT ''");
ensureColumn('sources', 'last_success_at', "TEXT DEFAULT ''");
ensureColumn('sources', 'last_error_at', "TEXT DEFAULT ''");
ensureColumn('sources', 'last_error', "TEXT DEFAULT ''");
ensureColumn('sources', 'consecutive_failures', 'INTEGER DEFAULT 0');
ensureColumn('sources', 'last_seen_count', 'INTEGER DEFAULT 0');
ensureColumn('sources', 'last_added_count', 'INTEGER DEFAULT 0');
ensureColumn('sources', 'last_updated_count', 'INTEGER DEFAULT 0');
ensureColumn('sources', 'last_duration_ms', 'INTEGER DEFAULT 0');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_hacks_source_url_key ON hacks(source_url_key);
  CREATE INDEX IF NOT EXISTS idx_entries_hack_id ON entries(hack_id);
  CREATE INDEX IF NOT EXISTS idx_entries_contest_url_key ON entries(contest_url_key);
  CREATE INDEX IF NOT EXISTS idx_sources_url_key ON sources(url_key);
`);

const ensureDefaultSourceStmt = db.prepare(`
  INSERT OR IGNORE INTO sources (kind, url, note, label, enabled)
  VALUES (?, ?, ?, ?, 1)
`);

const defaultSources = [
  ['luma', 'genai-collective', 'default lu.ma watch', 'GenAI Collective'],
  ['luma', 'genai-sf', 'default lu.ma watch', 'GenAI SF'],
  ['luma', 'oss4ai', 'default lu.ma watch', 'OSS4AI'],
  ['luma', 'theaibuildersdev', 'default lu.ma watch', 'The AI Builders'],
  ['luma', 'ai-tinkerers-sf', 'default lu.ma watch', 'AI Tinkerers SF'],
  ['luma', 'ai-tinkerers-seattle', 'default lu.ma watch', 'AI Tinkerers Seattle'],
  ['luma', 'ai-tinkerers-paloalto', 'default lu.ma watch', 'AI Tinkerers Palo Alto'],
  ['luma', 'build-club', 'default lu.ma watch', 'Build Club'],
  ['luma', 'aitinkerers', 'default lu.ma watch', 'AI Tinkerers'],
  ['headless', 'https://cerebralvalley.ai/hackathons', 'default website watch', 'Cerebral Valley'],
  ['headless', 'https://lablab.ai/event', 'default website watch', 'lablab.ai'],
  ['devpost', 'https://devpost.com/hackathons', 'default website watch', 'Devpost AI'],
];

try {
  for (const source of defaultSources) ensureDefaultSourceStmt.run(...source);
} catch (e) {
  console.warn('[db] default source sync skipped:', e.message);
}

if (firstRun && process.env.VH_NO_SEED !== '1') {
  const seed = JSON.parse(readFileSync(resolve(__dirname, 'seed', 'seed.json'), 'utf8'));
  const tx = db.transaction(() => {
    const insHack = db.prepare(`INSERT INTO hacks (id,code,name,host,starts,ends,prize,tracks,status,registered,teammates,progress,you,due,source)
      VALUES (@id,@code,@name,@host,@starts,@ends,@prize,@tracks,@status,@registered,@teammates,@progress,@you,@due,'seed')`);
    for (const h of seed.HACKS) {
      insHack.run({ ...h, tracks: JSON.stringify(h.tracks), registered: h.registered ? 1 : 0 });
    }
    const insEntry = db.prepare(`INSERT INTO entries (id,hack,project,title,tagline,team,progress,stage,deadline,risk,tasks)
      VALUES (@id,@hack,@project,@title,@tagline,@team,@progress,@stage,@deadline,@risk,@tasks)`);
    for (const e of seed.ENTRIES) {
      insEntry.run({ ...e, team: JSON.stringify(e.team), tasks: JSON.stringify(e.tasks) });
    }
    const insLog = db.prepare(`INSERT INTO agent_log (ts,lv,text) VALUES (@ts,@lv,@text)`);
    for (const l of seed.AGENT_LOG) insLog.run(l);
  });
  tx();
  console.log('[db] seeded vibehack.db from seed.json');
} else if (firstRun) {
  console.log('[db] VH_NO_SEED=1 — starting with empty database');
}

const normalizeHackStmt = db.prepare(`UPDATE hacks
  SET host=?, location=?, attendance_mode=?, website=?, hidden=?, source_key=?, registration_status=?, source_url_key=?, starts_at=?, ends_at=?, due_at=?
  WHERE id=?`);
const normalizeHacks = db.transaction(() => {
  const rows = db.prepare('SELECT id, host, tracks, source, source_url, location, attendance_mode, website, hidden, source_key, registered, registration_status, starts, ends, due FROM hacks').all();
  for (const row of rows) {
    let tracks = [];
    try { tracks = JSON.parse(row.tracks || '[]'); } catch {}

    let host = row.host || '';
    let location = row.location || '';
    let attendanceMode = row.attendance_mode || 'unknown';
    let website = row.website || '';
    let hidden = Number(row.hidden || 0);
    let sourceKey = row.source_key || '';

    if (row.source === 'luma') {
      website ||= 'lu.ma';
      sourceKey ||= tracks.find((t) => t && t !== 'Hackathon' && t !== 'Meetup') || '';
      if (tracks.includes('Meetup')) hidden = 1;
    }

    if (row.source === 'devpost') {
      host ||= 'Devpost';
      website ||= 'devpost.com';
      attendanceMode = attendanceMode === 'unknown' ? 'online' : attendanceMode;
      sourceKey ||= 'https://devpost.com/hackathons';
    }

    if (row.source === 'cerebralvalley') {
      website ||= 'cerebralvalley.ai';
      sourceKey ||= 'https://cerebralvalley.ai/hackathons';
      if (host && host !== 'Cerebral Valley' && !location) location = host;
      host = 'Cerebral Valley';
      attendanceMode = location ? 'in_person' : attendanceMode;
    }

    if (row.source === 'lablab') {
      host ||= 'lablab.ai';
      website ||= 'lablab.ai';
      sourceKey ||= 'https://lablab.ai/event';
    }

    if (!website && row.source_url) website = domainFromUrl(row.source_url);
    const registrationStatus = !row.registration_status || row.registration_status === 'unregistered' ? (row.registered ? 'registered' : 'candidate') : row.registration_status;
    normalizeHackStmt.run(
      host,
      location,
      attendanceMode,
      website,
      hidden ? 1 : 0,
      sourceKey,
      registrationStatus,
      canonicalUrlKey(row.source_url || website),
      normalizeDeadlineAt(row.starts),
      normalizeDeadlineAt(row.ends),
      normalizeDeadlineAt(row.due || row.ends),
      row.id,
    );
  }
});

const backfillEntryLinks = db.transaction(() => {
  const hacksByCode = new Map(db.prepare('SELECT id, code, source_url_key FROM hacks').all().map((row) => [row.code, row]));
  const hacksByUrlKey = new Map(db.prepare("SELECT id, source_url_key FROM hacks WHERE source_url_key!=''").all().map((row) => [row.source_url_key, row]));
  const updateEntry = db.prepare('UPDATE entries SET hack_id=?, contest_url_key=?, deadline_at=?, contest_deadline_at=? WHERE id=?');
  const rows = db.prepare('SELECT id, hack, contest_url, deadline, contest_deadline, hack_id FROM entries').all();
  for (const row of rows) {
    const contestUrlKey = canonicalUrlKey(row.contest_url);
    const linkedHack = hacksByCode.get(row.hack) || hacksByUrlKey.get(contestUrlKey) || null;
    updateEntry.run(
      row.hack_id || linkedHack?.id || '',
      contestUrlKey,
      normalizeDeadlineAt(row.deadline),
      normalizeDeadlineAt(row.contest_deadline),
      row.id,
    );
  }
});

const backfillSourceKeys = db.transaction(() => {
  const updateSource = db.prepare('UPDATE sources SET url_key=? WHERE id=?');
  const rows = db.prepare('SELECT id, url FROM sources').all();
  for (const row of rows) updateSource.run(canonicalUrlKey(row.url), row.id);
});

try {
  normalizeHacks();
  backfillEntryLinks();
  backfillSourceKeys();
} catch (e) {
  console.warn('[db] normalization skipped:', e.message);
}

const hydrateHack = (r) => r && ({ ...r, tracks: JSON.parse(r.tracks || '[]'), registered: !!r.registered, hidden: !!r.hidden });
const hydrateEntry = (r) => r && ({ ...r, team: JSON.parse(r.team || '[]'), tasks: JSON.parse(r.tasks || '[]') });

function findHackLink({ hack = '', contestUrl = '' } = {}) {
  const contestUrlKey = canonicalUrlKey(contestUrl);
  const row = db.prepare(`SELECT id FROM hacks
    WHERE code=? OR id=? OR (source_url_key!='' AND source_url_key=?)
    ORDER BY CASE WHEN code=? THEN 0 WHEN id=? THEN 1 ELSE 2 END, rowid
    LIMIT 1`).get(hack || '', hack || '', contestUrlKey, hack || '', hack || '');
  return { hackId: row?.id || '', contestUrlKey };
}

function parseCalendarDate(value, year) {
  const text = String(value || '').trim();
  if (!text || text === '—' || /\btba\b|to be announced/i.test(text)) return null;
  const normalized = /\b\d{4}\b/.test(text) ? text : `${text} ${year}`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addCalendarEvent(events, value, kind, label, year, month) {
  const date = parseCalendarDate(value, year);
  if (!date || date.getFullYear() !== year || date.getMonth() !== month) return;
  const day = date.getDate();
  (events[day] ||= []).push({ kind, label });
}

export const queries = {
  allHacks:   () => db.prepare('SELECT * FROM hacks ORDER BY rowid').all().map(hydrateHack),
  allEntries: () => db.prepare('SELECT * FROM entries ORDER BY rowid').all().map(hydrateEntry),
  findHackByUrl: (url) => hydrateHack(db.prepare('SELECT * FROM hacks WHERE source_url=? OR source_key=? OR source_url_key=? LIMIT 1').get(url, url, canonicalUrlKey(url))),
  findActiveDuplicateEntries: ({ hackId = '', contestUrl = '', contestUrlKey = '', excludeId = '' } = {}) => {
    const key = contestUrlKey || canonicalUrlKey(contestUrl);
    if (!hackId && !key) return [];
    return db.prepare(`SELECT * FROM entries
      WHERE id!=?
        AND COALESCE(stage,'')!='Submitted'
         AND ((?!='' AND hack_id=?) OR (?!='' AND contest_url_key=?))
      ORDER BY rowid`).all(excludeId, hackId, hackId, key, key).map(hydrateEntry);
  },
  recentLog:  (limit = 200) => db.prepare('SELECT id,ts,lv,text FROM agent_log ORDER BY id DESC LIMIT ?').all(limit).reverse(),
  calendar:   () => {
    const now = new Date();
    const year = now.getFullYear();
    const monthIndex = now.getMonth();
    const first = new Date(year, monthIndex, 1);
    const month = {
      name: first.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      dayOffset: first.getDay(),
      days: new Date(year, monthIndex + 1, 0).getDate(),
      today: now.getDate(),
    };
    const events = {};
    const hacks = db.prepare("SELECT code,name,starts,ends,due FROM hacks WHERE hidden=0 ORDER BY rowid").all();
    for (const hack of hacks) {
      const label = hack.code || hack.name;
      addCalendarEvent(events, hack.starts, 'start', `${label} start`, year, monthIndex);
      addCalendarEvent(events, hack.due && hack.due !== '—' ? hack.due : hack.ends, 'due', `${label} due`, year, monthIndex);
    }
    const entries = db.prepare("SELECT title,deadline,contest_deadline FROM entries WHERE stage!='Submitted' ORDER BY rowid").all();
    for (const entry of entries) {
      addCalendarEvent(events, entry.deadline, 'due', `${entry.title} build due`, year, monthIndex);
      addCalendarEvent(events, entry.contest_deadline, 'due', `${entry.title} contest due`, year, monthIndex);
    }
    return { month, events };
  },

  toggleHackRegistered: (id) => {
    const row = db.prepare('SELECT registered FROM hacks WHERE id=?').get(id);
    if (!row) return null;
    const next = row.registered ? 0 : 1;
    db.prepare('UPDATE hacks SET registered=?, registration_status=?, registered_at=? WHERE id=?')
      .run(next, next ? 'registered' : 'candidate', next ? new Date().toISOString() : '', id);
    return { id, registered: !!next, registration_status: next ? 'registered' : 'candidate' };
  },
  createHack: ({
    name,
    host = '',
    starts = '—',
    ends = '—',
    prize = '—',
    tracks = [],
    sourceUrl = '',
    registered = false,
    website = '',
    location = '',
    attendanceMode = 'unknown',
    status = 'upcoming',
    due = '—',
    hidden = false,
    registrationStatus = '',
    registrationUrl = '',
    registrationNotes = '',
    registeredAt = '',
  }) => {
    const slug = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    const id = 'h_' + slug + '_' + Date.now().toString(36);
    const initials = name.split(/\s+/).map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 3) || 'EV';
    const code = `CUSTOM-${initials}-${String(Math.floor(Math.random()*900)+100)}`;
    const sourceUrlKey = canonicalUrlKey(sourceUrl || website);
    db.prepare(`INSERT INTO hacks (id,code,name,host,starts,ends,prize,tracks,status,registered,teammates,progress,you,due,source,source_url,website,location,attendance_mode,hidden,source_key,registration_status,registration_url,registration_notes,registered_at,source_url_key,starts_at,ends_at,due_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,0,0,'—',?,'custom',?,?,?,?,?,'manual',?,?,?,?,?,?,?,?)`)
      .run(
        id,
        code,
        name,
        host,
        starts,
        ends,
        prize,
        JSON.stringify(tracks),
        status,
        registered ? 1 : 0,
        due,
        sourceUrl,
        website || domainFromUrl(sourceUrl),
        location,
        attendanceMode,
        hidden ? 1 : 0,
        registrationStatus || (registered ? 'registered' : 'candidate'),
        registrationUrl,
        registrationNotes,
        registeredAt || (registered ? new Date().toISOString() : ''),
        sourceUrlKey,
        normalizeDeadlineAt(starts),
        normalizeDeadlineAt(ends),
        normalizeDeadlineAt(due || ends),
      );
    return hydrateHack(db.prepare('SELECT * FROM hacks WHERE id=?').get(id));
  },
  updateHack: (id, patch) => {
    const existing = db.prepare('SELECT * FROM hacks WHERE id=?').get(id);
    if (!existing) return null;
    const nextTracks = Array.isArray(patch.tracks) ? patch.tracks : JSON.parse(existing.tracks || '[]');
    const next = {
      ...existing,
      ...patch,
      source_url: patch.sourceUrl ?? patch.source_url ?? existing.source_url,
      attendance_mode: patch.attendanceMode ?? patch.attendance_mode ?? existing.attendance_mode,
      registration_status: patch.registrationStatus ?? patch.registration_status ?? existing.registration_status,
      registration_url: patch.registrationUrl ?? patch.registration_url ?? existing.registration_url,
      registration_notes: patch.registrationNotes ?? patch.registration_notes ?? existing.registration_notes,
      registered_at: patch.registeredAt ?? patch.registered_at ?? existing.registered_at,
    };
    db.prepare(`UPDATE hacks
      SET name=?, host=?, starts=?, ends=?, prize=?, tracks=?, status=?, registered=?, you=?, due=?, source_url=?, website=?, location=?, attendance_mode=?, hidden=?, registration_status=?, registration_url=?, registration_notes=?, registered_at=?, source_url_key=?, starts_at=?, ends_at=?, due_at=?
      WHERE id=?`)
      .run(
        next.name,
        next.host || '',
        next.starts || '—',
        next.ends || next.starts || '—',
        next.prize || '—',
        JSON.stringify(nextTracks),
        next.status || 'upcoming',
        next.registered ? 1 : 0,
        next.you || '—',
        next.due || '—',
        next.source_url || '',
        next.website || domainFromUrl(next.source_url),
        next.location || '',
        next.attendance_mode || 'unknown',
        next.hidden ? 1 : 0,
        next.registration_status === 'unregistered' ? 'candidate' : (next.registration_status || (next.registered ? 'registered' : 'candidate')),
        next.registration_url || '',
        next.registration_notes || '',
        next.registered_at || '',
        canonicalUrlKey(next.source_url || next.website),
        normalizeDeadlineAt(next.starts),
        normalizeDeadlineAt(next.ends),
        normalizeDeadlineAt(next.due || next.ends),
        id,
      );
    return hydrateHack(db.prepare('SELECT * FROM hacks WHERE id=?').get(id));
  },
  deleteHack: (id) => {
    db.prepare('DELETE FROM hacks WHERE id=?').run(id);
    return { id, deleted: true };
  },
  setHackVisibilityBy: ({ field, value, hidden }) => {
    const allowed = new Set(['host', 'website', 'source', 'source_key']);
    if (!allowed.has(field)) throw new Error('invalid match field');
    const info = db.prepare(`UPDATE hacks SET hidden=? WHERE ${field}=?`).run(hidden ? 1 : 0, value);
    return { field, value, hidden: !!hidden, changed: info.changes };
  },
  createEntry: ({
    hack,
    title,
    tagline = '',
    project = '',
    contestName = '',
    contestHost = '',
    contestUrl = '',
    contestDeadline = '',
    contestPrize = '',
    repoUrl = '',
    demoUrl = '',
    notes = '',
    stage = 'Idea',
    progress = 0,
    deadline = '',
    risk = 'low',
    team = ['ila'],
    tasks = [],
  }) => {
    const id = 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const { hackId, contestUrlKey } = findHackLink({ hack, contestUrl });
    db.prepare(`INSERT INTO entries (id,hack,project,title,tagline,team,progress,stage,deadline,risk,tasks,contest_name,contest_host,contest_url,contest_deadline,contest_prize,repo_url,demo_url,notes,hack_id,contest_url_key,deadline_at,contest_deadline_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        id,
        hack || '',
        project || title.toLowerCase().replace(/\W+/g, '-'),
        title,
        tagline,
        JSON.stringify(team),
        progress,
        stage,
        deadline,
        risk,
        JSON.stringify(tasks),
        contestName,
        contestHost,
        contestUrl,
        contestDeadline,
        contestPrize,
        repoUrl,
        demoUrl,
        notes,
        hackId,
        contestUrlKey,
        normalizeDeadlineAt(deadline),
        normalizeDeadlineAt(contestDeadline),
      );
    return hydrateEntry(db.prepare('SELECT * FROM entries WHERE id=?').get(id));
  },
  updateEntry: (id, patch) => {
    const existing = db.prepare('SELECT * FROM entries WHERE id=?').get(id);
    if (!existing) return null;
    const next = {
      ...existing,
      ...patch,
      team: Array.isArray(patch.team) ? patch.team : JSON.parse(existing.team || '[]'),
      tasks: Array.isArray(patch.tasks) ? patch.tasks : JSON.parse(existing.tasks || '[]'),
      contest_name: patch.contestName ?? patch.contest_name ?? existing.contest_name,
      contest_host: patch.contestHost ?? patch.contest_host ?? existing.contest_host,
      contest_url: patch.contestUrl ?? patch.contest_url ?? existing.contest_url,
      contest_deadline: patch.contestDeadline ?? patch.contest_deadline ?? existing.contest_deadline,
      contest_prize: patch.contestPrize ?? patch.contest_prize ?? existing.contest_prize,
      repo_url: patch.repoUrl ?? patch.repo_url ?? existing.repo_url,
      demo_url: patch.demoUrl ?? patch.demo_url ?? existing.demo_url,
      hack_id: patch.hackId ?? patch.hack_id ?? existing.hack_id,
      contest_url_key: patch.contestUrlKey ?? patch.contest_url_key ?? existing.contest_url_key,
    };
    const link = findHackLink({ hack: next.hack, contestUrl: next.contest_url });
    const explicitHackId = patch.hackId ?? patch.hack_id;
    db.prepare(`UPDATE entries
      SET hack=?, project=?, title=?, tagline=?, team=?, progress=?, stage=?, deadline=?, risk=?, tasks=?, contest_name=?, contest_host=?, contest_url=?, contest_deadline=?, contest_prize=?, repo_url=?, demo_url=?, notes=?, hack_id=?, contest_url_key=?, deadline_at=?, contest_deadline_at=?
      WHERE id=?`)
      .run(
        next.hack || '',
        next.project || '',
        next.title || 'Untitled',
        next.tagline || '',
        JSON.stringify(next.team || []),
        Math.max(0, Math.min(100, Number(next.progress) || 0)),
        next.stage || 'Idea',
        next.deadline || '',
        next.risk || 'low',
        JSON.stringify(next.tasks || []),
        next.contest_name || '',
        next.contest_host || '',
        next.contest_url || '',
        next.contest_deadline || '',
        next.contest_prize || '',
        next.repo_url || '',
        next.demo_url || '',
        next.notes || '',
        (explicitHackId ?? link.hackId) || next.hack_id || '',
        link.contestUrlKey,
        normalizeDeadlineAt(next.deadline),
        normalizeDeadlineAt(next.contest_deadline),
        id,
      );
    return hydrateEntry(db.prepare('SELECT * FROM entries WHERE id=?').get(id));
  },
  deleteEntry: (id) => {
    db.prepare('DELETE FROM entries WHERE id=?').run(id);
    return { id, deleted: true };
  },
  toggleTask: (entryId, idx) => {
    const row = db.prepare('SELECT tasks FROM entries WHERE id=?').get(entryId);
    if (!row) return null;
    const tasks = JSON.parse(row.tasks || '[]');
    if (!tasks[idx]) return null;
    tasks[idx] = { ...tasks[idx], d: !tasks[idx].d };
    const progress = Math.round((tasks.filter((t) => t.d).length / tasks.length) * 100);
    db.prepare('UPDATE entries SET tasks=?, progress=? WHERE id=?').run(JSON.stringify(tasks), progress, entryId);
    return { id: entryId, tasks, progress };
  },
  appendLog: ({ lv, text, ts }) => {
    const now = ts || new Date().toISOString().slice(11, 19);
    const info = db.prepare('INSERT INTO agent_log (ts,lv,text) VALUES (?,?,?)').run(now, lv || 'info', text);
    return { id: info.lastInsertRowid, ts: now, lv: lv || 'info', text };
  },

  allSources: () => db.prepare('SELECT * FROM sources ORDER BY enabled DESC, id DESC').all().map((row) => ({ ...row, enabled: !!row.enabled })),
  addSource: ({ kind = 'luma', url, note = '', label = '', enabled = true }) => {
    const info = db.prepare('INSERT OR IGNORE INTO sources (kind,url,note,label,enabled,url_key) VALUES (?,?,?,?,?,?)')
      .run(kind, url, note, label, enabled ? 1 : 0, canonicalUrlKey(url));
    return { id: info.lastInsertRowid, kind, url, note, label, enabled, existed: info.changes === 0 };
  },
  updateSource: (id, patch) => {
    const existing = db.prepare('SELECT * FROM sources WHERE id=?').get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch };
    db.prepare('UPDATE sources SET kind=?, url=?, note=?, label=?, enabled=?, url_key=? WHERE id=?')
      .run(next.kind, next.url, next.note || '', next.label || '', next.enabled ? 1 : 0, canonicalUrlKey(next.url), id);
    return { ...next, enabled: !!next.enabled };
  },
  deleteSource: (id) => {
    db.prepare('DELETE FROM sources WHERE id=?').run(id);
    return { id, deleted: true };
  },
};
