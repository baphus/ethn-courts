"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Bell, CalendarDays, CalendarPlus, Clock, CreditCard, ExternalLink, LayoutDashboard, LogOut, ScrollText, Settings, Users, type LucideIcon } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import Image from "next/image";

const itemClass = "h-9 px-2.5";

type NavItem = { href: string; label: string; icon: LucideIcon; };

const operations: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/exceptions", label: "Late exceptions", icon: AlertTriangle },
  { href: "/admin/walk-in", label: "Prepaid walk-in", icon: CalendarPlus },
  { href: "/admin/open-plays", label: "Open Plays", icon: CalendarDays },
  { href: "/admin/sales", label: "Paid sales", icon: CreditCard },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
];

const management: NavItem[] = [
  { href: "/admin/courts", label: "Court setup", icon: CalendarDays },
  { href: "/admin/timing", label: "Timing policy", icon: Clock },
  { href: "/admin/finance", label: "Finance", icon: CreditCard },
  { href: "/admin/activity", label: "Activity history", icon: ScrollText },
  { href: "/admin/staff", label: "Staff access", icon: Users },
  { href: "/admin/settings", label: "Payment instructions", icon: Settings },
];

export default function AdminSidebar({ email, isOwner }: { email: string; name: string | null; isOwner: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  async function logout() {
    try { const id=localStorage.getItem('ethn-push-subscription-id'); if(id) await fetch('/api/ethn/admin/push',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscriptionId:id})}); if('serviceWorker' in navigator){const registration=await navigator.serviceWorker.getRegistration('/ethn-push-sw.js');await (await registration?.pushManager.getSubscription())?.unsubscribe();} localStorage.removeItem('ethn-push-subscription-id'); } catch { /* Sign-out must still proceed; delivery rechecks current staff access. */ }
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));

  const renderItem = ({ href, label, icon: Icon }: NavItem) => <SidebarMenuItem key={href}>
    <SidebarMenuButton className={itemClass} isActive={isActive(href)} render={<Link href={href} />} tooltip={label}><Icon /><span>{label}</span></SidebarMenuButton>
  </SidebarMenuItem>;

  return <Sidebar collapsible="icon">
    <nav aria-label="Staff navigation" className="flex h-full min-h-0 flex-col">
    <SidebarHeader><div className="flex items-center gap-3 px-3 py-4"><Image src="/ethn-courts-mark.png" alt="" width={40} height={40} className="size-10 rounded-xl object-cover"/><div className="min-w-0"><div className="font-extrabold tracking-[.12em]">ETHN <span className="text-[#f28500]">COURTS</span></div><span className="block truncate text-xs text-[#b7c7cf]">{email}</span></div></div></SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Operations</SidebarGroupLabel>
        <SidebarGroupContent><SidebarMenu className="gap-0.5">{operations.map(renderItem)}</SidebarMenu></SidebarGroupContent>
      </SidebarGroup>
      {isOwner && <SidebarGroup className="pt-0">
        <SidebarGroupLabel>Management &amp; finance</SidebarGroupLabel>
        <SidebarGroupContent><SidebarMenu className="gap-0.5">{management.map(renderItem)}</SidebarMenu></SidebarGroupContent>
      </SidebarGroup>}
      <SidebarGroup className="pt-0">
        <SidebarGroupContent><SidebarMenu className="gap-0.5">
          <SidebarMenuItem><SidebarMenuButton className={itemClass} render={<Link href="/" />} tooltip="Public booking"><ExternalLink /><span>Public booking</span></SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu></SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton className={itemClass} onClick={logout} tooltip="Sign out"><LogOut /><span>Sign out</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
    </nav>
  </Sidebar>;
}
