# Time Machine — version history for the web

Watches pages that change quietly (SaaS pricing, privacy policies / ToS, visa rules, insurance coverage, menu prices),
stores a **screenshot + text for every real change**, and answers *"what did this page say on date X"* and *"what changed between two dates"*.

## Run

```bash
cp .env.example .env     # set TINYFISH_API_KEY (https://agent.tinyfish.ai/api-keys)
npm install
npm run build && npm start   # http://localhost:3000   (keep it running for the 3-day live window)
```

Open the app → **Seed 30 real pages** (or paste any URL) → leave it running. `npm test` checks the diff engine.

## How TinyFish is used

| Piece | TinyFish product | Role |
|---|---|---|
| Watching | **Monitor** (`POST /v1/monitors`, type `fetch`) | One Page Monitor per tracked URL, on a cron (`SCHEDULE_CRON`, default every 3h). Monitor runs **Fetch** (`ttl:0`, markdown, `exclude_selectors` for cookie banners/ads) and is the only thing that fetches page content. Remove it and nothing is captured. |
| Ingest | Monitor **webhook** | Set `PUBLIC_URL` and each Monitor posts every scheduled run to `/api/webhook/monitor`. |
| Ingest (local) | Monitor **run now** (`POST /v1/monitors/:id/runs`) | If the app isn't publicly reachable, an in-process poller (`POLL_MINUTES`) triggers run-now for every Monitor and ingests the result. Same code path. |
| Screenshots | **Browser API** (remote Chromium over CDP) | On every detected change (and the baseline) a full-page JPEG is taken and stored. |

Noise handling: dates, times, ©years, "x ago", UUIDs/tracking tokens and link query strings are masked before comparing, so a
page that only changed its "Last updated" date does **not** create a version.

## API

`GET /api/pages` · `POST /api/pages {url,name,category}` · `GET /api/pages/:id` (timeline) ·
`GET /api/pages/:id/asof?date=YYYY-MM-DD` · `GET /api/pages/:id/diff?from=&to=` (dates or version numbers) ·
`GET /api/pages/:id/versions/:n` · `POST /api/pages/:id/check` · `GET /api/changes` · `GET /api/export?text=1` ·
`POST /api/webhook/monitor`

Diff shape: `{stats, added[], removed[], changed[{before,after,segments[]}], values[{from,to}]}` (`values` = price/number changes).

Storage is local disk (`data/`). Logs of caught changes: `GET /api/changes` or the **Change feed** tab.
