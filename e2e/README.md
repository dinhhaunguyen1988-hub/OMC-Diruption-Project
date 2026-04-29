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

| UAT scenario (docs/UAT_PLAN.md) | Spec file(s) | Stub CI | Authed |
|---|---|---|---|
| S1 — Controller AOG rapid response | `e2e/s1-aog.spec.ts`, `e2e/authed/s1-aog-authed.spec.ts` | ✅ | ✅ skip-by-default |
| S2 — Multi-event recovery (K10) | `e2e/s2-multi-event.spec.ts`, `e2e/authed/s2-multi-event-authed.spec.ts` | ✅ | ✅ skip-by-default |
| S3 — Compare 2 options | `e2e/s3-compare.spec.ts` | ✅ | n/a |
| S4 — Supervisor audit | `e2e/authed/s4-supervisor.spec.ts` | n/a (requires real audit data) | ✅ skip-by-default |
| S5 — Viewer least-privilege | `e2e/authed/s5-viewer.spec.ts` | partly via S1#4 (no-session) | ✅ skip-by-default |
| S6 — CSV upload error handling | `e2e/s6-broken-csv.spec.ts` | ✅ | n/a |
| S7 — Timezone display sanity | `e2e/s7-timezone.spec.ts` | ✅ | n/a |

### Curfew note

The default rules YAML configures curfews only for PQC/VCL/VCS, while the
sample schedules route between SGN/HAN/DAD. So the curfew badge never lights
up against bundled samples. Curfew correctness is covered by unit tests in
`src/lib/engine/__tests__/time-utils.test.ts`. To exercise the badge end-to-end,
provide a custom rules YAML that includes a curfew at one of the sample
airports (e.g. add SGN 22:00–05:00) and a disruption that pushes a movement
into that window — left as a Sprint 9 polish follow-up.

### Auth env vars

For `e2e/authed/*` specs, set the role-specific creds in addition to
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`E2E_SUPABASE=1`:

| Spec | Env vars |
|---|---|
| `s1-aog-authed`, `s2-multi-event-authed` | `E2E_CONTROLLER_EMAIL`, `E2E_CONTROLLER_PASSWORD` |
| `s4-supervisor` | `E2E_SUPERVISOR_EMAIL`, `E2E_SUPERVISOR_PASSWORD` |
| `s5-viewer` | `E2E_VIEWER_EMAIL`, `E2E_VIEWER_PASSWORD` |
