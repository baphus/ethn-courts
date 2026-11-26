"use client";
import { DateField } from "@/components/ui/date-field";
import { LoadingRows } from "@/components/admin/loading-slots";
import { useEffect, useState } from "react";
import { CourtTimeline } from "@/components/admin/court-timeline";
import { manilaDateStr } from "@/lib/booking/slots";
import type { Calendar } from "@/app/admin/calendar/calendar-range";
export default function StaffOccupancy({revision,onBooking}:{revision:number;onBooking:(id:string)=>void}) {
 const [date,setDate]=useState(()=>manilaDateStr(new Date()));const [day,setDay]=useState<Calendar|null>(null);const [error,setError]=useState("");
 useEffect(()=>{const c=new AbortController();setDay(null);setError("");fetch(`/api/ethn/admin/calendar?date=${encodeURIComponent(date)}`,{cache:"no-store",signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(setDay).catch(()=>{if(!c.signal.aborted)setError("Occupancy unavailable. Reload this page to try again.");});return()=>c.abort();},[date,revision]);
 return <section className="space-y-4 rounded-xl border bg-card p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Court occupancy</h2><p className="text-sm text-muted-foreground">Staff schedule for bookings and court blocks.</p></div><div className="flex gap-2"><label className="grid gap-1 text-xs">Schedule date<DateField value={date} onValueChange={value =>setDate(value)} /></label></div></div>{error?<p role="alert" className="text-sm text-destructive">{error}</p>:day?<CourtTimeline day={{...day,courts:day.courts.map(court=>({...court,intervals:court.intervals.filter(item=>item.state!=="held" && item.state!=="expired")}))}} now={Date.now()} onBooking={onBooking}/>:<LoadingRows label="Loading occupancy" rows={6} />}</section>;
}
