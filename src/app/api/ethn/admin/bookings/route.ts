import { searchEthnBookings } from "@/lib/admin/ethn-booking-read";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return adminResponse(await searchEthnBookings(staffPool, verifyStaffIdentity, new URL(request.url).searchParams)); }
  catch (error) { return adminError(error); }
}
