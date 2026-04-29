import { describe, expect, it } from "vitest";
import {
  isSupabaseConfiguredFrom,
  parsePublicEnv,
} from "../env";

describe("parsePublicEnv", () => {
  it("treats undefined as null (stub mode)", () => {
    const env = parsePublicEnv({});
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeNull();
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeNull();
    expect(isSupabaseConfiguredFrom(env)).toBe(false);
  });

  it("treats empty string as null (stub mode)", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeNull();
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeNull();
    expect(isSupabaseConfiguredFrom(env)).toBe(false);
  });

  it("accepts a valid Supabase URL + key (real mode)", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGc.payload.signature",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abc.supabase.co");
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(
      "eyJhbGc.payload.signature",
    );
    expect(isSupabaseConfiguredFrom(env)).toBe(true);
  });

  it("trims whitespace around the URL", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "  https://abc.supabase.co  ",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "key",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abc.supabase.co");
  });

  it("rejects a malformed URL with a clear message", () => {
    expect(() =>
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "key",
      }),
    ).toThrow(/Invalid public env vars/);
  });

  it("isSupabaseConfiguredFrom returns false if either var is null", () => {
    expect(
      isSupabaseConfiguredFrom(
        parsePublicEnv({
          NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        }),
      ),
    ).toBe(false);
    expect(
      isSupabaseConfiguredFrom(
        parsePublicEnv({
          NEXT_PUBLIC_SUPABASE_URL: "",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "key",
        }),
      ),
    ).toBe(false);
  });
});
