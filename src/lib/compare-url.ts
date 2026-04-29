import type { DisruptionEvent } from "@/lib/types";

export type ScenarioKey = "aog" | "airport_close" | "weather" | "late_arrival";

const SCENARIO_VALUES: ScenarioKey[] = [
  "aog",
  "airport_close",
  "weather",
  "late_arrival",
];

export interface CompareUrlState {
  scenario: ScenarioKey;
  /** 0-based indices into ranked_options (lower = better, 0 = top option). */
  picks: number[];
  /** Optional what-if disruption events (multi-event K10), base64 in URL. */
  extraEvents: DisruptionEvent[];
}

/**
 * Build a Compare URL that survives reload / sharing.
 *
 *   /dashboard/compare?scenario=aog&picks=0,2
 *   /dashboard/compare?scenario=aog&picks=0,2&events=<base64>
 *
 * `picks` are 0-based indices into the ranked_options list at the time of
 * navigation. On reload, the compare page re-runs the engine against the
 * referenced scenario and (optional) extra events, then selects ranked_options
 * at those indices. Engine output is deterministic for a fixed input, so the
 * IDs may change between deployments but the rank-1 / rank-3 semantic remains.
 */
export function buildCompareUrl(state: CompareUrlState): string {
  const params = new URLSearchParams();
  params.set("scenario", state.scenario);
  params.set("picks", state.picks.join(","));
  if (state.extraEvents.length > 0) {
    params.set("events", encodeEvents(state.extraEvents));
  }
  return `/dashboard/compare?${params.toString()}`;
}

export function parseCompareUrl(
  search: string | URLSearchParams,
): CompareUrlState | null {
  const params =
    search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const scenarioRaw = params.get("scenario");
  const picksRaw = params.get("picks");
  if (!scenarioRaw || !picksRaw) return null;
  if (!SCENARIO_VALUES.includes(scenarioRaw as ScenarioKey)) return null;

  const picks = picksRaw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0);
  if (picks.length < 2) return null;

  const eventsRaw = params.get("events");
  let extraEvents: DisruptionEvent[] = [];
  if (eventsRaw) {
    try {
      extraEvents = decodeEvents(eventsRaw);
    } catch {
      // Invalid events param — drop silently and fall through with sample only.
      extraEvents = [];
    }
  }

  return {
    scenario: scenarioRaw as ScenarioKey,
    picks,
    extraEvents,
  };
}

function encodeEvents(events: DisruptionEvent[]): string {
  const json = JSON.stringify(events);
  // URL-safe base64. Browsers expose btoa; Node's Buffer is used in tests.
  if (typeof btoa === "function") {
    return urlSafe(btoa(unescape(encodeURIComponent(json))));
  }
  return urlSafe(Buffer.from(json, "utf8").toString("base64"));
}

function decodeEvents(value: string): DisruptionEvent[] {
  const b64 = fromUrlSafe(value);
  let json: string;
  if (typeof atob === "function") {
    json = decodeURIComponent(escape(atob(b64)));
  } else {
    json = Buffer.from(b64, "base64").toString("utf8");
  }
  const parsed = JSON.parse(json) as DisruptionEvent[];
  // Restore Date objects on start_time / end_time.
  return parsed.map((e) => ({
    ...e,
    start_time: new Date(e.start_time),
    end_time: new Date(e.end_time),
  }));
}

function urlSafe(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromUrlSafe(value: string): string {
  let s = value.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  return s;
}
