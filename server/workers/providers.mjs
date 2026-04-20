/**
 * Curated AI-provider credit-page scraper.
 *
 * Hits a few well-known static HTML pages where dollar amounts are baked into
 * the markup. No auth, no headless. Extracts $-amount + surrounding copy.
 */
import { db } from '../db.mjs';
import { log } from '../bus.mjs';
import { extractCreditSignals } from './_credit_parse.mjs';

const TARGETS = [
  {
    key: 'together',
    provider: 'Together AI',
    url: 'https://www.together.ai/startup-accelerator',
    from: 'Together AI',
    fromTag: 'startup program',
  },
  {
    key: 'modal',
    provider: 'Modal',
    url: 'https://modal.com/startups',
    from: 'Modal',
    fromTag: 'startup program',
  },
  {
    key: 'lambda',
    provider: 'Lambda Labs',
    url: 'https://lambda.ai/research',
    from: 'Lambda Labs',
    fromTag: 'research grant',
  },
  {
    key: 'flyio',
    provider: 'Fly.io',
    url: 'https://fly.io/hello/fly-indie-hackers',
    from: 'Fly.io',
    fromTag: 'indie hackers',
  },
  {
    key: 'aigrant',
    provider: 'AI Grant',
    url: 'https://aigrant.com',
    from: 'AI Grant',
    fromTag: 'accelerator',
  },
];

const insStmt = db.prepare(`INSERT OR IGNORE INTO credits
  (id,"from",from_tag,subject,snippet,value,value_usd,deadline,tags,unread,when_str,action,provider,source,source_id,source_url)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function pollTarget(t) {
  const r = await fetch(t.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html',
    },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const html = await r.text();
  const text = stripTags(html);
  const signals = extractCreditSignals(text);

  // Dedupe per-target: keep the largest-amount offer for each (page, dollar-amount).
  // When the in-line provider guess is "Unknown", fall back to the page's own provider name.
  const seen = new Map();
  for (const sig of signals) {
    const provider = sig.provider === 'Unknown' ? t.provider : sig.provider;
    const key = `${provider}|${sig.valueUsd}`;
    if (!seen.has(key)) seen.set(key, { ...sig, provider });
  }

  let added = 0;
  for (const sig of seen.values()) {
    const idx = text.toLowerCase().indexOf(sig.raw.toLowerCase());
    const snippet = idx >= 0 ? text.slice(Math.max(0, idx - 60), idx + sig.raw.length + 80).trim() : sig.raw;
    const id = `prov_${t.key}_${sig.valueUsd}_${sig.provider.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}`;
    const subject = `${sig.provider} — ${sig.value}`;
    const info = insStmt.run(
      id, t.from, t.fromTag, subject, snippet,
      sig.value, sig.valueUsd, '—',
      JSON.stringify(['provider', t.key]), 1, 'now', 'apply',
      sig.provider, 'providers', `${t.key}|${sig.valueUsd}|${sig.provider}`, t.url
    );
    if (info.changes) added++;
  }
  return { key: t.key, signalCount: seen.size, added };
}

export async function run() {
  log('info', `scan.providers polling ${TARGETS.length} provider page(s)`);
  let totalAdded = 0, totalSignals = 0;
  for (const t of TARGETS) {
    try {
      const r = await pollTarget(t);
      totalSignals += r.signalCount; totalAdded += r.added;
      if (r.added > 0) log('ok', `scan.providers ${t.key}: +${r.added} signal(s)`);
      else if (r.signalCount > 0) log('info', `scan.providers ${t.key}: ${r.signalCount} signals seen, none new`);
      else log('warn', `scan.providers ${t.key}: no credit signals detected`);
    } catch (e) {
      log('bad', `scan.providers ${t.key} failed: ${e.message}`);
    }
  }
  return { totalSignals, totalAdded };
}

const INTERVAL_MS = Number(process.env.PROVIDERS_INTERVAL_MS || 12 * 60 * 60_000);
let timer = null;
export function start() {
  if (timer) return;
  run().catch((e) => log('bad', `scan.providers crash: ${e.message}`));
  timer = setInterval(() => run().catch((e) => log('bad', `scan.providers crash: ${e.message}`)), INTERVAL_MS);
  log('info', `scan.providers started — interval ${Math.round(INTERVAL_MS / 1000)}s`);
}
export function stop() { if (timer) clearInterval(timer), timer = null; }
