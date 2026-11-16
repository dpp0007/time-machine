# Time Machine — version history for the web

**Live demo:** https://time-machine-oz05.onrender.com  ·  **Repo:** https://github.com/dpp0007/time-machine

Time Machine watches pages that change quietly (SaaS pricing, privacy policies / ToS, visa rules, insurance coverage,
menu prices) and keeps a **screenshot + text for every real change**. It answers two questions:

- *"What did this page say on date X?"*
- *"What changed between two dates?"* (added / removed / changed lines, plus price and number changes)

---

## 1. What I built

A Next.js app, hosted on Render with Postgres storage, that turns any URL into a versioned timeline.

- **Track any URL** (or one click to seed 30 real pages) – one TinyFish Page Monitor is created per URL.
- **Real changes only.** Dates, times, ©years, "x ago", UUIDs, tracking tokens and link query strings are masked before
  comparing. A page that only bumped its "Last updated" stamp does **not** create a version. A new state must be seen
  on 2 consecutive checks before it is recorded, which suppresses A/B-variant flip-flops.
- **Time travel:** `as-of` lookup by date, and a two-version diff with inline word-level highlights and extracted value changes
  (e.g. `$29 → $35`).
- **Evidence:** a full-page screenshot is stored for the baseline and every detected change.
- **Feeds & export:** change feed tab, `GET /api/changes`, RSS (`/api/feed.xml`), JSON/text export, OpenAPI spec (`/api/openapi`).
- **Ops:** per-page check history, admin token for destructive endpoints, hourly schedule, compaction/prune tools.

## 2. Where TinyFish is used

TinyFish is the only thing that fetches page content or takes screenshots. Remove it and nothing is captured.
All calls live in [`lib/tf.ts`](lib/tf.ts).

| Piece | TinyFish product | Role |
|---|---|---|
| Watching | **Monitor** (`POST /v1/monitors`, type `fetch`) | One Page Monitor per tracked URL on a cron (`SCHEDULE_CRON`, default hourly). Runs **Fetch** (`ttl:0`, markdown, `exclude_selectors` for cookie banners/ads). |
| Ingest | Monitor **webhook** | With `PUBLIC_URL` set, every scheduled run is POSTed to `/api/webhook/monitor` (this is the hosted setup). |
| Ingest (fallback) | Monitor **run now** (`POST /v1/monitors/:id/runs`) | An in-process poller (`POLL_MINUTES`, [`instrumentation.ts`](instrumentation.ts)) triggers run-now for every Monitor when the app is not publicly reachable. Same ingest code path. |
| Screenshots | **Browser API** (remote Chromium over CDP) | Full-page JPEG on the baseline and on every detected change. |

## 3. How to test it

### Quick check on the live demo
1. Open https://time-machine-oz05.onrender.com (free tier may take ~30–60 s to wake up).
2. Pick a page from the list → **timeline** of captured versions with screenshots.
3. Open two versions → **diff** view (added / removed / changed, price changes).
4. **Check now** on a page → triggers a TinyFish Monitor run; the check history shows `baseline`, `unchanged`,
   `noise-ignored` or `changed`.
5. Add your own URL with **Add page** (creates a Monitor and a baseline within seconds).
6. API examples (replace `ID` with a page id from `/api/pages`):

```bash
curl https://time-machine-oz05.onrender.com/api/health
curl https://time-machine-oz05.onrender.com/api/pages
curl "https://time-machine-oz05.onrender.com/api/pages/ID/asof?date=2026-11-01"
curl "https://time-machine-oz05.onrender.com/api/pages/ID/diff?from=1&to=2"
curl https://time-machine-oz05.onrender.com/api/changes
```

### Run locally
```bash
cp .env.example .env        # set TINYFISH_API_KEY (https://agent.tinyfish.ai/api-keys)
npm install
npm test                    # diff / noise-masking engine tests
npm run build && npm start  # http://localhost:3000
```
Then click **Seed 30 real pages** (or paste any URL) and leave it running. Without `DATABASE_URL` it stores to local `data/`.

### Deploy (Render)
`render.yaml` defines the web service. Set `TINYFISH_API_KEY`, `DATABASE_URL` (Postgres) and `PUBLIC_URL`
(your Render URL, so Monitor webhooks arrive); `WEBHOOK_SECRET` and `ADMIN_TOKEN` are generated.

## Configuration

| Env | Purpose |
|---|---|
| `TINYFISH_API_KEY` | Required. |
| `PUBLIC_URL` | Public https URL of the app; enables Monitor webhooks. |
| `WEBHOOK_SECRET` | Shared secret for the webhook. |
| `SCHEDULE_CRON` | Cron per Monitor (UTC), default `0 * * * *`. |
| `POLL_MINUTES` | Fallback run-now poller, default 60; `0` disables. |
| `ADMIN_TOKEN` | Protects delete / run-all / reschedule / prune / compact. |
| `DATABASE_URL` | Postgres storage; local disk if unset. |

## API

`GET /api/pages` · `POST /api/pages {url,name,category}` · `GET /api/pages/:id` (timeline) ·
`GET /api/pages/:id/asof?date=YYYY-MM-DD` · `GET /api/pages/:id/diff?from=&to=` (dates or version numbers) ·
`GET /api/pages/:id/versions/:n` · `POST /api/pages/:id/check` · `GET /api/changes` · `GET /api/export?text=1` ·
`GET /api/feed.xml` · `POST /api/webhook/monitor`

Diff shape: `{stats, added[], removed[], changed[{before,after,segments[]}], values[{from,to}]}`.
