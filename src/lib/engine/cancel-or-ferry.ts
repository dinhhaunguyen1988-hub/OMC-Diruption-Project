import type {
  Aircraft,
  DisruptionEvent,
  FlightChange,
  FlightLeg,
  ImpactedFlight,
  OccRules,
  RecoveryOption,
} from "@/lib/types";
import { addMinutes, minTurnaroundForType } from "./time-utils";

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/**
 * Build a "cancel impacted flights and (optionally) ferry to resume" change
 * for a single aircraft rotation.
 *
 * Logic per impacted aircraft tail:
 *   1. Every flight in the rotation that is in `impacted` is cancelled.
 *   2. The first downstream flight that is NOT in `impacted` AND whose origin
 *      differs from the last cancelled flight's *origin* gets a ferry leg
 *      added — the aircraft has to deadhead from where the last cancelled
 *      leg started to the next leg's origin.
 *      (If origin matches we don't need a ferry; the aircraft simply
 *      resumes the rotation in place.)
 */
function buildCancelChangesForAircraft(
  aircraftId: string,
  schedule: FlightLeg[],
  impactedIds: Set<string>,
  disruption: DisruptionEvent,
  rules: OccRules,
): FlightChange[] {
  const rotation = schedule
    .filter((f) => f.aircraft_id === aircraftId)
    .sort((a, b) => a.std.getTime() - b.std.getTime());

  const changes: FlightChange[] = [];
  let lastCancelledOrigin: string | null = null;
  let ferryEmitted = false;

  for (const flight of rotation) {
    if (impactedIds.has(flight.flight_id)) {
      // Cancel — keep the original aircraft on the change row so the UI can
      // still show "VJ-A321 cancelled VJ101" rather than a blank tail.
      changes.push({
        flight_id: flight.flight_id,
        flight_number: flight.flight_number,
        origin: flight.origin,
        destination: flight.destination,
        original_aircraft: flight.aircraft_id,
        new_aircraft: flight.aircraft_id,
        original_std: flight.std,
        original_sta: flight.sta,
        new_std: flight.std,
        new_sta: flight.sta,
        delay_minutes: 0,
        reason: "Cancel: impacted flight dropped (no recovery)",
        status: "CANCELLED",
      });
      lastCancelledOrigin = flight.origin;
      continue;
    }

    // Non-impacted downstream flight: do we need a ferry to resume?
    if (
      lastCancelledOrigin !== null &&
      !ferryEmitted &&
      flight.origin !== lastCancelledOrigin
    ) {
      const minTurn = minTurnaroundForType(flight.aircraft_type, rules);
      // Position the ferry leg so the aircraft arrives at `flight.origin` at
      // least `minTurn` before the resume flight's STD. The block time is a
      // best-effort approximation (ferry is shorter than passenger flight,
      // but engine has no flight-time table).
      const arriveBy = addMinutes(flight.std, -minTurn);
      const ferryDepart = Math.max(
        disruption.end_time.getTime(),
        addMinutes(arriveBy, -60).getTime(),
      );
      changes.push({
        flight_id: `FERRY-${aircraftId}-${flight.flight_id}`,
        flight_number: `FY${flight.flight_number}`,
        origin: lastCancelledOrigin,
        destination: flight.origin,
        original_aircraft: aircraftId,
        new_aircraft: aircraftId,
        original_std: new Date(ferryDepart),
        original_sta: arriveBy,
        new_std: new Date(ferryDepart),
        new_sta: arriveBy,
        delay_minutes: 0,
        reason: `Ferry: deadhead ${lastCancelledOrigin} → ${flight.origin} to resume rotation`,
        status: "FERRY",
      });
      ferryEmitted = true;
    }
  }

  return changes;
}

/**
 * Generate the always-feasible CANCEL_OR_FERRY recovery option.
 *
 * This is the "last resort" baseline. It cancels every impacted flight and
 * (optionally, per impacted aircraft) inserts a ferry leg so the aircraft
 * can rejoin its rotation at the next non-impacted flight. The scoring
 * cost is dominated by `cancellation_penalty * cancelled_count`, which is
 * deliberately set high enough (default 200/flight) that the option ranks
 * worst whenever any delay or swap option is feasible.
 *
 * Always returns a non-null option when `impacted` is non-empty — that is
 * the whole point of the type: cancellation is always available, even
 * when no aircraft can swap and delays would breach curfew.
 */
export function simulateCancelOrFerry(
  impacted: ImpactedFlight[],
  disruption: DisruptionEvent,
  schedule: FlightLeg[],
  _aircraftList: Aircraft[],
  rules: OccRules,
): RecoveryOption | null {
  if (!impacted.length) return null;

  const impactedIds = new Set(impacted.map((i) => i.flight.flight_id));
  const impactedAircraftIds = [
    ...new Set(impacted.map((i) => i.flight.aircraft_id)),
  ].sort();

  const changes: FlightChange[] = [];
  for (const acId of impactedAircraftIds) {
    changes.push(
      ...buildCancelChangesForAircraft(
        acId,
        schedule,
        impactedIds,
        disruption,
        rules,
      ),
    );
  }

  const cancelledCount = changes.filter((c) => c.status === "CANCELLED").length;
  const ferryCount = changes.filter((c) => c.status === "FERRY").length;

  const reasonCodes = [
    `Cancel ${cancelledCount} impacted flight${cancelledCount === 1 ? "" : "s"} — accept revenue loss as last resort`,
  ];
  if (ferryCount > 0) {
    reasonCodes.push(
      `Add ${ferryCount} ferry leg${ferryCount === 1 ? "" : "s"} so impacted aircraft can resume downstream rotation`,
    );
  }
  reasonCodes.push(
    "Always feasible — used when delay/swap options breach operational limits",
  );

  return {
    option_id: randomId("OPT-CANCEL"),
    option_type: "CANCEL_OR_FERRY",
    flight_changes: changes,
    aircraft_changes: {},
    total_delay_minutes: 0,
    max_delay_minutes: 0,
    impacted_flight_count: changes.length,
    swap_count: 0,
    curfew_violations: 0,
    risk_level: "HIGH",
    score: 0,
    rank: null,
    recommendation: "",
    reason_codes: reasonCodes,
    score_breakdown: {},
  };
}
