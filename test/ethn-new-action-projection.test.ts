import test from 'node:test';
import assert from 'node:assert/strict';
import {projectEthnAuditRow} from '../src/lib/admin/ethn-audit-read';
test('new operational audit summaries never fall back to raw private detail',()=>{
 for(const action of ['expense.correct','sale.correct','extension.proof.submit','booking_completed','timing.update']){
  const row=projectEthnAuditRow({id:'1',created_at:new Date(0),action,actor:'private-customer-hash',detail:{trackingToken:'secret',reason:'private note',proofPath:'private-object'}},new Set());
  assert.notEqual(row.action,'unknown');assert.deepEqual(row.detail,{});assert.equal(row.actorId,null);assert.ok(!JSON.stringify(row).includes('secret'));
 }
});
