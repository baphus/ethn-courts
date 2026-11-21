import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/admin/ethn-staff-server";
import TimingEditor from "./timing-editor";
export default async function TimingPage(){try{const staff=await getCurrentStaff();if(staff.role!=="owner")return <div role="alert">Owner access is required for timing policy.</div>;}catch(e){if(e instanceof Error&&e.message==="UNAUTHENTICATED")redirect("/login?next=/admin/timing");if(e instanceof Error&&e.message==="FORBIDDEN")return <div role="alert">Owner access is not enabled for this account.</div>;return <div role="alert">Timing settings are unavailable. Please try again later.</div>;}return <TimingEditor/>;}
