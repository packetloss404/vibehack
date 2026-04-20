/**
 * Active-promo scanner.
 *
 * Watches canonical partner-bundle pages (Perplexity × Xfinity/T-Mobile/PayPal/
 * Airtel, Google One AI Premium, ChatGPT Students, Runway Students, Gemini
 * bundles) for "free X months" / "% off" / "free with …" copy.
 *
 * Separate from `signups.mjs` (sign-up bonuses for new users) — these are
 * bundle / carrier / seasonal offers.
 */
import { db } from '../db.mjs';
import { log } from '../bus.mjs';
import { extractCreditSignals } from './_credit_parse.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const TARGETS = [
  { key: 'google-ai-premium',   provider: 'Google / Gemini Advanced', url: 'https://one.google.com/about/plans', tag: 'bundle' },
  { key: 'openai-students',     provider: 'ChatGPT Plus',             url: 'https://openai.com/chatgpt/students', tag: 'student' },
  { key: 'openai-education',    provider: 'ChatGPT Edu',              url: 'https://openai.com/chatgpt/education', tag: 'education' },
  { key: 'anthropic-education', provider: 'Claude',                   url: 'https://www.anthropic.com/education', tag: 'education' },
  { key: 'runway-students',     provider: 'Runway',                   url: 'https://runwayml.com/students', tag: 'student' },
  { key: 'elevenlabs-pricing',  provider: 'ElevenLabs',               url: 'https://elevenlabs.io/pricing', tag: 'promo' },
  { key: 'leonardo-pricing',    provider: 'Leonardo.AI',              url: 'https://leonardo.ai/pricing', tag: 'promo' },
  { key: 'ideogram-pricing',    provider: 'Ideogram',                 url: 'https://ideogram.ai/pricing', tag: 'promo' },
  { key: 'gemini-api',          provider: 'Gemini API',               url: 'https://ai.google.dev/pricing', tag: 'free tier' },
  { key: 'jetbrains-education', provider: 'JetBrains AI',             url: 'https://www.jetbrains.com/community/education/', tag: 'student' },
  { key: 'github-copilot-edu',  provider: 'GitHub Copilot',           url: 'https://education.github.com/pack', tag: 'student' },
];

const insStmt = db.prepare(`INSERT OR IGNORE INTO credits
  (id,"from",from_tag,subject,snippet,value,value_usd,deadline,tags,unread,when_str,action,provider,source,source_id,source_url)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PROMO_PATTERNS = [
  /(\d+)\s*(?:months?|weeks?|years?)\s+(?:free|of\s+(?:Pro|Plus|Premium|Advanced))/i,
  /free\s+for\s+(\d+)\s*(?:months?|year|weeks?)/i,
  /(\d+)%\s+off/i,
  /half[- ]price/i,
  /(?:no\s+)?credit\s+card\s+(?:required|needed)/i,
  /free\s+trial/i,
];

async function pollTarget(t) {
  const r = await fetch(t.url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const text = stripTags(await r.text()).slice(0, 20000);

  const dollarSignals = extractCreditSignals(text);
  const seen = new Map();
  for (const sig of dollarSignals) {
    const provider = sig.provider === 'Unknown' ? t.provider : sig.provider;
    const key = `${provider}|${sig.valueUsd}`;
    if (!seen.has(key)) seen.set(key, { ...sig, provider });
  }

  const extras = [];
  if (seen.size === 0) {
    for (const re of PROMO_PATTERNS) {
      const m = text.match(re);
      if (m) {
        extras.push({ value: m[0].replace(/\s+/g, ' ').trim(), valueUsd: 0, provider: t.provider, raw: m[0].trim() });
        break;
      }
    }
  }

  const all = [...seen.values(), ...extras];
  let added = 0;
  for (const sig of all) {
    const idx = text.toLowerCase().indexOf(sig.raw.toLowerCase());
    const snippet = idx >= 0 ? text.slice(Math.max(0, idx - 80), idx + sig.raw.length + 120).trim() : sig.raw;
    const subject = `${sig.provider} — ${sig.value}`;
    const id = `pr_${t.key}_${sig.valueUsd}_${sig.provider.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}`;
    const info = insStmt.run(
      id, t.provider, t.tag, subject, snippet,
      sig.value, sig.valueUsd, '—',
      JSON.stringify(['promo', t.tag, t.key]),
      1, 'now', 'apply',
      sig.provider, 'promos', `${t.key}|${sig.valueUsd}|${sig.provider}`, t.url
    );
    if (info.changes) added++;
  }
  return { key: t.key, signals: all.length, added };
}

export async function run() {
  log('info', `scan.promos polling ${TARGETS.length} promo / bundle page(s)`);
  let totalSignals = 0, totalAdded = 0;
  for (const t of TARGETS) {
    try {
      const r = await pollTarget(t);
      totalSignals += r.signals; totalAdded += r.added;
      if (r.added > 0) log('ok', `scan.promos ${t.key}: +${r.added}`);
    } catch (e) {
      log('bad', `scan.promos ${t.key} failed: ${e.message}`);
    }
  }
  if (totalAdded > 0) log('ok', `scan.promos +${totalAdded} across ${TARGETS.length} pages`);
  else log('info', `scan.promos ${totalSignals} signals seen, none new`);
  return { total: totalSignals, added: totalAdded };
}

const INTERVAL_MS = Number(process.env.PROMOS_INTERVAL_MS || 12 * 60 * 60_000);
let timer = null;
export function start() {
  if (timer) return;
  run().catch((e) => log('bad', `scan.promos crash: ${e.message}`));
  timer = setInterval(() => run().catch((e) => log('bad', `scan.promos crash: ${e.message}`)), INTERVAL_MS);
  log('info', `scan.promos started — interval ${Math.round(INTERVAL_MS / 1000)}s`);
}
export function stop() { if (timer) clearInterval(timer), timer = null; }
