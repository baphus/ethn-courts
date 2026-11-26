import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/admin/ethn-staff-server";
import OwnerAccessManager from "./owner-access-manager";

export const dynamic = "force-dynamic";

export default async function OwnerAccessPage() {
  try {
    const staff = await getCurrentStaff();
    if (staff.role !== "owner") return <div role="alert">Owner access is required.</div>;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login?next=/admin/owner-access");
    if (error instanceof Error && error.message === "FORBIDDEN") return <div role="alert">Owner access is not enabled for this account.</div>;
    return <div role="alert">Owner access services are unavailable. Please try again later.</div>;
  }
  return <OwnerAccessManager />;
}
