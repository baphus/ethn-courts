import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/admin-shell";
import { ConfirmProvider } from "@/components/ui/confirm";
import { daylightFonts } from "@/app/daylight-fonts";
import { DashboardCacheProvider } from "@/components/admin/dashboard/dashboard-resource";
import { getCurrentStaff } from "@/lib/admin/ethn-staff-server";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let staff;
  try {
    staff = await getCurrentStaff();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login?next=/admin/bookings");
    if (error instanceof Error && error.message === "FORBIDDEN") return <main className="p-8">Owner access is not enabled for this account.</main>;
    return <main role="alert" className="p-8">Staff services are unavailable. Please try again later.</main>;
  }
  return <AdminShell email={staff.email} name={staff.name} className={daylightFonts}><ConfirmProvider>{staff.role === "owner" ? <DashboardCacheProvider key={staff.userId}>{children}</DashboardCacheProvider> : children}</ConfirmProvider></AdminShell>;
}
