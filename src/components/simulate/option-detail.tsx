"use client";

import type { RecoveryOption } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { logExport } from "@/app/actions";
import {
  exportOptionAsCsv,
  exportOptionAsJson,
} from "@/components/simulate/option-export";

export function OptionDetail({
  option,
  eventInfo,
  onApprove,
  approved,
  canApprove,
}: {
  option: RecoveryOption;
  eventInfo: string;
  onApprove?: () => void;
  approved: boolean;
  canApprove: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div>
        <h2 className="font-semibold">
          Option detail — #{option.rank} {option.option_type}
        </h2>
        <div className="text-xs text-zinc-500 mt-0.5 font-mono">
          {option.option_id} · disruption@{eventInfo}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Reason codes</h3>
        <ul className="text-sm space-y-1 list-disc list-inside text-zinc-700 dark:text-zinc-300">
          {option.reason_codes.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Score breakdown</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          {Object.entries(option.score_breakdown).map(([k, v]) => (
            <div key={k} className="rounded border border-border p-2">
              <div className="text-zinc-500">{k.replace(/_/g, " ")}</div>
              <div className="font-mono font-semibold">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {option.flight_changes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">
            Flight changes ({option.flight_changes.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="text-left text-zinc-500 border-b border-border">
                <tr>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3">Flight</th>
                  <th className="py-1 pr-3">From → To</th>
                  <th className="py-1 pr-3">Old aircraft</th>
                  <th className="py-1 pr-3">New aircraft</th>
                  <th className="py-1 pr-3">Old STD/STA</th>
                  <th className="py-1 pr-3">New STD/STA</th>
                  <th className="py-1 pr-3">Delay</th>
                </tr>
              </thead>
              <tbody>
                {option.flight_changes.map((c) => {
                  const cancelled = c.status === "CANCELLED";
                  const ferry = c.status === "FERRY";
                  return (
                    <tr
                      key={c.flight_id}
                      className={`border-b border-border/50 last:border-b-0 ${
                        cancelled ? "bg-red-50 dark:bg-red-900/10" : ""
                      } ${ferry ? "bg-amber-50 dark:bg-amber-900/10" : ""}`}
                    >
                      <td className="py-1 pr-3">
                        {cancelled && (
                          <span
                            data-testid="status-badge-cancelled"
                            className="inline-block px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-semibold tracking-wide"
                          >
                            CANCELLED
                          </span>
                        )}
                        {ferry && (
                          <span
                            data-testid="status-badge-ferry"
                            className="inline-block px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-semibold tracking-wide"
                            title="Empty positioning leg"
                          >
                            FERRY
                          </span>
                        )}
                        {!cancelled && !ferry && (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td
                        className={`py-1 pr-3 ${
                          cancelled ? "line-through text-zinc-500" : ""
                        }`}
                      >
                        {c.flight_number}
                      </td>
                      <td className="py-1 pr-3">{c.flight_id}</td>
                      <td className="py-1 pr-3">{c.original_aircraft}</td>
                      <td className="py-1 pr-3">
                        {cancelled ? (
                          <span className="text-zinc-400">—</span>
                        ) : c.new_aircraft !== c.original_aircraft ? (
                          <span className="text-emerald-700 font-bold">
                            {c.new_aircraft}
                          </span>
                        ) : (
                          c.new_aircraft
                        )}
                      </td>
                      <td className="py-1 pr-3">
                        {formatDateTime(c.original_std)}
                      </td>
                      <td className="py-1 pr-3">
                        {cancelled ? (
                          <span className="text-zinc-400">—</span>
                        ) : (
                          formatDateTime(c.new_std)
                        )}
                      </td>
                      <td className="py-1 pr-3">
                        {cancelled ? (
                          <span className="text-zinc-400">—</span>
                        ) : c.delay_minutes > 0 ? (
                          <span className="text-amber-700 font-bold">
                            +{c.delay_minutes}′
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2 flex-wrap">
        <button
          onClick={() => {
            exportOptionAsCsv(option);
            void logExport(option.option_id, "csv");
          }}
          className="h-9 rounded-md bg-primary px-4 text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          Export CSV (AIMS upload)
        </button>
        <button
          onClick={() => {
            exportOptionAsJson(option);
            void logExport(option.option_id, "json");
          }}
          className="h-9 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
        >
          Export audit JSON
        </button>
        {onApprove && (
          <button
            onClick={onApprove}
            disabled={!canApprove || approved}
            className="h-9 rounded-md bg-emerald-600 px-4 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-40"
            title={
              !canApprove
                ? "Save the simulation first"
                : approved
                  ? "Already approved"
                  : "Approve this option"
            }
          >
            {approved ? "Approved ✓" : "Approve option"}
          </button>
        )}
      </div>
    </div>
  );
}
