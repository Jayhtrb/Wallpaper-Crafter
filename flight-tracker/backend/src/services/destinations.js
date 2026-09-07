// Static seed of international destinations reachable from HYD, grouped by
// region for "Smart Destination Discovery". In production this would be
// backed by the `routes` Postgres table (seeded from this same list via
// src/models/migrate.js) plus airline route-network data; kept as a plain
// module here so the scraper/queue/API layers have something concrete to
// iterate over without a live DB during early development.

export const REGIONS = ["Middle East", "SEA", "Europe", "Americas", "East Asia", "Oceania"];

export const DESTINATIONS = [
  // Middle East
  { code: "DXB", city: "Dubai", country: "UAE", region: "Middle East" },
  { code: "AUH", city: "Abu Dhabi", country: "UAE", region: "Middle East" },
  { code: "DOH", city: "Doha", country: "Qatar", region: "Middle East" },
  { code: "MCT", city: "Muscat", country: "Oman", region: "Middle East" },
  { code: "KWI", city: "Kuwait City", country: "Kuwait", region: "Middle East" },
  { code: "BAH", city: "Manama", country: "Bahrain", region: "Middle East" },
  { code: "JED", city: "Jeddah", country: "Saudi Arabia", region: "Middle East" },
  { code: "RUH", city: "Riyadh", country: "Saudi Arabia", region: "Middle East" },

  // South East Asia
  { code: "SIN", city: "Singapore", country: "Singapore", region: "SEA" },
  { code: "BKK", city: "Bangkok", country: "Thailand", region: "SEA" },
  { code: "KUL", city: "Kuala Lumpur", country: "Malaysia", region: "SEA" },
  { code: "DPS", city: "Bali (Denpasar)", country: "Indonesia", region: "SEA" },
  { code: "CXR", city: "Nha Trang", country: "Vietnam", region: "SEA" },
  { code: "HAN", city: "Hanoi", country: "Vietnam", region: "SEA" },
  { code: "MNL", city: "Manila", country: "Philippines", region: "SEA" },

  // Europe
  { code: "LHR", city: "London", country: "UK", region: "Europe" },
  { code: "CDG", city: "Paris", country: "France", region: "Europe" },
  { code: "FRA", city: "Frankfurt", country: "Germany", region: "Europe" },
  { code: "IST", city: "Istanbul", country: "Turkey", region: "Europe" },
  { code: "AMS", city: "Amsterdam", country: "Netherlands", region: "Europe" },
  { code: "ZRH", city: "Zurich", country: "Switzerland", region: "Europe" },
  { code: "FCO", city: "Rome", country: "Italy", region: "Europe" },
  { code: "MAD", city: "Madrid", country: "Spain", region: "Europe" },

  // Americas
  { code: "JFK", city: "New York", country: "USA", region: "Americas" },
  { code: "EWR", city: "Newark", country: "USA", region: "Americas" },
  { code: "ORD", city: "Chicago", country: "USA", region: "Americas" },
  { code: "YYZ", city: "Toronto", country: "Canada", region: "Americas" },

  // East Asia
  { code: "HKG", city: "Hong Kong", country: "Hong Kong", region: "East Asia" },
  { code: "ICN", city: "Seoul", country: "South Korea", region: "East Asia" },
  { code: "NRT", city: "Tokyo", country: "Japan", region: "East Asia" },
  { code: "PVG", city: "Shanghai", country: "China", region: "East Asia" },

  // Oceania
  { code: "MEL", city: "Melbourne", country: "Australia", region: "Oceania" },
  { code: "SYD", city: "Sydney", country: "Australia", region: "Oceania" },
];

export function topDestinations(limit = 50) {
  return DESTINATIONS.slice(0, limit);
}

export function destinationsByRegion() {
  return REGIONS.reduce((acc, region) => {
    acc[region] = DESTINATIONS.filter((d) => d.region === region);
    return acc;
  }, {});
}

export function findDestination(code) {
  return DESTINATIONS.find((d) => d.code === code.toUpperCase()) || null;
}
