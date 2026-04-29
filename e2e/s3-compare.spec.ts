import { expect, test } from "@playwright/test";

/**
 * UAT scenario S3 — Compare 2 recovery options (stub mode).
 *
 * Maps to docs/UAT_PLAN.md §S3. Compare uses sessionStorage so stub mode is
 * sufficient — no Supabase required.
 */

test("UAT S3 — selects 2 ranked options, opens compare page, sees Δ table", async ({
  page,
}) => {
  await page.goto("/dashboard/simulate");
  const runButton = page.getByRole("button", { name: /Run simulation$/ });
  await expect(runButton).toBeEnabled({ timeout: 10_000 });
  await runButton.click();

  await expect(
    page.getByRole("heading", { name: /Ranked recovery options/i }),
  ).toBeVisible();

  const checkboxes = page.getByRole("checkbox", { name: /Add to compare/i });
  await expect(checkboxes.first()).toBeVisible();
  const total = await checkboxes.count();
  expect(total).toBeGreaterThanOrEqual(2);

  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();

  await expect(page.getByText(/Compare 2\/2 selected/)).toBeVisible();

  const openCompare = page.getByRole("button", { name: /Open compare/i });
  await expect(openCompare).toBeEnabled();
  await openCompare.click();

  await expect(page).toHaveURL(/\/dashboard\/compare/);
  await expect(
    page.getByRole("heading", { name: /Compare 2 recovery options/i }),
  ).toBeVisible();
});
