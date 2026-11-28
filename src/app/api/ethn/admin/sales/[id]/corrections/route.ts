import { adminResponse } from "@/lib/admin/ethn-staff-server";

export function POST() {
  return adminResponse({ error: "SALE_CORRECTIONS_RETIRED" }, 410);
}
