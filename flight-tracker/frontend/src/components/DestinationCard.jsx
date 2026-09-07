import { useState } from "react";
import { TrendingDown, TrendingUp, Bell, BellOff, Plane } from "lucide-react";
import { cn, formatInr } from "../lib/utils.js";

/**
 * @param {{
 *   destination: { destination: string, city: string, country: string, region: string },
 *   airline: string,
 *   stops: number,
 *   price: { inr: number, usd: number, local: { currency: string, amount: number } },
 *   analysis?: { verdict: "BUY_NOW" | "WAIT", confidence: number, deltaPct: number },
 *   trend?: "up" | "down" | "flat",
 *   onAlertToggle?: (destination: string, enabled: boolean) => void,
 *   onClick?: () => void,
 * }} props
 */
export default function DestinationCard({
  destination,
  airline,
  stops = 0,
  price,
  analysis,
  trend = "flat",
  onAlertToggle,
  onClick,
}) {
  const [alertOn, setAlertOn] = useState(false);

  function handleAlertToggle(e) {
    e.stopPropagation();
    const next = !alertOn;
    setAlertOn(next);
    onAlertToggle?.(destination.destination, next);
  }

  const isBuyNow = analysis?.verdict === "BUY_NOW";

  return (
    <button
      onClick={onClick}
      className="group relative flex w-full flex-col rounded-2xl border border-slate-800 bg-slate-900/60
                 p-4 text-left transition hover:border-brand-500/60 hover:bg-slate-900 hover:shadow-lg
                 hover:shadow-brand-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-lg font-semibold text-slate-50">{destination.city}</p>
          <p className="text-xs text-slate-500">
            {destination.country} · {destination.destination}
          </p>
        </div>

        <button
          onClick={handleAlertToggle}
          aria-pressed={alertOn}
          aria-label={alertOn ? "Disable price alert" : "Enable price alert"}
          className={cn(
            "rounded-full p-2 transition",
            alertOn ? "bg-brand-500/20 text-brand-400" : "bg-slate-800 text-slate-500 hover:text-slate-300"
          )}
        >
          {alertOn ? <Bell size={16} /> : <BellOff size={16} />}
        </button>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold tabular-nums text-slate-50">{formatInr(price.inr)}</p>
          <p className="text-xs text-slate-500 tabular-nums">
            ${price.usd} · {price.local.amount} {price.local.currency}
          </p>
        </div>

        <div className="flex items-center gap-1 text-sm">
          {trend === "down" && <TrendingDown size={18} className="text-emerald-400" />}
          {trend === "up" && <TrendingUp size={18} className="text-rose-400" />}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <Plane size={12} />
          {airline} · {stops === 0 ? "Nonstop" : `${stops} stop${stops > 1 ? "s" : ""}`}
        </span>

        {analysis && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-medium",
              isBuyNow ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
            )}
          >
            {isBuyNow ? "Buy now" : "Wait"} · {analysis.confidence}%
          </span>
        )}
      </div>
    </button>
  );
}
