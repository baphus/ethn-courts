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
    <SidebarProvider style={{ "--sidebar-width-icon": "4rem" } as React.CSSProperties}>
      <div data-admin-shell className="contents">
        <AdminSidebar email={email} name={name} isOwner={isOwner} />
        <SidebarInset className="min-w-0 overflow-x-clip">
          <AdminTopbar />
          <div className="admin-workspace flex min-w-0 flex-1 flex-col gap-4 overflow-x-clip p-4 md:p-6">{children}</div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  </TooltipProvider>;
}
