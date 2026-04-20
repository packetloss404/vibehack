/**
 * Sign-up bonus / referral program scanner.
 *
 * Watches ~15 canonical pricing / student / referral pages where new-user
 * bonuses are documented. Extracts $-amounts + credit phrases and records
 * each offer as a credit row so the Credit Hunter can surface it.
 *
 * Verified URLs (all returned 200 + relevant copy in April 2026 research).
 */
import { db } from '../db.mjs';
import { log } from '../bus.mjs';
import { extractCreditSignals, parseUsd } from './_credit_parse.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const TARGETS = [
  { key: 'perplexity-students', provider: 'Perplexity',   url: 'https://www.perplexity.ai/students',                                tag: 'student program' },
  { key: 'cursor-students',     provider: 'Cursor',       url: 'https://cursor.com/students',                                       tag: 'student program' },
  { key: 'zed-education',       provider: 'Zed',          url: 'https://zed.dev/education',                                         tag: 'student program' },
  { key: 'zed-pricing',         provider: 'Zed',          url: 'https://zed.dev/pricing',                                           tag: 'free trial'     },
  { key: 'github-student-pack', provider: 'GitHub',       url: 'https://education.github.com/pack',                                 tag: 'student bundle' },
  { key: 'yc-student-deals',    provider: 'YC AI Stack',  url: 'https://deals.ycombinator.com/students',                            tag: 'student bundle' },
  { key: 'replit-refer',        provider: 'Replit',       url: 'https://replit.com/refer',                                          tag: 'referral'       },
  { key: 'replit-pricing',      provider: 'Replit',       url: 'https://replit.com/pricing',                                        tag: 'free tier'      },
  { key: 'lovable-referral',    provider: 'Lovable',      url: 'https://lovable.dev/faq/referral',                                  tag: 'referral'       },
  { key: 'windsurf-pricing',    provider: 'Windsurf',     url: 'https://windsurf.com/pricing',                                      tag: 'free trial'     },
  { key: 'v0-pricing',          provider: 'v0',           url: 'https://v0.app/pricing',                                            tag: 'free tier'      },
  { key: 'factory-pricing',     provider: 'Factory.ai',   url: 'https://factory.ai/pricing',                                        tag: 'signup bonus'   },
  { key: 'devin-pricing',       provider: 'Devin',        url: 'https://devin.ai/pricing',                                          tag: 'signup bonus'   },
  { key: 'cline-pricing',       provider: 'Cline',        url: 'https://cline.bot/pricing',                                         tag: 'free tier'      },
  { key: 'warp-refer',          provider: 'Warp',         url: 'https://docs.warp.dev/getting-started/refer-a-friend',              tag: 'referral'       },
  { key: 'azure-students',      provider: 'Azure',        url: 'https://azure.microsoft.com/en-us/free/students',                   tag: 'student program' },
  { key: 'notion-education',    provider: 'Notion',       url: 'https://www.notion.com/product/notion-for-education',               tag: 'student program' },
];

const insStmt = db.prepare(`INSERT OR IGNORE INTO credits
  (id,"from",from_tag,subject,snippet,value,value_usd,deadline,tags,unread,when_str,action,provider,source,source_id,source_url)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Patterns that flag a sign-up bonus / referral / student perk, even without a $ amount
const FREE_PATTERNS = [
  /(\d+)\s*(?:months?|weeks?|days?)\s+(?:free|of\s+(?:Pro|Plus|Premium))/i,
  /free\s+for\s+(\d+)\s*(?:months?|weeks?|year)/i,
  /(\d+)[MK]?\s+(?:tokens?|credits?|requests?)\s+(?:free|per\s+\w+)/i,
  /(\d+)%\s+off/i,
  /refer\s+a\s+friend/i,
  /student\s+(?:discount|pricing|program|pack)/i,
];

async function pollTarget(t) {
  const r = await fetch(t.url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const html = await r.text();
  const text = stripTags(html).slice(0, 20000); // cap for very long pages

  // Pass 1: dollar-based credit signals
  const dollarSignals = extractCreditSignals(text);
  // Dedupe per-target: keep largest per-provider amount
  const seen = new Map();
  for (const sig of dollarSignals) {
    const provider = sig.provider === 'Unknown' ? t.provider : sig.provider;
    const key = `${provider}|${sig.valueUsd}`;
    if (!seen.has(key)) seen.set(key, { ...sig, provider });
  }

  // Pass 2: free-tier / referral signals (only if no dollar signal for this page)
  const extras = [];
  if (seen.size === 0) {
    for (const re of FREE_PATTERNS) {
      const m = text.match(re);
      if (m) {
        extras.push({
          value: m[0].toLowerCase().startsWith('refer') || m[0].toLowerCase().includes('student')
            ? m[0].replace(/\s+/g, ' ').trim()
            : m[0],
          valueUsd: 0,
          provider: t.provider,
          raw: m[0].trim(),
        });
        break; // one canonical signal per page is enough
      }
    }
  }

  const all = [...seen.values(), ...extras];
  let added = 0;
  for (const sig of all) {
    const idx = text.toLowerCase().indexOf(sig.raw.toLowerCase());
    const snippet = idx >= 0
      ? text.slice(Math.max(0, idx - 80), idx + sig.raw.length + 120).trim()
      : sig.raw;
    const subject = `${sig.provider} — ${sig.value}`;
    const id = `su_${t.key}_${sig.valueUsd}_${sig.provider.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}`;
    const info = insStmt.run(
      id, t.provider, t.tag, subject, snippet,
      sig.value, sig.valueUsd, '—',
      JSON.stringify(['signup', t.tag.replace(/\s+/g, '-'), t.key]),
      1, 'now', 'claim',
      sig.provider, 'signups', `${t.key}|${sig.valueUsd}|${sig.provider}`, t.url
    );
    if (info.changes) added++;
  }
  return { key: t.key, signals: all.length, added };
}

export async function run() {
  log('info', `scan.signups polling ${TARGETS.length} sign-up / student / referral page(s)`);
  let totalSignals = 0, totalAdded = 0;
  for (const t of TARGETS) {
    try {
      const r = await pollTarget(t);
      totalSignals += r.signals; totalAdded += r.added;
      if (r.added > 0) log('ok', `scan.signups ${t.key}: +${r.added}`);
    } catch (e) {
      log('bad', `scan.signups ${t.key} failed: ${e.message}`);
    }
  }
  if (totalAdded > 0) log('ok', `scan.signups +${totalAdded} across ${TARGETS.length} pages`);
  else log('info', `scan.signups ${totalSignals} signals seen, none new`);
  return { total: totalSignals, added: totalAdded };
}

const INTERVAL_MS = Number(process.env.SIGNUPS_INTERVAL_MS || 12 * 60 * 60_000);
let timer = null;
export function start() {
  if (timer) return;
  run().catch((e) => log('bad', `scan.signups crash: ${e.message}`));
  timer = setInterval(() => run().catch((e) => log('bad', `scan.signups crash: ${e.message}`)), INTERVAL_MS);
  log('info', `scan.signups started — interval ${Math.round(INTERVAL_MS / 1000)}s`);
}
export function stop() { if (timer) clearInterval(timer), timer = null; }
