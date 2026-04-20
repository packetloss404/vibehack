import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { logger } from 'hono/logger';
import { queries } from './db.mjs';
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

const app = new Hono();

app.use('*', logger());

app.get('/healthz', (c) => c.json({ ok: true }));

// Reads
app.get('/api/hacks',    (c) => c.json(queries.allHacks()));
app.get('/api/entries',  (c) => c.json(queries.allEntries()));
app.get('/api/credits',  (c) => c.json(queries.allCredits()));
app.get('/api/notes',    (c) => c.json(queries.allNotes()));
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

// Mutations — credits
app.post('/api/credits/:id/apply', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const r = queries.applyCredit(c.req.param('id'), body.action);
  return r ? c.json(r) : c.json({ error: 'not found' }, 404);
});
app.post('/api/credits/:id/read', (c) => c.json(queries.readCredit(c.req.param('id'))));
app.post('/api/credits/:id/archive', (c) => {
  const r = queries.archiveCredit(c.req.param('id'));
  log('info', `credit archived: ${c.req.param('id')}`);
  return c.json(r);
});

// Mutations — notes
app.post('/api/notes', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(queries.createNote(body));
});
app.patch('/api/notes/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const r = queries.updateNote(c.req.param('id'), body);
  return r ? c.json(r) : c.json({ error: 'not found' }, 404);
});
app.delete('/api/notes/:id', (c) => c.json(queries.deleteNote(c.req.param('id'))));

// Mutations — entries
app.post('/api/entries', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.title) return c.json({ error: 'title required' }, 400);
  return c.json(queries.createEntry(body));
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

  const matchedHack = queries.findHackByUrl(url);
  if (matchedHack) {
    return c.json({
      url,
      title: matchedHack.name,
      host: matchedHack.host,
      website: matchedHack.website,
      matchedHack,
      contestDeadline: matchedHack.due || matchedHack.ends || '',
      contestPrize: matchedHack.prize || '',
      hackCode: matchedHack.code || '',
    });
  }

  try {
    const response = await fetch(url, { headers: { 'User-Agent': FETCH_UA } });
    const html = await response.text();
    return c.json({
      url: response.url || url,
      title: parseHtmlTitle(html),
      host: hostnameFromUrl(response.url || url),
      website: hostnameFromUrl(response.url || url),
      matchedHack: null,
    });
  } catch (e) {
    return c.json({
      url,
      title: '',
      host: hostnameFromUrl(url),
      website: hostnameFromUrl(url),
      matchedHack: null,
      warning: e.message,
    });
  }
});

// Discovery sources
app.get('/api/sources', (c) => c.json(queries.allSources()));
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

app.post('/api/log', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(queries.appendLog(body));
});

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

const port = Number(process.env.PORT || 5173);
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`vibehack listening on http://127.0.0.1:${info.port}`);
  log('ok', `server started on :${info.port}`);
  if (process.env.VH_WORKERS !== 'off') startAll();
});
