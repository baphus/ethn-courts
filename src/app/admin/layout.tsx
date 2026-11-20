import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/admin-shell";
import { getCurrentStaff } from "@/lib/admin/ethn-staff-server";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let staff;
  try {
    staff = await getCurrentStaff();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login?next=/admin/payments");
    if (error instanceof Error && error.message === "FORBIDDEN") return <main className="p-8">Staff access is not enabled for this account.</main>;
    throw error;
  }
  return <AdminShell email={staff.role === "owner" ? "Owner" : "Staff"} name={null}>{children}</AdminShell>;
}
