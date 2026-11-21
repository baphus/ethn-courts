import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('ETHN operational cron endpoints require a configured secret even locally',()=>{
 for(const route of ['ethn-inbox','ethn-operations','ethn-outbox','ethn-push']){
  const source=readFileSync(new URL(`../src/app/api/cron/${route}/route.ts`,import.meta.url),'utf8');
  assert.match(source,/!process\.env\.CRON_SECRET\s*\|\|\s*!isCronAuthorized\(/,route);
 }
});
