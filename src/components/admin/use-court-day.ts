"use client";
import { useEffect, useState } from "react";
import type { Calendar } from "@/app/admin/calendar/calendar-range";
import { mergeDay } from "./court-timeline-utils";
import { useDashboardAccessDenial } from "./dashboard/dashboard-resource";

export type Detail = { guestName: string | null; status: string; total: string; items: { courtId: string; courtName: string; startsAt: string; endsAt: string }[] };

export function useNow(interval = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), interval); return () => clearInterval(timer); }, [interval]);
  return now;
}

/** Loads one operating day. Changing the date clears the view. */
export function useCourtDay(date: string) {
  const deny = useDashboardAccessDenial();
  const [day, setDay] = useState<Calendar | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<number | null>(null);
  const [key, setKey] = useState(date);
  useEffect(() => {
    const controller = new AbortController();
    if (key !== date) { setDay(null); setUpdated(null); setKey(date); }
    setError(""); setLoading(true);
    fetch(`/api/ethn/admin/calendar${date ? `?date=${encodeURIComponent(date)}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) { if (!controller.signal.aborted) deny?.(response.status); throw new Error("Calendar unavailable. Reload this page to try again."); } return response.json() as Promise<Calendar>; })
      .then(result => { if (!controller.signal.aborted) { setDay(mergeDay(result)); setUpdated(Date.now()); setLoading(false); } })
      .catch(e => { if (!controller.signal.aborted) { setError(e.message); setLoading(false); } });
    return () => controller.abort();
  }, [date, deny]);
  return { day: key === date ? day : null, error: key === date ? error : "", loading: key !== date || loading, updated: key === date ? updated : null };
}

export function useBookingDetail(booking: string | null) {
  const deny = useDashboardAccessDenial();
  const [detail, setDetail] = useState<{ id: string; data: Detail } | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  useEffect(() => {
    setDetail(null); setFailure(null);
    if (!booking) return;
    const controller = new AbortController();
    fetch(`/api/ethn/admin/bookings/${encodeURIComponent(booking)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) { if (!controller.signal.aborted) deny?.(response.status); throw new Error("Booking unavailable. Try opening booking details."); } return response.json() as Promise<Detail>; })
      .then(data => { if (!controller.signal.aborted) setDetail({ id: booking, data }); })
      .catch(e => { if (!controller.signal.aborted) setFailure({ id: booking, message: e.message }); });
    return () => controller.abort();
  }, [booking, deny]);
  return { detail: detail?.id === booking ? detail : null, error: failure?.id === booking ? failure.message : "" };
}
