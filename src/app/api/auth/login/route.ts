import * as Sentry from "@sentry/nextjs";
import { LaneError, err } from "@/lib/booking/errors";
import { createClient } from "@/lib/supabase/server";
import { isDeactivated } from "@/lib/admin/session";
import { getStaff } from "@/lib/admin/ethn-payments";
import { staffPool } from "@/lib/admin/ethn-staff-server";
import { loginBodySchema } from "@/lib/admin/validation";

export const runtime = "nodejs";

// Sign-in verifies current ETHN staff access, not legacy editable client input.
// Failed authorization/configuration signs the newly created session back out.
export async function POST(request: Request) {
  try {
    const parsed = loginBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error || !data.user) {
      const banned = /banned/i.test(error?.message ?? "");
      return err(
        banned ? "DEACTIVATED" : "INVALID_CREDENTIALS",
        banned ? "This account is deactivated." : "Invalid email or password.",
        banned ? 403 : 401,
      );
    }
    const user = data.user;
    if (isDeactivated(user)) {
      await supabase.auth.signOut();
      return err("DEACTIVATED", "This account is deactivated.", 403);
    }
    try {
      await getStaff(staffPool, async () => user.id);
    } catch (error) {
      await supabase.auth.signOut();
      if (error instanceof Error && error.message === "FORBIDDEN") {
        return err("FORBIDDEN", "This account does not have staff access.", 403);
      }
      return err("NOT_CONFIGURED", "Staff sign-in is unavailable.", 503);
    }
    const meta = (user.user_metadata ?? {}) as { full_name?: unknown };
    return Response.json({
      ok: true,
      email: user.email,
      name: typeof meta.full_name === "string" ? meta.full_name : null,
    });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("login failed", e);
    Sentry.captureException(e);
    return err("INTERNAL", "Sign-in failed.", 500);
  }
}
