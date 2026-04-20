/**
 * Aggregator-list scraper: pulls credit offers from GitHub "awesome-list" READMEs.
 *
 * No auth required. Zero-credential win. Polls rawn markdown and splits on
 * list bullets / table rows to get (name, url, description, $).
 */
import { db } from '../db.mjs';
import { log } from '../bus.mjs';
import { parseUsd } from './_credit_parse.mjs';

// Sources chosen for stability (auto-generated or high-star) and scrapability (raw markdown).
const SOURCES = [
  {
    name: 'dakshshah96/awesome-startup-credits',
    url: 'https://raw.githubusercontent.com/dakshshah96/awesome-startup-credits/master/README.md',
  },
  {
    name: 'cheahjs/free-llm-api-resources',
    url: 'https://raw.githubusercontent.com/cheahjs/free-llm-api-resources/main/README.md',
  },
  {
    name: 'ShaikhWarsi/free-ai-tools',
    url: 'https://raw.githubusercontent.com/ShaikhWarsi/free-ai-tools/main/README.md',
  },
];

const insStmt = db.prepare(`INSERT OR IGNORE INTO credits
  (id,"from",from_tag,subject,snippet,value,value_usd,deadline,tags,unread,when_str,action,provider,source,source_id,source_url)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

function parseBullets(md) {
  // Match "- [Name](url) — description" or "- [Name](url): description"
  const items = [];
  const lineRe = /^[-*]\s+\[([^\]]{2,80})\]\(([^)]+)\)\s*[\u2014\u2013:-]*\s*(.*)$/gm;
  let m;
  while ((m = lineRe.exec(md)) !== null) {
    const [, name, url, desc] = m;
    if (!/^https?:/.test(url)) continue;
    items.push({ name: name.trim(), url: url.trim(), desc: desc.trim() });
  }
  return items;
}

function parseMarkdownTables(md) {
  // Grab table rows that look like |Name|...|. Detect columns loosely.
  const items = [];
  const lines = md.split('\n');
  let header = null;
  for (const ln of lines) {
    const cells = ln.match(/^\|([^\n]+)\|\s*$/);
    if (!cells) { header = null; continue; }
    const parts = cells[1].split('|').map(p => p.trim());
    // Header row
    if (parts.some(p => /^---+:?$/.test(p))) continue;
    if (!header) { header = parts.map(h => h.toLowerCase()); continue; }
    const obj = {};
    parts.forEach((v, i) => { obj[header[i] || `c${i}`] = v; });
    // Try to resolve name + url from any columns
    const linkMatch = ln.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch && /^https?:/.test(linkMatch[2])) {
      items.push({ name: linkMatch[1].trim(), url: linkMatch[2].trim(), desc: parts.slice(1).join(' · ') });
    }
  }
  return items;
}

async function pollSource(src) {
  const r = await fetch(src.url, { headers: { 'User-Agent': 'Vibehack/0.1', 'Accept': 'text/plain' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const md = await r.text();

  const bullets = parseBullets(md);
  const tables = parseMarkdownTables(md);
  const items = [...bullets, ...tables];

  let added = 0;
  for (const it of items) {
    const provider = it.name.split(/[:\-\u2014]/)[0].trim();
    const fullText = `${it.name} ${it.desc}`;
    const usd = parseUsd(fullText);
    const value = usd > 0 ? '$' + usd.toLocaleString() : 'free / credit';
    const id = 'agg_' + Buffer.from(src.name + '|' + it.url).toString('base64url').slice(0, 20);
    const info = insStmt.run(
      id, provider, 'aggregator', it.name, it.desc.slice(0, 240) || it.name,
      value, usd, '—', JSON.stringify(['aggregator', src.name.split('/')[1] || 'list']),
      1, 'now', 'apply', provider, 'aggregators', src.name + '|' + it.url, it.url
    );
    if (info.changes) added++;
  }
  return { name: src.name, total: items.length, added };
}

export async function run() {
  log('info', `scan.aggregators polling ${SOURCES.length} list(s)`);
  let totalAdded = 0, totalItems = 0;
  for (const s of SOURCES) {
    try {
      const r = await pollSource(s);
      totalItems += r.total; totalAdded += r.added;
      if (r.added > 0) log('ok', `scan.aggregators ${r.name}: +${r.added} of ${r.total}`);
      else log('info', `scan.aggregators ${r.name}: ${r.total} seen, none new`);
    } catch (e) {
      log('bad', `scan.aggregators ${s.name} failed: ${e.message}`);
    }
  }
  return { totalItems, totalAdded };
}

const INTERVAL_MS = Number(process.env.AGGREGATORS_INTERVAL_MS || 6 * 60 * 60_000);
let timer = null;
export function start() {
  if (timer) return;
  run().catch((e) => log('bad', `scan.aggregators crash: ${e.message}`));
  timer = setInterval(() => run().catch((e) => log('bad', `scan.aggregators crash: ${e.message}`)), INTERVAL_MS);
  log('info', `scan.aggregators started — interval ${Math.round(INTERVAL_MS / 1000)}s`);
}
export function stop() { if (timer) clearInterval(timer), timer = null; }
