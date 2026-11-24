import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('dashboard leads with booking statuses and retains court view and optional finance', () => {
  const page = source('src/app/admin/page.tsx');
  assert.doesNotMatch(page, /aria-label="Needs attention"|Needs payment review/);
  const statuses = page.match(/<section aria-label="Today booking status"[\s\S]*?<\/section>/)?.[0] ?? '';
  for (const state of ['confirmed', 'completed', 'pending']) assert.match(statuses, new RegExp(`"${state}"`));
  assert.doesNotMatch(statuses, /"expired"/);
  assert.match(statuses, /data\.counts\[state\]/);
  assert.match(statuses, /<StatusBadge state=\{state\}/);
  assert.ok(page.indexOf('Today’s status') < page.indexOf('<HeroStats'));
  const court = source('src/components/admin/dashboard-court-view.tsx');
  assert.doesNotMatch(court, /Operating hours|AttentionPanel/);
  assert.match(court, /type="date"/);
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
