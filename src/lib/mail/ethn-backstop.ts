import type { Pool } from "pg";
import { drainEthnOutbox, validateEthnOutboxConfig } from "./ethn-worker";

export function ethnBackstopConfig(env: Record<string, string | undefined>) {
  if (env.ETHN_MAIL_ENABLED !== "1") return null;
  const config = { from: env.ETHN_MAIL_FROM ?? "", appUrl: env.ETHN_APP_URL ?? "" };
  try {
    validateEthnOutboxConfig({ ...config, bookingId: "00000000-0000-0000-0000-000000000000" });
    return config;
  } catch { return null; }
}

export async function drainEthnBackstop(pool: Pool, transport: Parameters<typeof drainEthnOutbox>[1], config: { from: string; appUrl: string }) {
  const { rows } = await pool.query<{ booking_id: string }>(`SELECT booking_id FROM ethn.email_outbox
    WHERE (status = 'pending' AND available_at <= now()) OR (status = 'sending' AND claimed_at < now() - interval '15 minutes')
    GROUP BY booking_id ORDER BY min(available_at), booking_id LIMIT 5`);
  let claimed = 0;
  for (const row of rows) claimed += (await drainEthnOutbox(pool, transport, { ...config, bookingId: row.booking_id })).claimed;
  return { bookingsProcessed: rows.length, claimed };
}
