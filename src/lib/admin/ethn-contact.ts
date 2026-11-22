import type { Pool } from "pg";
import type { StaffVerifier } from "./ethn-payments";

export type Contact = { facebook: string; phone: string; email: string };
export function validateContact(value: unknown): Contact & { version: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_INPUT");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(",") !== "email,facebook,phone,version" || typeof v.version !== "string" || !/^[1-9]\d{0,18}$/.test(v.version) || BigInt(v.version) > BigInt("9223372036854775807") || typeof v.facebook !== "string" || typeof v.phone !== "string" || typeof v.email !== "string") throw new Error("INVALID_INPUT");
  const facebook = v.facebook.trim(), phone = v.phone.trim(), email = v.email.trim();
  if (facebook.length > 500 || phone.length > 40 || email.length > 254 || (phone && !/^[+\d() .-]+$/.test(phone)) || (email && !/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email))) throw new Error("INVALID_INPUT");
  if (facebook) { try { const url = new URL(facebook); if (url.protocol !== "https:" || !(url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com")) || url.username || url.password) throw new Error(); } catch { throw new Error("INVALID_INPUT"); } }
  return { version: v.version, facebook, phone, email };
}
export async function getContact(pool: Pick<Pool, "query">) {
  const row = (await pool.query("SELECT version::text, contact_facebook, contact_phone, contact_email FROM ethn.settings WHERE singleton")).rows[0];
  if (!row) throw new Error("SETTINGS_UNAVAILABLE");
  return { version: row.version as string, facebook: (row.contact_facebook ?? "") as string, phone: (row.contact_phone ?? "") as string, email: (row.contact_email ?? "") as string };
}
export async function putContact(pool: Pick<Pool, "connect">, verify: StaffVerifier, body: unknown) {
  const input = validateContact(body), actor = await verify();
  if (!actor || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor)) throw new Error("UNAUTHENTICATED");
  const client = await pool.connect(); let transaction = false, committing = false, discard = false;
  try {
    await client.query("BEGIN"); transaction = true;
    if (!(await client.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE", [actor])).rows.length) throw new Error("FORBIDDEN");
    const current = (await client.query("SELECT version::text FROM ethn.settings WHERE singleton FOR UPDATE")).rows[0];
    if (!current) throw new Error("SETTINGS_UNAVAILABLE");
    if (current.version !== input.version) throw new Error("STALE_VERSION");
    const version = (await client.query("UPDATE ethn.settings SET contact_facebook=$1, contact_phone=$2, contact_email=$3, version=version+1 WHERE singleton RETURNING version::text", [input.facebook || null, input.phone || null, input.email || null])).rows[0].version;
    await client.query("INSERT INTO ethn.audit (actor, action, detail) VALUES ($1,'contact.update',$2::jsonb)", [actor, JSON.stringify({ oldVersion: input.version, newVersion: version })]);
    committing = true; await client.query("COMMIT"); return { version };
  } catch (error) {
    if (committing) discard = true; else if (transaction) { try { await client.query("ROLLBACK"); } catch { discard = true; } }
    if (!committing && error instanceof Error && /^(FORBIDDEN|STALE_VERSION)$/.test(error.message)) throw error;
    throw new Error("SETTINGS_UNAVAILABLE");
  } finally { client.release(discard); }
}
