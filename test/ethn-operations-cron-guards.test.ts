import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GET as operations } from '../src/app/api/cron/ethn-operations/route';
import { GET as retention } from '../src/app/api/cron/retention/route';
import { GET as proofPrune } from '../src/app/api/cron/proof-prune/route';


test('scheduled ETHN cron endpoints require a configured secret even locally', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.fromEntries(config.crons.map((job: { path: string; schedule: string }) => [job.path, job.schedule])), {
    '/api/cron/ethn-outbox': '*/5 * * * *', '/api/cron/ethn-push': '* * * * *', '/api/cron/keepalive': '10 2 * * 0',
  });
  for (const route of ['keepalive', 'ethn-outbox', 'ethn-push']) {
    const source = readFileSync(new URL(`../src/app/api/cron/${route}/route.ts`, import.meta.url), 'utf8');
    assert.match(source, /!process\.env\.CRON_SECRET\s*\|\|\s*!isCronAuthorized\(/, route);
  }
});

test('retired cron routes return 410', () => {
  for (const get of [operations, retention, proofPrune]) assert.equal(get().status, 410);
});
