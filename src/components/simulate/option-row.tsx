"use client";

import type { OptionType, RecoveryOption } from "@/lib/types";
import { cn } from "@/lib/utils";

export const OPTION_COLORS: Record<OptionType, string> = {
  DELAY_ONLY: "bg-amber-600",
  SPREAD_DELAY: "bg-orange-600",
  DEEP_DELAY: "bg-red-700",
  SINGLE_SWAP: "bg-emerald-600",
  SWAP_CHAIN: "bg-emerald-800",
  CANCEL_OR_FERRY: "bg-zinc-700",
};

export function OptionRow({
  option,
  active,
  inCompare,
  approved,
  onClick,
  onToggleCompare,
}: {
  option: RecoveryOption;
  active: boolean;
  inCompare: boolean;
  approved: boolean;
  onClick: () => void;
  onToggleCompare: () => void;
}) {
  return (
    <div
      className={cn(
        "w-full p-4 grid grid-cols-12 gap-3 items-center transition",
        active && "bg-muted",
      )}
    >
      <div className="col-span-1 flex items-center gap-2">
        <input
          type="checkbox"
          checked={inCompare}
          onChange={onToggleCompare}
          aria-label="Add to compare"
          className="h-4 w-4 accent-[color:var(--accent)]"
        />
        <span className="text-xl font-bold">#{option.rank}</span>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="col-span-11 grid grid-cols-11 gap-3 items-center text-left hover:bg-muted/40 -mx-2 px-2 py-1 rounded"
      >
        <div className="col-span-3">
          <span
            className={cn(
              "inline-block px-2 py-0.5 rounded text-[11px] font-mono text-white",
              OPTION_COLORS[option.option_type],
            )}
          >
            {option.option_type}
          </span>
          {approved && (
            <span className="ml-2 inline-block px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-600 text-white">
              APPROVED
            </span>
          )}
          {option.curfew_violations > 0 && (
            <span
              title={`${option.curfew_violations} movement(s) inside a configured curfew window`}
              className="ml-2 inline-block px-2 py-0.5 rounded text-[11px] font-mono bg-red-100 text-red-800 border border-red-300"
            >
              CURFEW ×{option.curfew_violations}
            </span>
          )}
          {(() => {
            const cancelCount = option.flight_changes.filter(
              (c) => c.status === "CANCELLED",
            ).length;
            const ferryCount = option.flight_changes.filter(
              (c) => c.status === "FERRY",
            ).length;
            return (
              <>
                {cancelCount > 0 && (
                  <span
                    title={`${cancelCount} flight(s) cancelled`}
                    className="ml-2 inline-block px-2 py-0.5 rounded text-[11px] font-mono bg-red-600 text-white"
                  >
                    CANCEL ×{cancelCount}
                  </span>
                )}
                {ferryCount > 0 && (
                  <span
                    title="Includes ferry (empty positioning) leg"
                    className="ml-2 inline-block px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500 text-white"
                  >
                    FERRY ×{ferryCount}
                  </span>
                )}
              </>
            );
          })()}
          <div className="mt-1 text-[11px] font-mono text-zinc-500">
            {option.option_id}
          </div>
        </div>
        <div className="col-span-2">
          <div className="text-xs text-zinc-500">Score</div>
          <div className="text-lg font-semibold">{option.score}</div>
        </div>
        <div className="col-span-2">
          <div className="text-xs text-zinc-500">Total / Max delay</div>
          <div className="text-sm font-mono">
            {option.total_delay_minutes}′ / {option.max_delay_minutes}′
          </div>
        </div>
        <div className="col-span-2">
          <div className="text-xs text-zinc-500">Impact / Swap</div>
          <div className="text-sm font-mono">
            {option.impacted_flight_count} / {option.swap_count}
          </div>
        </div>
        <div className="col-span-2">
          <span
            className={cn(
              "inline-block px-2 py-0.5 rounded text-[11px] font-mono",
              option.risk_level === "LOW" && "bg-emerald-100 text-emerald-800",
              option.risk_level === "MEDIUM" && "bg-amber-100 text-amber-800",
              option.risk_level === "HIGH" && "bg-red-100 text-red-800",
            )}
          >
            {option.risk_level}
          </span>
          <div className="mt-1 text-[11px] text-zinc-500">
            {option.recommendation}
          </div>
        </div>
      </button>
    </div>
  );
}
