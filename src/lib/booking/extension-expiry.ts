import type { PoolClient } from 'pg';

// Call only after the shared court locks, before inserting occupying allocations.
export async function expireExtensionHolds(client: PoolClient) {
  const candidates=(await client.query("SELECT id FROM ethn.extensions WHERE status='held' AND expires_at<=clock_timestamp() ORDER BY id FOR UPDATE")).rows.map(row=>row.id);
  if(!candidates.length)return;
  const expired=(await client.query("UPDATE ethn.extensions SET status='expired' WHERE id=ANY($1::uuid[]) AND status='held' AND expires_at<=clock_timestamp() RETURNING id",[candidates])).rows.map(row=>row.id);
  await client.query("UPDATE ethn.court_allocations SET state='expired' WHERE state='held' AND extension_item_id IN (SELECT id FROM ethn.extension_items WHERE extension_id=ANY($1::uuid[]))",[expired]);
}
