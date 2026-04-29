import type {
  Aircraft,
  CandidateAircraft,
  DisruptionEvent,
  FlightChange,
  FlightLeg,
  ImpactedFlight,
  OccRules,
  RecoveryOption,
} from "@/lib/types";
import { findCandidateAircraft } from "./candidate-finder";
import { simulateCancelOrFerry } from "./cancel-or-ferry";
import {
  simulateDeepDelay,
  simulateDelayOnly,
  simulateSpreadDelay,
} from "./delay-simulator";
import { findSwapChains, type SwapChain } from "./swap-chain-finder";

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/**
 * Bug fix K4: single-swap re-rotates the impacted rotation onto the new aircraft
 * starting from the target leg, so the orphan downstream legs of the impacted
 * tail are also covered (best-effort: same station, no conflict).
 */
function createSingleSwapOption(
  target: FlightLeg,
  candidate: CandidateAircraft,
  schedule: FlightLeg[],
): RecoveryOption {
  const downstream = schedule
    .filter(
      (f) =>
        f.aircraft_id === target.aircraft_id &&
        f.std.getTime() >= target.std.getTime(),
    )
    .sort((a, b) => a.std.getTime() - b.std.getTime());

  const newAcId = candidate.aircraft.aircraft_id;
  const candidateConflicts = new Set(
    schedule
      .filter((f) => f.aircraft_id === newAcId)
      .map((f) => f.flight_id),
  );

  const flightChanges: FlightChange[] = [];
  for (const flight of downstream) {
    if (candidateConflicts.has(flight.flight_id)) continue;
    flightChanges.push({
      flight_id: flight.flight_id,
      flight_number: flight.flight_number,
      origin: flight.origin,
      destination: flight.destination,
      original_aircraft: flight.aircraft_id,
      new_aircraft: newAcId,
      original_std: flight.std,
      original_sta: flight.sta,
      new_std: flight.std,
      new_sta: flight.sta,
      delay_minutes: 0,
      reason:
        flight.flight_id === target.flight_id
          ? "Single aircraft swap (target leg)"
          : "Re-rotate downstream leg onto swap aircraft",
    });
  }

  const option: RecoveryOption = {
    option_id: randomId("OPT-SWAP"),
    option_type: "SINGLE_SWAP",
    flight_changes: flightChanges,
    aircraft_changes: { [target.aircraft_id]: newAcId },
    total_delay_minutes: 0,
    max_delay_minutes: 0,
    impacted_flight_count: flightChanges.length,
    swap_count: 1,
    curfew_violations: 0,
    risk_level: candidate.risk_level,
    score: 0,
    rank: null,
    recommendation: "",
    reason_codes: [
      `Swap target flight ${target.flight_number} (and downstream rotation) from ${target.aircraft_id} to ${newAcId}`,
      ...candidate.reason_codes,
    ],
    score_breakdown: {},
  };
  return option;
}

/**
 * Build a SWAP_CHAIN option from a depth-2 chain. Each link re-rotates the
 * downstream legs of the impacted aircraft onto the new aircraft (best-effort,
 * skipping conflicts) — same approach as `createSingleSwapOption` but applied
 * twice and merged.
 */
function createSwapChainOption(
  target: FlightLeg,
  chain: SwapChain,
  schedule: FlightLeg[],
): RecoveryOption {
  const flightChanges: FlightChange[] = [];
  const reasonCodes: string[] = [
    `Swap chain depth ${chain.links.length}: cover ${target.flight_number} via re-assignment`,
  ];

  for (const link of chain.links) {
    const oldAcId = link.target_flight.aircraft_id;
    const newAcId = link.new_aircraft.aircraft_id;

    const downstream = schedule
      .filter(
        (f) =>
          f.aircraft_id === oldAcId &&
          f.std.getTime() >= link.target_flight.std.getTime(),
      )
      .sort((a, b) => a.std.getTime() - b.std.getTime());

    const candidateConflicts = new Set(
      schedule.filter((f) => f.aircraft_id === newAcId).map((f) => f.flight_id),
    );

    for (const flight of downstream) {
      if (candidateConflicts.has(flight.flight_id)) continue;
      // If a previous link already produced a change for this flight, skip
      // (chain links can overlap rotations when target & blocker share tail).
      if (flightChanges.some((c) => c.flight_id === flight.flight_id)) continue;
      flightChanges.push({
        flight_id: flight.flight_id,
        flight_number: flight.flight_number,
        origin: flight.origin,
        destination: flight.destination,
        original_aircraft: flight.aircraft_id,
        new_aircraft: newAcId,
        original_std: flight.std,
        original_sta: flight.sta,
        new_std: flight.std,
        new_sta: flight.sta,
        delay_minutes: 0,
        reason:
          flight.flight_id === link.target_flight.flight_id
            ? `Chain link: ${oldAcId} → ${newAcId} for ${flight.flight_number}`
            : `Re-rotate downstream leg onto ${newAcId}`,
      });
    }

    reasonCodes.push(
      `Link: ${oldAcId} → ${newAcId} covers ${link.target_flight.flight_number}`,
      ...link.reason_codes,
    );
  }

  return {
    option_id: randomId("OPT-CHAIN"),
    option_type: "SWAP_CHAIN",
    flight_changes: flightChanges,
    aircraft_changes: chain.aircraft_changes,
    total_delay_minutes: 0,
    max_delay_minutes: 0,
    impacted_flight_count: flightChanges.length,
    swap_count: Object.keys(chain.aircraft_changes).length,
    curfew_violations: 0,
    risk_level: chain.combined_risk,
    score: 0,
    rank: null,
    recommendation: "",
    reason_codes: reasonCodes,
    score_breakdown: {},
  };
}

export function generateRecoveryOptions(
  impacted: ImpactedFlight[],
  disruption: DisruptionEvent,
  schedule: FlightLeg[],
  aircraftList: Aircraft[],
  rules: OccRules,
): RecoveryOption[] {
  if (!impacted.length) return [];
  const options: RecoveryOption[] = [];
  options.push(simulateDelayOnly(impacted, disruption, schedule, rules));
  options.push(simulateSpreadDelay(impacted, disruption, schedule, rules));
  options.push(simulateDeepDelay(impacted, disruption, schedule, rules));

  const target = [...impacted]
    .map((i) => i.flight)
    .sort((a, b) => a.std.getTime() - b.std.getTime())[0];
  const candidates = findCandidateAircraft(target, aircraftList, schedule, rules);
  const feasibleCandidates = candidates.filter((c) => c.feasible).slice(0, 3);
  for (const candidate of feasibleCandidates) {
    options.push(createSingleSwapOption(target, candidate, schedule));
  }

  // Sprint 10 P1: SWAP_CHAIN — depth-2 chains when no aircraft is directly
  // available but one would be after a sub-swap. Scoring naturally penalises
  // higher swap_count via `swap_penalty`, so chains rank below SINGLE_SWAP
  // when both are feasible.
  const chains = findSwapChains(target, aircraftList, schedule, rules);
  for (const chain of chains) {
    options.push(createSwapChainOption(target, chain, schedule));
  }

  // Sprint 10 P1: CANCEL_OR_FERRY — always-feasible last-resort baseline.
  // Heavy `cancellation_penalty` (200/flight by default) ensures it ranks
  // worst whenever any delay/swap/chain option is feasible.
  const cancelOption = simulateCancelOrFerry(
    impacted,
    disruption,
    schedule,
    aircraftList,
    rules,
  );
  if (cancelOption) options.push(cancelOption);

  return options;
}
