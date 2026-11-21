import test from 'node:test';
import assert from 'node:assert/strict';
import {readAdminJson} from '../src/lib/admin/ethn-json';

test('admin JSON rejects wrong content, malformed and oversized bodies',async()=>{
  const request=(body:string,type='application/json')=>new Request('http://localhost',{method:'POST',headers:{'content-type':type},body});
  assert.deepEqual(await readAdminJson(request('{"ok":true}')),{ok:true});
  await assert.rejects(readAdminJson(request('{}','text/plain')),/INVALID_INPUT/);
  await assert.rejects(readAdminJson(request('{')),/INVALID_INPUT/);
  await assert.rejects(readAdminJson(request('"12345"'),4),/INVALID_INPUT/);
});
