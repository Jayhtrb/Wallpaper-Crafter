import { useEffect, useMemo, useState } from "react";
import BudgetSlider from "./components/BudgetSlider.jsx";
import DestinationCard from "./components/DestinationCard.jsx";
import Globe from "./components/Globe.jsx";
import { useLiveBigBoard } from "./hooks/useWebSocket.js";
import { getBigBoard, createAlert } from "./lib/api.js";

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function App() {
  const [departDate, setDepartDate] = useState(todayPlus(14));
  const [budget, setBudget] = useState(100_000);
  const [region, setRegion] = useState("");
  const [searched, setSearched] = useState(false);
  const [staticTiles, setStaticTiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { tiles: liveTiles, lastFareDrop, connected } = useLiveBigBoard();

  async function runSearch() {
    setSearched(true);
    setLoading(true);
    setError(null);
    try {
      const data = await getBigBoard({ departDate, maxBudgetInr: budget, region: region || undefined });
      setStaticTiles(data.tiles);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Merge the REST snapshot with anything the WebSocket has pushed since,
  // so a live fare-drop updates a tile already on screen without a refetch.
  const mergedTiles = useMemo(() => {
    const byDestination = new Map(staticTiles.map((t) => [t.destination, t]));
    for (const [code, live] of Object.entries(liveTiles)) {
      if (byDestination.has(code)) {
        byDestination.set(code, { ...byDestination.get(code), ...live });
      }
    }
    return [...byDestination.values()].filter((t) => t.price.inr <= budget);
  }, [staticTiles, liveTiles, budget]);

  async function handleAlertToggle(destination, enabled) {
    if (!enabled) return; // deletion flow omitted from this MVP toggle
    try {
      await createAlert({ destination, departDate, kind: "drop" });
    } catch {
      // Alerts require auth; in this scaffold an unauthenticated toggle
      // just no-ops rather than crashing the board.
    }
  }

  if (!searched) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
        <div className="text-center">
          <p className="text-sm uppercase tracking-widest text-brand-400">HYD outbound</p>
          <h1 className="mt-2 text-4xl font-bold sm:text-5xl">When do you want to fly?</h1>
        </div>

        <input
          type="date"
          value={departDate}
          onChange={(e) => setDepartDate(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-lg text-slate-100
                     focus:border-brand-500 focus:outline-none"
        />

        <button
          onClick={runSearch}
          className="rounded-xl bg-brand-500 px-8 py-3 text-lg font-semibold text-slate-950
                     transition hover:bg-brand-400"
        >
          Find cheap flights
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">HYD → Anywhere</h1>
          <p className="text-sm text-slate-500">
            Departing {departDate} · {connected ? "live" : "connecting…"}
          </p>
        </div>
        <BudgetSlider value={budget} onBudgetChange={setBudget} />
      </header>

      {lastFareDrop && (
        <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Fare drop: {lastFareDrop.destination} now {lastFareDrop.price?.inr ?? ""} INR
        </div>
      )}

      <Globe tiles={mergedTiles.reduce((acc, t) => ({ ...acc, [t.destination]: t }), {})} onSelectDestination={setRegion} />

      {loading && <p className="mt-8 text-slate-500">Loading the big board…</p>}
      {error && <p className="mt-8 text-rose-400">{error}</p>}

      {!loading && !error && (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mergedTiles.map((tile) => (
            <DestinationCard
              key={tile.destination}
              destination={tile}
              airline={tile.airline}
              stops={tile.stops}
              price={tile.price}
              analysis={tile.analysis}
              onAlertToggle={handleAlertToggle}
            />
          ))}
          {mergedTiles.length === 0 && (
            <p className="col-span-full text-slate-500">
              No fares within budget yet — the scrape cron populates this board every 2 hours; run the
              worker locally to seed data faster during development.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
