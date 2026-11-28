import type { PoolClient } from "pg";

type Client = Pick<PoolClient, "query">;
type BookingAlert = keyof typeof alerts;
const alerts = {
  open_play_submitted: ["New booking with Open Play", "Review payment proof. Booking approval publishes the Open Play."],
  open_play_added: ["Open Play added to booking", "A customer added an Open Play through booking tracking."],
  late_payment_recorded: ["Late payment evidence recorded", "Court time was not booked. Check the receiving account and contact the customer to reconcile payment."],
  proof_submitted: ["Payment proof submitted", "Review payment proof for this booking."],
  booking_confirmed: ["Booking confirmed", "This booking is confirmed."],
  booking_cancelled: ["Booking cancelled", "The booking was cancelled and its court time released."],
  refund_recorded: ["Refund recorded", "Staff recorded an external refund and released the court time."],
} as const;

// Inbox foreign keys lock owner rows. Take those locks before booking/court locks.
export async function lockBookingAlertOwners(client: Client) {
  const { rows } = await client.query<{ user_id: string }>("SELECT user_id FROM ethn.staff_access WHERE enabled AND role='owner' ORDER BY user_id FOR SHARE");
  return rows.map(row => row.user_id);
}

export async function recordBookingAlert(client: Client, bookingId: string, kind: BookingAlert, owners: string[]) {
  return recordBookingAlerts(client, [bookingId], kind, owners);
}

export async function recordBookingAlerts(client: Client, bookingIds: string[], kind: BookingAlert, owners: string[]) {
  if (!bookingIds.length || !owners.length) return;
  await client.query(`INSERT INTO ethn.notifications(id,recipient,event_key,title,body,link)
    SELECT gen_random_uuid(),user_id,$4 || ':' || booking_id::text,$2,$5,'/admin/bookings/' || booking_id::text
    FROM unnest($3::uuid[]) AS owners(user_id) CROSS JOIN unnest($1::uuid[]) AS bookings(booking_id)
    ON CONFLICT(recipient,event_key) DO NOTHING`, [bookingIds, alerts[kind][0], owners, kind, alerts[kind][1]]);
}

export function recordNewBookingAlerts(client: Client, bookingId: string, owners: string[], openPlay = false) {
  return recordBookingAlert(client, bookingId, openPlay ? "open_play_submitted" : "proof_submitted", owners);
}
