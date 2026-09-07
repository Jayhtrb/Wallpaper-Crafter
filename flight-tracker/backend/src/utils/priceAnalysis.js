// Heuristic "Wait" / "Buy Now" score, standing in for the spec'd ML model.
//
// Real approach for a v2: train a small gradient-boosted regressor (or even
// linear regression) per-route on {days_to_departure, day_of_week,
// season, historical_price_series} -> next-7-day min price, using the
// price_snapshots table as training data once a few months of history
// exist. Until there's enough history to train on, a transparent heuristic
// beats an untrustworthy model — this is that heuristic.

/**
 * @param {number[]} last30DaysPrices - chronological daily price points (INR)
 * @param {number} currentPrice
 * @returns {{ verdict: "BUY_NOW" | "WAIT", confidence: number, meanPrice: number, stdDev: number, deltaPct: number }}
 */
export function analyzePrice(last30DaysPrices, currentPrice) {
  if (!last30DaysPrices || last30DaysPrices.length < 5) {
    return {
      verdict: "BUY_NOW",
      confidence: 50,
      meanPrice: currentPrice,
      stdDev: 0,
      deltaPct: 0,
      note: "Insufficient history — defaulting to neutral confidence",
    };
  }

  const mean = average(last30DaysPrices);
  const stdDev = standardDeviation(last30DaysPrices, mean);
  const deltaPct = ((currentPrice - mean) / mean) * 100;

  const trend = recentTrend(last30DaysPrices);

  let verdict = "WAIT";
  let confidence = 50;

  if (deltaPct <= -10) {
    // Already well below average — good deal, don't gamble on it dropping further.
    verdict = "BUY_NOW";
    confidence = clamp(60 + Math.abs(deltaPct), 60, 95);
  } else if (deltaPct >= 10 && trend === "rising") {
    // Above average and climbing — buying now only gets worse.
    verdict = "BUY_NOW";
    confidence = clamp(55 + deltaPct / 2, 55, 90);
  } else if (trend === "falling") {
    verdict = "WAIT";
    confidence = clamp(55 + Math.abs(deltaPct), 55, 90);
  } else {
    // Roughly at the mean, no clear trend
    verdict = deltaPct < 0 ? "BUY_NOW" : "WAIT";
    confidence = 50 + Math.round(stdDev > 0 ? Math.min(15, (Math.abs(deltaPct) / stdDev) * 5) : 0);
  }

  return {
    verdict,
    confidence: Math.round(confidence),
    meanPrice: Math.round(mean),
    stdDev: Math.round(stdDev),
    deltaPct: Number(deltaPct.toFixed(1)),
  };
}

/** True when today's price is >15% below the trailing daily average — triggers a Fare Drop Alert. */
export function isFareDrop(previousAveragePrice, todayPrice, thresholdPct = 15) {
  if (!previousAveragePrice) return false;
  const dropPct = ((previousAveragePrice - todayPrice) / previousAveragePrice) * 100;
  return dropPct >= thresholdPct;
}

function average(arr) {
  return arr.reduce((sum, n) => sum + n, 0) / arr.length;
}

function standardDeviation(arr, mean) {
  const variance = average(arr.map((n) => (n - mean) ** 2));
  return Math.sqrt(variance);
}

function recentTrend(prices, windowSize = 5) {
  if (prices.length < windowSize * 2) return "flat";
  const recent = average(prices.slice(-windowSize));
  const prior = average(prices.slice(-windowSize * 2, -windowSize));
  const changePct = ((recent - prior) / prior) * 100;
  if (changePct > 3) return "rising";
  if (changePct < -3) return "falling";
  return "flat";
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
