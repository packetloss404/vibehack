/**
 * Lu.ma calendar scanner — uses undocumented but public endpoints.
 *
 *   1. Resolve a human slug to an api_id:  GET https://api.lu.ma/url?url=<slug>
 *   2. List upcoming events:              GET https://api.lu.ma/calendar/get-items?calendar_api_id=<id>&period=future
 *
 * Calendars to follow are read from:
 *   - process.env.LUMA_CALENDARS  (comma-separated slugs)
 *   - DB rows in `sources` where kind='luma' and url contains the slug
 */
import { db } from '../db.mjs';
import { log } from '../bus.mjs';
import { extractCreditSignals, flattenProseMirror } from './_credit_parse.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const DEFAULT_SLUGS = [
  'genai-collective',
  'genai-sf',
  'oss4ai',
  'theaibuildersdev',
  'ai-tinkerers-sf',
  'ai-tinkerers-seattle',
  'ai-tinkerers-paloalto',
  'build-club',
  'aitinkerers',
];

const ENV_SLUGS = (process.env.LUMA_CALENDARS || DEFAULT_SLUGS.join(','))
  .split(',').map((s) => s.trim()).filter(Boolean);

const STRONG_HACKATHON_PATTERNS = [
  /\bhackathon\b/i,
  /hackathon/i,
  /\bhack\s*day\b/i,
  /\bhack\s*week(?:end)?\b/i,
  /\bbuildathon\b/i,
  /\bcodefest\b/i,
  /\bgame\s*jam\b/i,
];

const VIBE_CODING_PATTERNS = [
  /\bvibe\s*coding\b/i,
  /\bvibecoding\b/i,
  /\bbuild\s+your\s+(?:first|next)\s+app\b/i,
  /\bbuild\s+an\s+app\b/i,
  /\bapp\s+builder\b/i,
];

const BUILD_SIGNAL_PATTERNS = [
  /\bchallenge\b/i,
  /\bcontest\b/i,
  /\bcompetition\b/i,
  /\bcup\b/i,
  /\bprizes?\b/i,
  /\bcash\s+prizes?\b/i,
  /\bsprint\b/i,
  /\bjam\b/i,
  /\bdemo\s*day\b/i,
  /\bagents?\b/i,
  /\bprototype\b/i,
  /\bship\b/i,
];

const TOOLING_PATTERNS = [/\bcursor\b/i, /\blovable\b/i, /\bbolt\b/i, /\breplit\b/i, /\bwindsurf\b/i, /\bv0\b/i, /\bclaude\s+code\b/i, /\bmanus\b/i];

const HARD_EXCLUDE_PATTERNS = [
  /\bmeet\s*&\s*greet\b/i,
  /\bmeetup\b/i,
  /\bhappy\s+hour\b/i,
  /\bvip\b/i,
  /\bdinner\b/i,
  /\bbrunch\b/i,
  /\bbreakfast\b/i,
  /\bnetwork(?:ing)?\b/i,
  /\bpanel\b/i,
  /\bfireside\b/i,
  /\bkeynote\b/i,
  /\bhiring\s+night\b/i,
  /\bjob\s+fair\b/i,
  /\bconference\b/i,
  /\bsummit\b/i,
  /\bexpo\b/i,
  /\bsocial\b/i,
  /\blounge\b/i,
];

const SOFT_EXCLUDE_PATTERNS = [
  /\bfounders?\b/i,
  /\bstartup\s+idea\b/i,
  /\bproduct\b/i,
  /\bbusiness\s+strateg(?:y|ies)\b/i,
  /\btech\s+leaders\b/i,
  /\bwhat\s+comes\s+next\b/i,
  /\bvibe\s+research(?:ing)?\b/i,
  /\bdrinks\b/i,
];

const insStmt = db.prepare(`INSERT OR IGNORE INTO hacks
  (id,code,name,host,starts,ends,prize,tracks,status,registered,teammates,progress,you,due,source,source_url,location,attendance_mode,website,hidden,source_key)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const insCreditStmt = db.prepare(`INSERT OR IGNORE INTO credits
  (id,"from",from_tag,subject,snippet,value,value_usd,deadline,deadline_ts,tags,unread,when_str,action,provider,source,source_id,source_url)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

function fmtDay(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toDateString().slice(4, 10);
}

function extractLocation(ev) {
  return ev.geo_address_json?.full_address || ev.geo_address_json?.address || ev.geo_address_info?.full_address || ev.geo_address_info?.address || ev.address || ev.place || '';
}

function extractAttendanceMode(ev, location) {
  const virtualLink = ev.zoom_meeting_url || ev.meeting_url || ev.join_url || '';
  const text = [ev.name, ev.description, ev.event_type, location].filter(Boolean).join(' ').toLowerCase();
  const looksVirtual = /\bonline\b|\bvirtual\b|zoom|google meet|livestream/.test(text) || /zoom|meet/.test(virtualLink);
  if (looksVirtual && location) return 'hybrid';
  if (looksVirtual) return 'online';
  if (location) return 'in_person';
  return 'unknown';
}

function scoreMatches(patterns, text, weight) {
  return patterns.reduce((score, pattern) => score + (pattern.test(text) ? weight : 0), 0);
}

function classifyLumaEvent(ev) {
  const text = [ev.name, ev.description, ev.event_type].filter(Boolean).join(' ');
  const strongHackathon = STRONG_HACKATHON_PATTERNS.some((pattern) => pattern.test(text));
  const vibeCoding = VIBE_CODING_PATTERNS.some((pattern) => pattern.test(text));
  const buildSignals = scoreMatches(BUILD_SIGNAL_PATTERNS, text, 1);
  const toolingSignals = scoreMatches(TOOLING_PATTERNS, text, 1);
  const hardExcludes = scoreMatches(HARD_EXCLUDE_PATTERNS, text, 4);
  const softExcludes = scoreMatches(SOFT_EXCLUDE_PATTERNS, text, 2);

  let score = 0;
  if (strongHackathon) score += 6;
  if (vibeCoding) score += 5;
  score += Math.min(buildSignals, 4);
  if (vibeCoding && toolingSignals > 0) score += 2;
  if (strongHackathon && /\bopen\s+registration\b/i.test(text)) score += 1;
  score -= hardExcludes + softExcludes;

  const keep = strongHackathon || vibeCoding
    ? score >= 3
    : score >= 6 && buildSignals >= 2 && toolingSignals > 0;

  return {
    keep,
    score,
    explicitHackathon: strongHackathon,
    track: strongHackathon ? 'Hackathon' : vibeCoding ? 'Vibe Coding' : 'Builder Event',
  };
}

function shouldHideForAttendance(attendanceMode, classification) {
  if (!classification.keep) return true;
  if (classification.explicitHackathon) return false;
  return attendanceMode === 'in_person' || attendanceMode === 'unknown';
}

const reclassifyLumaStmt = db.prepare("UPDATE hacks SET hidden=?, tracks=? WHERE id=? AND source='luma'");

export function reclassifyStoredLumaEvents() {
  const rows = db.prepare("SELECT id, name, tracks, source, source_key, attendance_mode FROM hacks WHERE source='luma'").all();
  let changed = 0;
  for (const row of rows) {
    const currentTracks = JSON.parse(row.tracks || '[]');
    const slug = row.source_key || currentTracks.find((track) => track && track !== 'Hackathon' && track !== 'Meetup' && track !== 'Vibe Coding' && track !== 'Builder Event') || '';
    const classification = classifyLumaEvent({ name: row.name });
    const nextTracks = JSON.stringify([classification.track, slug].filter(Boolean));
    const hidden = shouldHideForAttendance(row.attendance_mode || 'unknown', classification);
    const info = reclassifyLumaStmt.run(hidden ? 1 : 0, nextTracks, row.id);
    changed += info.changes;
  }
  return { total: rows.length, changed };
}

async function resolveSlug(slug) {
  // Accept either plain slug ("genai-collective") or full URL ("https://lu.ma/genai-collective")
  const clean = slug.replace(/^https?:\/\/lu\.ma\//, '').replace(/^\/+|\/+$/g, '').split('?')[0];
  const r = await fetch(`https://api.lu.ma/url?url=${encodeURIComponent(clean)}`, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
  });
  if (!r.ok) throw new Error(`slug resolve HTTP ${r.status}`);
  const j = await r.json();
  if (j.kind === 'calendar' && j.data?.calendar?.api_id) {
    return { kind: 'calendar', apiId: j.data.calendar.api_id, name: j.data.calendar.name || clean, slug: clean };
  }
  if (j.kind === 'event' && j.data?.event?.api_id) {
    return { kind: 'event', apiId: j.data.event.api_id, name: j.data.event.name, slug: clean };
  }
  throw new Error('unexpected lu.ma response kind: ' + j.kind);
}

async function listCalendarEvents(apiId, limit = 50) {
  const url = `https://api.lu.ma/calendar/get-items?calendar_api_id=${apiId}&pagination_limit=${limit}&period=future`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`get-items HTTP ${r.status}`);
  const j = await r.json();
  return j.entries || [];
}

function insertEvent({ ev, calendarSlug, host }) {
  const id = 'luma_' + ev.api_id.replace(/^evt-/, '');
  const code = 'LUMA-' + ev.api_id.slice(-6).toUpperCase();
  const classification = classifyLumaEvent(ev);
  if (!classification.keep) return { inserted: false, isHackish: false };
  const tracks = JSON.stringify([
    classification.track,
    calendarSlug || '',
  ].filter(Boolean));
  const url = `https://lu.ma/${ev.url || ev.api_id.replace(/^evt-/, '')}`;
  const location = extractLocation(ev);
  const attendanceMode = extractAttendanceMode(ev, location);
  const hidden = shouldHideForAttendance(attendanceMode, classification);
  const info = insStmt.run(
    id, code, ev.name || 'Untitled Lu.ma event', host || 'Lu.ma',
    fmtDay(ev.start_at), fmtDay(ev.end_at), '—',
    tracks, 'upcoming', 0, 0, 0, '—',
    ev.end_at ? new Date(ev.end_at).toUTCString() : '—',
    'luma', url, location, attendanceMode, 'lu.ma', hidden ? 1 : 0, calendarSlug || ''
  );
  return { inserted: info.changes > 0, isHackish: true };
}

/** Fetch event detail and extract credit signals from the description into the credits table. */
async function enrichEventCredits(ev) {
  try {
    const slug = ev.url || ev.api_id.replace(/^evt-/, '');
    const r = await fetch(`https://api.lu.ma/url?url=${encodeURIComponent(slug)}`, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    });
    if (!r.ok) return 0;
    const j = await r.json();
    const desc = flattenProseMirror(j.data?.description_mirror) || j.data?.event?.description || '';
    if (!desc) return 0;
    const signals = extractCreditSignals(desc);
    const eventUrl = `https://lu.ma/${slug}`;
    const eventName = j.data?.event?.name || ev.name || 'Lu.ma event';
    let added = 0;
    const deadlineTs = ev.end_at ? Math.floor(new Date(ev.end_at).getTime() / 1000) : 0;
    for (const sig of signals) {
      const id = `luma_cr_${ev.api_id.replace(/^evt-/, '')}_${sig.provider.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}_${sig.valueUsd}`;
      const subject = `${sig.provider} — ${sig.value}`;
      const snippet = `${eventName}: ${sig.raw}`;
      const info = insCreditStmt.run(
        id, eventName, 'hackathon sponsor', subject, snippet,
        sig.value, sig.valueUsd, fmtDay(ev.end_at) || '—', deadlineTs,
        JSON.stringify(['hackathon', 'luma', sig.provider.toLowerCase()]),
        1, 'now', 'apply', sig.provider, 'luma', `${ev.api_id}|${sig.provider}|${sig.valueUsd}`, eventUrl
      );
      if (info.changes) added++;
    }
    return added;
  } catch (e) {
    return 0;
  }
}

export async function run() {
  const reclassified = reclassifyStoredLumaEvents();
  if (reclassified.changed > 0) {
    log('info', `scan.luma reclassified ${reclassified.total} stored event(s)`);
  }
  const customSlugs = db.prepare("SELECT url FROM sources WHERE kind='luma' AND enabled != 0").all()
    .map((r) => r.url);
  const slugs = customSlugs.length > 0 ? [...new Set(customSlugs)] : [...new Set([...ENV_SLUGS, ...customSlugs])];
  if (slugs.length === 0) {
    log('info', 'scan.luma no calendars configured — add via "+ Add source" with kind=luma or set LUMA_CALENDARS');
    return { calendars: 0, total: 0, added: 0 };
  }
  log('info', `scan.luma polling ${slugs.length} calendar(s)`);
  let total = 0, added = 0;
  for (const slug of slugs) {
    try {
      const resolved = await resolveSlug(slug);
      if (resolved.kind === 'event') {
        // single event, treat as one-shot insert — re-fetch to get start/end
        const evRes = await fetch(`https://api.lu.ma/url?url=${encodeURIComponent(resolved.slug)}`, { headers: { 'User-Agent': UA } });
        const j = await evRes.json();
        const ev = j.data?.event;
        if (ev) {
          const single = insertEvent({ ev, calendarSlug: resolved.slug, host: 'Lu.ma' });
          if (single.inserted) added++;
          total++;
        }
        continue;
      }
      const entries = await listCalendarEvents(resolved.apiId);
      let creditsAdded = 0, hackish = 0;
      for (const entry of entries) {
        const ev = entry.event;
        if (!ev) continue;
        const r = insertEvent({ ev, calendarSlug: resolved.slug, host: resolved.name });
        if (r.inserted) added++;
        if (r.isHackish) hackish++;
        total++;
        // Enrich only hack-ish events with credit extraction (skip casual meetups)
        if (process.env.LUMA_ENRICH !== '0' && r.isHackish) {
          creditsAdded += await enrichEventCredits(ev);
        }
      }
      if (creditsAdded > 0) log('ok', `scan.luma ${resolved.slug}: +${creditsAdded} credit signal(s)`);
      log('info', `scan.luma ${resolved.slug}: ${entries.length} events (${hackish} hackish)`);
    } catch (e) {
      log('bad', `scan.luma ${slug} failed: ${e.message}`);
    }
  }
  if (added > 0) log('ok', `scan.luma ${added} new event(s) across ${slugs.length} calendar(s)`);
  else log('info', `scan.luma ${total} events seen, none new`);
  return { calendars: slugs.length, total, added };
}

const INTERVAL_MS = Number(process.env.LUMA_INTERVAL_MS || 30 * 60_000);
let timer = null;

export function start() {
  if (timer) return;
  run().catch((e) => log('bad', `scan.luma crash: ${e.message}`));
  timer = setInterval(() => run().catch((e) => log('bad', `scan.luma crash: ${e.message}`)), INTERVAL_MS);
  log('info', `scan.luma started — interval ${Math.round(INTERVAL_MS / 1000)}s`);
}

export function stop() {
  if (timer) clearInterval(timer), timer = null;
}
