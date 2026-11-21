import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('pending extension review is excluded from both completion selection and update',()=>{
 const source=readFileSync(new URL('../src/lib/admin/ethn-outcomes.ts',import.meta.url),'utf8');
 assert.equal(source.match(/pending_extension\.status='pending'/g)?.length,2);
});
