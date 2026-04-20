# Vibehack

Vibehack is a local submissions tracker for hackathons and contests.

The app is built around one main workflow:
- manage the projects you are actively submitting
- track contest details, deadlines, links, notes, and checklist progress
- keep noisy discovery and scraping tools separated under an admin panel

## Current Product Shape

Main modules:
- `Submissions`: your real working system for contest entries
- `Overview`: high-level pulse on submissions and credit leads
- `Credit hunter`: credit and promo tracking
- `Scratchpad`: notes and quick capture
- `Admin`: discovery, source rules, and agent controls

Admin is intentionally separate from the main workflow.
You search for contests there, then manually choose what to bring into the main system.

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
http://127.0.0.1:5173
```

Health check:

```text
http://127.0.0.1:5173/healthz
```

## Submission Workflow

In `Submissions`, you can:
- create and edit submissions with a real form
- store contest name, host, URL, deadlines, prize, repo URL, demo URL, team, notes, and tasks
- track stage, progress, and risk
- separate your internal build deadline from the actual contest deadline
- paste a contest URL and import basic metadata

## Admin Workflow

In `Admin`, you can:
- review discovered contests in `Discovery`
- manually add selected contests into `Submissions`
- manage source rules by host, website, and source row
- disable sources so bots ignore them
- run the small set of admin agents manually

Current public agent groups:
- `Vibe Coding Events search`
- `Hackathon events`
- `Credit hunter duties`
- `Promos search`

## API Notes

Useful local endpoints:
- `GET /healthz`
- `GET /api/hacks`
- `GET /api/entries`
- `PATCH /api/entries/:id`
- `POST /api/import-url`
- `GET /api/sources`
- `GET /api/workers/status`

## Data

The app stores data locally in SQLite.
It is designed as a local, no-auth tool with a clean separation between:
- curated submissions you care about
- admin-only discovery and ingestion machinery

## Status

This project is currently optimized for manual curation over full automation.
That is deliberate: the system should help manage real submissions first, and only use discovery as a supporting admin function.
