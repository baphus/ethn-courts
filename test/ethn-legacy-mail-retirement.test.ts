import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GET as legacyCron } from "../src/app/api/cron/outbox/route";
import { POST as register } from "../src/app/api/auth/register/route";
import { GET as listInvites, POST as createInvite } from "../src/app/api/auth/invites/route";
import { GET as validateInvite } from "../src/app/api/auth/invites/validate/route";
import { DELETE as revokeInvite } from "../src/app/api/auth/invites/revoke/route";

test("legacy mail and invite routes are inert; only ETHN outbox is scheduled by Vercel", async () => {
  for (const handler of [legacyCron, register, listInvites, createInvite, validateInvite, revokeInvite]) {
    const response = handler();
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { error: "RETIRED" });
  }
  const { crons } = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(crons.map(({ path }: { path: string }) => path).filter((path: string) => path.endsWith("outbox")), ["/api/cron/ethn-outbox"]);
});
