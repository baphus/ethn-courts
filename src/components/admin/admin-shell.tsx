"use client";

import NextTopLoader from "nextjs-toploader";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import AdminSidebar from "./admin-sidebar";
import AdminTopbar from "./admin-topbar";

interface Props {
  email: string;
  name: string | null;
  isOwner: boolean;
  children: React.ReactNode;
}

export default function AdminShell({ email, name, isOwner, children }: Props) {
  return <TooltipProvider>
    <NextTopLoader color="var(--primary)" showSpinner={false} />
    <SidebarProvider>
      <div data-admin-shell className="contents">
        <AdminSidebar email={email} name={name} isOwner={isOwner} />
        <SidebarInset className="min-w-0 overflow-x-clip">
          <AdminTopbar />
          <div className="admin-workspace flex min-w-0 flex-1 flex-col gap-5 overflow-x-clip p-4 pt-5 md:p-7 md:pt-7">{children}</div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  </TooltipProvider>;
}
