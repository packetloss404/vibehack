/**
 * Gmail credit-hunter (skeleton).
 *
 * Real-mode requirements (set these in .env to activate):
 *   GMAIL_CLIENT_ID      — OAuth2 desktop client id
 *   GMAIL_CLIENT_SECRET  — OAuth2 desktop client secret
 *   GMAIL_REFRESH_TOKEN  — obtained via one-time consent flow
 *   GMAIL_QUERY          — Gmail search query, default "newer_than:7d (credit OR grant OR promo OR bounty)"
 *
 * Uses raw fetch against Google's REST endpoints — no googleapis SDK required.
 */
import { db } from '../db.mjs';
import { log } from '../bus.mjs';

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const QUERY = process.env.GMAIL_QUERY || 'newer_than:7d (credit OR grant OR promo OR bounty)';

const configured = !!(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);

let accessToken = null;
let accessTokenExpiresAt = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiresAt - 30_000) return accessToken;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error('oauth token refresh failed: ' + r.status);
  const j = await r.json();
  accessToken = j.access_token;
  accessTokenExpiresAt = Date.now() + (j.expires_in || 3600) * 1000;
  return accessToken;
}

async function listMessages(token) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(QUERY)}&maxResults=50`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error('messages.list failed: ' + r.status);
  return (await r.json()).messages || [];
}

async function getMessage(token, id) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error('messages.get failed: ' + r.status);
  return r.json();
}

function header(msg, name) {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function guessValue(subject) {
  const m = subject.match(/\$\s?[\d,]+|\d+\s?%\s?off|free\s+tier|quota/i);
  return m ? m[0] : '—';
}

function providerFrom(from) {
  const m = from.match(/@([^>\s]+)/);
  if (!m) return 'unknown';
  const host = m[1].split('.').slice(-2, -1)[0] || 'unknown';
  return host.charAt(0).toUpperCase() + host.slice(1);
}

export async function run() {
  if (!configured) {
    log('info', 'scan.gmail skipped — set GMAIL_* env vars to enable');
    return { skipped: true, reason: 'not configured' };
  }
  log('info', `scan.gmail query="${QUERY}"`);
  try {
    const token = await getAccessToken();
    const msgs = await listMessages(token);
    const ins = db.prepare(`INSERT OR IGNORE INTO credits
      (id,"from",from_tag,subject,snippet,value,deadline,tags,unread,when_str,action,provider,source,source_id)
      VALUES (?,?,?,?,?,?,?,?,1,'now','apply',?,'gmail',?)`);
    let added = 0;
    for (const m of msgs) {
      const full = await getMessage(token, m.id);
      const from = header(full, 'From');
      const subject = header(full, 'Subject');
      const snippet = full.snippet || '';
      const provider = providerFrom(from);
      const id = 'gm_' + m.id;
      const info = ins.run(id, from, 'gmail', subject, snippet, guessValue(subject), '—', '[]', provider, m.id);
      if (info.changes) added++;
    }
    if (added) log('ok', `scan.gmail ${added} new credit lead(s)`);
    else log('info', `scan.gmail ${msgs.length} messages scanned, none new`);
    return { total: msgs.length, added };
  } catch (e) {
    log('bad', `scan.gmail failed: ${e.message}`);
    return { error: e.message };
  }
}

const INTERVAL_MS = Number(process.env.GMAIL_INTERVAL_MS || 5 * 60_000);
let timer = null;

export function start() {
  if (timer) return;
  if (!configured) {
    log('info', 'scan.gmail disabled (missing GMAIL_* env vars)');
    return;
  }
  run().catch((e) => log('bad', `scan.gmail crash: ${e.message}`));
  timer = setInterval(() => run().catch((e) => log('bad', `scan.gmail crash: ${e.message}`)), INTERVAL_MS);
  log('info', `scan.gmail started — interval ${Math.round(INTERVAL_MS / 1000)}s`);
}

export function stop() {
  if (timer) clearInterval(timer), timer = null;
}
