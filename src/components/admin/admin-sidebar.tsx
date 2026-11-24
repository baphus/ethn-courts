"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CalendarDays, Clock, CreditCard, ExternalLink, LayoutDashboard, LogOut, ScrollText, Settings, UserRound, Users, type LucideIcon } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger } from "@/components/ui/sidebar";
import Image from "next/image";

const itemClass = "h-8 px-2.5 text-xs group-data-[collapsible=icon]:mx-auto";

type NavItem = { href: string; label: string; icon: LucideIcon; };

const operations: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/admin/open-plays", label: "Open Plays", icon: CalendarDays },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
];

const management: NavItem[] = [
  { href: "/admin/courts", label: "Court setup", icon: CalendarDays },
  { href: "/admin/timing", label: "Timing policy", icon: Clock },
  { href: "/admin/finance", label: "Finance", icon: CreditCard },
  { href: "/admin/payment-instructions", label: "Payment instructions", icon: Settings },
  { href: "/admin/activity", label: "Activity history", icon: ScrollText },
  { href: "/admin/staff", label: "Owner access", icon: Users },
];

export default function AdminSidebar({ email, name }: { email: string; name: string | null }) {
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
    <nav aria-label="Owner navigation" className="flex h-full min-h-0 flex-col">
    <SidebarHeader><div className="flex flex-col items-start gap-1 px-2 py-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0"><Image src="/ethn-courts-logo.svg" alt="ETHN Courts" width={150} height={85} className="h-auto w-36 group-data-[collapsible=icon]:w-9"/><span className="text-xs text-[#b7c7cf] group-data-[collapsible=icon]:hidden">Owner portal</span></div></SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Operations</SidebarGroupLabel>
        <SidebarGroupContent><SidebarMenu className="gap-0.5">{operations.map(renderItem)}</SidebarMenu></SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup className="pt-0">
        <SidebarGroupLabel>Management &amp; finance</SidebarGroupLabel>
        <SidebarGroupContent><SidebarMenu className="gap-0.5">{management.map(renderItem)}</SidebarMenu></SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup className="pt-0">
        <SidebarGroupContent><SidebarMenu className="gap-0.5">
          <SidebarMenuItem><SidebarMenuButton className={itemClass} render={<Link href="/" />} tooltip="Public booking"><ExternalLink /><span>Public booking</span></SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu></SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter>
      <div className="flex items-center gap-2 border-t border-sidebar-border px-2 pt-3 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground"><UserRound className="size-4" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          {name && <p className="truncate text-xs font-semibold">{name}</p>}
          <p className="truncate text-xs text-sidebar-foreground/70">{email}</p>
          <p className="text-xs text-sidebar-foreground/70">Owner</p>
        </div>
        <SidebarTrigger aria-label="Toggle sidebar" className="hidden shrink-0 text-white hover:text-white md:inline-flex" />
      </div>
      <SidebarMenu><SidebarMenuItem><SidebarMenuButton className={itemClass} onClick={logout} tooltip="Sign out"><LogOut /><span>Sign out</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
    </SidebarFooter>
    </nav>
  </Sidebar>;
}
