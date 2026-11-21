import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/admin/ethn-staff-server";
import Sales from "./sales";
export const dynamic = "force-dynamic";
export default async function SalesPage() {
  try {
    const staff = await getCurrentStaff();
    return <Sales isOwner={staff.role === "owner"} />;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login?next=/admin/sales");
    if (error instanceof Error && error.message === "FORBIDDEN") return <div role="alert">Staff access is not enabled for this account.</div>;
    return <div role="alert">Sales are unavailable. Please try again later.</div>;
  }
}
