import { describe, expect, it } from "vitest";
import {
  findSwapChains,
  generateRecoveryOptions,
  rankRecoveryOptions,
  runSimulation,
} from "@/lib/engine";
import { findImpactedFlights } from "@/lib/engine/impact-detector";
import { getDefaultRules } from "@/lib/parsers/rules";
import type {
  Aircraft,
  DisruptionEvent,
  FlightLeg,
  OccRules,
} from "@/lib/types";

const RULES: OccRules = getDefaultRules();

/**
 * Scenario:
 *   - VJ-A321 is AOG and was supposed to fly VJ101 SGN→HAN at 01:00Z.
 *   - VJ-A322 is at SGN, ACTIVE, compatible — but it is already scheduled to
 *     fly VJ200 SGN→DAD at the same window. So it is NOT a SINGLE_SWAP cand.
 *   - VJ-A323 is at SGN, ACTIVE, compatible, idle — it can take over VJ200.
 *   ⇒ Depth-2 chain: VJ-A322 takes VJ101, VJ-A323 takes VJ200.
 */
const TARGET: FlightLeg = {
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
};

const BLOCKING: FlightLeg = {
  flight_id: "VJ200-D1",
  flight_number: "VJ200",
  origin: "SGN",
  destination: "DAD",
  std: new Date("2026-04-28T01:30:00Z"),
  sta: new Date("2026-04-28T02:45:00Z"),
  aircraft_id: "VJ-A322",
  aircraft_type: "A321",
  priority_level: 3,
  load_factor: 0.6,
  is_international: false,
  is_last_flight_of_day: false,
};

const CHAIN_SCHEDULE: FlightLeg[] = [TARGET, BLOCKING];

const CHAIN_AIRCRAFT: Aircraft[] = [
  {
    aircraft_id: "VJ-A321",
    aircraft_type: "A321",
    current_station: "SGN",
    available_from: new Date("2026-04-28T00:00:00Z"),
    status: "AOG",
    next_maintenance_time: null,
    restriction: null,
  },
  {
    aircraft_id: "VJ-A322",
    aircraft_type: "A321",
    current_station: "SGN",
    available_from: new Date("2026-04-28T00:00:00Z"),
    status: "ACTIVE",
    next_maintenance_time: null,
    restriction: null,
  },
  {
    aircraft_id: "VJ-A323",
    aircraft_type: "A321",
    current_station: "SGN",
    available_from: new Date("2026-04-28T00:00:00Z"),
    status: "ACTIVE",
    next_maintenance_time: null,
    restriction: null,
  },
];

const CHAIN_AOG: DisruptionEvent = {
  event_id: "EVT-AOG-CHAIN",
  event_type: "AOG",
  start_time: new Date("2026-04-28T00:30:00Z"),
  end_time: new Date("2026-04-28T03:30:00Z"),
  severity: "HIGH",
  description: "Hydraulic failure",
  affected_aircraft: "VJ-A321",
  affected_airport: null,
  affected_flight_id: null,
};

describe("findSwapChains (depth-2)", () => {
  it("finds a chain when SINGLE_SWAP is blocked but a sub-swap exists", () => {
    const chains = findSwapChains(
      TARGET,
      CHAIN_AIRCRAFT,
      CHAIN_SCHEDULE,
      RULES,
    );
    expect(chains.length).toBeGreaterThan(0);

    const first = chains[0];
    expect(first.links).toHaveLength(2);
    expect(first.links[0].new_aircraft.aircraft_id).toBe("VJ-A322");
    expect(first.links[1].new_aircraft.aircraft_id).toBe("VJ-A323");
    expect(first.aircraft_changes).toEqual({
      "VJ-A321": "VJ-A322",
      "VJ-A322": "VJ-A323",
    });
  });

  it("returns no chains when no sub-swap aircraft is available", () => {
    // Remove VJ-A323 — VJ-A322 is still blocked, no chain helper exists.
    const chains = findSwapChains(
      TARGET,
      CHAIN_AIRCRAFT.filter((a) => a.aircraft_id !== "VJ-A323"),
      CHAIN_SCHEDULE,
      RULES,
    );
    expect(chains).toEqual([]);
  });

  it("returns no chains when the only candidate is fully idle (use SINGLE_SWAP instead)", () => {
    // Remove the BLOCKING flight so VJ-A322 is idle ⇒ direct swap, not chain.
    const chains = findSwapChains(
      TARGET,
      CHAIN_AIRCRAFT,
      [TARGET],
      RULES,
    );
    expect(chains).toEqual([]);
  });

  it("respects max_swap_chain_length: returns no chains when limit < 2", () => {
    const tightRules: OccRules = {
      ...RULES,
      aircraft_rules: { ...RULES.aircraft_rules, max_swap_chain_length: 1 },
    };
    const chains = findSwapChains(
      TARGET,
      CHAIN_AIRCRAFT,
      CHAIN_SCHEDULE,
      tightRules,
    );
    expect(chains).toEqual([]);
  });
});

describe("generateRecoveryOptions — SWAP_CHAIN integration", () => {
  it("emits a SWAP_CHAIN option in the recovery option set", () => {
    const impacted = findImpactedFlights(CHAIN_AOG, CHAIN_SCHEDULE, RULES);
    const opts = generateRecoveryOptions(
      impacted,
      CHAIN_AOG,
      CHAIN_SCHEDULE,
      CHAIN_AIRCRAFT,
      RULES,
    );
    const types = opts.map((o) => o.option_type);
    expect(types).toContain("SWAP_CHAIN");
  });

  it("SWAP_CHAIN option carries swap_count = 2 and chain reason codes", () => {
    const impacted = findImpactedFlights(CHAIN_AOG, CHAIN_SCHEDULE, RULES);
    const opts = generateRecoveryOptions(
      impacted,
      CHAIN_AOG,
      CHAIN_SCHEDULE,
      CHAIN_AIRCRAFT,
      RULES,
    );
    const chain = opts.find((o) => o.option_type === "SWAP_CHAIN");
    expect(chain).toBeDefined();
    expect(chain!.swap_count).toBe(2);
    expect(chain!.aircraft_changes["VJ-A321"]).toBe("VJ-A322");
    expect(chain!.aircraft_changes["VJ-A322"]).toBe("VJ-A323");
    expect(chain!.reason_codes.some((r) => r.startsWith("Swap chain depth"))).toBe(
      true,
    );
  });

  it("ranking penalises SWAP_CHAIN above SINGLE_SWAP via swap_count", () => {
    // Add an idle 4th aircraft that gives SINGLE_SWAP feasibility too,
    // so both option types are produced and we can compare scores.
    const aircraftWithIdle: Aircraft[] = [
      ...CHAIN_AIRCRAFT,
      {
        aircraft_id: "VJ-A324",
        aircraft_type: "A321",
        current_station: "SGN",
        available_from: new Date("2026-04-28T00:00:00Z"),
        status: "ACTIVE",
        next_maintenance_time: null,
        restriction: null,
      },
    ];
    const result = runSimulation({
      schedule: CHAIN_SCHEDULE,
      aircraft: aircraftWithIdle,
      disruption: CHAIN_AOG,
      rules: RULES,
    });
    const single = result.ranked_options.find(
      (o) => o.option_type === "SINGLE_SWAP",
    );
    const chain = result.ranked_options.find(
      (o) => o.option_type === "SWAP_CHAIN",
    );
    expect(single).toBeDefined();
    expect(chain).toBeDefined();
    // swap_penalty = 25/swap, so chain (2 swaps) ≥ single (1 swap) by ≥ 25.
    expect(chain!.score).toBeGreaterThan(single!.score);
  });
});

describe("rankRecoveryOptions — SWAP_CHAIN scoring sanity", () => {
  it("score_breakdown.swap_component reflects 2 swaps for chain options", () => {
    const impacted = findImpactedFlights(CHAIN_AOG, CHAIN_SCHEDULE, RULES);
    const opts = generateRecoveryOptions(
      impacted,
      CHAIN_AOG,
      CHAIN_SCHEDULE,
      CHAIN_AIRCRAFT,
      RULES,
    );
    const ranked = rankRecoveryOptions(opts, RULES);
    const chain = ranked.find((o) => o.option_type === "SWAP_CHAIN");
    expect(chain).toBeDefined();
    const swapPenalty = RULES.score_weights.swap_penalty;
    expect(chain!.score_breakdown.swap_component).toBe(2 * swapPenalty);
  });
});
