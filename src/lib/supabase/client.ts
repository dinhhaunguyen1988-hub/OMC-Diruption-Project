"use client";

import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabaseCreds } from "@/lib/env";

export function createSupabaseBrowserClient() {
  const { url, anonKey } = supabaseCreds();
  return createBrowserClient(url, anonKey);
}

export function isSupabaseConfiguredBrowser(): boolean {
  return isSupabaseConfigured();
}
