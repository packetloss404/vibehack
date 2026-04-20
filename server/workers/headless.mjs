/**
 * Headless browser worker (Puppeteer + bundled Chromium).
 *
 * Fetches SPA pages after client-side hydration and extracts event data.
 * Used for sites that gate their data behind JS (cerebralvalley, MLH).
 */
import puppeteer from 'puppeteer';
import { db } from '../db.mjs';
import { log } from '../bus.mjs';

const insStmt = db.prepare(`INSERT OR IGNORE INTO hacks
  (id,code,name,host,starts,ends,prize,tracks,status,registered,teammates,progress,you,due,source,source_url,location,attendance_mode,website,hidden,source_key)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

function fmtDay(v) {
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toDateString().slice(4, 10);
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

async function renderedContent(url, { waitFor, extra = 1500 } = {}) {
  const b = await browser();
  const page = await b.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (waitFor) {
      try { await page.waitForSelector(waitFor, { timeout: 15_000 }); } catch {}
    }
    // give SPA XHRs time to land after DOMContentLoaded
    await new Promise((r) => setTimeout(r, extra));
    const html = await page.content();
    // Also pull visible text for fallback extraction
    const text = await page.evaluate(() => document.body?.innerText || '');
    return { html, text };
  } finally {
    await page.close().catch(() => {});
  }
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
    const id = 'cv_' + slugify(ev.title);
    const info = insStmt.run(
      id, codeFor(ev.title, 'CV'), ev.title, 'Cerebral Valley',
      fmtDay(ev.date), fmtDay(ev.date), '—',
      JSON.stringify(['AI', 'Cerebral Valley']), 'upcoming', 0, 0, 0, '—',
      ev.date, 'cerebralvalley', ev.href, ev.location || '', ev.location ? 'in_person' : 'unknown', 'cerebralvalley.ai', 0, 'https://cerebralvalley.ai/hackathons'
    );
    if (info.changes) added++;
  }
  return { total: list.length, added };
}

/* ────────────────────────────── driver ────────────────────────────── */

export async function run() {
  const enabled = db.prepare("SELECT enabled FROM sources WHERE kind='headless' AND url=?").get('https://cerebralvalley.ai/hackathons');
  if (enabled && !enabled.enabled) {
    log('info', 'scan.headless skipped: source disabled');
    return { skipped: true, reason: 'source disabled' };
  }
  log('info', 'scan.headless launching Chromium');
  try {
    const cv = await scrapeCerebralValley().catch((e) => ({ error: e.message }));
    if (cv.added > 0) log('ok', `scan.headless cerebralvalley: ${cv.added} new`);
    else if (cv.error) log('bad', `scan.headless cerebralvalley failed: ${cv.error}`);
    else log('info', `scan.headless cerebralvalley: ${cv.total ?? 0} seen, none new`);
    return { cerebralvalley: cv };
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
