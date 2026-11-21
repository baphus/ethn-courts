import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/admin/ethn-staff-server";
import Finance from "./finance";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  try {
    const staff = await getCurrentStaff();
    if (staff.role !== "owner") return <div role="alert">Owner access is required for finance.</div>;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login?next=/admin/finance");
    if (error instanceof Error && error.message === "FORBIDDEN") return <div role="alert">Staff access is not enabled for this account.</div>;
    return <div role="alert">Finance is unavailable. Please try again later.</div>;
  }
  return <Finance />;
}
