import "server-only";
import { createClient as createAuthClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isDeactivated, nameOf } from "@/lib/admin/session";
import { getCheckoutPool } from "@/db/checkout-client";
import { getStaff } from "@/lib/admin/ethn-payments";

async function getVerifiedStaffUser() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error("NOT_CONFIGURED");
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getClaims();
    const sub = error ? undefined : data?.claims?.sub;
    if (typeof sub !== "string") return null;
    const result = await client.auth.getUser();
    const user = result.data.user;
    return !result.error && user && user.id === sub && !isDeactivated(user) ? user : null;
  } catch { return null; }
}

export async function verifyStaffIdentity(): Promise<string | null> {
  return (await getVerifiedStaffUser())?.id ?? null;
}

// Auth admin uses the same ETHN project as private Storage; no separate config.
async function getAuthUser(userId: string) {
  const url = process.env.ETHN_STORAGE_URL, key = process.env.ETHN_STORAGE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("STAFF_UNAVAILABLE");
  const { data, error } = await createAuthClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin.getUserById(userId);
  if (data?.user) return data.user;
  if (!error || error.status === 404 || error.code === "user_not_found") return null;
  throw new Error("STAFF_UNAVAILABLE");
}

export async function getStaffNotificationEmail(userId: string): Promise<string | null> {
  const user = await getAuthUser(userId);
  return user?.email_confirmed_at && !isDeactivated(user) ? user.email ?? null : null;
}

export async function authUserExists(userId: string): Promise<boolean> {
  return !!(await getAuthUser(userId));
}

export const staffPool = { connect: () => getCheckoutPool().connect() };

export async function getCurrentStaff() {
  const user = await getVerifiedStaffUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  const staff = await getStaff(staffPool, async () => user.id);
  return { ...staff, email: user.email ?? "", name: nameOf(user) };
}

export function adminResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

export function adminError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "INVALID_INPUT" ? 400 : code === "IDEMPOTENCY_MISMATCH" ? 409 : code === "FINANCE_UNAVAILABLE" || code === "SALES_UNAVAILABLE" ? 503 : code === "CORRECTION_CONFLICT" ? 409 : code === "COURT_NOT_FOUND" || code === "BLOCK_NOT_FOUND" || code === "EXPENSE_NOT_FOUND" ? 404 : ["STALE_CORRECTION", "EXPENSE_HAS_CORRECTIONS"].includes(code) ? 409 : code === "SLOT_TAKEN" ? 409 : 503;
  return adminResponse({ error: status === 503 ? "Service unavailable" : code }, status);
}
