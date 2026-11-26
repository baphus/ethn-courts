import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { listUpcomingOpenPlays } from "../src/lib/admin/ethn-open-plays";

 test("open play listing includes past events but keeps removal and allocation filters", async () => {
  const source = await readFile(new URL("../src/lib/admin/ethn-open-plays.ts", import.meta.url), "utf8");
  const listing = source.slice(source.indexOf("export async function listPublicOpenPlays"), source.indexOf("async function allocateOpenPlay"));
  assert.match(listing, /WHERE p\.removed_at IS NULL/);
  assert.doesNotMatch(listing, /p\.ends_at\s*>\s*clock_timestamp\(\)/);
  assert.match(listing, /b\.removed_at IS NULL/);
  assert.match(listing, /a\.state='confirmed'/);
});

test("landing preview merges both public listing sources and returns the first three", async () => {
  const row = (id: string, day: number) => ({ id, title: id, description: "", starts_at: new Date(2030, 0, day), ends_at: new Date(2030, 0, day + 1), court_names: ["Court 1"], court_ids: ["1"], event_url: "", informational_fee: "0", version: 1 });
  const pool = { connect: async () => ({ release() {}, query: async (sql: string, args: unknown[]) => {
    if (sql.includes("FROM ethn.open_plays")) {
      assert.deepEqual(args, [true]);
      return { rows: [row("staff-1", 1), row("staff-4", 4)] };
    }
    assert.deepEqual(args, [false]);
    return { rows: [row("host-2", 2), row("host-3", 3)] };
  } }) };
  assert.deepEqual((await listUpcomingOpenPlays(pool as never)).map(event => event.id), ["staff-1", "host-2", "host-3"]);
});
