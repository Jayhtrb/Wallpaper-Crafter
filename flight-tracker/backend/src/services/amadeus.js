// Pluggable GDS adapter. When AMADEUS_API_KEY/SECRET are present, this talks
// to the real Amadeus Self-Service Flight Offers Search API and is preferred
// over scraping for structured routes (it's cheaper, faster, and doesn't
// risk getting blocked). Without keys, `isConfigured()` returns false and
// callers fall back to the Playwright Google Flights scraper.
//
// This keeps the rest of the app (queue jobs, routes, price analysis)
// agnostic to *how* a price was sourced — swap providers without touching
// them.

import { cacheGet, cacheSet } from "../config/redis.js";

const AMADEUS_BASE_URL = "https://test.api.amadeus.com";

let tokenCache = { token: null, expiresAt: 0 };

export function isConfigured() {
  return Boolean(process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET);
}

async function getAccessToken() {
  if (tokenCache.token && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  const res = await fetch(`${AMADEUS_BASE_URL}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.AMADEUS_API_KEY,
      client_secret: process.env.AMADEUS_API_SECRET,
    }),
  });

  if (!res.ok) {
    throw new Error(`Amadeus auth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return tokenCache.token;
}

/**
 * @param {{origin: string, destination: string, departDate: string, returnDate?: string, adults?: number}} params
 * @returns {Promise<Array<{airline: string, priceInr: number, stops: number, source: string}>>}
 */
export async function searchFlightOffers(params) {
  if (!isConfigured()) {
    throw new Error("Amadeus not configured — set AMADEUS_API_KEY/AMADEUS_API_SECRET");
  }

  const cacheKey = `amadeus:${params.origin}:${params.destination}:${params.departDate}:${params.returnDate ?? "oneway"}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const token = await getAccessToken();
  const query = new URLSearchParams({
    originLocationCode: params.origin,
    destinationLocationCode: params.destination,
    departureDate: params.departDate,
    adults: String(params.adults ?? 1),
    currencyCode: "INR",
    max: "10",
  });
  if (params.returnDate) query.set("returnDate", params.returnDate);

  const res = await fetch(`${AMADEUS_BASE_URL}/v2/shopping/flight-offers?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Amadeus search failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const offers = (data.data || []).map((offer) => ({
    airline: offer.validatingAirlineCodes?.[0] ?? "unknown",
    priceInr: Number(offer.price.total),
    stops: (offer.itineraries?.[0]?.segments?.length ?? 1) - 1,
    source: "amadeus",
  }));

  await cacheSet(cacheKey, offers); // 1h TTL default
  return offers;
}
