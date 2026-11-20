import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { PoolClient } from 'pg';

type ClientQuery = PoolClient['query'];
const typeSmoke: ClientQuery | undefined = undefined;

test('checkout draft limits grants and permits transactional idempotency reservation', () => {
  assert.equal(typeSmoke, undefined);
  const core = readFileSync('db/ethn/0001_core.sql', 'utf8');
  const sql = readFileSync('db/ethn/0002_checkout_access.sql', 'utf8');
  assert.match(core, /fingerprint text not null, result jsonb, primary key/);
  const grants = sql.split('\n').filter(line => /^grant /i.test(line));
  assert.deepEqual(grants, [
    'grant usage on schema ethn to ethn_checkout;',
    'grant select on ethn.settings, ethn.courts, ethn.court_hours, ethn.bookings, ethn.booking_items, ethn.court_allocations, ethn.idempotency to ethn_checkout;',
    'grant update (version) on ethn.settings to ethn_checkout;',
    'grant update (active) on ethn.courts to ethn_checkout;',
    'grant insert on ethn.bookings, ethn.booking_items, ethn.court_allocations, ethn.idempotency, ethn.audit to ethn_checkout;',
    'grant update (status) on ethn.bookings to ethn_checkout;',
    'grant update (state) on ethn.court_allocations to ethn_checkout;',
    'grant update (result) on ethn.idempotency to ethn_checkout;',
    'grant usage on sequence ethn.audit_id_seq to ethn_checkout;',
  ]);
  assert.doesNotMatch(sql, /\b(?:create role|create function|create trigger|grant delete|grant all|bypassrls\s+to)\b/i);
  const policies = sql.split('\n').filter(line => /^create policy /i.test(line));
  assert.equal(policies.length, 17);
  assert.ok(policies.every(line => / to ethn_checkout /i.test(line)));
  assert.doesNotMatch(policies.join('\n'), /ethn\.(?:payments|proof_reservations|email_outbox|staff_access)\b/i);
});
