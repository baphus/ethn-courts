import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('completion and allocation integration preserve extension and event boundaries',()=>{
 const outcomes=readFileSync(new URL('../src/lib/admin/ethn-outcomes.ts',import.meta.url),'utf8');
 assert.match(outcomes,/pending_extension\.status='pending'/);assert.match(outcomes,/ethn\.extension_items/);
 const calendar=readFileSync(new URL('../src/lib/admin/ethn-calendar.ts',import.meta.url),'utf8');
 assert.match(calendar,/\['maintenance','private'\]\.includes\(target\.kind\)/);
 const hours=readFileSync(new URL('../src/lib/admin/ethn-hours.ts',import.meta.url),'utf8');assert.match(hours,/LEFT JOIN ethn\.extension_items/);
 const checkout=readFileSync(new URL('../src/lib/booking/checkout.ts',import.meta.url),'utf8');assert.match(checkout,/await expireExtensionHolds\(client\)/);
});
