/**
 * Devpost hackathon scanner — the biggest gap in the current build.
 *
 * Devpost hosts most corporate-sponsored AI hackathons (Bolt, Vercel, Gemini,
 * Cursor x Anthropic etc.). Server-rendered HTML, plain GET works with a
 * browser UA.
 *
 * Endpoints used:
 *   /api/hackathons?challenge_type[]=online&themes[]=Machine+Learning%2FAI&status[]=upcoming&status[]=open
 *   falls back to HTML parse of /hackathons if the API path changes.
 */
import { canonicalUrlKey, db, normalizeDeadlineAt } from '../db.mjs';
import { log } from '../bus.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0';

const MAX_PAGES = Math.max(1, Math.min(10, Number(process.env.DEVPOST_MAX_PAGES || 2)));
const REQUEST_DELAY_MS = Math.max(0, Number(process.env.DEVPOST_REQUEST_DELAY_MS || 750));
const SEARCH_TERMS = (process.env.DEVPOST_SEARCH_TERMS || 'ai,agent,agents,vibe coding')
  .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8);

const HTML_URL = 'https://devpost.com/hackathons?challenge_type[]=online&themes[]=Machine+Learning%2FAI&status[]=upcoming&status[]=open';

const insStmt = db.prepare(`INSERT OR IGNORE INTO hacks
  (id,code,name,host,starts,ends,prize,tracks,status,registered,teammates,progress,you,due,source,source_url,location,attendance_mode,website,hidden,source_key,source_url_key,starts_at,ends_at,due_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const SOURCE_KIND = 'devpost';
const SOURCE_URL = 'https://devpost.com/hackathons';
const SOURCE_HEALTH_COLUMNS = [
  ['last_run_at', "TEXT DEFAULT ''"],
  ['last_error_at', "TEXT DEFAULT ''"],
  ['consecutive_failures', 'INTEGER DEFAULT 0'],
  ['last_seen_count', 'INTEGER DEFAULT 0'],
  ['last_added_count', 'INTEGER DEFAULT 0'],
  ['last_updated_count', 'INTEGER DEFAULT 0'],
  ['last_duration_ms', 'INTEGER DEFAULT 0'],
];

function ensureSourceHealthColumns() {
  try {
    const existing = new Set(db.prepare('PRAGMA table_info(sources)').all().map((row) => row.name));
    for (const [name, definition] of SOURCE_HEALTH_COLUMNS) {
      if (!existing.has(name)) db.exec(`ALTER TABLE sources ADD COLUMN ${name} ${definition}`);
    }
  } catch (e) {
    log('bad', `scan.devpost health schema skipped: ${e.message}`);
  }
}

ensureSourceHealthColumns();

function sourceColumns() {
  try { return new Set(db.prepare('PRAGMA table_info(sources)').all().map((row) => row.name)); }
  catch { return new Set(); }
}

function updateSourceHealth({ ok, error = '', seen = 0, added = 0, updated = 0, durationMs = 0 }) {
  const columns = sourceColumns();
  const now = new Date().toISOString();
  const sets = [];
  const values = [];
  const put = (column, value) => {
    if (columns.has(column)) {
      sets.push(`${column}=?`);
      values.push(value);
    }
  };
  put('last_checked_at', now);
  put('last_run_at', now);
  put('last_seen_count', seen);
  put('last_added_count', added);
  put('last_updated_count', updated);
  put('last_duration_ms', durationMs);
  if (ok) {
    put('last_success_at', now);
    put('last_error', '');
    put('consecutive_failures', 0);
  } else {
    put('last_error_at', now);
    put('last_error', String(error || '').slice(0, 500));
    if (columns.has('consecutive_failures')) sets.push('consecutive_failures=COALESCE(consecutive_failures,0)+1');
  }
  if (sets.length === 0) return;
  values.push(SOURCE_KIND, SOURCE_URL);
  db.prepare(`UPDATE sources SET ${sets.join(', ')} WHERE kind=? AND url=?`).run(...values);
}

function fmtDay(v) {
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toDateString().slice(4, 10);
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

function codeFor(title) {
  const parts = String(title || '').split(/\s+/);
  const initials = parts.map((w) => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 3) || 'EV';
  const hash = Math.abs([...title].reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0)) % 900 + 100;
  return `DP-${initials}-${hash}`;
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function devpostApiUrls() {
  const baseConfigs = [
    { online: true, theme: true, statuses: ['upcoming', 'open'] },
    { online: true, theme: true, statuses: ['ended'] },
    { online: false, theme: true, statuses: ['upcoming', 'open'] },
    { online: false, theme: true, statuses: ['ended'] },
    { online: false, theme: false, statuses: ['upcoming', 'open'] },
    { online: false, theme: false, statuses: ['ended'] },
  ];
  const urls = [];
  for (const config of baseConfigs) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = new URL('https://devpost.com/api/hackathons');
      if (config.online) url.searchParams.append('challenge_type[]', 'online');
      if (config.theme) url.searchParams.append('themes[]', 'Machine Learning/AI');
      for (const status of config.statuses) url.searchParams.append('status[]', status);
      url.searchParams.set('page', String(page));
      urls.push(url.toString());
    }
  }
  for (const term of SEARCH_TERMS) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = new URL('https://devpost.com/api/hackathons');
      url.searchParams.append('status[]', 'upcoming');
      url.searchParams.append('status[]', 'open');
      url.searchParams.set('search', term);
      url.searchParams.set('page', String(page));
      urls.push(url.toString());
    }
  }
  return urls;
}

function mentionsYear(value, year) {
  return new RegExp(`\\b${year}\\b`).test(String(value || ''));
}

function statusFor(row) {
  const text = [row.status, row.state, row.open_state, row.challenge_status].filter(Boolean).join(' ');
  if (/ended|closed|past|finished|complete/i.test(text)) return 'closed';
  const end = new Date(row.end_date || row.ends_at || row.deadline || 0);
  if (!Number.isNaN(end.getTime()) && end.getTime() < Date.now()) return 'closed';
  return 'upcoming';
}

function cleanText(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeDateLabel(value) {
  return cleanText(value)
    .replace(/,\s*20\d{2}\b/g, '')
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function parseSubmissionPeriod(value) {
  const text = cleanText(value);
  if (!text) return { starts: '—', ends: '—' };
  const [rawStart, rawEnd] = text.split(/\s+-\s+/);
  const starts = normalizeDateLabel(rawStart);
  let ends = normalizeDateLabel(rawEnd || rawStart);
  if (/^\d{1,2}$/.test(ends)) {
    const month = starts.match(/^[A-Za-z]+/)?.[0];
    if (month) ends = `${month} ${ends}`;
  }
  return { starts, ends };
}

async function tryApi() {
  const rows = [];
  const seen = new Set();
  for (const url of devpostApiUrls()) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!r.ok) continue;
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('json')) continue;
      const j = await r.json();
      const items = Array.isArray(j) ? j : (j.hackathons || j.data || []);
      for (const item of items) {
        const key = canonicalUrlKey(item.url || item.hackathon_url || '') || item.id || item.title || item.name;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        rows.push(item);
      }
    } catch {}
    await sleep(REQUEST_DELAY_MS);
  }
  return rows.length > 0 ? { items: rows } : null;
}

async function scrapeHtml() {
  const r = await fetch(HTML_URL, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
  if (!r.ok) throw new Error('HTML HTTP ' + r.status);
  const html = await r.text();
  // Each hackathon card: <a href="https://xxx.devpost.com/" class="flex-row ..."> with title/prize elements
  const cardRe = /<a[^>]+href="(https:\/\/[a-z0-9-]+\.devpost\.com\/?)"[\s\S]{0,200}?<h3[^>]*>([^<]+)<\/h3>([\s\S]{0,2000}?)(?=<a[^>]+href="https:\/\/[a-z0-9-]+\.devpost\.com|<\/ul|$)/g;
  const items = [];
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const [, url, title, chunk] = m;
    const prize = (chunk.match(/\$\s?[\d,]+(?:\.\d+)?/) || ['—'])[0];
    const when = (chunk.match(/([A-Z][a-z]{2}\s+\d{1,2}(?:,\s*\d{4})?)\s*(?:-|–|—|to)\s*([A-Z][a-z]{2}\s+\d{1,2}(?:,\s*\d{4})?)/) || []);
    const starts = when[1] || '—';
    const ends = when[2] || starts;
    items.push({ name: title.trim(), url: url.trim(), prize, starts_txt: starts, ends_txt: ends });
  }
  return items;
}

export async function run() {
  const startedAt = Date.now();
  const enabled = db.prepare("SELECT enabled FROM sources WHERE kind='devpost' AND url=?").get(SOURCE_URL);
  if (enabled && !enabled.enabled) {
    log('info', 'scan.devpost skipped: source disabled');
    return { skipped: true, reason: 'source disabled' };
  }
  log('info', 'scan.devpost fetching AI hackathons');
  try {
    let rows = [];
    const api = await tryApi();
    if (api) {
      log('info', `scan.devpost API returned ${api.items.length} items`);
      for (const h of api.items) {
        const dateText = [h.submission_period_dates, h.start_date, h.starts_at, h.end_date, h.ends_at, h.deadline].filter(Boolean).join(' ');
        if (mentionsYear(dateText, 2025)) continue;
        const period = parseSubmissionPeriod(h.submission_period_dates);
        rows.push({
          name: h.title || h.name || 'Untitled',
          url: h.url || h.hackathon_url || (h.id ? `https://${h.id}.devpost.com/` : 'https://devpost.com/hackathons'),
          prize: cleanText(h.prize_amount || h.prize) || '—',
          starts_txt: period.starts !== '—' ? period.starts : fmtDay(h.start_date || h.starts_at),
          ends_txt: period.ends !== '—' ? period.ends : fmtDay(h.end_date || h.ends_at),
          deadline_ts: Math.floor(new Date(h.end_date || h.ends_at || 0).getTime() / 1000) || 0,
          themes: h.themes?.map((t) => t.name || t) || [],
          status: statusFor(h),
        });
      }
    } else {
      const items = await scrapeHtml();
      log('info', `scan.devpost HTML scrape returned ${items.length} items`);
      for (const h of items) {
        if (mentionsYear([h.starts_txt, h.ends_txt].join(' '), 2025)) continue;
        rows.push({ ...h, themes: ['AI'], deadline_ts: 0 });
      }
    }

    let added = 0;
    for (const r of rows) {
      const urlKey = canonicalUrlKey(r.url);
      const id = 'dp_' + slugify(urlKey || r.url);
      const tracks = JSON.stringify(['Hackathon', ...(r.themes || []).slice(0, 3)]);
      const info = insStmt.run(
        id, codeFor(r.name), r.name, 'Devpost',
        r.starts_txt || '—', r.ends_txt || '—', r.prize || '—',
        tracks, r.status || 'upcoming', 0, 0, 0, '—',
        r.ends_txt || '—', 'devpost', r.url, '', 'online', 'devpost.com', 0, SOURCE_URL, urlKey,
        normalizeDeadlineAt(r.starts_txt), normalizeDeadlineAt(r.ends_txt), normalizeDeadlineAt(r.ends_txt)
      );
      if (info.changes) added++;
    }
    const durationMs = Date.now() - startedAt;
    updateSourceHealth({ ok: true, seen: rows.length, added, updated: 0, durationMs });
    if (added > 0) log('ok', `scan.devpost +${added} new hackathons`);
    else log('info', `scan.devpost ${rows.length} seen, none new`);
    return { total: rows.length, added, updated: 0, durationMs, maxPages: MAX_PAGES, searchTerms: SEARCH_TERMS.length };
  } catch (e) {
    updateSourceHealth({ ok: false, error: e.message, durationMs: Date.now() - startedAt });
    log('bad', `scan.devpost failed: ${e.message}`);
    return { error: e.message };
  }
}

const INTERVAL_MS = Number(process.env.DEVPOST_INTERVAL_MS || 60 * 60_000);
let timer = null;
export function start() {
  if (timer) return;
  run().catch((e) => log('bad', `scan.devpost crash: ${e.message}`));
  timer = setInterval(() => run().catch((e) => log('bad', `scan.devpost crash: ${e.message}`)), INTERVAL_MS);
  log('info', `scan.devpost started — interval ${Math.round(INTERVAL_MS / 1000)}s`);
}
export function stop() { if (timer) clearInterval(timer), timer = null; }
