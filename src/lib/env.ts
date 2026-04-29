import { z } from "zod";

/**
 * Centralised, validated access to public env vars.
 *
 * `NEXT_PUBLIC_*` vars are inlined at build-time by Next.js. Reading them via
 * a single typed helper means:
 *   - We catch malformed URLs at module-load time (with a clear error).
 *   - We expose `isSupabaseConfigured` as a single source of truth instead
 *     of the `Boolean(url && key)` check sprinkled across server/client.
 *   - Tests can mock `process.env` and re-import this module to assert
 *     stub-mode behaviour deterministically.
 *
 * Empty string is treated identically to `undefined` (i.e. "stub mode") so
 * the dev container + Playwright runner can both opt out of real Supabase
 * by setting the var to "".
 */

const trimmedNonEmpty = z
  .string()
  .trim()
  .min(1)
  .transform((v) => v);

const optionalUrl = z
  .union([trimmedNonEmpty.pipe(z.url()), z.literal(""), z.undefined()])
  .transform((v) => (v === undefined || v === "" ? null : v));

const optionalString = z
  .union([trimmedNonEmpty, z.literal(""), z.undefined()])
  .transform((v) => (v === undefined || v === "" ? null : v));

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

function readRawEnv(): Record<string, string | undefined> {
  // Next.js inlines `process.env.NEXT_PUBLIC_X` at build-time. Referencing
  // each var by its full literal name (rather than a dynamic key) is what
  // triggers that inlining, so do NOT replace these with `process.env[name]`.
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function parsePublicEnv(
  source: Record<string, string | undefined> = readRawEnv(),
): PublicEnv {
  const parsed = publicEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid public env vars:\n${issues}\n` +
        `Set the variables in .env.local (real Supabase) or leave empty for stub mode.`,
    );
  }
  return parsed.data;
}

let cached: PublicEnv | null = null;
export function publicEnv(): PublicEnv {
  if (!cached) cached = parsePublicEnv();
  return cached;
}

/** Mostly for tests — clear the cached parse so a re-import isn't needed. */
export function resetPublicEnvCache(): void {
  cached = null;
}

export function isSupabaseConfiguredFrom(env: PublicEnv): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function supabaseCreds(): { url: string; anonKey: string } {
  const env = publicEnv();
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
}

export function isSupabaseConfigured(): boolean {
  return isSupabaseConfiguredFrom(publicEnv());
}
