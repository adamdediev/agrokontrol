import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isConfigured = Boolean(url && key);

export const supabase: SupabaseClient = createClient(url || "http://localhost:54321", key || "missing", {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "ak.auth" },
});

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
