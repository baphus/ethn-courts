"use client";

import { addDaysManilaStr } from "@/lib/courts";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { ScheduleData, ScheduleItem } from "@/app/admin/dashboard-analytics-types";
import { StatusBadge } from "@/components/admin/dashboard-status";
import { Avatar } from "../court-avatar";
import { timelineTime } from "../court-timeline-utils";
import { Body, Card, Segmented, useAnalytics } from "./section-card";

type Tab = "today" | "tomorrow" | "week";
type Period = "morning" | "afternoon" | "evening" | "overnight";
const periods: { key: Period; label: string; hint: string }[] = [
  { key: "morning", label: "Morning", hint: "Before 12 PM" }, { key: "afternoon", label: "Afternoon", hint: "12 – 5 PM" },
  { key: "evening", label: "Evening", hint: "From 5 PM" }, { key: "overnight", label: "After midnight", hint: "Next calendar day" },
];
const manilaDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
const manilaHour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", hourCycle: "h23" }).format(d));
const dayLabel = (date: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", weekday: "short", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));
function periodOf(item: ScheduleItem): Period {
  const start = new Date(item.startsAt);
  if (manilaDate(start) > item.operatingDate) return "overnight"; // after-midnight events stay on their operating date
  const h = manilaHour(start);
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
function addDay(date: string) { return addDaysManilaStr(date, 1); }

export function UpcomingSchedule() {
  const state = useAnalytics<ScheduleData>("section=schedule");
  const [tab, setTab] = useState<Tab>("today");
  return <Card title="Upcoming schedule" subtitle="Confirmed reservations that haven’t started" action={<Link href="/admin/calendar" className="text-xs font-semibold text-primary hover:underline">Open calendar</Link>}>
    <Body state={state} skeleton="h-56">{d => {
      const tomorrow = addDay(d.operatingDate);
      const inTab = (i: ScheduleItem) => tab === "week" || i.operatingDate === (tab === "today" ? d.operatingDate : tomorrow);
      const count = (t: Tab) => d.items.filter(i => t === "week" || i.operatingDate === (t === "today" ? d.operatingDate : tomorrow)).length;
      const shown = d.items.filter(inTab);
      const groups = periods.map(p => ({ ...p, items: shown.filter(i => periodOf(i) === p.key) })).filter(g => g.key !== "overnight" || g.items.length);
      return <>
        <div className="mb-3"><Segmented label="Schedule range" value={tab} onChange={setTab} options={[{ value: "today", label: `Today · ${count("today")}` }, { value: "tomorrow", label: `Tomorrow · ${count("tomorrow")}` }, { value: "week", label: `Next 7 days · ${count("week")}` }]} /></div>
        <div className="grid gap-4 md:grid-cols-3">{groups.map(g => <div key={g.key} className="min-w-0">
          <p className="mb-2 flex items-baseline justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><span>{g.label}</span><span className="font-normal normal-case">{g.hint}</span></p>
          {g.items.length === 0 ? <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Nothing scheduled</p> : <ul className="space-y-2">{g.items.map((item, i) => <li key={item.id} className="cv-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <Link href={`/admin/bookings/${encodeURIComponent(item.bookingId)}`} className="block rounded-lg border bg-background p-3 transition duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary">
              <div className="flex items-center gap-2"><Avatar name={item.guestName || "Guest"} size="sm" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{item.guestName || "Guest"}</span><StatusBadge state={item.status} /></div>
              <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold tabular-nums">{tab === "week" && <span className="mr-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{dayLabel(item.operatingDate)}</span>}{timelineTime(item.startsAt)}<ArrowRight className="size-3 text-muted-foreground" aria-hidden="true" />{timelineTime(item.endsAt)}{manilaDate(new Date(item.endsAt)) > manilaDate(new Date(item.startsAt)) && <span className="text-xs font-normal text-muted-foreground">next calendar day</span>}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.courts.join(", ")}</p>
            </Link>
          </li>)}</ul>}
        </div>)}</div>
        {d.truncated && <p className="mt-3 text-xs text-muted-foreground">Showing the first 300 reservations. Open the calendar for the rest.</p>}
      </>;
    }}</Body>
  </Card>;
}
