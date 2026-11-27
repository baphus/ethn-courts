"use client";

import { useEffect, useState } from "react";
import { CourtSchedule } from "@/components/admin/court-schedule";
import { LoadingRows } from "@/components/admin/loading-slots";
import { manilaDateStr } from "@/lib/booking/slots";
import type { Calendar } from "@/app/admin/calendar/calendar-range";

export default function StaffOccupancy({ revision, onBooking }: { revision: number; onBooking: (id: string) => void }) {
  const [date, setDate] = useState(() => manilaDateStr(new Date()));
  const [result, setResult] = useState<{ date: string; revision: number; day: Calendar | null }>();
  const current = result?.date === date && result.revision === revision ? result : null;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/ethn/admin/calendar?date=${encodeURIComponent(date)}`, { cache: "no-store", signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json() as Promise<Calendar>; })
      .then(day => {
        if (!controller.signal.aborted) setResult({ date, revision, day: {
          ...day, courts: day.courts.map(court => ({ ...court, intervals: court.intervals.filter(item => item.state !== "held" && item.state !== "expired") })),
        } });
      })
      .catch(() => { if (!controller.signal.aborted) setResult({ date, revision, day: null }); });
    return () => controller.abort();
  }, [date, revision]);

  return <div className="min-w-0 rounded-xl border bg-card p-5">
    <CourtSchedule title="Court occupancy" description="Staff schedule for bookings and court blocks."
      date={date} onDateChange={setDate} day={current?.day ?? null} now={Date.now()} onBooking={onBooking}>
      {current ? <p role="alert" className="text-sm text-destructive">Occupancy unavailable. Reload this page to try again.</p> : <LoadingRows label="Loading occupancy" rows={6} />}
    </CourtSchedule>
  </div>;
}
