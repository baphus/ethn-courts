import { Suspense } from "react";
import BookingList from "./booking-list";

export default function BookingsPage() {
  return <Suspense fallback={<p role="status">Loading bookings…</p>}><BookingList /></Suspense>;
}
