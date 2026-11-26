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

export async function recordBookingAlert(client: Client, bookingId: string, kind: BookingAlert, owners: string[], source?: "online" | "internal") {
  return recordBookingAlerts(client, [bookingId], kind, owners, source);
}

export async function recordBookingAlerts(client: Client, bookingIds: string[], kind: BookingAlert, owners: string[], source?: "online" | "internal") {
  if (!bookingIds.length || !owners.length) return;
  await client.query(`WITH alerts AS (
    INSERT INTO ethn.notifications(id,recipient,event_key,title,body,link)
    SELECT gen_random_uuid(),user_id,$5 || ':' || booking_id::text,$2,$6,'/admin/bookings/' || booking_id::text
    FROM unnest($4::uuid[]) AS owners(user_id) CROSS JOIN unnest($1::uuid[]) AS bookings(booking_id)
    ON CONFLICT(recipient,event_key) DO NOTHING RETURNING recipient,event_key
  )
  INSERT INTO ethn.email_outbox(id,booking_id,kind,payload)
  SELECT gen_random_uuid(),split_part(event_key,':',2)::uuid,'booking_owner_alert',jsonb_build_object('ownerId',recipient,'source',$3::text,'event',$5::text)
  FROM alerts WHERE $3::text IS NOT NULL`, [bookingIds, alerts[kind][0], source ?? null, owners, kind, alerts[kind][1]]);
}

export function recordNewBookingAlerts(client: Client, bookingId: string, source: "online" | "internal", owners: string[], openPlay = false) {
  return recordBookingAlert(client, bookingId, source === "online" ? openPlay ? "open_play_submitted" : "proof_submitted" : "booking_confirmed", owners, source);
}
