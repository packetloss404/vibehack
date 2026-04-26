import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { logger } from 'hono/logger';
import { canonicalUrlKey, queries } from './db.mjs';
import { bus, log } from './bus.mjs';
import { startAll, runOne, status as workerStatus } from './workers/index.mjs';

const FETCH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function parseHtmlTitle(html = '') {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  return (og || title || '').replace(/\s+/g, ' ').trim();
}

function hostnameFromUrl(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function canonicalUrl(url = '') {
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    parsed.hash = '';
    parsed.username = '';
    parsed.password = '';
    parsed.protocol = 'https:';
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_|igshid$|ref$)/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return String(url || '').trim();
  }
}

function resolveHackLink({ hack = '', hackId = '', contestUrl = '' } = {}) {
  const urlKey = canonicalUrlKey(contestUrl);
  const needle = hackId || hack;
  const matchedHack = needle || urlKey
    ? queries.allHacks().find((h) => (
      h.id === needle
      || h.code === needle
      || (urlKey && h.source_url_key === urlKey)
      || (contestUrl && canonicalUrlKey(h.source_url || h.website) === urlKey)
    ))
    : null;
  return {
    hack: hack || matchedHack?.code || matchedHack?.id || '',
    hackId: hackId || matchedHack?.id || '',
    contestUrlKey: urlKey,
    matchedHack: matchedHack || null,
  };
}

function duplicateMetadata(duplicates = []) {
  return {
    duplicate: duplicates.length > 0,
    duplicates,
    existingDuplicate: duplicates[0] || null,
  };
}

const app = new Hono();

app.use('*', logger());

app.get('/healthz', (c) => c.json({ ok: true }));

// Reads
app.get('/api/hacks',    (c) => c.json(queries.allHacks()));
app.get('/api/entries',  (c) => c.json(queries.allEntries()));
app.get('/api/log',      (c) => {
  const limit = Math.max(1, Math.min(1000, Number(c.req.query('limit')) || 200));
  return c.json(queries.recentLog(limit));
});
app.get('/api/calendar', (c) => c.json(queries.calendar()));

// SSE stream of agent log events (keeps connection open; pushes new lines)
app.get('/api/log/stream', (c) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Accel-Buffering', 'no');
  return streamSSE(c, async (stream) => {
    for (const row of queries.recentLog(20)) {
      await stream.writeSSE({ data: JSON.stringify(row), event: 'log' });
    }
    let alive = true;
    const handler = (row) => {
      if (!alive) return;
      stream.writeSSE({ data: JSON.stringify(row), event: 'log' }).catch(() => {});
    };
    bus.on('log', handler);
    stream.onAbort(() => { alive = false; bus.off('log', handler); });
    while (alive) {
      await stream.sleep(20_000);
      if (alive) await stream.writeSSE({ data: 'ping', event: 'ping' }).catch(() => {});
    }
  });
});

// Mutations — hacks
app.post('/api/hacks/:id/register', (c) => {
  const r = queries.toggleHackRegistered(c.req.param('id'));
  return r ? c.json(r) : c.json({ error: 'not found' }, 404);
});
app.patch('/api/hacks/:id/registration', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const patch = {
    registered: body.registered,
    registrationStatus: body.registrationStatus ?? body.registration_status,
    registrationUrl: body.registrationUrl ?? body.registration_url,
    registrationNotes: body.registrationNotes ?? body.registration_notes,
    registeredAt: body.registeredAt ?? body.registered_at,
  };
  for (const key of Object.keys(patch)) if (patch[key] === undefined) delete patch[key];
  if (patch.registered !== undefined && patch.registrationStatus === undefined) {
    patch.registrationStatus = patch.registered ? 'registered' : 'candidate';
  }
  if (patch.registered === undefined && patch.registrationStatus !== undefined) {
    patch.registered = patch.registrationStatus === 'registered';
  }
  if (patch.registered && patch.registeredAt === undefined) patch.registeredAt = new Date().toISOString();
  if (patch.registered === false && patch.registeredAt === undefined) patch.registeredAt = '';
  const r = queries.updateHack(c.req.param('id'), patch);
  if (!r) return c.json({ error: 'not found' }, 404);
  log('info', `hack registration updated: ${r.name}`);
  return c.json({
    id: r.id,
    registered: r.registered,
    registration_status: r.registration_status,
    registration_url: r.registration_url,
    registration_notes: r.registration_notes,
    registered_at: r.registered_at,
  });
});
app.post('/api/hacks', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.name) return c.json({ error: 'name required' }, 400);
  const r = queries.createHack(body);
  log('ok', `hackathon added manually: ${r.name}`);
  return c.json(r);
});
app.patch('/api/hacks/visibility', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.field || body.value == null) return c.json({ error: 'field and value required' }, 400);
  const r = queries.setHackVisibilityBy(body);
  log('info', `hack visibility ${body.hidden ? 'hidden' : 'shown'}: ${body.field}=${body.value}`);
  return c.json(r);
});
app.patch('/api/hacks/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const r = queries.updateHack(c.req.param('id'), body);
  if (!r) return c.json({ error: 'not found' }, 404);
  log('ok', `hackathon updated: ${r.name}`);
  return c.json(r);
});
app.delete('/api/hacks/:id', (c) => c.json(queries.deleteHack(c.req.param('id'))));

// Mutations — entries
app.post('/api/entries', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.title) return c.json({ error: 'title required' }, 400);
  const link = resolveHackLink({ hack: body.hack, hackId: body.hackId ?? body.hack_id, contestUrl: body.contestUrl ?? body.contest_url });
  const duplicates = queries.findActiveDuplicateEntries({ hackId: link.hackId, contestUrlKey: link.contestUrlKey });
  if (!body.allowDuplicate && duplicates.length) {
    return c.json({ error: 'duplicate entry', ...duplicateMetadata(duplicates) }, 409);
  }
  const entry = queries.createEntry({
    ...body,
    hack: link.hack || body.hack || body.hackId || body.hack_id,
    contestUrl: body.contestUrl ?? body.contest_url ?? '',
  });
  return c.json({ ...entry, ...duplicateMetadata([]) });
});
app.patch('/api/entries/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const r = queries.updateEntry(c.req.param('id'), body);
  return r ? c.json(r) : c.json({ error: 'not found' }, 404);
});
app.patch('/api/entries/:id/tasks/:idx', (c) => {
  const r = queries.toggleTask(c.req.param('id'), Number(c.req.param('idx')));
  return r ? c.json(r) : c.json({ error: 'not found' }, 404);
});
app.delete('/api/entries/:id', (c) => c.json(queries.deleteEntry(c.req.param('id'))));

app.post('/api/import-url', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const rawUrl = String(body.url || '').trim();
  if (!rawUrl) return c.json({ error: 'url required' }, 400);
  let url = rawUrl;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const initialCanonical = canonicalUrl(url);
  const initialUrlKey = canonicalUrlKey(url);

  const matchedHack = queries.findHackByUrl(url);
  const initialDuplicates = queries.findActiveDuplicateEntries({
    hackId: matchedHack?.id || '',
    contestUrlKey: initialUrlKey,
  });
  if (matchedHack) {
    return c.json({
      url,
      canonical: initialCanonical,
      urlKey: initialUrlKey,
      title: matchedHack.name,
      host: matchedHack.host,
      website: matchedHack.website,
      matchedHack,
      matchedEntry: initialDuplicates[0] || null,
      ...duplicateMetadata(initialDuplicates),
      contestDeadline: matchedHack.due || matchedHack.ends || '',
      contestPrize: matchedHack.prize || '',
      hackCode: matchedHack.code || '',
    });
  }

  try {
    const response = await fetch(url, { headers: { 'User-Agent': FETCH_UA } });
    const html = await response.text();
    const finalUrl = response.url || url;
    const finalUrlKey = canonicalUrlKey(finalUrl);
    const fetchedMatchedHack = queries.findHackByUrl(finalUrl);
    const duplicates = queries.findActiveDuplicateEntries({
      hackId: fetchedMatchedHack?.id || '',
      contestUrlKey: finalUrlKey,
    });
    return c.json({
      url: finalUrl,
      canonical: canonicalUrl(finalUrl),
      urlKey: finalUrlKey,
      title: fetchedMatchedHack?.name || parseHtmlTitle(html),
      host: fetchedMatchedHack?.host || hostnameFromUrl(finalUrl),
      website: fetchedMatchedHack?.website || hostnameFromUrl(finalUrl),
      matchedHack: fetchedMatchedHack || null,
      matchedEntry: duplicates[0] || null,
      ...duplicateMetadata(duplicates),
      contestDeadline: fetchedMatchedHack?.due || fetchedMatchedHack?.ends || '',
      contestPrize: fetchedMatchedHack?.prize || '',
      hackCode: fetchedMatchedHack?.code || '',
    });
  } catch (e) {
    const duplicates = queries.findActiveDuplicateEntries({ contestUrlKey: initialUrlKey });
    return c.json({
      url,
      canonical: initialCanonical,
      urlKey: initialUrlKey,
      title: '',
      host: hostnameFromUrl(url),
      website: hostnameFromUrl(url),
      matchedHack: null,
      matchedEntry: duplicates[0] || null,
      ...duplicateMetadata(duplicates),
      warning: e.message,
    });
  }
});

// Contest sources
app.get('/api/sources', (c) => c.json(queries.allSources()));
app.get('/api/sources/health', (c) => c.json(queries.allSources().map((source) => ({
  id: source.id,
  kind: source.kind,
  url: source.url,
  label: source.label,
  enabled: source.enabled,
  last_checked_at: source.last_checked_at,
  last_run_at: source.last_run_at,
  last_success_at: source.last_success_at,
  last_error_at: source.last_error_at,
  last_error: source.last_error,
  consecutive_failures: source.consecutive_failures || 0,
  last_seen_count: source.last_seen_count || 0,
  last_added_count: source.last_added_count || 0,
  last_updated_count: source.last_updated_count || 0,
  last_duration_ms: source.last_duration_ms || 0,
  healthy: !source.enabled ? null : !source.last_error,
}))));
app.post('/api/sources', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.url) return c.json({ error: 'url required' }, 400);
  const r = queries.addSource(body);
  log(r.existed ? 'info' : 'ok', `source ${r.existed ? 'exists' : 'added'}: ${r.url}`);
  return c.json(r);
});
app.patch('/api/sources/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const r = queries.updateSource(Number(c.req.param('id')), body);
  if (!r) return c.json({ error: 'not found' }, 404);
  log('info', `source updated: ${r.url}`);
  return c.json(r);
});
app.delete('/api/sources/:id', (c) => c.json(queries.deleteSource(Number(c.req.param('id')))));

app.get('/api/workers/status', (c) => c.json(workerStatus()));
app.post('/api/workers/:name/run', async (c) => {
  try {
    const r = await runOne(c.req.param('name'));
    return c.json({ ok: true, result: r });
  } catch (e) {
    return c.json({ ok: false, error: e.message }, 400);
  }
});

app.use('/*', serveStatic({ root: './' }));
app.get('/', serveStatic({ path: './index.html' }));

const port = Number(process.env.PORT || 9080);
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`vibehack listening on http://127.0.0.1:${info.port}`);
  log('ok', `server started on :${info.port}`);
  if (process.env.VH_WORKERS !== 'off') startAll();
});
