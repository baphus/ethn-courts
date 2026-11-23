import "server-only";
import { createClient } from "@supabase/supabase-js";
import { firstOwnerAvailable } from "./ethn-setup";
import { staffPool } from "./ethn-staff-server";

function setupAuth() {
  const url = process.env.ETHN_STORAGE_URL, key = process.env.ETHN_STORAGE_SERVICE_ROLE_KEY;
  if (!url || !key || url.replace(/\/$/, "") !== process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.ETHN_SETUP_KEY || process.env.ETHN_SETUP_KEY.length < 32) throw new Error("SETUP_UNAVAILABLE");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function setupAvailable() {
  setupAuth();
  return firstOwnerAvailable(staffPool);
}

export async function createOwnerAccount(email: string, password: string) {
  const auth = setupAuth();
  const { data, error } = await auth.auth.admin.createUser({ email, password, email_confirm: true });
  if (!error && data.user) return data.user.id;
  // Retry can recover an Auth account left behind by a failed SQL transaction.
  const existing = await auth.auth.signInWithPassword({ email, password });
  if (existing.error || !existing.data.user || existing.data.user.app_metadata?.disabled === true) throw new Error("ACCOUNT_UNAVAILABLE");
  return existing.data.user.id;
}
