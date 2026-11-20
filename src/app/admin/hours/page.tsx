import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/admin/ethn-staff-server";
import HoursEditor from "./hours-editor";

export default async function HoursPage() {
  try {
    const staff = await getCurrentStaff();
    if (staff.role !== "owner") return <div role="alert">Owner access is required for court hours.</div>;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login?next=/admin/hours");
    if (error instanceof Error && error.message === "FORBIDDEN") return <div role="alert">Owner access is not enabled for this account.</div>;
    return <div role="alert">Hours are unavailable. Please try again later.</div>;
  }
  return <HoursEditor />;
}
