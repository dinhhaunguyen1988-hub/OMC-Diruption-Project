import type { RecoveryOption } from "@/lib/types";

export function exportOptionAsCsv(option: RecoveryOption) {
  const header = [
    "flight_id",
    "flight_number",
    "original_aircraft",
    "new_aircraft",
    "original_std",
    "new_std",
    "original_sta",
    "new_sta",
    "delay_minutes",
    "change_reason",
  ];
  const rows = option.flight_changes.map((c) => [
    c.flight_id,
    c.flight_number,
    c.original_aircraft,
    c.new_aircraft,
    c.original_std.toISOString(),
    c.new_std.toISOString(),
    c.original_sta.toISOString(),
    c.new_sta.toISOString(),
    String(c.delay_minutes),
    c.reason,
  ]);
  const csv = [header, ...rows]
    .map((r) =>
      r
        .map((v) => (v.includes(",") ? `"${v.replace(/"/g, '""')}"` : v))
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `aims_upload_${option.option_id}.csv`);
}

export function exportOptionAsJson(option: RecoveryOption) {
  const payload = {
    approved_by: "OCC_USER",
    approved_time: new Date().toISOString(),
    option,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  triggerDownload(blob, `audit_${option.option_id}.json`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
