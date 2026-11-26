import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/admin/ethn-staff-server";
import ActivityLog from "./activity-log";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  try {
    const staff = await getCurrentStaff();
    if (staff.role !== "owner") return <div role="alert">Owner access is required for activity history.</div>;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login?next=/admin/activity");
    if (error instanceof Error && error.message === "FORBIDDEN") return <div role="alert">Owner access is not enabled for this account.</div>;
    return <div role="alert">Activity history is unavailable. Please try again later.</div>;
  }
  return <ActivityLog />;
}
