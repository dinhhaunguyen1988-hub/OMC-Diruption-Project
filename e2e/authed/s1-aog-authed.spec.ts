import { expect, test } from "@playwright/test";

/**
 * UAT scenario S1 — Controller AOG rapid-response, AUTH-GATED steps.
 *
 * Maps to docs/UAT_PLAN.md §S1 steps 1, 3, 7, 8, 9.
 *
 * Skipped by default. To run:
 *   1. Provision a UAT Supabase project (run migrations + uat_seed.sql).
 *   2. Export the env vars below.
 *   3. Set E2E_SUPABASE=1.
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   E2E_CONTROLLER_EMAIL
 *   E2E_CONTROLLER_PASSWORD
 */

const RUN_AUTH = process.env.E2E_SUPABASE === "1";

test.skip(!RUN_AUTH, "Set E2E_SUPABASE=1 + Supabase creds to run auth-gated specs");

test.describe("UAT S1 — AOG rapid-response (authed)", () => {
  test("controller signs in, runs sim, saves, approves, sees audit row", async ({
    page,
  }) => {
    const email = process.env.E2E_CONTROLLER_EMAIL!;
    const password = process.env.E2E_CONTROLLER_PASSWORD!;

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText(/CONTROLLER|ADMIN/)).toBeVisible();

    // Run a sim (sample auto-loaded).
    await page.goto("/dashboard/simulate");
    const runButton = page.getByRole("button", { name: /Run simulation$/ });
    await expect(runButton).toBeEnabled();
    await runButton.click();
    await expect(
      page.getByRole("heading", { name: /Ranked recovery options/i }),
    ).toBeVisible();

    // Save the simulation.
    const saveBtn = page.getByRole("button", { name: /Save simulation/i });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect(page.getByText(/Simulation saved/i)).toBeVisible({
      timeout: 15_000,
    });

    // Approve the top option.
    await page.locator("text=#1").first().click();
    const approveBtn = page.getByRole("button", { name: /^Approve$/i });
    await expect(approveBtn).toBeEnabled();
    await approveBtn.click();
    await expect(page.getByText(/approved/i)).toBeVisible();

    // Audit page reflects the activity.
    await page.goto("/dashboard/audit");
    await expect(
      page.getByRole("heading", { name: /Audit log/i }),
    ).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText(/SIMULATE|APPROVE/i).first()).toBeVisible();
  });
});
