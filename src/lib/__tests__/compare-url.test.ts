import { describe, expect, it } from "vitest";
import {
  buildCompareUrl,
  parseCompareUrl,
  type ScenarioKey,
} from "@/lib/compare-url";
import type { DisruptionEvent } from "@/lib/types";

const EXTRA_EVENT: DisruptionEvent = {
  event_id: "EVT-WX-HAN",
  event_type: "WEATHER",
  start_time: new Date("2026-04-28T01:00:00Z"),
  end_time: new Date("2026-04-28T03:00:00Z"),
  severity: "MEDIUM",
  description: "Thunderstorm at HAN",
  affected_aircraft: null,
  affected_airport: "HAN",
  affected_flight_id: null,
};

describe("buildCompareUrl + parseCompareUrl", () => {
  it("round-trips scenario + picks for the simple sample case", () => {
    const url = buildCompareUrl({
      scenario: "aog",
      picks: [0, 2],
      extraEvents: [],
    });
    expect(url).toBe("/dashboard/compare?scenario=aog&picks=0%2C2");

    const parsed = parseCompareUrl(url.split("?")[1]);
    expect(parsed).not.toBeNull();
    expect(parsed!.scenario).toBe<ScenarioKey>("aog");
    expect(parsed!.picks).toEqual([0, 2]);
    expect(parsed!.extraEvents).toEqual([]);
  });

  it("encodes and decodes extraEvents (base64) preserving Date types", () => {
    const url = buildCompareUrl({
      scenario: "aog",
      picks: [1, 3],
      extraEvents: [EXTRA_EVENT],
    });
    const parsed = parseCompareUrl(url.split("?")[1]);
    expect(parsed).not.toBeNull();
    expect(parsed!.extraEvents).toHaveLength(1);
    const ev = parsed!.extraEvents[0];
    expect(ev.event_id).toBe("EVT-WX-HAN");
    expect(ev.event_type).toBe("WEATHER");
    expect(ev.start_time).toBeInstanceOf(Date);
    expect(ev.end_time).toBeInstanceOf(Date);
    expect(ev.start_time.toISOString()).toBe("2026-04-28T01:00:00.000Z");
  });

  it("returns null for missing scenario", () => {
    expect(parseCompareUrl("picks=0,1")).toBeNull();
  });

  it("returns null for missing picks", () => {
    expect(parseCompareUrl("scenario=aog")).toBeNull();
  });

  it("returns null when fewer than 2 picks are provided", () => {
    expect(parseCompareUrl("scenario=aog&picks=0")).toBeNull();
  });

  it("rejects unknown scenario keys", () => {
    expect(parseCompareUrl("scenario=hijack&picks=0,1")).toBeNull();
  });

  it("ignores garbage events param without crashing the parser", () => {
    const parsed = parseCompareUrl(
      "scenario=aog&picks=0,1&events=not-valid-base64",
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.extraEvents).toEqual([]);
  });

  it("accepts URLSearchParams input directly (alternative entry point)", () => {
    const params = new URLSearchParams();
    params.set("scenario", "weather");
    params.set("picks", "0,4");
    const parsed = parseCompareUrl(params);
    expect(parsed).not.toBeNull();
    expect(parsed!.scenario).toBe<ScenarioKey>("weather");
    expect(parsed!.picks).toEqual([0, 4]);
  });
});
