import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('dashboard renders optional occupancy and peak widgets once', () => {
  const page = source('src/app/admin/page.tsx');
  assert.equal((page.match(/<CourtOccupancy\b/g) ?? []).length, 1);
  assert.equal((page.match(/<PeakHours\b/g) ?? []).length, 1);
  assert.match(page, /data\.finance \|\| data\.peakHours \|\| data\.courtOccupancy/);
});

test('shell avoids unsupported nav-summary polling and misleading create menu', () => {
  const shell = source('src/components/admin/admin-sidebar.tsx') + source('src/components/admin/admin-topbar.tsx');
  assert.doesNotMatch(shell, /nav-summary|useNavSummary|Create new/);
  assert.match(shell, /href="\/admin\/walk-in"/);
});
