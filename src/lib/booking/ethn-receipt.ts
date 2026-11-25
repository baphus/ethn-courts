import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { maskEmail } from "./redact";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
export const receiptInput = z.object({ ownerToken: uuid, checkoutId: uuid, submitKey: uuid }).strict();

type ReceiptItem = { court: string; startsAt: string; endsAt: string; amount: string };
export type CheckoutReceipt = { booked: false; checkoutId: string } | {
  booked: true; trackingToken: string; code: string;
  receipt: { status: string; customerName: string; maskedEmail: string; operatingDate: string; total: string; paymentMethod: string; items: ReceiptItem[] };
};

export async function readCheckoutReceipt(pool: Pick<Pool, "query">, input: z.infer<typeof receiptInput>): Promise<CheckoutReceipt | null> {
  const { ownerToken, checkoutId, submitKey } = receiptInput.parse(input);
  const ownerHash = createHash("sha256").update(ownerToken.toLowerCase()).digest("hex");
  const { rows: [row] } = await pool.query(`
    SELECT b.id, b.status, b.guest_name, b.guest_email, b.operating_date::text, b.total::text,
      b.tracking_code, s.result->>'trackingToken' AS tracking_token,
      s.result->'booked' = 'true'::jsonb AS booked,
      COALESCE(m.value->>'name', p.method) AS payment_method,
      (SELECT jsonb_agg(jsonb_build_object('court', c.name, 'startsAt', i.starts_at,
        'endsAt', i.ends_at, 'amount', i.amount::text) ORDER BY i.starts_at, c.name)
        FROM ethn.booking_items i JOIN ethn.courts c ON c.id=i.court_id WHERE i.booking_id=b.id) AS items
    FROM ethn.bookings b
    JOIN ethn.idempotency s ON s.owner_hash=b.owner_hash AND s.operation='submission' AND s.key=$3
      AND s.result->>'checkoutId'=b.id::text
    JOIN ethn.payments p ON p.booking_id=b.id AND p.extension_id IS NULL AND p.proof_id IS NOT NULL
    LEFT JOIN LATERAL jsonb_array_elements(b.payment_methods_snapshot) m(value) ON m.value->>'id'=p.method
    WHERE b.id=$1 AND b.owner_hash=$2 AND b.walk_in_actor IS NULL
  `, [checkoutId.toLowerCase(), ownerHash, submitKey]);
  if (!row) return null;
  if (!row.booked) return { booked: false, checkoutId: row.id };
  return { booked: true, trackingToken: row.tracking_token, code: row.tracking_code, receipt: {
    status: row.status, customerName: row.guest_name, maskedEmail: maskEmail(row.guest_email),
    operatingDate: row.operating_date, total: row.total, paymentMethod: row.payment_method, items: row.items ?? [],
  } };
}
