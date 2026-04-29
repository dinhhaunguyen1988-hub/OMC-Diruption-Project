import { describe, expect, it } from "vitest";
import { simulateDelayOnly } from "@/lib/engine/delay-simulator";
import { findImpactedFlights } from "@/lib/engine/impact-detector";
import { effectiveDisruptionEnd } from "@/lib/engine/time-utils";
import { getDefaultRules } from "@/lib/parsers/rules";
import type {
  DisruptionEvent,
  FlightLeg,
  OccRules,
} from "@/lib/types";

const RULES_WITH_BUFFER: OccRules = (() => {
  const r = getDefaultRules();
  r.airport_rules.enforce_closure_window = true;
  r.airport_rules.reopen_buffer_minutes = 30;
  return r;
})();

const RULES_NO_ENFORCE: OccRules = (() => {
  const r = getDefaultRules();
  r.airport_rules.enforce_closure_window = false;
  r.airport_rules.reopen_buffer_minutes = 30;
  return r;
})();

const RULES_ZERO_BUFFER: OccRules = (() => {
  const r = getDefaultRules();
  r.airport_rules.enforce_closure_window = true;
  r.airport_rules.reopen_buffer_minutes = 0;
  return r;
})();

const flight = (
  id: string,
  flight_number: string,
  origin: string,
  destination: string,
  std: string,
  sta: string,
  aircraft_id = "VJ-A321",
): FlightLeg => ({
  flight_id: id,
  flight_number,
  origin,
  destination,
  std: new Date(std),
  sta: new Date(sta),
  aircraft_id,
  aircraft_type: "A321",
  priority_level: 2,
  load_factor: 0.8,
  is_international: false,
  is_last_flight_of_day: false,
});

describe("effectiveDisruptionEnd helper", () => {
  it("returns end_time unchanged for AOG (buffer doesn't apply)", () => {
    const aog: DisruptionEvent = {
      event_id: "EVT",
      event_type: "AOG",
      start_time: new Date("2026-04-28T01:00:00Z"),
      end_time: new Date("2026-04-28T03:00:00Z"),
      severity: "HIGH",
      description: "AOG",
      affected_aircraft: "VJ-A321",
      affected_airport: null,
      affected_flight_id: null,
    };
    expect(
      effectiveDisruptionEnd(aog, RULES_WITH_BUFFER).getTime(),
    ).toBe(aog.end_time.getTime());
  });

  it("extends end_time by reopen_buffer_minutes for AIRPORT_CLOSE when enforced", () => {
    const close: DisruptionEvent = {
      event_id: "EVT",
      event_type: "AIRPORT_CLOSE",
      start_time: new Date("2026-04-28T01:00:00Z"),
      end_time: new Date("2026-04-28T03:00:00Z"),
      severity: "HIGH",
      description: "Closed",
      affected_aircraft: null,
      affected_airport: "HAN",
      affected_flight_id: null,
    };
    expect(
      effectiveDisruptionEnd(close, RULES_WITH_BUFFER).toISOString(),
    ).toBe("2026-04-28T03:30:00.000Z");
  });

  it("returns end_time unchanged when enforce_closure_window is false", () => {
    const close: DisruptionEvent = {
      event_id: "EVT",
      event_type: "AIRPORT_CLOSE",
      start_time: new Date("2026-04-28T01:00:00Z"),
      end_time: new Date("2026-04-28T03:00:00Z"),
      severity: "HIGH",
      description: "Closed",
      affected_aircraft: null,
      affected_airport: "HAN",
      affected_flight_id: null,
    };
    expect(
      effectiveDisruptionEnd(close, RULES_NO_ENFORCE).getTime(),
    ).toBe(close.end_time.getTime());
  });

  it("returns end_time unchanged when reopen_buffer_minutes is 0", () => {
    const weather: DisruptionEvent = {
      event_id: "EVT",
      event_type: "WEATHER",
      start_time: new Date("2026-04-28T01:00:00Z"),
      end_time: new Date("2026-04-28T03:00:00Z"),
      severity: "MEDIUM",
      description: "Weather",
      affected_aircraft: null,
      affected_airport: "DAD",
      affected_flight_id: null,
    };
    expect(
      effectiveDisruptionEnd(weather, RULES_ZERO_BUFFER).getTime(),
    ).toBe(weather.end_time.getTime());
  });
});

describe("findImpactedFlights — reopen buffer applied to AIRPORT_CLOSE", () => {
  const close: DisruptionEvent = {
    event_id: "EVT-CLOSE-HAN",
    event_type: "AIRPORT_CLOSE",
    start_time: new Date("2026-04-28T01:00:00Z"),
    end_time: new Date("2026-04-28T03:00:00Z"),
    severity: "HIGH",
    description: "Runway maintenance",
    affected_aircraft: null,
    affected_airport: "HAN",
    affected_flight_id: null,
  };

  // VJ_INSIDE departs HAN at 02:30Z — clearly inside the listed window.
  // VJ_BUFFER departs HAN at 03:15Z — 15 min after listed end_time, inside the
  //   30-min reopen buffer.
  // VJ_AFTER departs HAN at 03:45Z — 45 min after end_time, outside buffer.
  const schedule: FlightLeg[] = [
    flight(
      "VJ_INSIDE",
      "VJ100",
      "HAN",
      "SGN",
      "2026-04-28T02:30:00Z",
      "2026-04-28T04:30:00Z",
      "VJ-A100",
    ),
    flight(
      "VJ_BUFFER",
      "VJ110",
      "HAN",
      "SGN",
      "2026-04-28T03:15:00Z",
      "2026-04-28T05:15:00Z",
      "VJ-A110",
    ),
    flight(
      "VJ_AFTER",
      "VJ120",
      "HAN",
      "SGN",
      "2026-04-28T03:45:00Z",
      "2026-04-28T05:45:00Z",
      "VJ-A120",
    ),
  ];

  it("flags flights departing within the listed window AND the reopen buffer", () => {
    const impacted = findImpactedFlights(close, schedule, RULES_WITH_BUFFER);
    const ids = impacted.map((i) => i.flight.flight_id);
    expect(ids).toContain("VJ_INSIDE");
    expect(ids).toContain("VJ_BUFFER");
    expect(ids).not.toContain("VJ_AFTER");
  });

  it("flags only flights inside the listed window when buffer is disabled", () => {
    const impacted = findImpactedFlights(close, schedule, RULES_NO_ENFORCE);
    const ids = impacted.map((i) => i.flight.flight_id);
    expect(ids).toContain("VJ_INSIDE");
    expect(ids).not.toContain("VJ_BUFFER"); // buffer not applied
    expect(ids).not.toContain("VJ_AFTER");
  });

  it("flags only flights inside the listed window when buffer is 0", () => {
    const impacted = findImpactedFlights(close, schedule, RULES_ZERO_BUFFER);
    const ids = impacted.map((i) => i.flight.flight_id);
    expect(ids).toContain("VJ_INSIDE");
    expect(ids).not.toContain("VJ_BUFFER");
    expect(ids).not.toContain("VJ_AFTER");
  });

  it("buffer-window flights are tagged with a reopen-buffer reason code", () => {
    const impacted = findImpactedFlights(close, schedule, RULES_WITH_BUFFER);
    const buffer = impacted.find((i) => i.flight.flight_id === "VJ_BUFFER");
    expect(buffer).toBeDefined();
    expect(
      buffer!.reason_codes.some((r) => /reopen buffer/i.test(r)),
    ).toBe(true);
    const inside = impacted.find((i) => i.flight.flight_id === "VJ_INSIDE");
    expect(inside).toBeDefined();
    expect(
      inside!.reason_codes.some((r) => /reopen buffer/i.test(r)),
    ).toBe(false);
  });

  it("legacy callers without rules see only the listed window (backward compat)", () => {
    const impacted = findImpactedFlights(close, schedule);
    const ids = impacted.map((i) => i.flight.flight_id);
    expect(ids).toContain("VJ_INSIDE");
    expect(ids).not.toContain("VJ_BUFFER"); // no rules ⇒ no buffer
  });
});

describe("simulateDelayOnly — buffer pushes recovery delay further out", () => {
  const close: DisruptionEvent = {
    event_id: "EVT-CLOSE-DAD",
    event_type: "AIRPORT_CLOSE",
    start_time: new Date("2026-04-28T01:00:00Z"),
    end_time: new Date("2026-04-28T03:00:00Z"),
    severity: "HIGH",
    description: "DAD closed for runway works",
    affected_aircraft: null,
    affected_airport: "DAD",
    affected_flight_id: null,
  };

  // VJ_DAD lands at DAD at 02:30Z (inside window) — needs to be delayed past
  // the reopen end. With buffer=30, recovery STD ≥ 03:30Z + minTurn(40) = 04:10Z.
  // Without buffer, recovery STD ≥ 03:00Z + 40 = 03:40Z.
  const schedule: FlightLeg[] = [
    flight(
      "VJ_DAD",
      "VJ500",
      "SGN",
      "DAD",
      "2026-04-28T01:00:00Z",
      "2026-04-28T02:30:00Z",
    ),
  ];

  it("delay-only adds the buffer to required STD when configured", () => {
    const impacted = findImpactedFlights(close, schedule, RULES_WITH_BUFFER);
    expect(impacted.length).toBe(1);
    const opt = simulateDelayOnly(
      impacted,
      close,
      schedule,
      RULES_WITH_BUFFER,
    );
    const change = opt.flight_changes.find((c) => c.flight_id === "VJ_DAD");
    expect(change).toBeDefined();
    // Recovery STD should be at least 03:30Z (buffered end) + 40 min turn = 04:10Z.
    expect(change!.new_std.toISOString()).toBe("2026-04-28T04:10:00.000Z");
  });

  it("delay-only uses listed end_time when buffer disabled", () => {
    const impacted = findImpactedFlights(close, schedule, RULES_NO_ENFORCE);
    const opt = simulateDelayOnly(
      impacted,
      close,
      schedule,
      RULES_NO_ENFORCE,
    );
    const change = opt.flight_changes.find((c) => c.flight_id === "VJ_DAD");
    expect(change).toBeDefined();
    // No buffer ⇒ recovery STD = 03:00Z + 40 min turn = 03:40Z.
    expect(change!.new_std.toISOString()).toBe("2026-04-28T03:40:00.000Z");
  });
});
