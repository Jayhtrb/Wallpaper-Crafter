import { Router } from "express";
import { z } from "zod";
import { DESTINATIONS, destinationsByRegion, findDestination } from "../services/destinations.js";
import { cacheGet, cacheSet } from "../config/redis.js";
import { getOrCreateRoute, last30DayPrices, evaluateNewPrice } from "../services/priceHistory.js";
import { convertPrice } from "../services/currency.js";
import { filterVisaFriendly } from "../services/visa.js";
import { query } from "../config/postgres.js";
import { optionalAuth } from "../middleware/auth.js";

export const flightsRouter = Router();

const bigBoardSchema = z.object({
  departDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  maxBudgetInr: z.coerce.number().positive().optional(),
  region: z.string().optional(),
  passportCountry: z.string().length(2).optional(), // e.g. "IN"
});

/**
 * The "Big Board": cheapest known price per destination for a given
 * departure date, optionally filtered by budget slider / region / visa
 * status. Backed by the most recent price_snapshots row per route — the
 * cron+worker pipeline is what keeps these fresh, this endpoint just reads.
 */
flightsRouter.get("/big-board", optionalAuth, async (req, res) => {
  const parsed = bigBoardSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { departDate, maxBudgetInr, region, passportCountry } = parsed.data;

  const cacheKey = `bigboard:${departDate}:${region ?? "all"}`;
  let tiles = await cacheGet(cacheKey);

  if (!tiles) {
    const result = await query(
      `SELECT DISTINCT ON (r.destination)
         r.destination, r.region, s.airline, s.price_inr, s.stops, s.scraped_at
       FROM price_snapshots s
       JOIN routes r ON r.id = s.route_id
       WHERE s.depart_date = $1 ${region ? "AND r.region = $2" : ""}
       ORDER BY r.destination, s.scraped_at DESC`,
      region ? [departDate, region] : [departDate]
    );

    tiles = await Promise.all(
      result.rows.map(async (row) => {
        const dest = findDestination(row.destination);
        const price = await convertPrice(Number(row.price_inr), row.destination);
        return {
          destination: row.destination,
          city: dest?.city,
          country: dest?.country,
          region: row.region,
          airline: row.airline,
          stops: row.stops,
          price,
          lastUpdated: row.scraped_at,
        };
      })
    );

    await cacheSet(cacheKey, tiles, 300); // short TTL — this is live-ish data
  }

  let filtered = tiles;
  if (maxBudgetInr) filtered = filtered.filter((t) => t.price.inr <= maxBudgetInr);
  if (passportCountry) {
    filtered = filterVisaFriendly(
      filtered.map((t) => ({ ...t, country: t.country })),
      passportCountry
    );
  }

  res.json({ departDate, count: filtered.length, tiles: filtered });
});

/** Cheapest destination per region for a given date — "Smart Destination Discovery". */
flightsRouter.get("/cheapest-per-region", async (req, res) => {
  const departDate = req.query.departDate;
  if (!departDate) return res.status(400).json({ error: "departDate is required" });

  const byRegion = destinationsByRegion();
  const results = {};

  for (const [region, destinations] of Object.entries(byRegion)) {
    const codes = destinations.map((d) => d.code);
    const result = await query(
      `SELECT r.destination, MIN(s.price_inr) AS price_inr
       FROM price_snapshots s
       JOIN routes r ON r.id = s.route_id
       WHERE s.depart_date = $1 AND r.destination = ANY($2)
       GROUP BY r.destination
       ORDER BY price_inr ASC
       LIMIT 1`,
      [departDate, codes]
    );
    results[region] = result.rows[0]
      ? { destination: result.rows[0].destination, priceInr: Number(result.rows[0].price_inr) }
      : null;
  }

  res.json({ departDate, cheapestByRegion: results });
});

/** +/- 3 day flexible date grid for a single destination. */
flightsRouter.get("/date-grid/:destination", async (req, res) => {
  const { destination } = req.params;
  const centerDate = req.query.departDate;
  if (!centerDate) return res.status(400).json({ error: "departDate is required" });

  const dest = findDestination(destination);
  if (!dest) return res.status(404).json({ error: "Unknown destination" });

  const routeId = await getOrCreateRoute(destination, "HYD", dest.region);
  const result = await query(
    `SELECT depart_date, MIN(price_inr) AS price_inr
     FROM price_snapshots
     WHERE route_id = $1 AND depart_date BETWEEN $2::date - 3 AND $2::date + 3
     GROUP BY depart_date
     ORDER BY depart_date ASC`,
    [routeId, centerDate]
  );

  res.json({
    destination,
    grid: result.rows.map((r) => ({ date: r.depart_date, priceInr: Number(r.price_inr) })),
  });
});

/** Detail view: 30-day price history + Wait/Buy verdict for one destination. */
flightsRouter.get("/detail/:destination", async (req, res) => {
  const { destination } = req.params;
  const dest = findDestination(destination);
  if (!dest) return res.status(404).json({ error: "Unknown destination" });

  const routeId = await getOrCreateRoute(destination, "HYD", dest.region);
  const history = await last30DayPrices(routeId);
  const currentPrice = history[history.length - 1] ?? null;
  const analysis = currentPrice ? await evaluateNewPrice(routeId, currentPrice) : null;

  const byAirline = await query(
    `SELECT airline, MIN(price_inr) AS price_inr
     FROM price_snapshots
     WHERE route_id = $1 AND scraped_at >= now() - interval '7 days'
     GROUP BY airline
     ORDER BY price_inr ASC`,
    [routeId]
  );

  res.json({
    destination: dest,
    history30d: history,
    analysis,
    byAirline: byAirline.rows.map((r) => ({ airline: r.airline, priceInr: Number(r.price_inr) })),
    // Nearby-airport comparison (BLR/MAA) is a follow-up: needs those
    // origins in the scrape rotation too. Left as an explicit TODO rather
    // than a fake response.
    nearbyAirports: [],
  });
});

flightsRouter.get("/destinations", (_req, res) => {
  res.json({ destinations: DESTINATIONS, byRegion: destinationsByRegion() });
});
