"use client";

import type { DisruptionEvent, DisruptionType, Severity } from "@/lib/types";

export interface EventDraft {
  event_type: DisruptionType;
  affected_aircraft: string;
  affected_airport: string;
  affected_flight_id: string;
  start: string;
  end: string;
  severity: Severity;
  description: string;
}

export function emptyDraft(): EventDraft {
  return {
    event_type: "AOG",
    affected_aircraft: "",
    affected_airport: "",
    affected_flight_id: "",
    start: "",
    end: "",
    severity: "HIGH",
    description: "",
  };
}

/**
 * Normalize an ISO-ish datetime string to UTC. If the user provided only
 * `YYYY-MM-DDTHH:MM` or `...:SS` with no timezone designator, append `Z` so it
 * is parsed as UTC (matches the field label "UTC, ISO 8601"). Strings that
 * already carry `Z` or `±HH:MM` pass through unchanged.
 */
export function normalizeIsoUtc(value: string): string {
  const v = value.trim();
  if (!v) return v;
  if (/Z$/i.test(v)) return v;
  if (/[+-]\d{2}:?\d{2}$/.test(v)) return v;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return `${v}Z`;
  return v;
}

export function draftToEvent(d: EventDraft): DisruptionEvent | null {
  if (!d.start || !d.end) return null;
  const start = new Date(normalizeIsoUtc(d.start));
  const end = new Date(normalizeIsoUtc(d.end));
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return null;
  return {
    event_id: `WHAT-IF-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    event_type: d.event_type,
    start_time: start,
    end_time: end,
    severity: d.severity,
    description: d.description || `What-if ${d.event_type}`,
    affected_aircraft: d.event_type === "AOG" ? d.affected_aircraft || null : null,
    affected_airport:
      d.event_type === "AIRPORT_CLOSE" || d.event_type === "WEATHER"
        ? d.affected_airport || null
        : null,
    affected_flight_id:
      d.event_type === "LATE_ARRIVAL" ? d.affected_flight_id || null : null,
  };
}

export function MultiEventPanel({
  primary,
  extras,
  showForm,
  draft,
  onShowForm,
  onCancelForm,
  onDraftChange,
  onAdd,
  onRemove,
}: {
  primary: DisruptionEvent | null;
  extras: DisruptionEvent[];
  showForm: boolean;
  draft: EventDraft;
  onShowForm: () => void;
  onCancelForm: () => void;
  onDraftChange: (d: EventDraft) => void;
  onAdd: () => void;
  onRemove: (eventId: string) => void;
}) {
  const totalEvents = (primary ? 1 : 0) + extras.length;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold">Active disruption events ({totalEvents})</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Add what-if events to run a multi-event recovery (K10). Useful for
            cascading IROPS — e.g. AOG + weather at the same time.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={onShowForm}
            className="h-8 rounded-md border border-border px-3 text-sm hover:bg-muted"
          >
            + Add what-if event
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-2 text-sm">
        {primary && (
          <li className="rounded border border-border p-2 bg-muted/40">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-mono text-xs">
                <span className="font-semibold">PRIMARY · {primary.event_id}</span>{" "}
                — {primary.event_type} — {primary.description}
              </div>
              <div className="text-[11px] font-mono text-zinc-500">
                {primary.start_time.toISOString()} →{" "}
                {primary.end_time.toISOString()}
              </div>
            </div>
          </li>
        )}
        {extras.map((e) => (
          <li
            key={e.event_id}
            className="rounded border border-amber-300 p-2 bg-amber-50/60 dark:bg-amber-900/20"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-mono text-xs">
                <span className="font-semibold">WHAT-IF · {e.event_id}</span> —{" "}
                {e.event_type} — {e.description}
                {e.affected_aircraft && ` (a/c ${e.affected_aircraft})`}
                {e.affected_airport && ` (apt ${e.affected_airport})`}
                {e.affected_flight_id && ` (flt ${e.affected_flight_id})`}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-zinc-500">
                  {e.start_time.toISOString()} → {e.end_time.toISOString()}
                </span>
                <button
                  onClick={() => onRemove(e.event_id)}
                  className="text-[11px] rounded border border-border px-2 py-0.5 hover:bg-muted"
                >
                  Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {showForm && (
        <div className="mt-3 rounded border border-border p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">
              Event type
            </label>
            <select
              value={draft.event_type}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  event_type: e.target.value as DisruptionType,
                })
              }
              className="h-9 w-full rounded border border-border bg-background px-2 text-sm"
            >
              <option value="AOG">AOG</option>
              <option value="AIRPORT_CLOSE">AIRPORT_CLOSE</option>
              <option value="WEATHER">WEATHER</option>
              <option value="LATE_ARRIVAL">LATE_ARRIVAL</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">
              Severity
            </label>
            <select
              value={draft.severity}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  severity: e.target.value as Severity,
                })
              }
              className="h-9 w-full rounded border border-border bg-background px-2 text-sm"
            >
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
          {draft.event_type === "AOG" && (
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                Affected aircraft (e.g. VJ-A322)
              </label>
              <input
                value={draft.affected_aircraft}
                onChange={(e) =>
                  onDraftChange({ ...draft, affected_aircraft: e.target.value })
                }
                className="h-9 w-full rounded border border-border bg-background px-2 text-sm font-mono"
                placeholder="VJ-A322"
              />
            </div>
          )}
          {(draft.event_type === "AIRPORT_CLOSE" ||
            draft.event_type === "WEATHER") && (
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                Affected airport (IATA)
              </label>
              <input
                value={draft.affected_airport}
                onChange={(e) =>
                  onDraftChange({
                    ...draft,
                    affected_airport: e.target.value.toUpperCase(),
                  })
                }
                className="h-9 w-full rounded border border-border bg-background px-2 text-sm font-mono"
                placeholder="HAN"
              />
            </div>
          )}
          {draft.event_type === "LATE_ARRIVAL" && (
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                Affected flight id
              </label>
              <input
                value={draft.affected_flight_id}
                onChange={(e) =>
                  onDraftChange({
                    ...draft,
                    affected_flight_id: e.target.value,
                  })
                }
                className="h-9 w-full rounded border border-border bg-background px-2 text-sm font-mono"
                placeholder="VJ102-D1"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">
              Start (UTC, ISO 8601)
            </label>
            <input
              type="text"
              value={draft.start}
              onChange={(e) =>
                onDraftChange({ ...draft, start: e.target.value })
              }
              className="h-9 w-full rounded border border-border bg-background px-2 text-sm font-mono"
              placeholder="2026-04-28T09:00:00Z"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Paste from ops doc, e.g. <code>2026-04-28T09:00:00Z</code>
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">
              End (UTC, ISO 8601)
            </label>
            <input
              type="text"
              value={draft.end}
              onChange={(e) =>
                onDraftChange({ ...draft, end: e.target.value })
              }
              className="h-9 w-full rounded border border-border bg-background px-2 text-sm font-mono"
              placeholder="2026-04-28T19:00:00Z"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Must be after Start. UTC only.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-500 mb-1">
              Description (optional)
            </label>
            <input
              value={draft.description}
              onChange={(e) =>
                onDraftChange({ ...draft, description: e.target.value })
              }
              className="h-9 w-full rounded border border-border bg-background px-2 text-sm"
              placeholder="e.g. Thunderstorm cell over HAN"
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <button
              onClick={onAdd}
              disabled={!draft.start || !draft.end}
              className="h-8 rounded-md bg-primary px-3 text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90"
            >
              Add event
            </button>
            <button
              onClick={onCancelForm}
              className="h-8 rounded-md border border-border px-3 text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
