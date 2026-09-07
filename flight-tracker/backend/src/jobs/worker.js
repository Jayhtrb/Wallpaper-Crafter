// Standalone worker process — run with `npm run worker`, separate from the
// API process (`npm run dev` / `npm start`), so a slow/crashing scrape never
// takes the HTTP+WebSocket server down with it.

import "dotenv/config";
import { Worker } from "bullmq";
import { bullConnection } from "../config/redis.js";
import { SCRAPE_QUEUE_NAME } from "../queues/scrapeQueue.js";
import { scrapeGoogleFlights } from "../scrapers/googleFlights.js";
import * as amadeus from "../services/amadeus.js";
import { rawScrapesCollection } from "../config/mongo.js";
import { getOrCreateRoute, recordSnapshot, evaluateNewPrice } from "../services/priceHistory.js";
import { initWebSocket, broadcastPriceUpdate, broadcastFareDrop } from "../websocket/index.js";
import { createServer } from "node:http";
import { convertPrice } from "../services/currency.js";

// The worker needs to *emit* WebSocket events too (a price drop found during
// a scrape should reach browsers immediately) but doesn't need to accept
// inbound socket connections from clients — those connect to the API
// process. A bare, unlisted HTTP server here just gives socket.io an emitter
// to attach to for server-to-server style broadcast via a shared Redis
// adapter in a multi-instance deployment; for local/dev, running the worker
// in-process with the API (see src/server.js comment) is simpler.
const emitterServer = createServer();
initWebSocket(emitterServer);

const concurrency = Number(process.env.SCRAPE_CONCURRENCY ?? 2);

const worker = new Worker(
  SCRAPE_QUEUE_NAME,
  async (job) => {
    const { destination, departDate, returnDate, region } = job.data;

    let priceResult;
    if (amadeus.isConfigured()) {
      try {
        const offers = await amadeus.searchFlightOffers({ origin: "HYD", destination, departDate, returnDate });
        offers.sort((a, b) => a.priceInr - b.priceInr);
        if (offers[0]) priceResult = { destination, ...offers[0] };
      } catch (err) {
        console.warn(`[worker] amadeus failed for ${destination}, falling back to scrape:`, err.message);
      }
    }

    if (!priceResult) {
      priceResult = await scrapeGoogleFlights({ destination, departDate, returnDate });
    }

    if (!priceResult) {
      throw new Error(`No price found for ${destination} on ${departDate}`);
    }

    // Raw payload -> Mongo (unstructured store)
    const rawCollection = await rawScrapesCollection();
    await rawCollection.insertOne({
      destination,
      departDate,
      returnDate: returnDate ?? null,
      result: priceResult,
      scrapedAt: new Date(),
    });

    // Clean row -> Postgres (queryable history)
    const routeId = await getOrCreateRoute(destination, "HYD", region);
    await recordSnapshot({
      routeId,
      departDate,
      returnDate,
      airline: priceResult.airline,
      priceInr: priceResult.priceInr,
      source: priceResult.source,
      stops: priceResult.stops,
    });

    const analysis = await evaluateNewPrice(routeId, priceResult.priceInr);
    const converted = await convertPrice(priceResult.priceInr, destination);

    const tile = {
      destination,
      departDate,
      airline: priceResult.airline,
      stops: priceResult.stops,
      price: converted,
      analysis,
    };

    broadcastPriceUpdate(tile);

    if (analysis.fareDrop) {
      console.log(`[worker] fare drop detected: ${destination} -> ₹${priceResult.priceInr}`);
      broadcastFareDrop(tile);
      // TODO: also fan out to Firebase Cloud Messaging / WebPush for users
      // with an active alert on this route (see src/routes/alerts.js and
      // src/services — push delivery is stubbed pending FCM/WebPush keys).
    }

    return tile;
  },
  { connection: bullConnection, concurrency }
);

worker.on("completed", (job) => console.log(`[worker] done: ${job.id}`));
worker.on("failed", (job, err) => console.error(`[worker] failed: ${job?.id} — ${err.message}`));

console.log(`[worker] listening on "${SCRAPE_QUEUE_NAME}" with concurrency=${concurrency}`);
