import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/admin/ethn-staff-server";
import OwnerContact from "./owner-contact";

export default async function SettingsPage() {
  try {
    const staff = await getCurrentStaff();
    if (staff.role !== "owner") return <div role="alert">Owner access is required for settings.</div>;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login?next=/admin/settings");
    if (error instanceof Error && error.message === "FORBIDDEN") return <div role="alert">Owner access is not enabled for this account.</div>;
    return <div role="alert">Settings are unavailable. Please try again later.</div>;
  }
  return <><OwnerContact /><a className="text-sm font-semibold text-primary underline" href="/admin/payment-instructions">Manage payment instructions</a></>;
}
