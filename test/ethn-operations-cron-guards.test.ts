import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GET as operations } from '../src/app/api/cron/ethn-operations/route';
import { GET as push } from '../src/app/api/cron/ethn-push/route';
import { GET as retention } from '../src/app/api/cron/retention/route';
import { GET as proofPrune } from '../src/app/api/cron/proof-prune/route';


test('Vercel schedules daily mail and deleted-proof retries and weekly keepalive, not push', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.crons, [
    { path: '/api/cron/ethn-outbox', schedule: '5 2 * * *' },
    { path: '/api/cron/ethn-deleted-proofs', schedule: '25 2 * * *' },
    { path: '/api/cron/keepalive', schedule: '10 2 * * 0' },
  ]);
});

test('Vercel cron endpoints require a configured secret even locally', () => {
  for (const route of ['keepalive', 'ethn-outbox', 'ethn-deleted-proofs']) {
    const source = readFileSync(new URL(`../src/app/api/cron/${route}/route.ts`, import.meta.url), 'utf8');
    assert.match(source, /!process\.env\.CRON_SECRET\s*\|\|\s*!isCronAuthorized\(/, route);
  }
});

test('retired cron routes return 410', () => {
  for (const get of [operations, retention, proofPrune, push]) assert.equal(get().status, 410);
});
