# Vibehack

Vibehack is a local-first hackathon and contest intelligence tool: a self-scheduling, three-source event-ingestion engine fronted by a curation UI for the submissions you actually care about.

Under the hood, three autonomous worker agents poll Lu.ma, Devpost, and JS-gated SPA sites, run scraped events through a weighted classifier and canonical-URL dedupe, normalize messy deadlines, and track per-source health — then surface candidates in `Contests` where you promote the good ones into tracked `Submissions`.

The app is built around one main workflow:
- discover contests automatically via the scanning agents (or import a URL by hand)
- promote curated contests into the projects you are actively submitting
- track contest details, deadlines, links, and checklist progress
- keep the discovery/scraping machinery separated under an admin panel

## Discovery Engine

The discovery side is the most substantial part of the project. Three workers self-schedule and run on server boot:

- **Lu.ma scanner** (`server/workers/luma.mjs`): uses Lu.ma's undocumented public endpoints — `api.lu.ma/url?url=` for slug→api_id resolution and `calendar/get-items?...&period=future` for listings. Every event passes through `classifyLumaEvent()`, a hand-tuned weighted classifier (~40 regex patterns across strong-hackathon / vibe-coding / build-signal / tooling-signal tiers, minus hard- and soft-exclude patterns for meetups, happy hours, and panels) plus attendance-mode-based filtering. Runs every 30 min.
- **Devpost scanner** (`server/workers/devpost.mjs`): queries Devpost's `/api/hackathons` endpoint across a cartesian matrix of challenge_type / theme / status / page plus per-search-term queries, with polite request throttling, an HTML fallback parser (`scrapeHtml()`) when JSON is unavailable, `parseSubmissionPeriod()` date parsing, and year filtering. Runs every 60 min.
- **Headless browser scanner** (`server/workers/headless.mjs`): a Puppeteer/Chromium subsystem that defeats JS-gated SPA sites. Launches headless Chromium (with browser reuse), scrapes Cerebral Valley (`scrapeCerebralValley()`, innerText line-walk + month regex) and lablab.ai (`scrapeLablab()`, waits for hydrated `HACKATHON` cards, parses window/prize/attendance). Runs every 2 h.

Supporting machinery shared across the pipeline:
- **Canonical-URL dedupe** (`canonicalUrlKey` / `canonicalUrl`): strips `utm_*`/`fbclid`/`gclid`/`ref` params, sorts the query, lowercases the host, and normalizes the trailing slash so the same contest seen via different sources or tracking params collapses into one record.
- **Deadline normalization** (`normalizeDeadlineAt()`): parses messy human date strings — ranges like "Apr 24 - 28", ordinals, and timezone tokens (PDT/PST/EST → GMT offsets) — into ISO `*_at` fields for sorting and diagnostics.
- **Per-source health telemetry**: last_checked / last_run / last_success / last_error timestamps, consecutive-failure counters, seen/added/updated counts, and run durations, surfaced via `/api/sources/health` with a `healthy` rollup. Every worker wraps its network and parse paths in try/catch, records failure telemetry, and never crashes the server.

## Current Product Shape

Main modules:
- `Contests`: high-level pulse plus hackathon and vibe coding contest tracking
- `Submissions`: your real working system for contest entries
- `Admin`: source rules, event-agent controls, and admin log
- `+ New`: quick creation menu for contests and submissions

Admin is intentionally separate from the main workflow.
You tune sources there, then use `Contests` to choose what to bring into the main system.

## Stack

- frontend: React via browser scripts (import map, no build step)
- backend: Hono on Node.js, with an SSE log stream over an `EventEmitter` bus
- database: SQLite via `better-sqlite3` (WAL), with self-healing runtime migrations (`ensureColumn`) and idempotent startup backfills/normalizations
- discovery: Puppeteer (bundled Chromium) + fetch-based workers

## Run Locally

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

Development mode with watch:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:9080
```

Health check:

```text
http://127.0.0.1:9080/healthz
```

## Submission Workflow

In `Submissions`, you can:
- create and edit submissions with a real form
- store contest name, host, URL, deadlines, prize, repo URL, demo URL, team, notes, and tasks
- link submissions back to contest records by contest ID or canonical contest URL
- track stage, progress, and risk
- separate your internal build deadline from the actual contest deadline, with normalized `*_at` deadline fields for sorting and diagnostics
- paste a contest URL and import basic metadata (the `/api/import-url` endpoint fetches the page and parses `og:title`/`<title>`)

## Admin Workflow

In `Admin`, you can:
- manage source rules by host, website, and source row
- disable sources so bots ignore them
- run the event-scanning agents manually (in addition to their automatic schedules)
- monitor the admin log and scanner diagnostics such as last check, last success, and errors

In `Contests`, you can:
- review tracked hackathons and vibe coding contests
- filter by status, source, host, website, and attendance mode
- track registration states like candidate, interested, registered, waitlisted, submitted, and not applying
- manually add selected contests into `Submissions` without creating duplicate entries for the same contest URL (the duplicate guard returns a 409 with metadata)
- create or edit contest records directly

Contest and submission URLs are stored with canonical URL keys so imports, scanner results, and manual entries can dedupe the same contest even when tracking parameters differ.
The UI also includes a live agent-log stream (SSE), live calendar generation from contest deadlines, and accessibility/mobile improvements for keyboard use, focus states, responsive tables, and compact controls.

Public agent groups:
- `Vibe Coding Events` (Lu.ma + headless scanners)
- `Hackathon Events` (Devpost scanner)

Each group runs a small idle/busy/running/error state machine with an aggregated `status()`.

## API Notes

Useful local endpoints:
- `GET /healthz`
- `GET /api/hacks`
- `POST /api/hacks`
- `PATCH /api/hacks/:id`
- `PATCH /api/hacks/visibility`
- `GET /api/entries`
- `POST /api/entries`
- `PATCH /api/entries/:id`
- `PATCH /api/entries/:id/tasks/:idx`
- `POST /api/import-url`
- `GET /api/calendar`
- `GET /api/log`
- `GET /api/log/stream` (SSE)
- `GET /api/sources`
- `POST /api/sources`
- `PATCH /api/sources/:id`
- `GET /api/sources/health`
- `GET /api/workers/status`
- `POST /api/workers/:name/run`

## Data

The app stores data locally in SQLite (`hacks`, `entries`, `agent_log`, `sources`).
It is designed as a local, no-auth tool with a clean separation between:
- curated submissions you care about
- admin-only discovery and ingestion machinery

The schema migrates itself in place: `ensureColumn` adds missing columns at runtime, and startup backfill transactions (`normalizeHacks`, `backfillEntryLinks`, `backfillSourceKeys`) upgrade and normalize older databases. On first run, the database seeds from `server/seed/seed.json`.

## Status

Working MVP. The full ingestion pipeline — three self-scheduling scrapers, classifier, canonical dedupe, deadline normalization, and source health monitoring — is implemented and runs end to end against live third-party APIs and pages.

Known limits: no automated tests; no auth (deliberately local); and the scrapers are inherently brittle against third-party markup changes (mitigated by per-worker try/catch and health tracking rather than eliminated).
