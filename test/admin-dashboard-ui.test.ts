import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('dashboard retains attention, booking statuses, court view and optional finance', () => {
  const page = source('src/app/admin/page.tsx');
  const attention = page.match(/<section aria-label="Needs attention"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.match(page, /\(data\.counts\.pending > 0 \|\| data\.counts\.pendingReviewOverdue > 0\) && <section aria-label="Needs attention"/);
  assert.match(attention, /overdue is included in pending/i);
  assert.match(attention, /data\.counts\.pending\b/);
  assert.match(attention, /data\.counts\.pendingReviewOverdue\b/);
  const statuses = page.match(/<section aria-label="Today booking status"[\s\S]*?<\/section>/)?.[0] ?? '';
  for (const state of ['confirmed', 'completed', 'expired']) assert.match(statuses, new RegExp(`"${state}"`));
  assert.match(statuses, /data\.counts\[state\]/);
  assert.match(statuses, /<StatusBadge state=\{state\}/);
  assert.match(page, /<StatusBadge state=\{row\.status\}/);
  assert.match(page, /courtView \? <DashboardCourtView overview=\{data\}/);
  assert.match(page, /<ViewToggle courtView=\{courtView\} onChange=\{setCourtView\}/);
  assert.match(source("src/components/admin/view-toggle.tsx"), /aria-pressed/);
  assert.match(page, /\{data\.finance && <section[^>]*>[\s\S]*?Finance this month/);
  assert.ok(page.indexOf('Recent bookings') < page.indexOf('Finance this month'));
});

test('shell avoids unsupported nav-summary polling and misleading create menu', () => {
  const shell = source('src/components/admin/admin-sidebar.tsx') + source('src/components/admin/admin-topbar.tsx');
  assert.doesNotMatch(shell, /nav-summary|useNavSummary|Create new/);
  assert.doesNotMatch(shell, /\/admin\/bookings\/new/);
});
