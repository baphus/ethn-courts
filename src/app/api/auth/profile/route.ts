import { adminError, adminResponse, getCurrentStaff, staffPool } from "@/lib/admin/ethn-staff-server";
import { profilePatchSchema } from "@/lib/admin/validation";
import { hasValidOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    return adminResponse(await getCurrentStaff());
  } catch (error) {
    return adminError(error);
  }
}

export async function PATCH(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);

  try {
    const staff = await getCurrentStaff();
    const parsed = profilePatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return adminResponse({ error: { message: "Enter a display name of 1–100 characters. Only the display name can be changed." } }, 400);
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ data: { full_name: parsed.data.name } });
    if (error) return adminResponse({ error: { message: "Could not update your display name." } }, 503);

    try {
      const client = await staffPool.connect();
      try {
        await client.query("INSERT INTO ethn.audit(actor,action,detail) VALUES ($1,'admin_profile.update','{}'::jsonb)", [staff.userId]);
      } finally {
        client.release();
      }
    } catch {
      // Best effort: Auth already saved the display name.
    }
    return adminResponse({ ok: true, name: parsed.data.name });
  } catch (error) {
    return adminError(error);
  }
}
