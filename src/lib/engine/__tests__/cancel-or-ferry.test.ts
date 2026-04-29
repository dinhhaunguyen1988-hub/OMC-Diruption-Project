import { describe, expect, it } from "vitest";
import {
  generateRecoveryOptions,
  rankRecoveryOptions,
  runSimulation,
  simulateCancelOrFerry,
} from "@/lib/engine";
import { findImpactedFlights } from "@/lib/engine/impact-detector";
import { getDefaultRules } from "@/lib/parsers/rules";
import type {
  Aircraft,
  DisruptionEvent,
  FlightLeg,
  ImpactedFlight,
  OccRules,
} from "@/lib/types";

const RULES: OccRules = getDefaultRules();

/**
 * Rotation:
 *   VJ-A321 flies VJ101 SGN→HAN, then VJ102 HAN→SGN, then VJ103 SGN→PQC.
 *   AOG starts mid-VJ101 ⇒ VJ101+VJ102+VJ103 are impacted.
 *
 * For CANCEL_OR_FERRY: cancelling all three legs leaves the rotation
 * exhausted, so no ferry leg is needed (no surviving downstream leg).
 *
 * For the ferry test we use a separate rotation where the *middle* legs are
 * impacted but a later leg from a *different origin* survives — that
 * survivor needs a ferry to resume.
 */
const SCHEDULE: FlightLeg[] = [
  {
    flight_id: "VJ101-D1",
    flight_number: "VJ101",
    origin: "SGN",
    destination: "HAN",
    std: new Date("2026-04-28T01:00:00Z"),
    sta: new Date("2026-04-28T03:00:00Z"),
    aircraft_id: "VJ-A321",
    aircraft_type: "A321",
    priority_level: 2,
    load_factor: 0.85,
    is_international: false,
    is_last_flight_of_day: false,
  },
  {
    flight_id: "VJ102-D1",
    flight_number: "VJ102",
    origin: "HAN",
    destination: "SGN",
    std: new Date("2026-04-28T04:00:00Z"),
    sta: new Date("2026-04-28T06:00:00Z"),
    aircraft_id: "VJ-A321",
    aircraft_type: "A321",
    priority_level: 2,
    load_factor: 0.78,
    is_international: false,
    is_last_flight_of_day: false,
  },
  {
    flight_id: "VJ103-D1",
    flight_number: "VJ103",
    origin: "SGN",
    destination: "PQC",
    std: new Date("2026-04-28T12:00:00Z"),
    sta: new Date("2026-04-28T13:30:00Z"),
    aircraft_id: "VJ-A321",
    aircraft_type: "A321",
    priority_level: 3,
    load_factor: 0.6,
    is_international: false,
    is_last_flight_of_day: true,
  },
];

const AIRCRAFT: Aircraft[] = [
  {
    aircraft_id: "VJ-A321",
    aircraft_type: "A321",
    current_station: "SGN",
    available_from: new Date("2026-04-28T00:00:00Z"),
    status: "AOG",
    next_maintenance_time: null,
    restriction: null,
  },
];

const AOG: DisruptionEvent = {
  event_id: "EVT-AOG",
  event_type: "AOG",
  start_time: new Date("2026-04-28T01:30:00Z"),
  end_time: new Date("2026-04-28T03:30:00Z"),
  severity: "HIGH",
  description: "Hydraulic failure",
  affected_aircraft: "VJ-A321",
  affected_airport: null,
  affected_flight_id: null,
};

describe("simulateCancelOrFerry — basic cancellation", () => {
  it("returns null when no flights are impacted", () => {
    const result = simulateCancelOrFerry([], AOG, SCHEDULE, AIRCRAFT, RULES);
    expect(result).toBeNull();
  });

  it("emits a CANCEL_OR_FERRY option with one CANCELLED change per impacted flight", () => {
    const impacted = findImpactedFlights(AOG, SCHEDULE, RULES);
    expect(impacted.length).toBeGreaterThan(0);
    const result = simulateCancelOrFerry(
      impacted,
      AOG,
      SCHEDULE,
      AIRCRAFT,
      RULES,
    );
    expect(result).not.toBeNull();
    expect(result!.option_type).toBe("CANCEL_OR_FERRY");
    expect(result!.risk_level).toBe("HIGH");
    const cancelled = result!.flight_changes.filter(
      (c) => c.status === "CANCELLED",
    );
    expect(cancelled).toHaveLength(impacted.length);
    for (const c of cancelled) {
      expect(c.delay_minutes).toBe(0);
      expect(c.reason).toMatch(/Cancel/i);
    }
  });

  it("uses zero swaps and zero delay (cancellation drops legs entirely)", () => {
    const impacted = findImpactedFlights(AOG, SCHEDULE, RULES);
    const result = simulateCancelOrFerry(
      impacted,
      AOG,
      SCHEDULE,
      AIRCRAFT,
      RULES,
    )!;
    expect(result.swap_count).toBe(0);
    expect(result.total_delay_minutes).toBe(0);
    expect(result.aircraft_changes).toEqual({});
  });
});

describe("simulateCancelOrFerry — ferry detection", () => {
  /**
   * Rotation:
   *   VJ200  SGN→DAD  (cancelled — impacted; aircraft stays at SGN, never took off)
   *   VJ201  HAN→SGN  (later, not impacted) ← origin HAN ≠ SGN ⇒ needs ferry SGN→HAN
   * Ferry leg should be inserted between them so the tail can rejoin its
   * rotation at HAN.
   */
  const FERRY_SCHEDULE: FlightLeg[] = [
    {
      flight_id: "VJ200-D1",
      flight_number: "VJ200",
      origin: "SGN",
      destination: "DAD",
      std: new Date("2026-04-28T01:00:00Z"),
      sta: new Date("2026-04-28T02:30:00Z"),
      aircraft_id: "VJ-A330",
      aircraft_type: "A321",
      priority_level: 2,
      load_factor: 0.7,
      is_international: false,
      is_last_flight_of_day: false,
    },
    {
      flight_id: "VJ201-D1",
      flight_number: "VJ201",
      origin: "HAN",
      destination: "SGN",
      std: new Date("2026-04-28T08:00:00Z"),
      sta: new Date("2026-04-28T10:00:00Z"),
      aircraft_id: "VJ-A330",
      aircraft_type: "A321",
      priority_level: 2,
      load_factor: 0.65,
      is_international: false,
      is_last_flight_of_day: false,
    },
  ];

  const FERRY_AIRCRAFT: Aircraft[] = [
    {
      aircraft_id: "VJ-A330",
      aircraft_type: "A321",
      current_station: "SGN",
      available_from: new Date("2026-04-28T00:00:00Z"),
      status: "AOG",
      next_maintenance_time: null,
      restriction: null,
    },
  ];

  // Manually build an impacted list that ONLY includes VJ200, leaving VJ201
  // surviving downstream so the ferry detector has a target.
  const FERRY_IMPACTED: ImpactedFlight[] = [
    {
      flight: FERRY_SCHEDULE[0],
      reason_codes: ["Direct AOG impact"],
    },
  ];

  it("inserts a ferry leg when a surviving downstream leg has a different origin", () => {
    const result = simulateCancelOrFerry(
      FERRY_IMPACTED,
      AOG,
      FERRY_SCHEDULE,
      FERRY_AIRCRAFT,
      RULES,
    )!;
    const ferries = result.flight_changes.filter((c) => c.status === "FERRY");
    expect(ferries).toHaveLength(1);
    const ferry = ferries[0];
    // Aircraft never took off for VJ200 ⇒ stays at SGN ⇒ ferry SGN → HAN
    expect(ferry.origin).toBe("SGN");
    expect(ferry.destination).toBe("HAN");
    expect(ferry.flight_number).toMatch(/^FY/);
  });

  it("does not insert a ferry when surviving leg shares origin with last cancellation", () => {
    // Replace VJ201's origin with SGN (= last cancelled leg's origin) ⇒ no ferry needed.
    const noFerrySchedule = [...FERRY_SCHEDULE];
    noFerrySchedule[1] = { ...FERRY_SCHEDULE[1], origin: "SGN" };
    const result = simulateCancelOrFerry(
      FERRY_IMPACTED,
      AOG,
      noFerrySchedule,
      FERRY_AIRCRAFT,
      RULES,
    )!;
    const ferries = result.flight_changes.filter((c) => c.status === "FERRY");
    expect(ferries).toHaveLength(0);
  });
});

describe("CANCEL_OR_FERRY — recovery option set integration & ranking", () => {
  it("is always present in the option set when flights are impacted", () => {
    const impacted = findImpactedFlights(AOG, SCHEDULE, RULES);
    const opts = generateRecoveryOptions(impacted, AOG, SCHEDULE, AIRCRAFT, RULES);
    const types = opts.map((o) => o.option_type);
    expect(types).toContain("CANCEL_OR_FERRY");
  });

  it("ranks worst (highest score) when any delay/swap option is feasible", () => {
    // Add an idle compatible aircraft so SINGLE_SWAP is feasible too.
    const aircraftWithIdle: Aircraft[] = [
      ...AIRCRAFT,
      {
        aircraft_id: "VJ-A322",
        aircraft_type: "A321",
        current_station: "SGN",
        available_from: new Date("2026-04-28T00:00:00Z"),
        status: "ACTIVE",
        next_maintenance_time: null,
        restriction: null,
      },
    ];
    const result = runSimulation({
      schedule: SCHEDULE,
      aircraft: aircraftWithIdle,
      disruption: AOG,
      rules: RULES,
    });
    const cancel = result.ranked_options.find(
      (o) => o.option_type === "CANCEL_OR_FERRY",
    );
    const others = result.ranked_options.filter(
      (o) => o.option_type !== "CANCEL_OR_FERRY",
    );
    expect(cancel).toBeDefined();
    expect(others.length).toBeGreaterThan(0);
    for (const o of others) {
      expect(o.score).toBeLessThan(cancel!.score);
    }
    // Also: it should never be Recommended when alternatives exist.
    expect(cancel!.recommendation).not.toBe("Recommended");
  });

  it("score_breakdown.cancellation_component reflects cancellation_penalty × cancelled count", () => {
    const impacted = findImpactedFlights(AOG, SCHEDULE, RULES);
    const opts = generateRecoveryOptions(impacted, AOG, SCHEDULE, AIRCRAFT, RULES);
    const ranked = rankRecoveryOptions(opts, RULES);
    const cancel = ranked.find((o) => o.option_type === "CANCEL_OR_FERRY")!;
    const cancelledCount = cancel.flight_changes.filter(
      (c) => c.status === "CANCELLED",
    ).length;
    expect(cancelledCount).toBe(impacted.length);
    // Default cancellation_penalty is 200 (rules.score_weights.cancellation_penalty
    // is undefined in default sample YAML).
    const expectedComponent =
      cancelledCount * (RULES.score_weights.cancellation_penalty ?? 200);
    expect(cancel.score_breakdown.cancellation_component).toBe(expectedComponent);
  });

  it("respects custom cancellation_penalty when provided in rules", () => {
    const impacted = findImpactedFlights(AOG, SCHEDULE, RULES);
    const customRules: OccRules = {
      ...RULES,
      score_weights: { ...RULES.score_weights, cancellation_penalty: 500 },
    };
    const opts = generateRecoveryOptions(
      impacted,
      AOG,
      SCHEDULE,
      AIRCRAFT,
      customRules,
    );
    const ranked = rankRecoveryOptions(opts, customRules);
    const cancel = ranked.find((o) => o.option_type === "CANCEL_OR_FERRY")!;
    const cancelledCount = cancel.flight_changes.filter(
      (c) => c.status === "CANCELLED",
    ).length;
    expect(cancel.score_breakdown.cancellation_component).toBe(
      cancelledCount * 500,
    );
  });
});
