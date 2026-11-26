import type { PoolClient } from "pg";

type Client = Pick<PoolClient, "query">;

// Inbox foreign keys lock owner rows. Take those locks before booking/court locks.
export async function lockBookingAlertOwners(client: Client) {
  const { rows } = await client.query<{ user_id: string }>("SELECT user_id FROM ethn.staff_access WHERE enabled AND role='owner' ORDER BY user_id FOR KEY SHARE");
  return rows.map(row => row.user_id);
}

export async function recordNewBookingAlerts(client: Client, bookingId: string, source: "online" | "internal", owners: string[]) {
  await client.query(`WITH alerts AS (
    INSERT INTO ethn.notifications(id,recipient,event_key,title,body,link)
    SELECT gen_random_uuid(),user_id,'new-booking:' || $1::uuid::text,'New booking',$2,'/admin/bookings/' || $1::uuid::text
    FROM unnest($4::uuid[]) AS owners(user_id)
    ON CONFLICT(recipient,event_key) DO NOTHING RETURNING recipient
  )
  INSERT INTO ethn.email_outbox(id,booking_id,kind,payload)
  SELECT gen_random_uuid(),$1,'booking_owner_alert',jsonb_build_object('ownerId',recipient,'source',$3::text) FROM alerts`,
  [bookingId, source === "online" ? "A customer submitted a booking. Payment needs review." : "Staff added a confirmed booking.", source, owners]);
}
