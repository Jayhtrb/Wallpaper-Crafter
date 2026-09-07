import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import passport from "passport";

import { redis } from "./config/redis.js";
import { pgPool } from "./config/postgres.js";
import { connectMongo } from "./config/mongo.js";
import { initWebSocket } from "./websocket/index.js";
import { flightsRouter } from "./routes/flights.js";
import { alertsRouter } from "./routes/alerts.js";
import { authRouter } from "./routes/auth.js";
import { startScrapeCron } from "./jobs/cronScrape.js";
import { startPriceLockCron } from "./jobs/priceLockCheck.js";

const app = express();
const httpServer = createServer(app);

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(passport.initialize());

app.get("/health", async (_req, res) => {
  const checks = { redis: false, postgres: false, mongo: false };

  try {
    await redis.ping();
    checks.redis = true;
  } catch { /* reported as false */ }

  try {
    await pgPool.query("SELECT 1");
    checks.postgres = true;
  } catch { /* reported as false */ }

  try {
    await connectMongo();
    checks.mongo = true;
  } catch { /* reported as false */ }

  const healthy = Object.values(checks).every(Boolean);
  res.status(healthy ? 200 : 503).json({ status: healthy ? "ok" : "degraded", checks });
});

app.use("/api/flights", flightsRouter);
app.use("/api/alerts", alertsRouter);
app.use("/auth", authRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[server] unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

initWebSocket(httpServer);

const PORT = process.env.PORT || 4000;

async function start() {
  await connectMongo().catch((err) => {
    console.error("[server] Mongo connection failed at boot (will retry lazily):", err.message);
  });

  httpServer.listen(PORT, () => {
    console.log(`[server] flight-tracker API listening on :${PORT}`);
  });

  // Cron scheduling lives in the API process for simplicity in dev; in
  // production run it in exactly one instance (or move to the worker
  // process) to avoid double-enqueueing when horizontally scaled.
  startScrapeCron();
  startPriceLockCron();
}

start();

process.on("SIGTERM", async () => {
  console.log("[server] SIGTERM received, shutting down");
  await pgPool.end();
  await redis.quit();
  httpServer.close(() => process.exit(0));
});
