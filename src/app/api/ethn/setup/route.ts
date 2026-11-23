import { adminResponse, staffPool } from "@/lib/admin/ethn-staff-server";
import { checkSetupKey, createFirstOwner } from "@/lib/admin/ethn-setup";
import { createOwnerAccount, setupAvailable } from "@/lib/admin/ethn-setup-server";
import { readAdminJson } from "@/lib/admin/ethn-json";
import { hasValidOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return adminResponse({ available: await setupAvailable() }); }
  catch { return adminResponse({ error: "SETUP_UNAVAILABLE" }, 503); }
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try {
    const body = await readAdminJson(request, 4096);
    checkSetupKey(process.env.ETHN_SETUP_KEY, body && typeof body === "object" && "setupKey" in body ? body.setupKey : undefined);
    if (!await setupAvailable()) return adminResponse({ error: "SETUP_CLOSED" }, 409);
    return adminResponse(await createFirstOwner(staffPool, createOwnerAccount, process.env.ETHN_SETUP_KEY, body), 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = code === "INVALID_INPUT" ? 400 : code === "INVALID_SETUP_KEY" ? 403 : code === "SETUP_CLOSED" ? 409 : code === "ACCOUNT_UNAVAILABLE" ? 409 : 503;
    return adminResponse({ error: status === 503 ? "SETUP_UNAVAILABLE" : code }, status);
  }
}
