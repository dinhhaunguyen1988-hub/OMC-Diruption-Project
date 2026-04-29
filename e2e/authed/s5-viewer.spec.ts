import { expect, test } from "@playwright/test";

/**
 * UAT scenario S5 — Viewer least-privilege.
 *
 * A viewer-role profile must:
 *   - read schedule/aircraft/disruption (everyone authenticated can read)
 *   - NOT see Save / Approve / "Save to Supabase" buttons anywhere
 *
 * Stub mode incidentally also hides those buttons (no session) — that's
 * covered by e2e/s1-aog.spec.ts. This spec proves the gating works for a
 * REAL authenticated viewer session, which is the actual security posture.
 *
 * Skipped unless E2E_SUPABASE=1 + Supabase env + UAT viewer creds.
 * Required env: E2E_VIEWER_EMAIL, E2E_VIEWER_PASSWORD.
 */

const RUN_AUTH = process.env.E2E_SUPABASE === "1";
test.skip(!RUN_AUTH, "Set E2E_SUPABASE=1 + Supabase creds to run auth-gated specs");

test("UAT S5 — viewer cannot see write actions in any dashboard page", async ({
  page,
}) => {
  const email = process.env.E2E_VIEWER_EMAIL!;
  const password = process.env.E2E_VIEWER_PASSWORD!;

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Sidebar shows the role badge so we can confirm we're truly logged in as viewer.
  await expect(page.getByText(/VIEWER/i)).toBeVisible();

  // Data page: Save to Supabase button must not exist.
  await page.goto("/dashboard/data");
  await expect(page.getByRole("heading", { name: /Data import/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Save to Supabase/i }),
  ).toHaveCount(0);

  // Simulate page: run sim, ensure neither Save simulation nor Approve render.
  await page.goto("/dashboard/simulate");
  const runButton = page.getByRole("button", { name: /^Run simulation$/ });
  await expect(runButton).toBeEnabled({ timeout: 10_000 });
  await runButton.click();
  await expect(
    page.getByRole("heading", { name: /Ranked recovery options/i }),
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: /Save simulation/i }),
  ).toHaveCount(0);
  // Open the top option to surface the OptionDetail panel (Approve lives there).
  await page.locator("text=#1").first().click();
  await expect(page.getByRole("button", { name: /^Approve$/i })).toHaveCount(0);
});
