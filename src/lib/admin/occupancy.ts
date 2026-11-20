import type { Db } from "@/db/client";
import { listCourts } from "@/lib/admin/config";
import { isSlotOpen, loadOpenRules } from "@/lib/booking/hours";
import { manilaWallClock } from "@/lib/booking/slots";

const HOUR = 3_600_000;
export function occupancyStarts(date: string): string[] {
  const start = manilaWallClock(date).getTime() + 7 * HOUR;
  return Array.from({ length: 24 }, (_, i) => new Date(start + i * HOUR).toISOString());
}

type Slot = { booking_id: string; court_id: string; slot_start: string; state: string };
type Hold = { court_id: string; slot_start: string };
type Booking = { id: string; full_name: string; tracking_code: string; status: string };
export type OccupancyBooking = { name: string; code: string; status: string; starts: string[] };
export type OccupancyCell = { state: "Approved" | "Pending" | "Hold" | "Free" | "Closed"; booking?: OccupancyBooking };

// PostgREST limits response size, so every range is read to completion.
async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query(offset, offset + 499);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}

export async function getDailyOccupancy(db: Db, date: string) {
  const starts = occupancyStarts(date);
  const from = starts[0]!;
  const to = new Date(new Date(from).getTime() + 24 * HOUR).toISOString();
  const [courts, slots, holds] = await Promise.all([
    listCourts(db),
    allRows<Slot>((a, b) => db.from("booking_slots").select("booking_id,court_id,slot_start,state").gte("slot_start", from).lt("slot_start", to).in("state", ["approved", "pending"]).order("slot_start").order("booking_id").order("court_id").range(a, b)),
    allRows<Hold>((a, b) => db.from("holds").select("court_id,slot_start").gte("slot_start", from).lt("slot_start", to).gt("expires_at", new Date().toISOString()).order("slot_start").order("court_id").range(a, b)),
  ]);
  const ids = [...new Set(slots.map((s) => s.booking_id))];
  const bookings: Booking[] = [];
  const fullSlots: Slot[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const [bookingRows, slotRows] = await Promise.all([
      allRows<Booking>((a, b) => db.from("bookings").select("id,full_name,tracking_code,status").in("id", batch).order("id").range(a, b)),
      allRows<Slot>((a, b) => db.from("booking_slots").select("booking_id,court_id,slot_start,state").in("booking_id", batch).order("slot_start").order("booking_id").order("court_id").range(a, b)),
    ]);
    bookings.push(...bookingRows);
    fullSlots.push(...slotRows);
  }
  const details = new Map(bookings.filter((b) => b.status === "Approved" || b.status === "Pending").map((b) => [b.id, { name: b.full_name, code: b.tracking_code, status: b.status, starts: fullSlots.filter((s) => s.booking_id === b.id).map((s) => s.slot_start) }]));
  const occupied = new Map<string, OccupancyBooking>();
  for (const s of slots) {
    const booking = details.get(s.booking_id);
    if (booking) occupied.set(`${s.court_id}|${new Date(s.slot_start).getTime()}`, booking);
  }
  const held = new Set(holds.map((h) => `${h.court_id}|${new Date(h.slot_start).getTime()}`));
  const visible = courts.filter((c) => c.status === "active" || slots.some((s) => s.court_id === c.id && details.has(s.booking_id)) || holds.some((h) => h.court_id === c.id));
  const rules = await loadOpenRules(db, { courtIds: visible.map((c) => c.id), from: new Date(from), to: new Date(to) });
  return { starts, courts: visible.map((court) => ({ ...court, cells: starts.map((start): OccupancyCell => {
    const key = `${court.id}|${new Date(start).getTime()}`;
    const booking = occupied.get(key);
    if (booking) return { state: booking.status as "Approved" | "Pending", booking };
    if (held.has(key)) return { state: "Hold" };
    return { state: isSlotOpen(rules, court.id, new Date(start)) ? "Free" : "Closed" };
  }) })) };
}
