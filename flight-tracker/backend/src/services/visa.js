// Visa-aware filtering. Static table keyed by (passport country -> requirement
// per destination country), seeded with common cases for an Indian passport
// (the app's primary user base, since origin is fixed at HYD). For full
// global coverage, swap `REQUIREMENTS` for a call to a passport-strength API
// (e.g. Sherpa, VisaHQ, Passport Index) behind the same `getRequirement()`
// signature — nothing else in the app needs to change.

export const VISA_FREE = "visa_free";
export const VISA_ON_ARRIVAL = "visa_on_arrival";
export const E_VISA = "e_visa";
export const VISA_REQUIRED = "visa_required";

// destination country -> requirement, for an Indian (IN) passport holder.
const INDIA_PASSPORT_REQUIREMENTS = {
  UAE: VISA_ON_ARRIVAL,
  Qatar: E_VISA,
  Oman: E_VISA,
  Kuwait: E_VISA,
  Bahrain: VISA_ON_ARRIVAL,
  "Saudi Arabia": E_VISA,
  Singapore: E_VISA,
  Thailand: VISA_ON_ARRIVAL,
  Malaysia: E_VISA,
  Indonesia: VISA_ON_ARRIVAL,
  Vietnam: E_VISA,
  Philippines: VISA_FREE,
  UK: VISA_REQUIRED,
  France: VISA_REQUIRED,
  Germany: VISA_REQUIRED,
  Turkey: E_VISA,
  Netherlands: VISA_REQUIRED,
  Switzerland: VISA_REQUIRED,
  Italy: VISA_REQUIRED,
  Spain: VISA_REQUIRED,
  USA: VISA_REQUIRED,
  Canada: VISA_REQUIRED,
  "Hong Kong": VISA_FREE,
  "South Korea": VISA_FREE,
  Japan: VISA_REQUIRED,
  China: VISA_REQUIRED,
  Australia: E_VISA,
};

/**
 * @param {string} passportCountry - ISO-ish country name/code the user holds
 * @param {string} destinationCountry
 * @returns {string} one of VISA_FREE | VISA_ON_ARRIVAL | E_VISA | VISA_REQUIRED
 */
export function getRequirement(passportCountry, destinationCountry) {
  if ((passportCountry || "").toUpperCase() !== "IN") {
    // Only Indian-passport data is seeded; treat unknown passports as
    // "unknown" rather than silently asserting visa-free.
    return "unknown";
  }
  return INDIA_PASSPORT_REQUIREMENTS[destinationCountry] ?? "unknown";
}

/**
 * Filters a destinations array down to ones the user can fly to without a
 * pre-arranged visa, per the spec ("exclude destinations that require a
 * visa-on-arrival or pre-arranged visa if the user doesn't have one").
 * `allowVisaOnArrival` lets the caller decide whether VOA counts as "fine".
 */
export function filterVisaFriendly(destinations, passportCountry, { allowVisaOnArrival = true, allowEVisa = false } = {}) {
  return destinations.filter((dest) => {
    const req = getRequirement(passportCountry, dest.country);
    if (req === VISA_FREE) return true;
    if (req === VISA_ON_ARRIVAL) return allowVisaOnArrival;
    if (req === E_VISA) return allowEVisa;
    return false; // VISA_REQUIRED or unknown -> excluded
  });
}
