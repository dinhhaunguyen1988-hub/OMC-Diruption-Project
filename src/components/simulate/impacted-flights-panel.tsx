"use client";

import { GanttSchedule } from "@/components/gantt-schedule";
import type {
  Aircraft,
  FlightLeg,
  ImpactedFlight,
} from "@/lib/types";

export function ImpactedFlightsPanel({
  schedule,
  aircraft,
  impacted,
  highlightAircraft,
}: {
  schedule: FlightLeg[];
  aircraft: Aircraft[];
  impacted: ImpactedFlight[];
  highlightAircraft: string | null;
}) {
  // aircraft is a forwarded prop in case Gantt needs it later; today's
  // GanttSchedule only takes schedule + impacted + highlight, but we keep the
  // signature symmetrical with what the simulate page already had so future
  // additions don't have to thread a new prop through.
  void aircraft;

  return (
    <div className="rounded-lg border border-border p-4">
      <h2 className="font-semibold">
        Impacted flights ({impacted.length})
      </h2>
      <div className="mt-3">
        <GanttSchedule
          schedule={schedule}
          impacted={impacted}
          highlightAircraft={highlightAircraft}
        />
      </div>
      <ul className="mt-3 text-sm space-y-1">
        {impacted.map((f) => (
          <li
            key={f.flight.flight_id}
            className="font-mono text-xs text-zinc-600 dark:text-zinc-400"
          >
            {f.flight.flight_number} {f.flight.origin}-
            {f.flight.destination} {f.flight.aircraft_id} —{" "}
            {f.reason_codes[0]}
          </li>
        ))}
      </ul>
    </div>
  );
}
