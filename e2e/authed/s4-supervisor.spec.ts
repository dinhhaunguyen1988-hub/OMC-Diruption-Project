import { expect, test } from "@playwright/test";

/**
 * UAT scenario S4 — Supervisor reviews audit log.
 *
 * Skipped unless E2E_SUPABASE=1 + Supabase env + UAT supervisor (admin) creds.
 * Required env (in addition to NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY):
 *   E2E_SUPERVISOR_EMAIL
 *   E2E_SUPERVISOR_PASSWORD
 */

const RUN_AUTH = process.env.E2E_SUPABASE === "1";
test.skip(!RUN_AUTH, "Set E2E_SUPABASE=1 + Supabase creds to run auth-gated specs");

test("UAT S4 — supervisor sees audit rows + activity feed", async ({ page }) => {
  const email = process.env.E2E_SUPERVISOR_EMAIL!;
  const password = process.env.E2E_SUPERVISOR_PASSWORD!;

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Sidebar should expose the Audit page (admin and controller can both reach it).
  await page.goto("/dashboard/audit");
  await expect(
    page.getByRole("heading", { name: /Audit/i }).first(),
  ).toBeVisible();

  // Two panels: Saved simulations + Activity feed. We don't assume the UAT
  // database is non-empty; just verify both panels render headers.
  await expect(page.getByText(/Saved simulations/i)).toBeVisible();
  await expect(page.getByText(/Activity/i)).toBeVisible();

  // The page links out to Supabase dashboard for deeper inspection.
  await expect(
    page.getByRole("link", { name: /Supabase/i }),
  ).toBeVisible();
});
