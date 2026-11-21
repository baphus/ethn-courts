import type { Pool } from "pg";
import { getStaff, type StaffVerifier } from "./ethn-payments";

export async function readExtension(pool: Pick<Pool, "connect">, verify: StaffVerifier, bookingId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)) throw new Error("INVALID_INPUT");
  await getStaff(pool, verify);
  const client = await pool.connect();
  let committing=false,discard=false;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const booking = (await client.query("SELECT id,status,operating_date::text FROM ethn.bookings WHERE id=$1", [bookingId])).rows[0];
    if (!booking) {committing=true;await client.query('COMMIT');return null;}
    const items = (await client.query(`SELECT i.court_id::text, c.name, i.starts_at, i.ends_at FROM ethn.booking_items i JOIN ethn.courts c ON c.id=i.court_id WHERE i.booking_id=$1 UNION ALL SELECT i.court_id::text,c.name,i.starts_at,i.ends_at FROM ethn.extension_items i JOIN ethn.extensions e ON e.id=i.extension_id JOIN ethn.courts c ON c.id=i.court_id WHERE e.booking_id=$1 AND e.status='confirmed'`, [bookingId])).rows;
    const active = (await client.query(`SELECT e.id,e.status,e.total::text,e.expires_at,e.merchant_snapshot,i.court_id::text,i.starts_at,i.ends_at,i.hourly_rate::text,i.amount::text FROM ethn.extensions e JOIN ethn.extension_items i ON i.extension_id=e.id WHERE e.booking_id=$1 AND e.status IN ('held','pending') ORDER BY e.expires_at DESC LIMIT 1`, [bookingId])).rows[0];
    const evidence = active?.status === "pending" ? (await client.query(`SELECT p.claimed_reference,p.claimed_amount::text,q.id AS proof_id,(q.id IS NOT NULL AND q.state='attached') AS proof_available FROM ethn.payments p LEFT JOIN ethn.extension_proofs q ON q.id=p.extension_proof_id AND q.extension_id=p.extension_id WHERE p.extension_id=$1 AND p.status='unverified' ORDER BY p.created_at DESC,p.id DESC LIMIT 1`, [active.id])).rows[0] : null;
    const history=(await client.query("SELECT e.id,e.status,e.total::text,e.created_at,p.method,p.collected_amount::text,p.received_at FROM ethn.extensions e LEFT JOIN ethn.payments p ON p.extension_id=e.id AND p.status='accepted' WHERE e.booking_id=$1 ORDER BY e.created_at DESC,e.id DESC LIMIT 50",[bookingId])).rows.map(row=>({extensionId:row.id,status:row.status,total:row.total,createdAt:new Date(row.created_at).toISOString(),method:row.method,collectedAmount:row.collected_amount,receivedAt:row.received_at?new Date(row.received_at).toISOString():null}));
    committing=true;await client.query('COMMIT');
    return { history, id: booking.id, status: booking.status, operatingDate: booking.operating_date, items: items.map(i => ({ courtId: i.court_id, courtName: i.name, startsAt: new Date(i.starts_at).toISOString(), endsAt: new Date(i.ends_at).toISOString() })), active: active ? { extensionId: active.id, bookingId: booking.id, status: active.status, courtId: active.court_id, startsAt: new Date(active.starts_at).toISOString(), endsAt: new Date(active.ends_at).toISOString(), total: active.total, expiresAt: new Date(active.expires_at).toISOString(), merchant: active.merchant_snapshot, evidence: evidence ? { proofId: evidence.proof_id, claimedReference: evidence.claimed_reference, claimedAmount: evidence.claimed_amount, proofAvailable: evidence.proof_available } : null, items: [{ courtId: active.court_id, startsAt: new Date(active.starts_at).toISOString(), endsAt: new Date(active.ends_at).toISOString(), hourlyRate: active.hourly_rate, amount: active.amount }] } : null };
  } catch(e){if(committing)discard=true;else try{await client.query('ROLLBACK');}catch{discard=true;}throw e;} finally { client.release(discard); }
}
