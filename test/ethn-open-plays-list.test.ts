import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

 test("open play listing includes past events but keeps removal and allocation filters", async () => {
  const source = await readFile(new URL("../src/lib/admin/ethn-open-plays.ts", import.meta.url), "utf8");
  const listing = source.slice(source.indexOf("export async function listPublicOpenPlays"), source.indexOf("async function allocateOpenPlay"));
  assert.match(listing, /WHERE p\.removed_at IS NULL/);
  assert.doesNotMatch(listing, /p\.ends_at\s*>\s*clock_timestamp\(\)/);
  assert.match(listing, /b\.removed_at IS NULL/);
  assert.match(listing, /a\.state='confirmed'/);
});
