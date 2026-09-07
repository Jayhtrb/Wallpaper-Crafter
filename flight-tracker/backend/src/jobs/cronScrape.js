import cron from "node-cron";
import { topDestinations } from "../services/destinations.js";
import { enqueueScrapeJobs } from "../queues/scrapeQueue.js";

// "cron job (every 2 hours) that scrapes the top 50 destinations" — this
// enqueues the work; src/jobs/worker.js is what actually performs each
// scrape, at a bounded concurrency so we don't hammer the source all at
// once. Schedule is overridable via SCRAPE_CRON in .env.
const SCHEDULE = process.env.SCRAPE_CRON || "0 */2 * * *";

function nextDepartureDates() {
  // Flexible-date grid: seed +/-3 days around "2 weeks out" as a reasonable
  // default scan window; the on-demand search endpoint handles user-picked
  // dates separately (see src/routes/flights.js).
  const base = new Date();
  base.setDate(base.getDate() + 14);

  const dates = [];
  for (let offset = -3; offset <= 3; offset++) {
    const d = new Date(base);
    d.setDate(d.getDate() + offset);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export function startScrapeCron() {
  if (!cron.validate(SCHEDULE)) {
    console.error(`[cron] invalid SCRAPE_CRON expression: "${SCHEDULE}" — cron not started`);
    return;
  }

  cron.schedule(SCHEDULE, async () => {
    const destinations = topDestinations(50);
    const dates = nextDepartureDates();

    const routes = destinations.flatMap((dest) =>
      dates.map((departDate) => ({
        destination: dest.code,
        region: dest.region,
        departDate,
      }))
    );

    const count = await enqueueScrapeJobs(routes);
    console.log(`[cron] enqueued ${count} scrape jobs across ${destinations.length} destinations`);
  });

  console.log(`[cron] scrape schedule active: "${SCHEDULE}"`);
}
