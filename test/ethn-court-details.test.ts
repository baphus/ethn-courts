import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeCourtPhoto } from "../src/lib/admin/ethn-court-photo";
import { updateCourtDetails, validateCourtDetails } from "../src/lib/admin/ethn-court-details";

test("court details validate boundaries and trim text", () => {
  assert.deepEqual(validateCourtDetails("1", { name: " Court ", description: " ", version: "0" }), { name: "Court", description: null, version: "0" });
  for (const input of [{ name: "", description: "", version: "0" }, { name: "Court", description: "x".repeat(1001), version: "0" }, { name: "Court", description: "", version: "-1" }]) assert.throws(() => validateCourtDetails("1", input), /INVALID_INPUT/);
});

test("photo validates real image content, re-encodes WebP and rejects spoofed or oversized files", async () => {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "blue" } }).png().toBuffer();
  const output = await normalizeCourtPhoto(png, "image/png");
  assert.equal((await sharp(output).metadata()).format, "webp");
  await assert.rejects(normalizeCourtPhoto(png, "image/jpeg"), /INVALID_INPUT/);
  await assert.rejects(normalizeCourtPhoto(Buffer.from("<svg/>"), "image/png"), /INVALID_INPUT/);
  await assert.rejects(normalizeCourtPhoto(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"), /INVALID_INPUT/);
});

function database(owner: boolean, version = "0", failUpdate = false) {
  const queries: string[] = [];
  const pool = { async connect() { return { async query(sql: string) {
    queries.push(sql);
    if (sql.includes("staff_access")) return { rows: owner ? [{}] : [] };
    if (sql.startsWith("SELECT version")) return { rows: [{ version: "5" }] };
    if (sql.startsWith("SELECT details_version")) return { rows: [{ version }] };
    if (sql.startsWith("UPDATE ethn.courts")) { if (failUpdate) throw new Error("write failed"); return { rows: [{ id: "1", name: "Court", version: "1", photoVersion: "1" }] }; }
    if (sql.startsWith("UPDATE ethn.settings")) return { rows: [{ version: "6" }] };
    return { rows: [] };
  }, release() {} }; } };
  return { pool: pool as unknown as Parameters<typeof updateCourtDetails>[0], queries };
}
const body = { name: "Court", description: "Covered", version: "0" };
test("owner writes atomically; staff, stale edits and failed writes do not commit", async () => {
  const ok = database(true);
  const row = await updateCourtDetails(ok.pool, async () => "owner", "1", body, Buffer.from("photo"));
  assert.equal(row.settingsVersion, "6"); assert.equal(ok.queries.at(-1), "COMMIT");
  for (const [db, error] of [[database(false), "FORBIDDEN"], [database(true, "2"), "STALE_VERSION"], [database(true, "0", true), "VENUE_UNAVAILABLE"]] as const) {
    await assert.rejects(updateCourtDetails(db.pool, async () => "owner", "1", body), new RegExp(error));
    assert.equal(db.queries.at(-1), "ROLLBACK"); assert.ok(!db.queries.includes("COMMIT"));
  }
  const unauth = database(true);
  await assert.rejects(updateCourtDetails(unauth.pool, async () => null, "1", body), /UNAUTHENTICATED/);
  assert.equal(unauth.queries.length, 0);
});
