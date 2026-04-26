# Vibehack

Vibehack is a local submissions tracker for hackathons and contests.

The app is built around one main workflow:
- manage the projects you are actively submitting
- track contest details, deadlines, links, and checklist progress
- keep noisy discovery and scraping tools separated under an admin panel

## Current Product Shape

Main modules:
- `Contests`: high-level pulse plus hackathon and vibe coding contest tracking
- `Submissions`: your real working system for contest entries
- `Admin`: source rules, event-agent controls, and admin log
- `+ New`: quick creation menu for contests and submissions

Admin is intentionally separate from the main workflow.
You tune sources there, then use `Contests` to choose what to bring into the main system.

## Stack

- frontend: React via browser scripts
- backend: Hono on Node.js
- database: SQLite via `better-sqlite3`
- scraping/import helpers: Puppeteer + fetch-based workers

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
- paste a contest URL and import basic metadata

## Admin Workflow

In `Admin`, you can:
- manage source rules by host, website, and source row
- disable sources so bots ignore them
- run the event-scanning agents manually
- monitor the admin log and scanner diagnostics such as last check, last success, and errors

In `Contests`, you can:
- review tracked hackathons and vibe coding contests
- filter by status, source, host, website, and attendance mode
- track registration states like candidate, interested, registered, waitlisted, submitted, and not applying
- manually add selected contests into `Submissions` without creating duplicate entries for the same contest URL
- create or edit contest records directly

Contest and submission URLs are stored with canonical URL keys so imports, scanner results, and manual entries can dedupe the same contest even when tracking parameters differ.
The UI also includes accessibility and mobile improvements for keyboard use, focus states, responsive tables, and compact controls.

Current public agent groups:
- `Vibe Coding Events`
- `Hackathon Events`

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
- `GET /api/log/stream`
- `GET /api/sources`
- `POST /api/sources`
- `PATCH /api/sources/:id`
- `GET /api/workers/status`
- `POST /api/workers/:name/run`

## Data

The app stores data locally in SQLite.
It is designed as a local, no-auth tool with a clean separation between:
- curated submissions you care about
- admin-only discovery and ingestion machinery

## Status

This project is currently optimized for manual curation over full automation.
That is deliberate: the system should help manage real submissions first, and only use discovery as a supporting admin function.
