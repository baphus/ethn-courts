import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('new financial and operational mutations check origin before domain writes',()=>{
 const routes=['sales/route.ts','sales/[id]/corrections/route.ts','courts/route.ts','notifications/[id]/read/route.ts','outcomes/route.ts','push/route.ts'];
 for(const route of routes){const source=readFileSync(new URL(`../src/app/api/ethn/admin/${route}`,import.meta.url),'utf8');assert.match(source,/hasValidOrigin\(request\)/,route);}
});
