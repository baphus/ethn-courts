import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isDeactivated } from "@/lib/admin/session";
import { getCheckoutPool } from "@/db/checkout-client";
import { getStaff } from "@/lib/admin/ethn-payments";

export async function verifyStaffIdentity(): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error("NOT_CONFIGURED");
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getClaims();
    const sub = error ? undefined : data?.claims?.sub;
    if (typeof sub !== "string") return null;
    const result = await client.auth.getUser();
    const user = result.data.user;
    return !result.error && user && user.id === sub && !isDeactivated(user) ? user.id : null;
  } catch { return null; }
}

export const staffPool = { connect: () => getCheckoutPool().connect() };

export async function getCurrentStaff() {
  return getStaff(staffPool, verifyStaffIdentity);
}

export function adminResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

export function adminError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "INVALID_INPUT" ? 400 : 503;
  return adminResponse({ error: status === 503 ? "Service unavailable" : code }, status);
}
