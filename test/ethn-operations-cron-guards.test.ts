import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isCronAuthorized } from '../src/lib/cron/auth';
import { GET as operations } from '../src/app/api/cron/ethn-operations/route';
import { GET as retention } from '../src/app/api/cron/retention/route';
import { GET as proofPrune } from '../src/app/api/cron/proof-prune/route';


test('Vercel schedules daily mail retries and weekly keepalive, not push', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.crons, [
    { path: '/api/cron/ethn-outbox', schedule: '5 2 * * *' },
    { path: '/api/cron/keepalive', schedule: '10 2 * * 0' },
  ]);
});

test('Vercel cron endpoints require a configured secret even locally', () => {
  for (const route of ['keepalive', 'ethn-outbox']) {
    const source = readFileSync(new URL(`../src/app/api/cron/${route}/route.ts`, import.meta.url), 'utf8');
    assert.match(source, /!process\.env\.CRON_SECRET\s*\|\|\s*!isCronAuthorized\(/, route);
  }
});

test('push cron uses a dedicated secret and fails closed', () => {
  const source = readFileSync(new URL('../src/app/api/cron/ethn-push/route.ts', import.meta.url), 'utf8');
  assert.match(source, /const secret = process\.env\.ETHN_PUSH_CRON_SECRET;\s*if \(!secret \|\| !isCronAuthorized\(request, secret\)\)/);
  const request = new Request('https://example.test/api/cron/ethn-push', {
    headers: { Authorization: 'Bearer push-secret' },
  });
  assert.equal(isCronAuthorized(request, 'push-secret'), true);
  assert.equal(isCronAuthorized(request, 'vercel-secret'), false);
});

test('retired cron routes return 410', () => {
  for (const get of [operations, retention, proofPrune]) assert.equal(get().status, 410);
});
