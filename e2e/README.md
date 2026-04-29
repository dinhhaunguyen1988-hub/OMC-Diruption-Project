# E2E tests (Playwright)

End-to-end tests for OCC Disruption Recovery web. Sprint 9 / P0 — covers the
UAT plan scenarios so engine + UI regressions are caught before merge.

## Layout

| Folder | What it covers | Runs in CI? |
|---|---|---|
| `e2e/` | Stub-mode flows (no Supabase). Engine, UI, navigation. | ✅ yes |
| `e2e/authed/` | Auth-gated flows (Save, Approve, Audit). | ❌ skip-by-default; opt-in via `E2E_SUPABASE=1` + valid env |

## Run locally

```bash
# Build once + run stub-mode E2E
npm run build
npm run e2e

# Headed mode for debugging
npm run e2e -- --headed

# Specific spec
npm run e2e -- s1-aog
```

The `webServer` block in `playwright.config.ts` boots `next start` on port
3000 with empty Supabase env vars (forces stub mode). It reuses an existing
server in dev so you can `npm run dev` in another terminal and skip the boot.

## Run with real Supabase (auth specs)

Provision a UAT Supabase project, run `supabase/migrations/0001_init.sql`
plus `0002_curfew_and_multi_event.sql`, seed UAT users via
`docs/uat/uat_seed.sql`, then:

```bash
export NEXT_PUBLIC_SUPABASE_URL="https://<your-project>.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
export E2E_SUPABASE=1
export E2E_CONTROLLER_EMAIL="uat-controller@vietjet.com"
export E2E_CONTROLLER_PASSWORD="<password>"
npm run e2e
```

## Mapping to UAT plan

| UAT scenario (docs/UAT_PLAN.md) | Spec file | Status |
|---|---|---|
| S1 — Controller AOG rapid response | `e2e/s1-aog.spec.ts` (stub) + `e2e/authed/s1-aog-authed.spec.ts` | ✅ stub; ⏳ authed |
| S2 — Multi-event with curfew | (todo, Sprint 9 follow-up) | ⏳ |
| S3 — Compare 2 options | `e2e/s3-compare.spec.ts` | ✅ |
| S4 — Supervisor audit | (auth-gated, todo) | ⏳ |
| S5 — Viewer least-privilege | (auth-gated, todo) | ⏳ |
| S6 — CSV upload error handling | (todo) | ⏳ |
| S7 — Timezone display sanity | (todo) | ⏳ |
