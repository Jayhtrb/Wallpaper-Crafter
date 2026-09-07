import { cacheGet, cacheSet } from "../config/redis.js";

// Local-currency mapping so a price can be shown in destination currency too
// (Currency Arbitrage feature), without needing a live lookup per country.
const DESTINATION_CURRENCY = {
  DXB: "AED", AUH: "AED", DOH: "QAR", MCT: "OMR", KWI: "KWD", BAH: "BHD",
  JED: "SAR", RUH: "SAR", SIN: "SGD", BKK: "THB", KUL: "MYR", DPS: "IDR",
  CXR: "VND", HAN: "VND", MNL: "PHP", LHR: "GBP", CDG: "EUR", FRA: "EUR",
  IST: "TRY", AMS: "EUR", ZRH: "CHF", FCO: "EUR", MAD: "EUR", JFK: "USD",
  EWR: "USD", ORD: "USD", YYZ: "CAD", HKG: "HKD", ICN: "KRW", NRT: "JPY",
  PVG: "CNY", MEL: "AUD", SYD: "AUD",
};

const RATES_CACHE_KEY = "fx:rates:inr-base";
const RATES_TTL_SECONDS = 60 * 60; // 1h, matches the general API cache policy

export function localCurrencyFor(destinationCode) {
  return DESTINATION_CURRENCY[destinationCode.toUpperCase()] ?? "USD";
}

async function fetchRates() {
  const cached = await cacheGet(RATES_CACHE_KEY);
  if (cached) return cached;

  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey) {
    // No key configured — fall back to a static snapshot so the UI still
    // renders multi-currency figures in dev. Swap for a live provider
    // (exchangerate-api.com, openexchangerates.org, ...) by setting the key.
    return STATIC_FALLBACK_RATES;
  }

  const res = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/INR`);
  if (!res.ok) return STATIC_FALLBACK_RATES;

  const data = await res.json();
  const rates = data.conversion_rates;
  await cacheSet(RATES_CACHE_KEY, rates, RATES_TTL_SECONDS);
  return rates;
}

// Approximate, only used when no live FX key is configured.
const STATIC_FALLBACK_RATES = {
  INR: 1, USD: 0.012, EUR: 0.011, GBP: 0.0095, AED: 0.044, QAR: 0.044,
  SGD: 0.016, THB: 0.42, MYR: 0.054, JPY: 1.8, KRW: 16.1, AUD: 0.018,
  CAD: 0.016, CHF: 0.011, SAR: 0.045, HKD: 0.094, CNY: 0.087, TRY: 0.41,
  IDR: 190, VND: 305, PHP: 0.68, KWD: 0.0037, BHD: 0.0045, OMR: 0.0046,
};

/**
 * @param {number} priceInr
 * @param {string} destinationCode
 * @returns {Promise<{ inr: number, usd: number, local: { currency: string, amount: number } }>}
 */
export async function convertPrice(priceInr, destinationCode) {
  const rates = await fetchRates();
  const localCurrency = localCurrencyFor(destinationCode);

  return {
    inr: Math.round(priceInr),
    usd: round2(priceInr * (rates.USD ?? STATIC_FALLBACK_RATES.USD)),
    local: {
      currency: localCurrency,
      amount: round2(priceInr * (rates[localCurrency] ?? STATIC_FALLBACK_RATES[localCurrency] ?? 1)),
    },
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
