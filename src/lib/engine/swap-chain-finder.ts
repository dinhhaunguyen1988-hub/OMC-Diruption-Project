import type {
  Aircraft,
  CandidateAircraft,
  FlightLeg,
  OccRules,
  RiskLevel,
} from "@/lib/types";
import { findCandidateAircraft } from "./candidate-finder";
import { addMinutes, minTurnaroundForType, overlaps } from "./time-utils";

/**
 * A 2-link swap chain.
 *
 *   target_flight  →  [link 0 aircraft] takes target_flight (was assigned to its owner)
 *   link 0's blocking flight  →  [link 1 aircraft] takes link 0's blocking flight
 *
 * `aircraft_changes` mirrors the shape used in `RecoveryOption.aircraft_changes`:
 * a map from the original aircraft id to the new aircraft id. For depth-2 the
 * map has exactly two entries.
 */
export interface SwapChain {
  links: Array<{
    target_flight: FlightLeg;
    new_aircraft: Aircraft;
    /** Risk inherited from the candidate-finder result for this link. */
    risk_level: RiskLevel;
    /** Reason codes from the candidate-finder result for this link. */
    reason_codes: string[];
  }>;
  aircraft_changes: Record<string, string>;
  /** LOW < MEDIUM < HIGH; the chain inherits the worst link risk. */
  combined_risk: RiskLevel;
}

const RISK_ORDER: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function worseRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

/**
 * Find aircraft that are *almost* feasible for `target` — same type, at the
 * right station, available in time — but blocked by exactly one conflicting
 * flight already assigned to them. These are the candidates for the first
 * link of a swap chain.
 *
 * Returns `{ aircraft, blockingFlight }` so the caller can recurse into
 * `findCandidateAircraft(blockingFlight, …)` to fill the second link.
 */
function findChainStarters(
  target: FlightLeg,
  aircraftList: Aircraft[],
  schedule: FlightLeg[],
  rules: OccRules,
): Array<{
  aircraft: Aircraft;
  blockingFlight: FlightLeg;
  reason_codes: string[];
  risk_level: RiskLevel;
}> {
  const starters: Array<{
    aircraft: Aircraft;
    blockingFlight: FlightLeg;
    reason_codes: string[];
    risk_level: RiskLevel;
  }> = [];

  const minTurn = minTurnaroundForType(target.aircraft_type, rules);
  const requiredAvailableTime = addMinutes(target.std, -minTurn);

  for (const ac of aircraftList) {
    if (ac.aircraft_id === target.aircraft_id) continue;
    if (ac.status.toUpperCase() !== "ACTIVE") continue;

    // Same compatibility checks as findCandidateAircraft, except we
    // *expect* a single schedule conflict.
    const compat = rules.aircraft_rules?.compatible_types ?? {};
    const allowed = compat[target.aircraft_type] ?? [target.aircraft_type];
    if (!allowed.includes(ac.aircraft_type)) continue;
    if (ac.current_station !== target.origin) continue;
    if (ac.available_from > requiredAvailableTime) continue;
    if (ac.next_maintenance_time && target.sta > ac.next_maintenance_time) {
      continue;
    }

    const conflicts = schedule.filter(
      (f) =>
        f.aircraft_id === ac.aircraft_id &&
        overlaps(f.std, f.sta, target.std, target.sta),
    );

    // Exactly one conflict ⇒ the chain only needs to free one link.
    // Multiple conflicts would require depth-3+ which we defer.
    if (conflicts.length !== 1) continue;

    const blocking = conflicts[0];
    starters.push({
      aircraft: ac,
      blockingFlight: blocking,
      reason_codes: [
        `Aircraft ${ac.aircraft_id} would cover target ${target.flight_number}` +
          ` if its existing assignment ${blocking.flight_number} is re-assigned`,
      ],
      risk_level: ac.restriction ? "MEDIUM" : "LOW",
    });
  }

  return starters;
}

/**
 * Generate up to `maxChains` depth-2 swap chains for `target`.
 *
 * Algorithm:
 *   1. For each `starter` aircraft S whose only blocker is flight F_b:
 *   2.   Find a feasible candidate aircraft C for F_b (recursive single-link
 *        search via `findCandidateAircraft`), excluding S itself and any
 *        aircraft already used elsewhere in the chain.
 *   3.   Emit the chain { S takes target, C takes F_b }.
 *
 * Honours `rules.aircraft_rules.max_swap_chain_length` (default 3) — if the
 * limit is < 2 we return no chains at all (caller falls back to SINGLE_SWAP /
 * delay options).
 */
export function findSwapChains(
  target: FlightLeg,
  aircraftList: Aircraft[],
  schedule: FlightLeg[],
  rules: OccRules,
  maxChains = 3,
): SwapChain[] {
  const limit = rules.aircraft_rules?.max_swap_chain_length ?? 3;
  if (limit < 2) return [];

  const starters = findChainStarters(target, aircraftList, schedule, rules);
  if (starters.length === 0) return [];

  const chains: SwapChain[] = [];
  for (const starter of starters) {
    if (chains.length >= maxChains) break;

    const otherAircraft = aircraftList.filter(
      (a) =>
        a.aircraft_id !== starter.aircraft.aircraft_id &&
        a.aircraft_id !== target.aircraft_id,
    );

    const link2Candidates = findCandidateAircraft(
      starter.blockingFlight,
      otherAircraft,
      schedule,
      rules,
    ).filter((c: CandidateAircraft) => c.feasible);

    if (link2Candidates.length === 0) continue;
    const link2 = link2Candidates[0]; // best by ranking inside candidate-finder

    const chain: SwapChain = {
      links: [
        {
          target_flight: target,
          new_aircraft: starter.aircraft,
          risk_level: starter.risk_level,
          reason_codes: starter.reason_codes,
        },
        {
          target_flight: starter.blockingFlight,
          new_aircraft: link2.aircraft,
          risk_level: link2.risk_level,
          reason_codes: link2.reason_codes,
        },
      ],
      aircraft_changes: {
        [target.aircraft_id]: starter.aircraft.aircraft_id,
        [starter.blockingFlight.aircraft_id]: link2.aircraft.aircraft_id,
      },
      combined_risk: worseRisk(starter.risk_level, link2.risk_level),
    };
    chains.push(chain);
  }

  return chains;
}
