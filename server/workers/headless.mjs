/**
 * Headless browser worker (Puppeteer + bundled Chromium).
 *
 * Fetches SPA pages after client-side hydration and extracts event data.
 * Used for sites that gate their data behind JS (cerebralvalley, lablab.ai).
 */
import puppeteer from 'puppeteer';
import { canonicalUrlKey, db, normalizeDeadlineAt } from '../db.mjs';
import { log } from '../bus.mjs';

const insStmt = db.prepare(`INSERT OR IGNORE INTO hacks
  (id,code,name,host,starts,ends,prize,tracks,status,registered,teammates,progress,you,due,source,source_url,location,attendance_mode,website,hidden,source_key,source_url_key,starts_at,ends_at,due_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const CURRENT_YEAR = new Date().getFullYear();
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
    log('bad', `scan.headless health schema skipped: ${e.message}`);
  }
}

ensureSourceHealthColumns();

function sourceColumns() {
  try { return new Set(db.prepare('PRAGMA table_info(sources)').all().map((row) => row.name)); }
  catch { return new Set(); }
}

function updateSourceHealth({ url, ok, error = '', seen = 0, added = 0, updated = 0, durationMs = 0 }) {
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
  values.push('headless', url);
  db.prepare(`UPDATE sources SET ${sets.join(', ')} WHERE kind=? AND url=?`).run(...values);
}

function fmtDay(v) {
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toDateString().slice(4, 10);
}

function mentionsYear(value, year) {
  return new RegExp(`\\b${year}\\b`).test(String(value || ''));
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function codeFor(title, prefix) {
  const parts = String(title || '').split(/\s+/);
  const initials = parts.map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 3);
  return `${prefix}-${initials || 'EV'}-${Math.abs([...title].reduce((a,c) => ((a<<5)-a)+c.charCodeAt(0), 0)) % 900 + 100}`;
}

let _browser = null;
async function browser() {
  if (_browser && _browser.connected !== false) return _browser;
  _browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  return _browser;
}

/* ────────────────────────── Cerebral Valley ────────────────────────── */

async function scrapeCerebralValley() {
  const b = await browser();
  const page = await b.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  let list = [];
  try {
    await page.goto('https://cerebralvalley.ai/hackathons', { waitUntil: 'networkidle0', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('h3').length > 1, { timeout: 15_000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));

    // Extract by parsing body text line-by-line. Structure is:
    //   <title>\n <Month D, YYYY>\n [<location>\n]  repeated
    list = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      const titles = new Set([...document.querySelectorAll('h3')].map(h => h.innerText.trim()).filter(Boolean));
      const skip = new Set(['Cerebral Valley Hackathons', 'All partners']);
      const monthRe = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}$/;

      const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
      const out = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!titles.has(line) || skip.has(line)) continue;
        let date = '—', location = '';
        const n1 = lines[i + 1], n2 = lines[i + 2];
        if (n1 && monthRe.test(n1)) date = n1;
        if (n2 && !titles.has(n2) && !monthRe.test(n2) && /[A-Z]/.test(n2) && n2.length < 80) location = n2;
        out.push({ title: line, date, location, href: 'https://cerebralvalley.ai/hackathons' });
      }
      return out;
    });
  } finally {
    await page.close().catch(() => {});
  }

  let added = 0;
  for (const ev of list) {
    if (mentionsYear(ev.date, 2025)) continue;
    const id = 'cv_' + slugify(ev.title);
    const info = insStmt.run(
      id, codeFor(ev.title, 'CV'), ev.title, 'Cerebral Valley',
      fmtDay(ev.date), fmtDay(ev.date), '—',
      JSON.stringify(['AI', 'Cerebral Valley']), 'upcoming', 0, 0, 0, '—',
      ev.date, 'cerebralvalley', ev.href, ev.location || '', ev.location ? 'in_person' : 'unknown', 'cerebralvalley.ai', 0, 'https://cerebralvalley.ai/hackathons', canonicalUrlKey(ev.href),
      normalizeDeadlineAt(ev.date), normalizeDeadlineAt(ev.date), normalizeDeadlineAt(ev.date)
    );
    if (info.changes) added++;
  }
  return { total: list.length, added };
}

/* ────────────────────────────── lablab.ai ───────────────────────────── */

function normalizeDatePart(value) {
  const text = String(value || '').trim();
  if (!text || /to be announced|tba/i.test(text)) return 'TBA';
  return text.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function parseLablabWindow(value) {
  const text = String(value || '').trim();
  if (!text || /to be announced|tba/i.test(text)) return { starts: 'TBA', ends: 'TBA' };
  const [starts, ends] = text.split(/\s*(?:-|–|—|to)\s*/i);
  const normalizedStart = normalizeDatePart(starts);
  let normalizedEnd = normalizeDatePart(ends || starts);
  if (/^\d{1,2}$/.test(normalizedEnd)) {
    const month = normalizedStart.match(/^[A-Za-z]+/)?.[0];
    if (month) normalizedEnd = `${month} ${normalizedEnd}`;
  }
  return { starts: normalizedStart, ends: normalizedEnd };
}

function attendanceFromText(text) {
  const lower = String(text || '').toLowerCase();
  const hasOnline = /\bonline\b|virtual|remote/.test(lower);
  const hasVenue = /on[-\s]?site|in[-\s]?person|venue|location|dubai|san francisco|new york|london/.test(lower);
  if (hasOnline && hasVenue) return 'hybrid';
  if (hasOnline) return 'online';
  return hasVenue ? 'in_person' : 'unknown';
}

async function scrapeLablab() {
  const b = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await b.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  let cards = [];
  try {
    for (let attempt = 0; attempt < 2 && cards.length === 0; attempt++) {
      await page.goto('https://lablab.ai/event', { waitUntil: 'networkidle2', timeout: 60_000 });
      await page.waitForSelector('a[href*="/ai-hackathons/"]', { timeout: 15_000 }).catch(() => {});
      await page.waitForFunction(
        () => [...document.querySelectorAll('a[href*="/ai-hackathons/"]')]
          .some((a) => (a.innerText || '').includes('HACKATHON')),
        { timeout: 25_000 }
      ).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      cards = await page.evaluate(() => {
        const seen = new Set();
        return [...document.querySelectorAll('a[href*="/ai-hackathons/"]')]
          .map((a) => ({ href: a.href, text: a.innerText || '' }))
          .filter((row) => {
            if (!row.href || seen.has(row.href)) return false;
            seen.add(row.href);
            return row.text.includes('HACKATHON');
          });
      });
    }
  } finally {
    await page.close().catch(() => {});
    await b.close().catch(() => {});
  }

  let added = 0;
  let total = 0;
  for (const card of cards) {
    const lines = card.text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    if (mentionsYear(card.text, 2025)) continue;
    const isFinished = /finished/i.test(lines[0] || '');
    if (isFinished && !mentionsYear(card.text, CURRENT_YEAR)) continue;
    const hackIdx = lines.findIndex((line) => /^HACKATHON$/i.test(line));
    if (hackIdx < 0) continue;
    const windowText = lines[hackIdx + 1] || '';
    const title = lines.slice(hackIdx + 2).find((line) => !/^\d+$/.test(line) && !/to be announced|tba/i.test(line));
    if (!title) continue;
    const description = lines.slice(lines.indexOf(title) + 1).join(' ');
    const prize = (card.text.match(/\$\s?[\d,]+(?:\+)?/) || ['—'])[0];
    const { starts, ends } = parseLablabWindow(windowText);
    const status = isFinished ? 'closed' : /register/i.test(lines[0] || '') ? 'open' : 'upcoming';
    const info = insStmt.run(
      'lablab_' + slugify(canonicalUrlKey(card.href) || card.href),
      codeFor(title, 'LL'),
      title,
      'lablab.ai',
      starts,
      ends,
      prize,
      JSON.stringify(['Hackathon', 'lablab.ai']),
      status,
      0,
      0,
      0,
      '—',
      ends,
      'lablab',
      card.href,
      '',
      attendanceFromText(description),
      'lablab.ai',
      0,
      'https://lablab.ai/event',
      canonicalUrlKey(card.href),
      normalizeDeadlineAt(starts),
      normalizeDeadlineAt(ends),
      normalizeDeadlineAt(ends)
    );
    total++;
    if (info.changes) added++;
  }
  return { total, added };
}

/* ────────────────────────────── driver ────────────────────────────── */

function sourceEnabled(url) {
  const row = db.prepare("SELECT enabled FROM sources WHERE kind='headless' AND url=?").get(url);
  return !row || !!row.enabled;
}

export async function run() {
  log('info', 'scan.headless launching Chromium');
  try {
    const result = {};
    if (sourceEnabled('https://cerebralvalley.ai/hackathons')) {
      const startedAt = Date.now();
      const cv = await scrapeCerebralValley().catch((e) => ({ error: e.message }));
      updateSourceHealth({
        url: 'https://cerebralvalley.ai/hackathons',
        ok: !cv.error,
        error: cv.error || '',
        seen: cv.total || 0,
        added: cv.added || 0,
        durationMs: Date.now() - startedAt,
      });
      if (cv.added > 0) log('ok', `scan.headless cerebralvalley: ${cv.added} new`);
      else if (cv.error) log('bad', `scan.headless cerebralvalley failed: ${cv.error}`);
      else log('info', `scan.headless cerebralvalley: ${cv.total ?? 0} seen, none new`);
      result.cerebralvalley = cv;
    } else {
      log('info', 'scan.headless cerebralvalley skipped: source disabled');
      result.cerebralvalley = { skipped: true, reason: 'source disabled' };
    }

    if (sourceEnabled('https://lablab.ai/event')) {
      const startedAt = Date.now();
      const lablab = await scrapeLablab().catch((e) => ({ error: e.message }));
      updateSourceHealth({
        url: 'https://lablab.ai/event',
        ok: !lablab.error,
        error: lablab.error || '',
        seen: lablab.total || 0,
        added: lablab.added || 0,
        durationMs: Date.now() - startedAt,
      });
      if (lablab.added > 0) log('ok', `scan.headless lablab: ${lablab.added} new`);
      else if (lablab.error) log('bad', `scan.headless lablab failed: ${lablab.error}`);
      else log('info', `scan.headless lablab: ${lablab.total ?? 0} seen, none new`);
      result.lablab = lablab;
    } else {
      log('info', 'scan.headless lablab skipped: source disabled');
      result.lablab = { skipped: true, reason: 'source disabled' };
    }
    return result;
  } catch (e) {
    log('bad', `scan.headless crash: ${e.message}`);
    return { error: e.message };
  }
}

const INTERVAL_MS = Number(process.env.HEADLESS_INTERVAL_MS || 2 * 60 * 60_000); // 2h
let timer = null;

export function start() {
  if (timer) return;
  if (process.env.HEADLESS_ON_START !== '0') {
    run().catch((e) => log('bad', `scan.headless crash: ${e.message}`));
  }
  timer = setInterval(() => run().catch((e) => log('bad', `scan.headless crash: ${e.message}`)), INTERVAL_MS);
  log('info', `scan.headless started — interval ${Math.round(INTERVAL_MS / 1000)}s`);
}

export async function stop() {
  if (timer) clearInterval(timer), timer = null;
  if (_browser) await _browser.close().catch(() => {}); _browser = null;
}
