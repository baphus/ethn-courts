import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(file:string)=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
test('bounded admin creation tasks have labelled dialog entry points',()=>{
 for(const [file,label] of [
 ['src/app/admin/calendar/page.tsx','Create event'],
 ['src/app/admin/courts/court-setup.tsx','Add court'],
 ['src/app/admin/staff/staff-manager.tsx','Grant access'],
 ['src/app/admin/finance/sales.tsx','Add sale'],
 ['src/app/admin/open-plays/page.tsx','Create open play'],
 ] as const){const text=source(file);assert.match(text,/DialogContent/,file);assert.match(text,/DialogTitle/,file);assert.ok(text.includes(label),file);assert.match(text,/onOpenChange/,file);}
});
test('court editor treats null descriptions as blank when opening, saving and checking edits',()=>{
 const text=source('src/app/admin/courts/court-setup.tsx');
 assert.match(text,/setEditDescription\(detail\.description \?\? ""\)/);
 assert.match(text,/setEditDescription\(updated\.description \?\? ""\)/);
 assert.match(text,/editDescription\.trim\(\) !== \(editing\.description \?\? ""\)/);
});
test('uncertain attendance changes cannot silently close or resubmit',()=>{
 const text=source('src/app/admin/bookings/outcome-controls.tsx');
 assert.match(text,/inflight\.current \|\| unknown/);
 assert.match(text,/Reload booking/);
 assert.match(text,/expectedNoShow:noShow/);
});
test('finance date range filters open from a trigger, not the page body',()=>{
 const text=source('src/app/admin/finance/finance.tsx');
 assert.match(text,/SheetTrigger/);
 assert.match(text,/Apply filters/);
 assert.match(text,/setRangeOpen\(false\)/);
});
test('mobile sidebar sheet gets the dark admin palette',()=>{
 const css=source('src/app/globals.css');
 assert.match(css,/\[data-sidebar="sidebar"\]\[data-mobile="true"\]/);
});
