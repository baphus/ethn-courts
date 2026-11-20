import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { parsePesos } from "../booking/core";
import type { StaffVerifier } from "./ethn-payments";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v: unknown): v is string => typeof v === "string" && /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= BigInt("9223372036854775807");
const keys = (v: unknown, names: string[]): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
type Court = { id: string; name: string; rates: { hoursId: string; hourlyRate: string | null }[] };
function validate(input: unknown): { version: string; merchant: string | null; courts: Court[] } {
  if (!keys(input, ["version", "merchant", "courts"]) || !id(input.version) || !(input.merchant === null || typeof input.merchant === "string" && input.merchant.trim().length > 0 && input.merchant.trim().length <= 2000) || !Array.isArray(input.courts)) throw new Error("INVALID_INPUT");
  const names = new Set<string>(), ids = new Set<string>(), hours = new Set<string>();
  const courts = input.courts.map((court): Court => {
    if (!keys(court, ["id", "name", "rates"]) || !id(court.id) || ids.has(court.id) || typeof court.name !== "string" || !court.name.trim() || court.name.trim().length > 100 || names.has(court.name.trim()) || !Array.isArray(court.rates)) throw new Error("INVALID_INPUT");
    ids.add(court.id); names.add(court.name.trim());
    const rates = court.rates.map(rate => {
      if (!keys(rate, ["hoursId", "hourlyRate"]) || !id(rate.hoursId) || hours.has(rate.hoursId) || !(rate.hourlyRate === null || typeof rate.hourlyRate === "string")) throw new Error("INVALID_INPUT");
      hours.add(rate.hoursId);
      let hourlyRate = rate.hourlyRate as string | null;
      if (hourlyRate !== null) { try { const cents = parsePesos(hourlyRate); hourlyRate = `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, "0")}`; } catch { throw new Error("INVALID_INPUT"); } }
      return { hoursId: rate.hoursId, hourlyRate };
    });
    return { id: court.id, name: court.name.trim(), rates };
  });
  return { version: input.version, merchant: typeof input.merchant === "string" ? input.merchant.trim() : null, courts };
}
async function identity(verify: StaffVerifier) {
  const actor = await verify();
  if (!actor || !uuid.test(actor)) throw new Error("UNAUTHENTICATED");
  return actor.toLowerCase();
}
async function snapshot(client: PoolClient) {
  const settings = (await client.query("SELECT version::text, merchant, interval_minutes, minimum_minutes, anchor_minutes, horizon_days, hold_minutes FROM ethn.settings WHERE singleton")).rows[0];
  if (!settings) throw new Error("SETTINGS_UNAVAILABLE");
  const courts = (await client.query("SELECT id::text, name, active FROM ethn.courts ORDER BY id")).rows;
  const hours = (await client.query("SELECT id::text, court_id::text, weekday, opens::text, closes::text, hourly_rate::text FROM ethn.court_hours ORDER BY id")).rows;
  return { version: settings.version, merchant: settings.merchant, intervalMinutes: settings.interval_minutes, minimumMinutes: settings.minimum_minutes, anchorMinutes: settings.anchor_minutes, horizonDays: settings.horizon_days, holdMinutes: settings.hold_minutes, courts: courts.map(c => ({ id: c.id, name: c.name, active: c.active, hours: hours.filter(h => h.court_id === c.id).map(h => ({ id: h.id, weekday: h.weekday, opens: h.opens, closes: h.closes, hourlyRate: h.hourly_rate })) })) };
}
export async function getSettings(pool: Pick<Pool, "connect">, verify: StaffVerifier) {
  const actor = await identity(verify), client = await pool.connect();
  let transaction = false, committing = false, discard = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); transaction = true;
    if (!(await client.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'", [actor])).rows.length) throw new Error("FORBIDDEN");
    const result = await snapshot(client);
    committing = true; await client.query("COMMIT"); return result;
  } catch (error) {
    if (committing) discard = true; else if (transaction) { try { await client.query("ROLLBACK"); } catch { discard = true; } }
    if (error instanceof Error && error.message === "FORBIDDEN") throw error;
    throw new Error("SETTINGS_UNAVAILABLE");
  } finally { client.release(discard); }
}
export async function putSettings(pool: Pick<Pool, "connect">, verify: StaffVerifier, body: unknown) {
  const input = validate(body), actor = await identity(verify), client = await pool.connect();
  let transaction = false, committing = false, discard = false;
  try {
    await client.query("BEGIN"); transaction = true;
    if (!(await client.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE", [actor])).rows.length) throw new Error("FORBIDDEN");
    const settings = (await client.query("SELECT version::text, merchant FROM ethn.settings WHERE singleton FOR UPDATE")).rows[0];
    if (!settings) throw new Error("SETTINGS_UNAVAILABLE");
    if (settings.version !== input.version) throw new Error("STALE_VERSION");
    const courts = (await client.query("SELECT id::text, name FROM ethn.courts ORDER BY id FOR UPDATE")).rows;
    const hours = (await client.query("SELECT id::text, court_id::text, hourly_rate::text FROM ethn.court_hours ORDER BY id FOR UPDATE")).rows;
    if (courts.length !== input.courts.length || input.courts.some(c => !courts.some(row => row.id === c.id)) || hours.length !== input.courts.reduce((n, c) => n + c.rates.length, 0) || input.courts.some(c => c.rates.some(r => !hours.some(h => h.id === r.hoursId && h.court_id === c.id)))) throw new Error("INVALID_INPUT");
    const changed = input.courts.filter(c => courts.find(row => row.id === c.id).name !== c.name);
    for (const c of changed) await client.query("UPDATE ethn.courts SET name=$2 WHERE id=$1", [c.id, randomUUID()]);
    for (const c of changed) await client.query("UPDATE ethn.courts SET name=$2 WHERE id=$1", [c.id, c.name]);
    const changedHours: string[] = [];
    for (const c of input.courts) for (const r of c.rates) if (hours.find(h => h.id === r.hoursId).hourly_rate !== r.hourlyRate) { await client.query("UPDATE ethn.court_hours SET hourly_rate=$2 WHERE id=$1", [r.hoursId, r.hourlyRate]); changedHours.push(r.hoursId); }
    const version = (await client.query("UPDATE ethn.settings SET merchant=$1, version=version+1 WHERE singleton RETURNING version::text", [input.merchant])).rows[0].version;
    await client.query("INSERT INTO ethn.audit (actor, action, detail) VALUES ($1,'settings.update',$2::jsonb)", [actor, JSON.stringify({ oldVersion: input.version, newVersion: version, courtIds: changed.map(c => c.id), hoursIds: changedHours })]);
    committing = true; await client.query("COMMIT"); return { version };
  } catch (error) {
    if (committing) discard = true; else if (transaction) { try { await client.query("ROLLBACK"); } catch { discard = true; } }
    if (!committing && error && typeof error === "object" && "code" in error && error.code === "23505" && "constraint" in error && error.constraint === "courts_name_key") throw new Error("NAME_COLLISION");
    if (!committing && error instanceof Error && /^(FORBIDDEN|STALE_VERSION|INVALID_INPUT)$/.test(error.message)) throw error;
    throw new Error("SETTINGS_UNAVAILABLE");
  } finally { client.release(discard); }
}
