// Playwright-based Google Flights scraper — the fallback price source when
// no paid GDS API key is configured (see src/services/amadeus.js).
//
// IMPORTANT: scraping Google Flights is against Google's Terms of Service.
// This is provided for personal/educational use at low volume (the queue is
// deliberately concurrency-limited — see src/queues/scrapeQueue.js). For any
// production deployment, prefer a licensed API (Amadeus, Skyscanner, Kiwi/
// Travelport) and treat this module purely as a stopgap / cross-check.
// Respect robots.txt, don't parallelize aggressively, and be ready for
// selectors to break — Google changes the results-page DOM often, so the
// selectors below use resilient text/role-based queries rather than brittle
// class names, but they WILL eventually need updating.

import { chromium } from "playwright";
import { randomUserAgent, randomViewport } from "./userAgents.js";

const MIN_DELAY_MS = Number(process.env.SCRAPE_MIN_DELAY_MS ?? 1500);
const MAX_DELAY_MS = Number(process.env.SCRAPE_MAX_DELAY_MS ?? 5000);

function randomDelay(min = MIN_DELAY_MS, max = MAX_DELAY_MS) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildGoogleFlightsUrl({ origin, destination, departDate, returnDate }) {
  // Google Flights supports a deep-link search query string; falls back to
  // the search UI if the shorthand ever stops resolving.
  const tripType = returnDate ? "r" : "o";
  const params = new URLSearchParams({
    hl: "en",
    curr: "INR",
  });
  const query = returnDate
    ? `Flights from ${origin} to ${destination} on ${departDate} through ${returnDate}`
    : `Flights from ${origin} to ${destination} on ${departDate}`;
  return `https://www.google.com/travel/flights/search?${params}&q=${encodeURIComponent(query)}&tfs=${tripType}`;
}

/**
 * Scrapes the cheapest visible fare for a single HYD -> destination route.
 *
 * @param {{ destination: string, departDate: string, returnDate?: string, origin?: string }} params
 * @returns {Promise<{ destination: string, priceInr: number, airline: string, stops: number, raw: object } | null>}
 */
export async function scrapeGoogleFlights({ destination, departDate, returnDate, origin = "HYD" }) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      userAgent: randomUserAgent(),
      viewport: randomViewport(),
      locale: "en-US",
      timezoneId: "Asia/Kolkata",
    });

    // Strip the most obvious automation fingerprint before any page script runs.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const page = await context.newPage();
    const url = buildGoogleFlightsUrl({ origin, destination, departDate, returnDate });

    await randomDelay(); // don't fire requests back-to-back across destinations
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Dismiss a consent dialog if one appears (region-dependent).
    const consentButton = page.getByRole("button", { name: /accept all|i agree/i });
    if (await consentButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await consentButton.click();
      await randomDelay(500, 1200);
    }

    // Wait for at least one result row to render.
    const resultRow = page.locator('[role="listitem"]').first();
    await resultRow.waitFor({ timeout: 20_000 });
    await randomDelay(800, 2000); // let lazy-loaded prices settle

    const rows = page.locator('[role="listitem"]');
    const rowCount = await rows.count();
    if (rowCount === 0) return null;

    let cheapest = null;
    for (let i = 0; i < Math.min(rowCount, 10); i++) {
      const row = rows.nth(i);
      const text = await row.innerText().catch(() => "");
      const parsed = parseResultRowText(text);
      if (parsed && (!cheapest || parsed.priceInr < cheapest.priceInr)) {
        cheapest = parsed;
      }
    }

    if (!cheapest) return null;

    return {
      destination,
      priceInr: cheapest.priceInr,
      airline: cheapest.airline,
      stops: cheapest.stops,
      source: "google_flights_scrape",
      raw: { url, sampledRows: rowCount, scrapedAt: new Date().toISOString() },
    };
  } finally {
    await browser.close();
  }
}

/** Best-effort text parse of a Google Flights result row's flattened innerText. */
function parseResultRowText(text) {
  if (!text) return null;

  const priceMatch = text.match(/₹\s?([\d,]+)/);
  if (!priceMatch) return null;
  const priceInr = Number(priceMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(priceInr) || priceInr <= 0) return null;

  const stopsMatch = text.match(/nonstop/i)
    ? 0
    : (text.match(/(\d+)\s*stop/i)?.[1] ? Number(text.match(/(\d+)\s*stop/i)[1]) : 1);

  // Airline name is typically the first line of the row's text content.
  const airline = text.split("\n")[0]?.trim().slice(0, 60) || "unknown";

  return { priceInr, stops: stopsMatch, airline };
}

/**
 * Scrapes multiple destinations sequentially with jitter between each —
 * intentionally serial (not Promise.all) to keep the footprint low; real
 * parallelism/concurrency limiting is handled one level up by BullMQ's
 * worker concurrency setting, not by hammering Google from a single process.
 */
export async function scrapeMany(routes) {
  const results = [];
  for (const route of routes) {
    try {
      const result = await scrapeGoogleFlights(route);
      if (result) results.push(result);
    } catch (err) {
      console.error(`[scraper] failed for ${route.destination}:`, err.message);
    }
    await randomDelay();
  }
  return results;
}
