"use client";
import { useEffect, useState } from "react";
import { CourtTimeline } from "@/components/admin/court-timeline";
import { manilaDateStr } from "@/lib/booking/slots";
import type { Calendar } from "@/app/admin/calendar/calendar-range";
export default function StaffOccupancy({revision,onBooking}:{revision:number;onBooking:(id:string)=>void}) {
 const [date,setDate]=useState(()=>manilaDateStr(new Date()));const [day,setDay]=useState<Calendar|null>(null);const [error,setError]=useState("");
 useEffect(()=>{const c=new AbortController();setDay(null);setError("");fetch(`/api/ethn/admin/calendar?date=${encodeURIComponent(date)}`,{cache:"no-store",signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(setDay).catch(()=>{if(!c.signal.aborted)setError("Occupancy unavailable. Reload this page to try again.");});return()=>c.abort();},[date,revision]);
 return <section className="space-y-4 rounded-xl border bg-card p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Court occupancy</h2><p className="text-sm text-muted-foreground">Staff schedule, including held slots and blocks.</p></div><div className="flex gap-2"><label className="grid gap-1 text-xs">Schedule date<input className="rounded-md border bg-background p-2 text-sm" type="date" value={date} onChange={e=>setDate(e.target.value)} /></label></div></div>{error?<p role="alert" className="text-sm text-destructive">{error}</p>:day?<CourtTimeline day={day} now={Date.now()} onBooking={onBooking}/>:<p className="text-sm">Loading occupancy…</p>}</section>;
}
