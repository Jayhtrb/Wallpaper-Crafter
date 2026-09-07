# HydraFly

A real-time, proactive price tracker for international flights departing
Hyderabad (HYD). "Hydra" for the many-headed watch it keeps — dozens of
destinations scanned across multiple sources at once — "Fly" for what it's
tracking. It doesn't just search on demand — a scheduled worker scans the
top destinations every 2 hours, stores history, and pushes live price
updates and fare-drop alerts over WebSockets.

## Status: working scaffold, not a finished product

This is the foundation from the spec, built end-to-end but intentionally
left with clear seams instead of fake completeness in the harder corners
(ML price prediction, live push notifications, full visa API, Sentry/
Prometheus wiring). Each of those is called out below with what's real vs.
stubbed and why.

**No Amadeus/Skyscanner/Kiwi API keys were available**, so per the spec's
own fallback instruction, this pivots to a **pure-scraping architecture**
by default: a Playwright scraper against Google Flights is the live price
source. The code is written provider-agnostic, though — `src/services/
amadeus.js` is a drop-in adapter that activates automatically the moment
`AMADEUS_API_KEY`/`AMADEUS_API_SECRET` are set in `.env`, and the worker
prefers it over scraping when configured (see `src/jobs/worker.js`).

## Architecture

```
hydrafly/
├── docker-compose.yml       # Redis + Postgres + MongoDB (local infra)
├── .env.example
├── backend/
│   ├── package.json
│   ├── Dockerfile           # Playwright base image (Chromium preinstalled)
│   ├── sql/001_init.sql     # Postgres schema (users, routes, price_snapshots, alerts, price_lock_watches)
│   └── src/
│       ├── server.js        # Express API + Socket.IO, boots cron schedules
│       ├── config/          # redis.js, postgres.js, mongo.js
│       ├── websocket/       # Socket.IO rooms + broadcast helpers
│       ├── queues/          # BullMQ queue definition (rate-limits scraping)
│       ├── jobs/            # worker.js (queue consumer), cronScrape.js (every 2h), priceLockCheck.js (hourly)
│       ├── scrapers/        # googleFlights.js (Playwright), userAgents.js (UA/viewport rotation)
│       ├── services/        # amadeus.js, destinations.js, currency.js, visa.js, priceHistory.js
│       ├── routes/          # flights.js, alerts.js, auth.js (Google/GitHub OAuth + JWT)
│       ├── middleware/       # auth.js (JWT verify)
│       └── models/migrate.js
└── frontend/
    ├── package.json         # Vite + React + Tailwind
    └── src/
        ├── App.jsx           # Landing date-picker -> Big Board flow
        ├── components/
        │   ├── BudgetSlider.jsx      # ₹20k–₹1L drag filter (Radix Slider)
        │   ├── DestinationCard.jsx   # price, trend, airline, Alert Me toggle
        │   └── Globe.jsx             # Three.js globe, markers colored by relative price
        ├── hooks/useWebSocket.js     # live big-board + fare-drop subscription
        └── lib/{api.js,utils.js}
```

### Data flow

1. **`cronScrape.js`** (every 2h, `SCRAPE_CRON` in `.env`) enqueues one
   BullMQ job per (destination × date) pair across the top 50 destinations
   and a ±3-day date grid — the flexible-date-grid feature and the fare-drop
   scan share this same job set.
2. **`worker.js`** consumes the queue at bounded concurrency
   (`SCRAPE_CONCURRENCY`, default 2) — this is the actual rate limiter
   against Google Flights, not the cron itself. For each job it tries the
   Amadeus adapter first (if configured), else scrapes.
3. Each result is written **twice**: the raw payload to MongoDB
   (`raw_scrapes`) for debugging/audit, and a clean row to Postgres
   (`price_snapshots`) for querying.
4. `evaluateNewPrice()` compares the new price against 30-day history (the
   Wait/Buy heuristic) and the trailing daily average (the >15%
   fare-drop threshold). Both ride over Socket.IO to every connected
   browser immediately.
5. The frontend's Big Board renders the initial state from a cached REST
   call (`GET /api/flights/big-board`, Redis-cached 5 min) and then patches
   tiles live from the socket — no polling.

### Why two databases

- **Postgres**: users, routes, `price_snapshots`, alerts, price-lock
  watches — anything queried by structure (date ranges, aggregates,
  joins). This is the system's source of truth.
- **MongoDB**: raw scraped payloads. Scraper output is inherently
  unstable (Google changes result-page markup often); storing the raw
  blob means a selector fix can be backfilled/reprocessed without having
  re-scraped, and debugging a bad parse doesn't require reproducing it live.

### What's real vs. stubbed

| Feature | Status |
|---|---|
| Multi-source aggregation | Playwright scraper live; Amadeus adapter coded and auto-activates with keys; Skyscanner/Kiwi not wired (same adapter pattern, add when you have keys) |
| Smart destination discovery (region board) | Live — `GET /api/flights/cheapest-per-region` |
| Flexible ±3 day date grid | Live — `GET /api/flights/date-grid/:destination`, scraped by the same cron |
| Multi-city / stopover optimization | Not implemented — needs a combinatorial search over the existing single-route scraper; noted as a follow-up, not faked |
| Price prediction | Heuristic (mean/stddev/trend vs. 30-day history), not ML — see comment in `src/utils/priceAnalysis.js` for the real path once there's enough historical data to train on |
| Fare drop alerts (WebSocket) | Live end-to-end (scrape → detect → broadcast → toast) |
| Push notifications (FCM/WebPush) | Alert *records* are created and the price-lock cron detects the trigger condition; actual FCM/WebPush delivery is a `TODO` in `src/jobs/worker.js` and `priceLockCheck.js` pending your Firebase/VAPID keys |
| Price Lock (7-day watch, warn before rise) | Live — `price_lock_watches` table + hourly cron in `priceLockCheck.js` |
| Visa-aware filtering | Static table for Indian passports in `src/services/visa.js`; swap for a live passport-strength API by keeping the same `getRequirement()` signature |
| Currency arbitrage (INR/USD/local) | Live — `src/services/currency.js`, falls back to a static rate table without an `EXCHANGE_RATE_API_KEY` |
| Globe visualization | Live, Three.js — markers colored green→red by relative price on the current board |
| Nearby-airport suggestion (BLR/MAA) | Stubbed (`nearbyAirports: []` in the detail endpoint) — needs those origins added to the scrape rotation |
| OAuth (Google/GitHub) + JWT | Coded, activates automatically when `GOOGLE_CLIENT_ID`/`GITHUB_CLIENT_ID` are set; JWT issuance/verification is fully live |

## Running it locally

```bash
cp .env.example .env          # then fill in whatever keys you have — none are required to boot
docker compose up -d          # Redis, Postgres (auto-runs sql/001_init.sql), MongoDB

cd backend
npm install
npx playwright install chromium   # scraper's browser binary
npm run dev                        # API + WebSocket on :4000

# separate terminal
npm run worker                     # scrape queue consumer

# separate terminal
cd ../frontend
npm install
npm run dev                        # Vite dev server on :5173, proxies /api and /auth to :4000
```

Visit `http://localhost:5173`. The board will be empty until the worker has
processed at least one cycle — either wait for the 2-hour cron or manually
trigger enqueue by lowering `SCRAPE_CRON` in `.env` during development
(e.g. `*/5 * * * *` for every 5 minutes) or writing a one-off script that
calls `enqueueScrapeJobs()` directly.

## Deployment

**Frontend → Vercel**
```bash
cd frontend
vercel --prod
```
Set `VITE_API_BASE` and `VITE_WS_BASE` in the Vercel project's environment
variables to your deployed backend URL.

**Backend → Render (simplest) or AWS EC2**

*Render:*
1. New → Web Service, point at this repo, root directory `backend`, use the provided `Dockerfile`.
2. Add a second Render service (Background Worker type) from the same repo/Dockerfile, override the start command to `node src/jobs/worker.js`.
3. Provision Render's managed Postgres and Redis add-ons (or point at your own), and a MongoDB Atlas free-tier cluster — set `DATABASE_URL`, `REDIS_URL`, `MONGO_URL` accordingly.
4. Run `npm run migrate` once (Render's shell, or a one-off job) to apply `sql/001_init.sql` if the managed Postgres didn't auto-run it.

*AWS EC2 (more control, more setup):*
1. Launch an instance (t3.medium+ recommended — Playwright's Chromium is memory-hungry), install Docker.
2. `docker compose up -d` for infra, or point at managed RDS/ElastiCache/DocumentDB instead.
3. Run `docker build -t hydrafly-backend backend/` then two containers off that image — one default (API), one with `command: node src/jobs/worker.js`.
4. Put the API behind an ALB/nginx with TLS; the frontend on Vercel talks to it over HTTPS.

## Monitoring

- **Sentry**: add `@sentry/node` to the backend and `@sentry/react` to the
  frontend, initialize with `SENTRY_DSN` from `.env` (placeholder already
  present) at the top of `server.js` / `main.jsx`. Not wired yet — this is
  a few lines once you have a DSN, intentionally left out rather than
  shipping a fake/no-op integration.
- **Scrape success rate**: `src/jobs/worker.js`'s BullMQ `completed`/`failed`
  worker events are the right hook point for a Prometheus counter
  (`prom-client`). Suggested metrics: `scrape_jobs_total{status}`,
  `scrape_duration_seconds`, `fare_drops_detected_total`. Expose via a
  `/metrics` endpoint on the worker process and scrape it from Grafana/
  Prometheus the standard way.

## Known limitations / honesty notes

- Scraping Google Flights is against their Terms of Service. This is built
  for personal/low-volume use with deliberate rate limiting (see
  `SCRAPE_CONCURRENCY`, random delays in `googleFlights.js`) — it is not
  hardened against bot detection, and Google's result-page DOM changes
  often enough that the CSS/text selectors in `googleFlights.js` will need
  periodic maintenance. Treat scraping as a bridge until you have a real
  GDS API key, not a permanent production strategy.
- The ML price-prediction feature is a documented heuristic, not a trained
  model — there's no historical dataset to train on yet. Once
  `price_snapshots` has a few months of real data, swap
  `src/utils/priceAnalysis.js`'s `analyzePrice()` for an actual regression
  without touching any caller.
- Multi-city/stopover optimization and nearby-airport suggestions are
  scoped out of this pass — noted as `TODO`s rather than shipped as
  hollow UI.
