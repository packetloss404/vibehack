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
import { db } from '../db.mjs';
import { log } from '../bus.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0';

const API_URLS = [
  'https://devpost.com/api/hackathons?challenge_type[]=online&themes[]=Machine+Learning%2FAI&status[]=upcoming&status[]=open&page=1',
  'https://devpost.com/api/hackathons?themes[]=Machine+Learning%2FAI&status[]=upcoming&status[]=open&page=1',
  'https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&page=1',
];

const HTML_URL = 'https://devpost.com/hackathons?challenge_type[]=online&themes[]=Machine+Learning%2FAI&status[]=upcoming&status[]=open';

const insStmt = db.prepare(`INSERT OR IGNORE INTO hacks
  (id,code,name,host,starts,ends,prize,tracks,status,registered,teammates,progress,you,due,source,source_url,location,attendance_mode,website,hidden,source_key)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

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

async function tryApi() {
  for (const url of API_URLS) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!r.ok) continue;
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('json')) continue;
      const j = await r.json();
      const items = Array.isArray(j) ? j : (j.hackathons || j.data || []);
      if (items.length > 0) return { items, url };
    } catch {}
  }
  return null;
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
  const enabled = db.prepare("SELECT enabled FROM sources WHERE kind='devpost' AND url=?").get('https://devpost.com/hackathons');
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
        rows.push({
          name: h.title || h.name || 'Untitled',
          url: h.url || h.hackathon_url || (h.id ? `https://${h.id}.devpost.com/` : 'https://devpost.com/hackathons'),
          prize: h.prize_amount || h.prize || '—',
          starts_txt: fmtDay(h.submission_period_dates?.split(' - ')?.[0] || h.start_date || h.starts_at),
          ends_txt: fmtDay(h.submission_period_dates?.split(' - ')?.[1] || h.end_date || h.ends_at),
          deadline_ts: Math.floor(new Date(h.end_date || h.ends_at || 0).getTime() / 1000) || 0,
          themes: h.themes?.map((t) => t.name || t) || [],
        });
      }
    } else {
      const items = await scrapeHtml();
      log('info', `scan.devpost HTML scrape returned ${items.length} items`);
      for (const h of items) {
        rows.push({ ...h, themes: ['AI'], deadline_ts: 0 });
      }
    }

    let added = 0;
    for (const r of rows) {
      const id = 'dp_' + slugify(r.url);
      const tracks = JSON.stringify(['Hackathon', ...(r.themes || []).slice(0, 3)]);
      const info = insStmt.run(
        id, codeFor(r.name), r.name, 'Devpost',
        r.starts_txt || '—', r.ends_txt || '—', r.prize || '—',
        tracks, 'upcoming', 0, 0, 0, '—',
        r.ends_txt || '—', 'devpost', r.url, '', 'online', 'devpost.com', 0, 'https://devpost.com/hackathons'
      );
      if (info.changes) added++;
    }
    if (added > 0) log('ok', `scan.devpost +${added} new hackathons`);
    else log('info', `scan.devpost ${rows.length} seen, none new`);
    return { total: rows.length, added };
  } catch (e) {
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
