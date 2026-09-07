import cron from "node-cron";
import { query } from "../config/postgres.js";
import { analyzePrice } from "../utils/priceAnalysis.js";
import { last30DayPrices, trailingAveragePrice } from "../services/priceHistory.js";
import { notifyUser } from "../websocket/index.js";

// Runs hourly; checks every active Price Lock watch and pushes a warning
// once the heuristic flips to "prices likely rising soon", aiming to land
// the alert roughly an hour before the predicted increase per the spec.
export function startPriceLockCron() {
  cron.schedule("0 * * * *", async () => {
    const active = await query(
      `SELECT w.*, a.user_id, a.route_id
       FROM price_lock_watches w
       JOIN alerts a ON a.id = w.alert_id
       WHERE w.expires_at > now() AND w.notified_at IS NULL AND a.active = true`
    );

    for (const watch of active.rows) {
      const [history, current] = await Promise.all([
        last30DayPrices(watch.route_id),
        trailingAveragePrice(watch.route_id, 0.25), // last 6h average as "current"
      ]);
      if (!current) continue;

      const analysis = analyzePrice(history, current);
      const risingFast = analysis.verdict === "BUY_NOW" && analysis.deltaPct > 5;

      if (risingFast) {
        notifyUser(watch.user_id, "price_lock:warning", {
          alertId: watch.alert_id,
          baselinePriceInr: Number(watch.baseline_price_inr),
          currentPriceInr: current,
          message: "Price on your locked route looks likely to rise soon — consider booking now.",
        });
        await query(`UPDATE price_lock_watches SET notified_at = now() WHERE id = $1`, [watch.id]);
      }
    }
  });

  console.log("[cron] price-lock watch schedule active: hourly");
}
