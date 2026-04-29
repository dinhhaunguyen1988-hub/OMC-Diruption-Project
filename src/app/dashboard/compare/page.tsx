"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useData } from "@/components/data-context";
import { runMultiEventSimulation, runSimulation } from "@/lib/engine";
import { parseCompareUrl } from "@/lib/compare-url";
import type { RecoveryOption } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

interface ComparePayload {
  saved_at: string;
  options: RecoveryOption[];
}

type ResolveResult =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "ok"; payload: ComparePayload };

export default function ComparePage() {
  const { schedule, aircraft, disruption, rules, loadSampleData } = useData();
  const [sessionPayload, setSessionPayload] = useState<ComparePayload | null>(
    null,
  );
  const [sessionChecked, setSessionChecked] = useState(false);

  // Parse URL once per mount; query string drives the compare state.
  const urlState = useMemo(() => {
    if (typeof window === "undefined") return null;
    return parseCompareUrl(window.location.search.replace(/^\?/, ""));
  }, []);

  // Path A — URL has scenario+picks: load the sample for that scenario.
  // The actual option resolution happens synchronously in the derived
  // memo below once DataContext catches up.
  useEffect(() => {
    if (!urlState) return;
    void loadSampleData(urlState.scenario);
  }, [urlState, loadSampleData]);

  // Path B — no URL params: read session-storage handoff (legacy / cache).
  useEffect(() => {
    if (urlState) return;
    Promise.resolve().then(() => {
      const raw = sessionStorage.getItem("occ:compare");
      if (!raw) {
        setSessionChecked(true);
        return;
      }
      try {
        const parsed = JSON.parse(raw) as ComparePayload;
        parsed.options = parsed.options.map((o) => ({
          ...o,
          flight_changes: o.flight_changes.map((c) => ({
            ...c,
            original_std: new Date(c.original_std),
            original_sta: new Date(c.original_sta),
            new_std: new Date(c.new_std),
            new_sta: new Date(c.new_sta),
          })),
        }));
        setSessionPayload(parsed);
      } catch {
        // fall through to "missing" state
      } finally {
        setSessionChecked(true);
      }
    });
  }, [urlState]);

  // Derived state — both paths funnel through this single computation so
  // we never call setState synchronously inside an effect.
  const resolved = useMemo<ResolveResult>(() => {
    if (urlState) {
      if (!disruption || schedule.length === 0 || aircraft.length === 0) {
        return { kind: "loading" };
      }
      try {
        const events = [disruption, ...urlState.extraEvents];
        const ranked =
          events.length === 1
            ? runSimulation({ schedule, aircraft, disruption, rules })
                .ranked_options
            : runMultiEventSimulation({
                schedule,
                aircraft,
                disruptions: events,
                rules,
              }).ranked_options;
        const picks = urlState.picks
          .map((idx) => ranked[idx])
          .filter((o): o is RecoveryOption => Boolean(o));
        if (picks.length < 2) {
          return {
            kind: "error",
            message: `Could not resolve compare picks (requested ranks ${urlState.picks
              .map((p) => `#${p + 1}`)
              .join(", ")} but engine returned ${ranked.length} options).`,
          };
        }
        return {
          kind: "ok",
          payload: { saved_at: new Date().toISOString(), options: picks },
        };
      } catch (e) {
        return { kind: "error", message: (e as Error).message };
      }
    }

    // No URL state — wait for sessionStorage scan.
    if (!sessionChecked) return { kind: "loading" };
    if (!sessionPayload) return { kind: "missing" };
    return { kind: "ok", payload: sessionPayload };
  }, [
    urlState,
    schedule,
    aircraft,
    disruption,
    rules,
    sessionChecked,
    sessionPayload,
  ]);

  if (resolved.kind === "error") {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Compare options</h1>
        <p className="text-sm text-red-700">Error: {resolved.message}</p>
        <Link
          href="/dashboard/simulate"
          className="text-sm text-primary underline underline-offset-2"
        >
          ← Back to Simulate
        </Link>
      </div>
    );
  }

  if (resolved.kind === "missing") {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Compare options</h1>
        <p className="text-sm text-zinc-600">
          No comparison loaded. Go to{" "}
          <Link
            href="/dashboard/simulate"
            className="text-primary underline underline-offset-2"
          >
            Simulate
          </Link>
          , tick 2 options in the ranked list, then click <em>Open compare</em>.
        </p>
      </div>
    );
  }

  if (resolved.kind === "loading") {
    return <div className="text-sm text-zinc-500">Loading…</div>;
  }

  const payload = resolved.payload;
  const [a, b] = payload.options;
  const winner = pickWinner(a, b);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Compare 2 recovery options
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Side-by-side diff. Lower score is better.
          </p>
        </div>
        <Link
          href="/dashboard/simulate"
          className="text-sm text-zinc-500 hover:text-foreground"
        >
          ← Back to Simulate
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <OptionCard option={a} highlight={winner === "a"} />
        <OptionCard option={b} highlight={winner === "b"} />
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-2 w-1/3">Metric</th>
              <th className="p-2">Option A — {a.option_id}</th>
              <th className="p-2">Option B — {b.option_id}</th>
              <th className="p-2 w-32">Δ (B − A)</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Type" a={a.option_type} b={b.option_type} />
            <Row label="Score (lower = better)" a={a.score} b={b.score} delta />
            <Row label="Risk" a={a.risk_level} b={b.risk_level} />
            <Row
              label="Total delay (min)"
              a={a.total_delay_minutes}
              b={b.total_delay_minutes}
              delta
            />
            <Row
              label="Max single delay (min)"
              a={a.max_delay_minutes}
              b={b.max_delay_minutes}
              delta
            />
            <Row
              label="Impacted flights"
              a={a.impacted_flight_count}
              b={b.impacted_flight_count}
              delta
            />
            <Row label="Swaps" a={a.swap_count} b={b.swap_count} delta />
            <Row
              label="Curfew violations"
              a={a.curfew_violations}
              b={b.curfew_violations}
              delta
            />
            <Row
              label="Flight changes"
              a={a.flight_changes.length}
              b={b.flight_changes.length}
              delta
            />
            <Row label="Recommendation" a={a.recommendation} b={b.recommendation} />
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FlightChangesPanel option={a} label="Option A" />
        <FlightChangesPanel option={b} label="Option B" />
      </div>
    </div>
  );
}

function pickWinner(a: RecoveryOption, b: RecoveryOption): "a" | "b" | "tie" {
  if (a.score < b.score) return "a";
  if (b.score < a.score) return "b";
  return "tie";
}

function OptionCard({
  option,
  highlight,
}: {
  option: RecoveryOption;
  highlight: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        highlight ? "border-emerald-500 bg-emerald-50/40" : "border-border",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs">{option.option_id}</span>
        {highlight && (
          <span className="text-[10px] font-mono uppercase text-emerald-700">
            Lower score
          </span>
        )}
      </div>
      <div className="mt-1 text-lg font-semibold">{option.option_type}</div>
      <div className="text-3xl font-bold mt-2">{option.score}</div>
      <div className="text-xs text-zinc-500">{option.recommendation}</div>
      <ul className="mt-3 text-xs space-y-1 list-disc list-inside text-zinc-700">
        {option.reason_codes.slice(0, 5).map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

function Row({
  label,
  a,
  b,
  delta,
}: {
  label: string;
  a: string | number;
  b: string | number;
  delta?: boolean;
}) {
  let deltaCell = "";
  if (delta && typeof a === "number" && typeof b === "number") {
    const d = b - a;
    deltaCell = (d > 0 ? "+" : "") + String(d);
  }
  return (
    <tr className="border-t border-border">
      <td className="p-2 text-zinc-500">{label}</td>
      <td className="p-2 font-mono">{a}</td>
      <td className="p-2 font-mono">{b}</td>
      <td className="p-2 font-mono text-xs">
        {delta ? deltaCell : "—"}
      </td>
    </tr>
  );
}

function FlightChangesPanel({
  option,
  label,
}: {
  option: RecoveryOption;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-border">
      <div className="p-3 border-b border-border">
        <h3 className="font-semibold text-sm">
          {label} — flight changes ({option.flight_changes.length})
        </h3>
      </div>
      {option.flight_changes.length === 0 ? (
        <div className="p-3 text-sm text-zinc-500">No flight changes.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead className="text-left text-zinc-500 border-b border-border">
              <tr>
                <th className="p-2">Flight</th>
                <th className="p-2">A/C</th>
                <th className="p-2">New STD</th>
                <th className="p-2">Δ min</th>
              </tr>
            </thead>
            <tbody>
              {option.flight_changes.map((c) => (
                <tr
                  key={c.flight_id}
                  className="border-b border-border/50 last:border-b-0"
                >
                  <td className="p-2">{c.flight_number}</td>
                  <td className="p-2">
                    {c.original_aircraft}
                    {c.new_aircraft !== c.original_aircraft &&
                      ` → ${c.new_aircraft}`}
                  </td>
                  <td className="p-2">{formatDateTime(c.new_std)}</td>
                  <td
                    className={cn(
                      "p-2",
                      c.delay_minutes > 0 && "text-amber-700 font-bold",
                    )}
                  >
                    {c.delay_minutes > 0 ? `+${c.delay_minutes}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
