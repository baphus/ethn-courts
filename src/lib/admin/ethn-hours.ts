import type { Pool } from "pg";
import { parsePesos } from "../booking/core";
import type { StaffVerifier } from "./ethn-payments";
import { validateEthnHours } from "./ethn-hours-validation";

const id = (v: unknown): v is string => typeof v === "string" && /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= BigInt("9223372036854775807");
const keys = (v: unknown, names: string[]): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const time = (v: unknown): v is string => typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
function validate(body: unknown) {
  if (!keys(body, ["version", "courts"]) || !id(body.version) || !Array.isArray(body.courts) || body.courts.length > 100) throw new Error("INVALID_INPUT");
  const ids = new Set<string>();
  const courts = body.courts.map(c => {
    if (!keys(c, ["id", "active", "hours"]) || !id(c.id) || ids.has(c.id) || typeof c.active !== "boolean" || !Array.isArray(c.hours) || c.hours.length > 100) throw new Error("INVALID_INPUT");
    ids.add(c.id);
    const hours = c.hours.map(h => {
      if (!keys(h, ["weekday", "opens", "closes", "hourly_rate"]) || !Number.isInteger(h.weekday) || (h.weekday as number) < 0 || (h.weekday as number) > 6 || !time(h.opens) || !time(h.closes) || !(h.hourly_rate === null || typeof h.hourly_rate === "string")) throw new Error("INVALID_INPUT");
      if (h.hourly_rate !== null) { try { parsePesos(h.hourly_rate as string); } catch { throw new Error("INVALID_INPUT"); } }
      return { weekday: h.weekday as number, opens: h.opens, closes: h.closes, hourly_rate: h.hourly_rate as string | null };
    });
    return { id: c.id, active: c.active, hours };
  });
  return { version: body.version, courts };
}
export async function putEthnHours(pool: Pick<Pool, "connect">, verify: StaffVerifier, body: unknown) {
  const input = validate(body), actor = await verify();
  if (!actor || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor)) throw new Error("UNAUTHENTICATED");
  const client = await pool.connect();
  let transaction = false, committing = false, discard = false;
  try {
    await client.query("BEGIN"); transaction = true;
    if (!(await client.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE", [actor])).rows.length) throw new Error("FORBIDDEN");
    const settings = (await client.query("SELECT version::text, anchor_minutes, interval_minutes, minimum_minutes FROM ethn.settings WHERE singleton FOR UPDATE")).rows[0];
    if (!settings) throw new Error("SETTINGS_UNAVAILABLE");
    if (settings.version !== input.version) throw new Error("STALE_VERSION");
    const courts = (await client.query("SELECT id::text FROM ethn.courts ORDER BY id FOR UPDATE")).rows;
    await client.query("SELECT id FROM ethn.court_hours ORDER BY id FOR UPDATE");
    if (courts.length !== input.courts.length || input.courts.some(c => !courts.some(row => row.id === c.id))) throw new Error("INVALID_INPUT");
    const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    const allocations = (await client.query("SELECT a.court_id::text, b.operating_date::text, a.starts_at, a.ends_at, a.state, b.expires_at FROM ethn.court_allocations a JOIN ethn.booking_items i ON i.id=a.item_id JOIN ethn.bookings b ON b.id=i.booking_id WHERE a.ends_at > $1 AND (a.state IN ('pending','confirmed') OR (a.state='held' AND b.expires_at > $1))", [now])).rows.map(a => ({ courtId: a.court_id, operatingDate: a.operating_date, start: a.starts_at, end: a.ends_at, state: a.state, expiresAt: a.expires_at }));
    const result = validateEthnHours({ settings: { anchorMinutes: settings.anchor_minutes, interval: settings.interval_minutes, minimum: settings.minimum_minutes }, courts: input.courts, allocations, now });
    if ('error' in result) throw new Error(result.error);
    await client.query("DELETE FROM ethn.court_hours");
    const sorted = [...input.courts].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1);
    for (const c of sorted) {
      await client.query("UPDATE ethn.courts SET active=$2 WHERE id=$1", [c.id, c.active]);
      for (const h of [...c.hours].sort((a, b) => a.weekday - b.weekday || a.opens.localeCompare(b.opens))) await client.query("INSERT INTO ethn.court_hours(court_id,weekday,opens,closes,hourly_rate) VALUES ($1,$2,$3,$4,$5)", [c.id, h.weekday, h.opens, h.closes, h.hourly_rate]);
    }
    const version = (await client.query("UPDATE ethn.settings SET version=version+1 WHERE singleton RETURNING version::text")).rows[0].version;
    await client.query("INSERT INTO ethn.audit(actor,action,detail) VALUES ($1,'hours.update',$2::jsonb)", [actor.toLowerCase(), JSON.stringify({ oldVersion: input.version, newVersion: version, courtIds: sorted.map(c => c.id) })]);
    committing = true; await client.query("COMMIT"); return { version };
  } catch (error) {
    if (committing) discard = true; else if (transaction) { try { await client.query("ROLLBACK"); } catch { discard = true; } }
    if (!committing && error instanceof Error && /^(FORBIDDEN|STALE_VERSION|INVALID_INPUT|INVALID_SCHEDULE|HOURS_CONFLICT)$/.test(error.message)) throw error;
    throw new Error("SETTINGS_UNAVAILABLE");
  } finally { client.release(discard); }
}
