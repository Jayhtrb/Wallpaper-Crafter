import { Router } from "express";
import { z } from "zod";
import { query } from "../config/postgres.js";
import { requireAuth } from "../middleware/auth.js";
import { getOrCreateRoute } from "../services/priceHistory.js";

export const alertsRouter = Router();

const createAlertSchema = z.object({
  destination: z.string().length(3),
  departDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  targetPriceInr: z.coerce.number().positive().optional(),
  kind: z.enum(["drop", "price_lock"]).default("drop"),
});

alertsRouter.use(requireAuth);

alertsRouter.get("/", async (req, res) => {
  const result = await query(
    `SELECT a.*, r.destination, r.region
     FROM alerts a JOIN routes r ON r.id = a.route_id
     WHERE a.user_id = $1 AND a.active = true
     ORDER BY a.created_at DESC`,
    [req.user.id]
  );
  res.json({ alerts: result.rows });
});

alertsRouter.post("/", async (req, res) => {
  const parsed = createAlertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { destination, departDate, targetPriceInr, kind } = parsed.data;
  const routeId = await getOrCreateRoute(destination);

  const inserted = await query(
    `INSERT INTO alerts (user_id, route_id, depart_date, target_price_inr, kind)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.user.id, routeId, departDate ?? null, targetPriceInr ?? null, kind]
  );

  const alert = inserted.rows[0];

  // Price Lock: monitor for 7 days, needs a baseline price captured now.
  if (kind === "price_lock") {
    const latest = await query(
      `SELECT price_inr FROM price_snapshots WHERE route_id = $1 ORDER BY scraped_at DESC LIMIT 1`,
      [routeId]
    );
    const baseline = latest.rows[0]?.price_inr;
    if (baseline) {
      await query(
        `INSERT INTO price_lock_watches (alert_id, expires_at, baseline_price_inr)
         VALUES ($1, now() + interval '7 days', $2)`,
        [alert.id, baseline]
      );
    }
  }

  res.status(201).json({ alert });
});

alertsRouter.delete("/:id", async (req, res) => {
  await query(`UPDATE alerts SET active = false WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
  res.status(204).end();
});
