import * as SliderPrimitive from "@radix-ui/react-slider";
import { useState } from "react";
import { formatInr } from "../lib/utils.js";

const MIN_BUDGET = 20_000;
const MAX_BUDGET = 100_000;
const STEP = 1_000;

/**
 * Drag slider for budget filtering. Fires `onBudgetChange` continuously
 * while dragging so the Big Board can filter destinations live, plus
 * `onBudgetCommit` once the user releases (useful for anything that should
 * only fire on settle, e.g. re-fetching from the API instead of filtering
 * client-side tiles already in memory).
 */
export default function BudgetSlider({ value, onBudgetChange, onBudgetCommit }) {
  const [localValue, setLocalValue] = useState(value ?? MAX_BUDGET);

  function handleChange([next]) {
    setLocalValue(next);
    onBudgetChange?.(next);
  }

  function handleCommit([next]) {
    onBudgetCommit?.(next);
  }

  return (
    <div className="w-full max-w-md select-none">
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-sm font-medium text-slate-300">Max budget</label>
        <span className="text-lg font-semibold text-brand-400 tabular-nums">{formatInr(localValue)}</span>
      </div>

      <SliderPrimitive.Root
        className="relative flex items-center w-full h-5 touch-none"
        min={MIN_BUDGET}
        max={MAX_BUDGET}
        step={STEP}
        value={[localValue]}
        onValueChange={handleChange}
        onValueCommit={handleCommit}
        aria-label="Budget"
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow rounded-full bg-slate-800">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className="block h-5 w-5 rounded-full border-2 border-brand-400 bg-slate-950 shadow-lg shadow-brand-500/30
                     transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        />
      </SliderPrimitive.Root>

      <div className="flex justify-between mt-1 text-xs text-slate-500 tabular-nums">
        <span>{formatInr(MIN_BUDGET)}</span>
        <span>{formatInr(MAX_BUDGET)}</span>
      </div>
    </div>
  );
}
