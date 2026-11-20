"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, LogOut, ExternalLink } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export default function AdminSidebar({ email }: { email: string; name: string | null }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return <Sidebar collapsible="icon">
    <nav aria-label="Staff navigation" className="flex h-full min-h-0 flex-col">
    <SidebarHeader><div className="px-3 py-4 font-semibold">ETHN <span className="text-muted-foreground">/ {email}</span></div></SidebarHeader>
    <SidebarContent><SidebarMenu>
      <SidebarMenuItem><SidebarMenuButton render={<Link href="/admin/payments" />} tooltip="Payments"><CreditCard /><span>Payments</span></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton render={<Link href="/" />} tooltip="Public booking"><ExternalLink /><span>Public booking</span></SidebarMenuButton></SidebarMenuItem>
    </SidebarMenu></SidebarContent>
    <SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton onClick={logout} tooltip="Sign out"><LogOut /><span>Sign out</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
    </nav>
  </Sidebar>;
}
