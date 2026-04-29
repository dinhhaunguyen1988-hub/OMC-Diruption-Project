"use client";

import { useState } from "react";
import { useData } from "@/components/data-context";
import {
  runSimulation,
  runMultiEventSimulation,
  type SimulationResult,
} from "@/lib/engine";
import type { DisruptionEvent } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { approveOption, persistSimulation } from "@/app/actions";
import {
  draftToEvent,
  emptyDraft,
  type EventDraft,
  MultiEventPanel,
} from "@/components/simulate/multi-event-panel";
import { OptionRow } from "@/components/simulate/option-row";
import { OptionDetail } from "@/components/simulate/option-detail";
import { ImpactedFlightsPanel } from "@/components/simulate/impacted-flights-panel";
import { buildCompareUrl, type ScenarioKey } from "@/lib/compare-url";

export default function SimulatePage() {
  const { schedule, aircraft, disruption, rules, loadSampleData, session } =
    useData();
  const [scenario, setScenario] = useState<ScenarioKey>("aog");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [extraEvents, setExtraEvents] = useState<DisruptionEvent[]>([]);
  const [eventDraft, setEventDraft] = useState<EventDraft>(emptyDraft());
  const [showEventForm, setShowEventForm] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [savedUuid, setSavedUuid] = useState<string | null>(null);
  const [savingSim, setSavingSim] = useState(false);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [approvedOptionId, setApprovedOptionId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const canRun = Boolean(schedule.length && aircraft.length && disruption);
  const canWrite = session?.role === "controller" || session?.role === "admin";

  const handleRun = () => {
    if (!disruption) return;
    setRunning(true);
    setSavedUuid(null);
    setApprovedOptionId(null);
    setActionMsg(null);
    setActionErr(null);
    setCompareIds(new Set());
    try {
      const allEvents = [disruption, ...extraEvents];
      if (allEvents.length === 1) {
        const r = runSimulation({ schedule, aircraft, disruption, rules });
        setResult(r);
        setSelectedOption(r.ranked_options[0]?.option_id ?? null);
      } else {
        const multi = runMultiEventSimulation({
          schedule,
          aircraft,
          disruptions: allEvents,
          rules,
        });
        // Wrap multi result into SimulationResult shape so existing UI keeps
        // working — `event` becomes the primary disruption, but impacted +
        // ranked_options reflect the union.
        setResult({
          event: disruption,
          impacted_flights: multi.impacted_flights,
          ranked_options: multi.ranked_options,
        });
        setSelectedOption(multi.ranked_options[0]?.option_id ?? null);
      }
    } finally {
      setRunning(false);
    }
  };

  const addExtraEvent = () => {
    const ev = draftToEvent(eventDraft);
    if (!ev) return;
    setExtraEvents((prev) => [...prev, ev]);
    setEventDraft(emptyDraft());
    setShowEventForm(false);
  };

  const removeExtraEvent = (eventId: string) => {
    setExtraEvents((prev) => prev.filter((e) => e.event_id !== eventId));
  };

  const handleSaveSimulation = async () => {
    if (!result) return;
    setSavingSim(true);
    setActionErr(null);
    try {
      const r = await persistSimulation(result);
      if (!r.ok) throw new Error(r.message);
      setSavedUuid(r.data?.uuid ?? null);
      setActionMsg(`Simulation saved (${r.data?.uuid ?? "?"}).`);
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setSavingSim(false);
    }
  };

  const handleApprove = async (optionId: string) => {
    if (!savedUuid) {
      setActionErr("Save the simulation first before approving.");
      return;
    }
    setActionErr(null);
    const r = await approveOption(savedUuid, optionId);
    if (!r.ok) {
      setActionErr(r.message ?? "Approve failed");
      return;
    }
    setApprovedOptionId(optionId);
    setActionMsg(`Option ${optionId} approved.`);
  };

  const toggleCompare = (optionId: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(optionId)) {
        next.delete(optionId);
      } else if (next.size < 2) {
        next.add(optionId);
      }
      return next;
    });
  };

  const openCompare = () => {
    if (compareIds.size !== 2 || !result) return;
    const picks: number[] = [];
    result.ranked_options.forEach((o, idx) => {
      if (compareIds.has(o.option_id)) picks.push(idx);
    });
    if (picks.length !== 2) return;

    // Keep sessionStorage as a same-session cache (faster page open, also
    // a fallback if the URL state misses anything). The URL is the
    // canonical source of truth on reload.
    const payload = {
      saved_at: new Date().toISOString(),
      options: result.ranked_options.filter((o) => compareIds.has(o.option_id)),
    };
    sessionStorage.setItem("occ:compare", JSON.stringify(payload));

    const url = buildCompareUrl({
      scenario,
      picks,
      extraEvents,
    });
    window.location.href = url;
  };

  const handleLoadScenario = async (s: ScenarioKey) => {
    setScenario(s);
    setResult(null);
    setExtraEvents([]);
    await loadSampleData(s);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Disruption simulation
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Run the recovery engine on the active disruption and review ranked
          options.
        </p>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">
              Sample scenario
            </label>
            <select
              value={scenario}
              onChange={(e) =>
                void handleLoadScenario(e.target.value as ScenarioKey)
              }
              className="h-9 rounded border border-border bg-background px-3 text-sm"
            >
              <option value="aog">AOG — VJ-A321</option>
              <option value="airport_close">Airport Close — HAN</option>
              <option value="weather">Weather — DAD</option>
              <option value="late_arrival">Late Arrival</option>
            </select>
          </div>
          {disruption && (
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-mono">{disruption.event_id}</span> —{" "}
              {disruption.description}
            </div>
          )}
          <button
            onClick={handleRun}
            disabled={!canRun || running}
            className="ml-auto h-9 rounded-md bg-primary px-5 text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90"
          >
            {running
              ? "Running…"
              : extraEvents.length > 0
                ? `Run multi-event (${extraEvents.length + 1})`
                : "Run simulation"}
          </button>
        </div>
      </div>

      <MultiEventPanel
        primary={disruption}
        extras={extraEvents}
        showForm={showEventForm}
        draft={eventDraft}
        onShowForm={() => setShowEventForm(true)}
        onCancelForm={() => {
          setShowEventForm(false);
          setEventDraft(emptyDraft());
        }}
        onDraftChange={setEventDraft}
        onAdd={addExtraEvent}
        onRemove={removeExtraEvent}
      />

      {result && (
        <>
          {(actionMsg || actionErr) && (
            <div
              className={cn(
                "rounded border p-3 text-sm",
                actionErr
                  ? "border-[color:var(--danger)] bg-red-50 text-red-800"
                  : "border-emerald-300 bg-emerald-50 text-emerald-800",
              )}
            >
              {actionErr ?? actionMsg}
            </div>
          )}

          <ImpactedFlightsPanel
            schedule={schedule}
            aircraft={aircraft}
            impacted={result.impacted_flights}
            highlightAircraft={disruption?.affected_aircraft ?? null}
          />

          <div className="rounded-lg border border-border">
            <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-semibold">
                Ranked recovery options ({result.ranked_options.length})
              </h2>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500">
                  Compare {compareIds.size}/2 selected
                </span>
                <button
                  onClick={openCompare}
                  disabled={compareIds.size !== 2}
                  className="h-8 rounded-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-40"
                >
                  Open compare →
                </button>
                {canWrite && (
                  <button
                    onClick={handleSaveSimulation}
                    disabled={savingSim || Boolean(savedUuid)}
                    className="h-8 rounded-md bg-primary px-3 text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90"
                  >
                    {savedUuid
                      ? "Saved ✓"
                      : savingSim
                        ? "Saving…"
                        : "Save simulation"}
                  </button>
                )}
              </div>
            </div>
            <div className="divide-y divide-border">
              {result.ranked_options.map((opt) => (
                <OptionRow
                  key={opt.option_id}
                  option={opt}
                  active={selectedOption === opt.option_id}
                  inCompare={compareIds.has(opt.option_id)}
                  approved={approvedOptionId === opt.option_id}
                  onClick={() => setSelectedOption(opt.option_id)}
                  onToggleCompare={() => toggleCompare(opt.option_id)}
                />
              ))}
            </div>
          </div>

          {selectedOption && (
            <OptionDetail
              option={
                result.ranked_options.find((o) => o.option_id === selectedOption)!
              }
              eventInfo={
                disruption ? formatDateTime(disruption.start_time) : ""
              }
              onApprove={
                canWrite
                  ? () => handleApprove(selectedOption)
                  : undefined
              }
              approved={approvedOptionId === selectedOption}
              canApprove={Boolean(savedUuid && canWrite)}
            />
          )}
        </>
      )}
    </div>
  );
}
