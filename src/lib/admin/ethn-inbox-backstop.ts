import type { Pool } from "pg";
import { reconcileInboxForRecipient } from "./ethn-notifications";

type Db = Pick<Pool, "connect">;

async function inboxRecipients(pool: Db) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT user_id FROM ethn.staff_access WHERE enabled AND role='owner' ORDER BY user_id LIMIT 100");
    return rows.map(row=>row.user_id as string);
  } finally { client.release(); }
}

export async function reconcileInboxBackstop(pool: Db) {
  const recipients=await inboxRecipients(pool);
  let created=0;
  for(const recipient of recipients)created+=(await reconcileInboxForRecipient(pool,recipient)).created;
  return {recipients:recipients.length,created};
}
