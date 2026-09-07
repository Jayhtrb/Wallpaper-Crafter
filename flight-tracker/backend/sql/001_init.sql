-- Core schema for flight-tracker (Postgres)
-- Loaded automatically by the postgres container on first boot
-- (docker-entrypoint-initdb.d), or run manually via `npm run migrate`.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT UNIQUE NOT NULL,
  display_name   TEXT,
  auth_provider  TEXT NOT NULL DEFAULT 'local', -- 'google' | 'github' | 'local'
  provider_id    TEXT,
  passport_country TEXT,      -- ISO 3166-1 alpha-2, drives visa-aware filtering
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS routes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin       TEXT NOT NULL DEFAULT 'HYD',
  destination  TEXT NOT NULL,          -- IATA code
  region       TEXT,                   -- 'Europe' | 'SEA' | 'Middle East' | 'Americas' | ...
  UNIQUE (origin, destination)
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id            BIGSERIAL PRIMARY KEY,
  route_id      UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  depart_date   DATE NOT NULL,
  return_date   DATE,                  -- NULL for one-way
  airline       TEXT,
  price_inr     NUMERIC(12, 2) NOT NULL,
  source        TEXT NOT NULL,         -- 'google_flights_scrape' | 'amadeus' | 'skyscanner' | ...
  stops         SMALLINT DEFAULT 0,
  scraped_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_route_date
  ON price_snapshots (route_id, depart_date, scraped_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route_id      UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  depart_date   DATE,
  target_price_inr NUMERIC(12, 2),
  kind          TEXT NOT NULL DEFAULT 'drop', -- 'drop' | 'price_lock'
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_lock_watches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id      UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  starts_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL, -- starts_at + 7 days
  baseline_price_inr NUMERIC(12, 2) NOT NULL,
  notified_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_route ON alerts (route_id, active);
