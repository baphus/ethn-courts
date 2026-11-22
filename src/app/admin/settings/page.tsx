import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/admin/ethn-staff-server";
import OwnerPayment from "./owner-payment";
import OwnerContact from "./owner-contact";

export default async function SettingsPage() {
  try {
    const staff = await getCurrentStaff();
    if (staff.role !== "owner") return <div role="alert">Owner access is required for payment settings.</div>;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login?next=/admin/settings");
    if (error instanceof Error && error.message === "FORBIDDEN") return <div role="alert">Owner access is not enabled for this account.</div>;
    return <div role="alert">Settings are unavailable. Please try again later.</div>;
  }
  return <><OwnerContact /><OwnerPayment /></>;
}
