import { Queue } from "bullmq";
import { bullConnection } from "../config/redis.js";

export const SCRAPE_QUEUE_NAME = "price-scrape";

export const scrapeQueue = new Queue(SCRAPE_QUEUE_NAME, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

/**
 * Enqueue one job per destination rather than one giant job — this is what
 * lets BullMQ's worker `concurrency` setting act as the actual rate limiter
 * against Google Flights, instead of the cron job blasting 50 requests at
 * once.
 */
export async function enqueueScrapeJobs(routes) {
  const jobs = routes.map((route) => ({
    name: "scrape-route",
    data: route,
    opts: { jobId: `${route.destination}:${route.departDate}` }, // de-dupes same-day re-enqueues
  }));
  await scrapeQueue.addBulk(jobs);
  return jobs.length;
}
