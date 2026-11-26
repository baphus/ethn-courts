import test from "node:test";
import assert from "node:assert/strict";
import { drainEthnOutbox } from "../src/lib/mail/ethn-worker";

const bookingId = "123e4567-e89b-42d3-a456-426614174001";
const owners = Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`);

test("new booking email goes only to eligible owner accounts and retries temporary failures", async () => {
  const statuses: unknown[] = [], lookedUp: string[] = [], messages: { to: string; subject: string; text: string; html: string }[] = [];
  const pool = { connect: async () => ({ query: async (sql: string, args?: unknown[]) => {
    if (sql.includes("SELECT id, kind")) return { rows: owners.map((ownerId, i) => ({ id: `message-${i}`, kind: "booking_owner_alert", payload: { ownerId, source: i === 0 ? "online" : "internal", trackingToken: "secret", proof: "secret" }, attempts: 0 })) };
    if (sql.includes("FROM ethn.staff_access")) {
      assert.match(sql, /enabled AND role='owner'/);
      return { rows: args?.[0] === owners[2] ? [] : [{}] };
    }
    if (sql.includes("SET status = $3")) statuses.push(args?.[2]);
    return { rows: [] };
  }, release() {} }) };
  await drainEthnOutbox(pool as never, { sendMail: async m => { messages.push(m); } }, {
    bookingId, from: "mail@example.com", appUrl: "https://example.com",
    ownerEmail: async id => {
      lookedUp.push(id);
      if (id === owners[3]) throw new Error("Auth temporarily unavailable");
      return id === owners[4] ? null : `owner${owners.indexOf(id)}@example.com`;
    },
  });
  assert.deepEqual(lookedUp, [owners[0], owners[1], owners[3], owners[4]]);
  assert.deepEqual(statuses, ["sent", "sent", "dead", "pending", "dead"]);
  assert.deepEqual(messages.map(m => m.to), ["owner0@example.com", "owner1@example.com"]);
  assert.match(messages[0].text, /submitted payment proof/);
  assert.match(messages[1].text, /No payment review is needed/);
  assert.deepEqual(messages.map(m => m.subject), ["Payment review needed — ETHN Courts", "Staff booking confirmed — ETHN Courts"]);
  for (const [index, message] of messages.entries()) {
    assert.ok(message.html.includes(`href="https://example.com/admin/bookings/${bookingId}"`));
    assert.ok(message.html.includes(`>${index === 0 ? "Review payment" : "View booking"}</a>`));
    assert.doesNotMatch(message.html, /secret|checkout\/track/);
    assert.ok(message.text.includes(`https://example.com/admin/bookings/${bookingId}`));
    assert.doesNotMatch(message.text, /secret|checkout\/track/);
  }
});
