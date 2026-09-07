import { query } from "../config/postgres.js";
import { analyzePrice, isFareDrop } from "../utils/priceAnalysis.js";

export async function getOrCreateRoute(destinationCode, origin = "HYD", region = null) {
  const existing = await query(
    "SELECT id FROM routes WHERE origin = $1 AND destination = $2",
    [origin, destinationCode]
  );
  if (existing.rows.length) return existing.rows[0].id;

  const inserted = await query(
    "INSERT INTO routes (origin, destination, region) VALUES ($1, $2, $3) RETURNING id",
    [origin, destinationCode, region]
  );
  return inserted.rows[0].id;
}

export async function recordSnapshot({ routeId, departDate, returnDate = null, airline, priceInr, source, stops = 0 }) {
  await query(
    `INSERT INTO price_snapshots (route_id, depart_date, return_date, airline, price_inr, source, stops)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [routeId, departDate, returnDate, airline, priceInr, source, stops]
  );
}

/** Last 30 days of daily-minimum prices for a route, oldest first. */
export async function last30DayPrices(routeId) {
  const result = await query(
    `SELECT DATE(scraped_at) AS day, MIN(price_inr) AS price
     FROM price_snapshots
     WHERE route_id = $1 AND scraped_at >= now() - interval '30 days'
     GROUP BY day
     ORDER BY day ASC`,
    [routeId]
  );
  return result.rows.map((r) => Number(r.price));
}

export async function trailingAveragePrice(routeId, days = 1) {
  const result = await query(
    `SELECT AVG(price_inr) AS avg_price
     FROM price_snapshots
     WHERE route_id = $1 AND scraped_at >= now() - ($2 || ' days')::interval AND scraped_at < now()`,
    [routeId, String(days)]
  );
  return result.rows[0]?.avg_price ? Number(result.rows[0].avg_price) : null;
}

/**
 * Called after a new snapshot lands. Returns the wait/buy heuristic and
 * whether this counts as a fare-drop worth alerting on.
 */
export async function evaluateNewPrice(routeId, currentPrice) {
  const [history, previousAverage] = await Promise.all([
    last30DayPrices(routeId),
    trailingAveragePrice(routeId, 1),
  ]);

  const analysis = analyzePrice(history, currentPrice);
  const fareDrop = isFareDrop(previousAverage, currentPrice);

  return { ...analysis, fareDrop, previousAverage };
}
