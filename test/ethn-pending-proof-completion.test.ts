import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('manual completion blocks unresolved extensions',()=>{
 const source=readFileSync(new URL('../src/lib/admin/ethn-outcomes.ts',import.meta.url),'utf8');
 assert.ok(source.includes("AND NOT EXISTS (SELECT 1 FROM ethn.extensions e WHERE e.booking_id=b.id AND e.status IN ('held','pending'))"));
});
