import { expect, test } from "@playwright/test";

/**
 * UAT S2 auth-gated tail — save the multi-event simulation + approve top option.
 *
 * Skipped unless E2E_SUPABASE=1 + Supabase env + UAT controller creds are set.
 * See e2e/README.md for setup.
 */

const RUN_AUTH = process.env.E2E_SUPABASE === "1";
test.skip(!RUN_AUTH, "Set E2E_SUPABASE=1 + Supabase creds to run auth-gated specs");

test("UAT S2 (authed) — controller saves multi-event sim + approves top option", async ({
  page,
}) => {
  const email = process.env.E2E_CONTROLLER_EMAIL!;
  const password = process.env.E2E_CONTROLLER_PASSWORD!;

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/dashboard/simulate");
  await expect(
    page.getByRole("button", { name: /^Run simulation$/ }),
  ).toBeEnabled();

  await page.getByRole("button", { name: /Add what-if event/i }).click();
  const eventTypeSelect = page.locator("select", {
    has: page.locator("option[value='AIRPORT_CLOSE']"),
  });
  await eventTypeSelect.selectOption("AIRPORT_CLOSE");
  await page.getByPlaceholder("HAN", { exact: true }).fill("HAN");
  await page
    .getByPlaceholder(/2026-04-28T09:00:00Z/)
    .fill("2026-04-28T07:00:00Z");
  await page
    .getByPlaceholder(/2026-04-28T19:00:00Z/)
    .fill("2026-04-28T10:00:00Z");
  await page.getByRole("button", { name: /^Add event$/ }).click();

  await page.getByRole("button", { name: /Run multi-event \(2\)/ }).click();
  await expect(
    page.getByRole("heading", { name: /Ranked recovery options/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Save simulation/i }).click();
  await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible({
    timeout: 15_000,
  });

  await page.locator("text=#1").first().click();
  await page.getByRole("button", { name: /^Approve$/i }).click();
  await expect(page.getByText(/APPROVED/)).toBeVisible();
});
