import { expect, test } from "@playwright/test";

/**
 * UAT scenario S2 — Multi-event recovery (K10), stub-mode subset.
 *
 * Maps to docs/UAT_PLAN.md §S2. The save + approve steps live in
 * e2e/authed/s2-multi-event-authed.spec.ts. This spec covers the parts that
 * don't require Supabase: build a what-if event, run multi-event simulation,
 * and assert the engine produced ranked options across the combined window.
 *
 * Curfew badge assertion is intentionally skipped in stub mode because the
 * default rules YAML configures curfews only for PQC/VCL/VCS, while the AOG
 * sample schedule routes between SGN/HAN/DAD. Curfew correctness is covered
 * by unit tests in src/lib/engine/__tests__/time-utils.test.ts.
 */

test.describe("UAT S2 — Multi-event recovery (stub mode)", () => {
  test("adds a what-if AIRPORT_CLOSE and runs multi-event simulation", async ({
    page,
  }) => {
    await page.goto("/dashboard/simulate");

    // Auto-load primes the AOG primary event; Run button gates on schedule + disruption.
    const runButton = page.getByRole("button", { name: /^Run simulation$/ });
    await expect(runButton).toBeEnabled({ timeout: 10_000 });

    // Open the what-if form.
    await page.getByRole("button", { name: /Add what-if event/i }).click();

    // Form has dropdowns for type and severity, plus airport/start/end inputs.
    // Labels are not associated via htmlFor, so locate by <option> contents.
    const eventTypeSelect = page.locator("select", {
      has: page.locator("option[value='AIRPORT_CLOSE']"),
    });
    await eventTypeSelect.selectOption("AIRPORT_CLOSE");

    await page.getByPlaceholder("HAN", { exact: true }).fill("HAN");

    // Use a window that overlaps the primary AOG window (05:10–09:00).
    await page
      .getByPlaceholder(/2026-04-28T09:00:00Z/)
      .fill("2026-04-28T07:00:00Z");
    await page
      .getByPlaceholder(/2026-04-28T19:00:00Z/)
      .fill("2026-04-28T10:00:00Z");

    // Description is optional; placeholder is unique so we can target it
    // directly without a label association.
    await page
      .getByPlaceholder(/Thunderstorm cell over HAN/)
      .fill("E2E what-if: HAN ATC closure overlapping AOG window");

    await page.getByRole("button", { name: /^Add event$/ }).click();

    // The events list now shows PRIMARY + WHAT-IF.
    await expect(page.getByText(/PRIMARY ·/)).toBeVisible();
    await expect(page.getByText(/WHAT-IF ·/)).toBeVisible();

    // Run button label flips to multi-event when extras > 0.
    const multiRun = page.getByRole("button", { name: /Run multi-event \(2\)/ });
    await expect(multiRun).toBeEnabled();
    await multiRun.click();

    await expect(
      page.getByRole("heading", { name: /Impacted flights/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Ranked recovery options/i }),
    ).toBeVisible();

    // K10 multi-event simulation merges impacted flights from both events.
    // We don't assert exact counts (engine internals can shift) but require
    // at least one ranked option exists.
    const rankedHeading = page.getByRole("heading", {
      name: /Ranked recovery options \((\d+)\)/i,
    });
    const headingText = (await rankedHeading.textContent()) ?? "";
    const match = headingText.match(/Ranked recovery options \((\d+)\)/i);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(1);
  });

  test("removes a what-if event and reverts Run button to single-event mode", async ({
    page,
  }) => {
    await page.goto("/dashboard/simulate");
    await expect(
      page.getByRole("button", { name: /^Run simulation$/ }),
    ).toBeEnabled({ timeout: 10_000 });

    await page.getByRole("button", { name: /Add what-if event/i }).click();
    const eventTypeSelect = page.locator("select", {
      has: page.locator("option[value='AIRPORT_CLOSE']"),
    });
    await eventTypeSelect.selectOption("AIRPORT_CLOSE");
    await page.getByPlaceholder("HAN", { exact: true }).fill("DAD");
    await page
      .getByPlaceholder(/2026-04-28T09:00:00Z/)
      .fill("2026-04-28T08:00:00Z");
    await page
      .getByPlaceholder(/2026-04-28T19:00:00Z/)
      .fill("2026-04-28T11:00:00Z");
    await page.getByRole("button", { name: /^Add event$/ }).click();

    await expect(page.getByText(/WHAT-IF ·/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Run multi-event \(2\)/ }),
    ).toBeVisible();

    // Remove the what-if and the Run button collapses back.
    await page.getByRole("button", { name: /^Remove$/ }).click();
    await expect(page.getByText(/WHAT-IF ·/)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Run simulation$/ }),
    ).toBeVisible();
  });
});
