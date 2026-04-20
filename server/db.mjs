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

  CREATE TABLE IF NOT EXISTS credits (
    id         TEXT PRIMARY KEY,
    "from"     TEXT,
    from_tag   TEXT,
    subject    TEXT,
    snippet    TEXT,
    value      TEXT,
    value_usd  INTEGER DEFAULT 0,
    deadline   TEXT,
    deadline_ts INTEGER,
    tags       TEXT,
    unread     INTEGER DEFAULT 1,
    when_str   TEXT,
    action     TEXT,
    provider   TEXT,
    source     TEXT,
    source_id  TEXT,
    source_url TEXT,
    discovered_at TEXT DEFAULT (datetime('now')),
    UNIQUE(source, source_id)
  );

  CREATE TABLE IF NOT EXISTS notes (
    id         TEXT PRIMARY KEY,
    ttl        TEXT,
    tag        TEXT,
    body       TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_log (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    ts    TEXT,
    lv    TEXT,
    text  TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_agent_log_created_at ON agent_log(created_at DESC);

  CREATE TABLE IF NOT EXISTS cal_events (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    day    INTEGER,
    kind   TEXT,
    label  TEXT
  );

  CREATE TABLE IF NOT EXISTS meta (
    k TEXT PRIMARY KEY,
    v TEXT
  );

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
ensureColumn('entries', 'contest_name', "TEXT DEFAULT ''");
ensureColumn('entries', 'contest_host', "TEXT DEFAULT ''");
ensureColumn('entries', 'contest_url', "TEXT DEFAULT ''");
ensureColumn('entries', 'contest_deadline', "TEXT DEFAULT ''");
ensureColumn('entries', 'contest_prize', "TEXT DEFAULT ''");
ensureColumn('entries', 'repo_url', "TEXT DEFAULT ''");
ensureColumn('entries', 'demo_url', "TEXT DEFAULT ''");
ensureColumn('entries', 'notes', "TEXT DEFAULT ''");
ensureColumn('sources', 'label', "TEXT DEFAULT ''");
ensureColumn('sources', 'enabled', 'INTEGER DEFAULT 1');
ensureColumn('sources', 'hidden', 'INTEGER DEFAULT 0');

const ensureDefaultSourceStmt = db.prepare(`
  INSERT OR IGNORE INTO sources (kind, url, note, label, enabled, hidden)
  VALUES (?, ?, ?, ?, 1, 0)
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
    const insCred = db.prepare(`INSERT INTO credits (id,"from",from_tag,subject,snippet,value,deadline,tags,unread,when_str,action,provider,source)
      VALUES (@id,@from,@fromTag,@subject,@snippet,@value,@deadline,@tags,@unread,@when,@action,@provider,'seed')`);
    for (const c of seed.CREDITS) {
      insCred.run({ ...c, tags: JSON.stringify(c.tags), unread: c.unread ? 1 : 0 });
    }
    const insNote = db.prepare(`INSERT INTO notes (id,ttl,tag,body) VALUES (@id,@ttl,@tag,@body)`);
    for (const n of seed.NOTES) insNote.run(n);
    const insLog = db.prepare(`INSERT INTO agent_log (ts,lv,text) VALUES (@ts,@lv,@text)`);
    for (const l of seed.AGENT_LOG) insLog.run(l);
    const insCal = db.prepare(`INSERT INTO cal_events (day,kind,label) VALUES (?,?,?)`);
    for (const [day, evs] of Object.entries(seed.CAL_EVENTS)) {
      for (const ev of evs) insCal.run(Number(day), ev.kind, ev.label);
    }
    db.prepare(`INSERT INTO meta (k,v) VALUES ('month', ?)`).run(JSON.stringify(seed.MONTH));
    db.prepare(`INSERT INTO meta (k,v) VALUES ('seeded_at', datetime('now'))`).run();
  });
  tx();
  console.log('[db] seeded vibehack.db from seed.json');
} else if (firstRun) {
  console.log('[db] VH_NO_SEED=1 — starting with empty database');
}

const normalizeHackStmt = db.prepare('UPDATE hacks SET host=?, location=?, attendance_mode=?, website=?, hidden=?, source_key=? WHERE id=?');
const normalizeHacks = db.transaction(() => {
  const rows = db.prepare('SELECT id, host, tracks, source, source_url, location, attendance_mode, website, hidden, source_key FROM hacks').all();
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

    if (!website && row.source_url) website = domainFromUrl(row.source_url);
    normalizeHackStmt.run(host, location, attendanceMode, website, hidden ? 1 : 0, sourceKey, row.id);
  }
});

try {
  normalizeHacks();
} catch (e) {
  console.warn('[db] hack normalization skipped:', e.message);
}

const hydrateHack = (r) => r && ({ ...r, tracks: JSON.parse(r.tracks || '[]'), registered: !!r.registered, hidden: !!r.hidden });
const hydrateEntry = (r) => r && ({ ...r, team: JSON.parse(r.team || '[]'), tasks: JSON.parse(r.tasks || '[]') });
const hydrateCredit = (r) => r && ({ ...r, tags: JSON.parse(r.tags || '[]'), unread: !!r.unread, when: r.when_str, sourceUrl: r.source_url, valueUsd: r.value_usd });

export const queries = {
  allHacks:   () => db.prepare('SELECT * FROM hacks ORDER BY rowid').all().map(hydrateHack),
  allEntries: () => db.prepare('SELECT * FROM entries ORDER BY rowid').all().map(hydrateEntry),
  findHackByUrl: (url) => hydrateHack(db.prepare('SELECT * FROM hacks WHERE source_url=? OR source_key=? LIMIT 1').get(url, url)),
  allCredits: () => db.prepare('SELECT * FROM credits ORDER BY rowid').all().map(hydrateCredit),
  allNotes:   () => db.prepare('SELECT * FROM notes ORDER BY rowid').all(),
  recentLog:  (limit = 200) => db.prepare('SELECT id,ts,lv,text FROM agent_log ORDER BY id DESC LIMIT ?').all(limit).reverse(),
  calendar:   () => {
    const month = JSON.parse(db.prepare(`SELECT v FROM meta WHERE k='month'`).get()?.v || 'null');
    const rows  = db.prepare('SELECT day,kind,label FROM cal_events').all();
    const events = {};
    for (const r of rows) (events[r.day] ||= []).push({ kind: r.kind, label: r.label });
    return { month, events };
  },

  toggleHackRegistered: (id) => {
    const row = db.prepare('SELECT registered FROM hacks WHERE id=?').get(id);
    if (!row) return null;
    const next = row.registered ? 0 : 1;
    db.prepare('UPDATE hacks SET registered=? WHERE id=?').run(next, id);
    return { id, registered: !!next };
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
  }) => {
    const slug = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    const id = 'h_' + slug + '_' + Date.now().toString(36);
    const initials = name.split(/\s+/).map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 3) || 'EV';
    const code = `CUSTOM-${initials}-${String(Math.floor(Math.random()*900)+100)}`;
    db.prepare(`INSERT INTO hacks (id,code,name,host,starts,ends,prize,tracks,status,registered,teammates,progress,you,due,source,source_url,website,location,attendance_mode,hidden,source_key)
      VALUES (?,?,?,?,?,?,?,?,'upcoming',?,0,0,'—','—','custom',?,?,?,?,0,'manual')`)
      .run(
        id,
        code,
        name,
        host,
        starts,
        ends,
        prize,
        JSON.stringify(tracks),
        registered ? 1 : 0,
        sourceUrl,
        website || domainFromUrl(sourceUrl),
        location,
        attendanceMode,
      );
    return { id, code, name };
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
    };
    db.prepare(`UPDATE hacks
      SET name=?, host=?, starts=?, ends=?, prize=?, tracks=?, status=?, registered=?, you=?, due=?, source_url=?, website=?, location=?, attendance_mode=?, hidden=?
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
  applyCredit: (id, action = 'applied') => {
    const row = db.prepare('SELECT id,action FROM credits WHERE id=?').get(id);
    if (!row) return null;
    const nextAction =
      action === 'confirm'     ? 'granted' :
      action === 'quick-apply' ? 'applied' :
      action === 'apply'       ? 'applied' :
      action === 'claim'       ? 'granted' :
      action === 'copy'        ? 'copied'  :
      action;
    db.prepare('UPDATE credits SET action=?, unread=0 WHERE id=?').run(nextAction, id);
    return { id, action: nextAction };
  },
  readCredit: (id) => {
    db.prepare('UPDATE credits SET unread=0 WHERE id=?').run(id);
    return { id, unread: false };
  },
  archiveCredit: (id) => {
    db.prepare("UPDATE credits SET action='archived', unread=0 WHERE id=?").run(id);
    return { id, action: 'archived' };
  },
  createNote: ({ ttl, tag = '', body = '' }) => {
    const id = 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    db.prepare('INSERT INTO notes (id,ttl,tag,body) VALUES (?,?,?,?)').run(id, ttl || 'Untitled', tag, body);
    return { id, ttl: ttl || 'Untitled', tag, body };
  },
  updateNote: (id, patch) => {
    const existing = db.prepare('SELECT * FROM notes WHERE id=?').get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch };
    db.prepare("UPDATE notes SET ttl=?, tag=?, body=?, updated_at=datetime('now') WHERE id=?")
      .run(next.ttl, next.tag, next.body, id);
    return next;
  },
  deleteNote: (id) => {
    db.prepare('DELETE FROM notes WHERE id=?').run(id);
    return { id, deleted: true };
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
    db.prepare(`INSERT INTO entries (id,hack,project,title,tagline,team,progress,stage,deadline,risk,tasks,contest_name,contest_host,contest_url,contest_deadline,contest_prize,repo_url,demo_url,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
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
    };
    db.prepare(`UPDATE entries
      SET hack=?, project=?, title=?, tagline=?, team=?, progress=?, stage=?, deadline=?, risk=?, tasks=?, contest_name=?, contest_host=?, contest_url=?, contest_deadline=?, contest_prize=?, repo_url=?, demo_url=?, notes=?
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

  allSources: () => db.prepare('SELECT * FROM sources ORDER BY hidden ASC, enabled DESC, id DESC').all().map((row) => ({ ...row, enabled: !!row.enabled, hidden: !!row.hidden })),
  addSource: ({ kind = 'luma', url, note = '', label = '', enabled = true, hidden = false }) => {
    const info = db.prepare('INSERT OR IGNORE INTO sources (kind,url,note,label,enabled,hidden) VALUES (?,?,?,?,?,?)').run(kind, url, note, label, enabled ? 1 : 0, hidden ? 1 : 0);
    return { id: info.lastInsertRowid, kind, url, note, label, enabled, hidden, existed: info.changes === 0 };
  },
  updateSource: (id, patch) => {
    const existing = db.prepare('SELECT * FROM sources WHERE id=?').get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch };
    db.prepare('UPDATE sources SET kind=?, url=?, note=?, label=?, enabled=?, hidden=? WHERE id=?')
      .run(next.kind, next.url, next.note || '', next.label || '', next.enabled ? 1 : 0, next.hidden ? 1 : 0, id);
    return { ...next, enabled: !!next.enabled, hidden: !!next.hidden };
  },
  deleteSource: (id) => {
    db.prepare('DELETE FROM sources WHERE id=?').run(id);
    return { id, deleted: true };
  },
};
