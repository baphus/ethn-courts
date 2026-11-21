"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CreditCard, LogOut, ExternalLink, Settings, Clock, Users, AlertTriangle, CalendarPlus, LayoutDashboard, CalendarDays, ScrollText } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import Image from "next/image";

export default function AdminSidebar({ email, isOwner }: { email: string; name: string | null; isOwner: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  async function logout() {
    try { const id=localStorage.getItem('ethn-push-subscription-id'); if(id) await fetch('/api/ethn/admin/push',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscriptionId:id})}); if('serviceWorker' in navigator){const registration=await navigator.serviceWorker.getRegistration('/ethn-push-sw.js');await (await registration?.pushManager.getSubscription())?.unsubscribe();} localStorage.removeItem('ethn-push-subscription-id'); } catch { /* Sign-out must still proceed; delivery rechecks current staff access. */ }
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return <Sidebar collapsible="icon">
    <nav aria-label="Staff navigation" className="flex h-full min-h-0 flex-col">
    <SidebarHeader><div className="flex items-center gap-3 px-3 py-4"><Image src="/ethn-courts-mark.png" alt="" width={40} height={40} className="size-10 rounded-xl object-cover"/><div className="min-w-0"><div className="font-extrabold tracking-[.12em]">ETHN <span className="text-[#f28500]">COURTS</span></div><span className="block truncate text-xs text-[#b7c7cf]">{email}</span></div></div></SidebarHeader>
    <SidebarContent><SidebarMenu>
      <li className="px-2 pt-3 text-xs font-semibold text-sidebar-foreground/60 group-data-[collapsible=icon]:sr-only">Operations</li>
      <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin"} render={<Link href="/admin" />} tooltip="Dashboard"><LayoutDashboard /><span>Dashboard</span></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin/calendar" || pathname.startsWith("/admin/calendar/")} render={<Link href="/admin/calendar" />} tooltip="Calendar"><CalendarDays /><span>Calendar</span></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin/bookings" || pathname.startsWith("/admin/bookings/")} render={<Link href="/admin/bookings" />} tooltip="Bookings"><CalendarDays /><span>Bookings</span></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin/payments" || pathname.startsWith("/admin/payments/")} render={<Link href="/admin/payments" />} tooltip="Payments"><CreditCard /><span>Payments</span></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin/exceptions" || pathname.startsWith("/admin/exceptions/")} render={<Link href="/admin/exceptions" />} tooltip="Late exceptions"><AlertTriangle /><span>Late exceptions</span></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin/walk-in" || pathname.startsWith("/admin/walk-in/")} render={<Link href="/admin/walk-in" />} tooltip="Prepaid walk-in"><CalendarPlus /><span>Prepaid walk-in</span></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin/open-plays" || pathname.startsWith("/admin/open-plays/")} render={<Link href="/admin/open-plays" />} tooltip="Open Plays"><CalendarDays /><span>Open Plays</span></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin/sales" || pathname.startsWith("/admin/sales/")} render={<Link href="/admin/sales" />} tooltip="Paid sales"><CreditCard /><span>Paid sales</span></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin/notifications" || pathname.startsWith("/admin/notifications/")} render={<Link href="/admin/notifications" />} tooltip="Inbox"><AlertTriangle /><span>Inbox</span></SidebarMenuButton></SidebarMenuItem>
      {isOwner && <li className="px-2 pt-5 text-xs font-semibold text-sidebar-foreground/60 group-data-[collapsible=icon]:sr-only">Management & finance</li>}
      {isOwner && <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin/courts" || pathname.startsWith("/admin/courts/")} render={<Link href="/admin/courts" />} tooltip="Courts"><CalendarDays /><span>Courts</span></SidebarMenuButton></SidebarMenuItem>}
      {isOwner && <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin/timing" || pathname.startsWith("/admin/timing/")} render={<Link href="/admin/timing" />} tooltip="Timing policy"><Clock /><span>Timing policy</span></SidebarMenuButton></SidebarMenuItem>}
      {isOwner && <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin/finance" || pathname.startsWith("/admin/finance/")} render={<Link href="/admin/finance" />} tooltip="Finance"><CreditCard /><span>Finance</span></SidebarMenuButton></SidebarMenuItem>}
      {isOwner && <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin/activity" || pathname.startsWith("/admin/activity/")} render={<Link href="/admin/activity" />} tooltip="Activity history"><ScrollText /><span>Activity history</span></SidebarMenuButton></SidebarMenuItem>}
      {isOwner && <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin/staff" || pathname.startsWith("/admin/staff/")} render={<Link href="/admin/staff" />} tooltip="Staff access"><Users /><span>Staff access</span></SidebarMenuButton></SidebarMenuItem>}
      {isOwner && <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin/settings" || pathname.startsWith("/admin/settings/")} render={<Link href="/admin/settings" />} tooltip="Pricing settings"><Settings /><span>Pricing settings</span></SidebarMenuButton></SidebarMenuItem>}
      {isOwner && <SidebarMenuItem><SidebarMenuButton isActive={pathname === "/admin/hours" || pathname.startsWith("/admin/hours/")} render={<Link href="/admin/hours" />} tooltip="Court hours"><Clock /><span>Court hours</span></SidebarMenuButton></SidebarMenuItem>}
      <SidebarMenuItem><SidebarMenuButton render={<Link href="/" />} tooltip="Public booking"><ExternalLink /><span>Public booking</span></SidebarMenuButton></SidebarMenuItem>
    </SidebarMenu></SidebarContent>
    <SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton onClick={logout} tooltip="Sign out"><LogOut /><span>Sign out</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
    </nav>
  </Sidebar>;
}
