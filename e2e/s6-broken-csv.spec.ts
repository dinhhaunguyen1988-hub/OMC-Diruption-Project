import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * UAT scenario S6 — CSV/Excel ingestion error handling (stub mode).
 *
 * Maps to docs/UAT_PLAN.md §S6. Uploads `public/uat/uat_scenario_broken_schedule.csv`
 * which deliberately includes:
 *   - row 3: lowercase IATA "sgn" (should be uppercased / flagged)
 *   - row 4: invalid datetime "not-a-date"
 *   - row 5: STD after STA (logical inversion)
 *   - row 6: priority_level = "not-a-number"
 *
 * Verifies the Issues panel surfaces these per-row defects without crashing.
 */

const BROKEN_CSV = path.resolve(
  __dirname,
  "..",
  "public",
  "uat",
  "uat_scenario_broken_schedule.csv",
);

test("UAT S6 — broken schedule CSV surfaces parser issues with row numbers", async ({
  page,
}) => {
  await page.goto("/dashboard/data");

  // The Schedule Uploader has a hidden <input type="file"> attached to the
  // Schedule card. The first matching file input on the page belongs to
  // Schedule (uploader order: Schedule, Aircraft, Disruption).
  const scheduleInput = page.locator("input[type='file']").nth(0);
  await scheduleInput.setInputFiles(BROKEN_CSV);

  // The Issues panel renders a header `Schedule file` with error/warning chips.
  const issuesPanel = page
    .locator("div", {
      has: page.getByRole("heading", { name: /^Schedule file$/i }),
    })
    .first();
  await expect(issuesPanel).toBeVisible({ timeout: 10_000 });

  // At least one error chip should appear (we expect 2-3 from the broken file).
  const errorChip = issuesPanel.locator("text=/\\d+ errors?/").first();
  await expect(errorChip).toBeVisible();

  const errorChipText = (await errorChip.textContent()) ?? "";
  const errorCount = Number(errorChipText.match(/(\d+)/)?.[1] ?? "0");
  expect(errorCount).toBeGreaterThanOrEqual(1);

  // Issues list mentions specific row numbers (rows 4–6 in the broken file
  // contain bad values; row indices are 1-based in the parser output).
  const rowMarkers = issuesPanel.locator("text=/^row \\d+$/");
  const markerCount = await rowMarkers.count();
  expect(markerCount).toBeGreaterThanOrEqual(1);

  // The hasErrors flag also disables the Save to Supabase button — but only
  // when canWrite is true (i.e. controller session). In stub mode that button
  // doesn't render at all, so we just assert the panel itself is visible
  // above and stop here.
});
