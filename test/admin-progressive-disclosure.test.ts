import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(file:string)=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
test('bounded admin creation tasks have labelled dialog entry points',()=>{
 for(const [file,label] of [
 ['src/app/admin/calendar/page.tsx','Block time'],
 ['src/app/admin/courts/court-manager.tsx','Add court'],
 ['src/app/admin/staff/staff-manager.tsx','Grant access'],
 ['src/app/admin/sales/sales.tsx','Record sale'],
 ['src/app/admin/open-plays/page.tsx','Create open play'],
 ] as const){const text=source(file);assert.match(text,/DialogContent/,file);assert.match(text,/DialogTitle/,file);assert.ok(text.includes(label),file);assert.match(text,/onOpenChange/,file);}
});
test('uncertain attendance changes cannot silently close or resubmit',()=>{
 const text=source('src/app/admin/bookings/outcome-controls.tsx');
 assert.match(text,/inflight\.current \|\| unknown/);
 assert.match(text,/Reload booking/);
 assert.match(text,/expectedNoShow:noShow/);
});
