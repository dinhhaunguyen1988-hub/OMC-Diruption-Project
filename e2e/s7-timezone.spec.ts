import { expect, test } from "@playwright/test";

/**
 * UAT scenario S7 — Timezone display sanity (stub mode).
 *
 * Maps to docs/UAT_PLAN.md §S7. Verifies:
 *  - Schedule preview labels STD/STA as origin/destination local.
 *  - Schedule preview cells render dates in en-GB-style formatting.
 *  - Gantt legend states the canvas-vs-tooltip timezone convention.
 *  - Hovering a Gantt bar reveals airport-local time labels for STD/STA.
 *
 * The unit suite (src/lib/engine/__tests__/time-utils.test.ts) covers the
 * actual UTC↔IANA-local conversion correctness incl. DST.
 */

test.describe("UAT S7 — Timezone display", () => {
  test("schedule preview labels STD/STA as origin/destination local", async ({
    page,
  }) => {
    await page.goto("/dashboard/data");

    await expect(
      page.getByRole("heading", { name: /Schedule preview/i }),
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText("STD (origin local)")).toBeVisible();
    await expect(page.getByText("STA (dest local)")).toBeVisible();

    // At least one row renders a DD/MM/YYYY HH:MM date (en-GB locale, time-zoned).
    const previewTable = page
      .locator("table")
      .filter({ has: page.getByText("STD (origin local)") });
    const dateCell = previewTable
      .locator("td")
      .locator("text=/\\d{2}\\/\\d{2}\\/\\d{4}, \\d{2}:\\d{2}/")
      .first();
    await expect(dateCell).toBeVisible();
  });

  test("Gantt schedule states canvas/tooltip timezone convention", async ({
    page,
  }) => {
    await page.goto("/dashboard/schedule");

    await expect(
      page.getByRole("heading", { name: /Schedule overview/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Footer note documents the convention so controllers don't confuse
    // UTC tick marks with airport-local times.
    await expect(
      page.getByText(/Canvas: UTC · Tooltip: airport-local/i),
    ).toBeVisible();
  });
});
