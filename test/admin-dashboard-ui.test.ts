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
  assert.match(court, /<CourtSchedule[\s\S]*?date=\{selectedDate\} onDateChange=\{setDate\}/);
  assert.match(page, /<StatusBadge state=\{row\.status\}/);
  assert.match(page, /courtView \? <DashboardCourtView overview=\{data\}/);
  assert.match(page, /<ViewToggle courtView=\{courtView\} onChange=\{setCourtView\}/);
  assert.match(source("src/components/admin/view-toggle.tsx"), /aria-pressed/);
  assert.match(page, /const owner = useDashboardOwner\(\)/);
  assert.match(page, /\{!owner && !data \?[^\n]+LoadingAnimation/);
  assert.match(statuses, /<Skeleton /);
  assert.match(page, /\{\(owner \|\| data\?\.finance\) && <section[^>]*>[\s\S]*?Finance this month/);
  assert.match(page, /Finance this month[^\n]*Total collections[^\n]*Recorded expenses[^\n]*Net after recorded expenses[^\n]*amount !== undefined[^\n]*<Skeleton/);
  for (const file of ['dashboard/section-card.tsx', 'dashboard/glance-kpis.tsx', 'kpi-row.tsx']) {
    assert.doesNotMatch(source(`src/components/admin/${file}`), /cv-rise|animationDelay/);
  }
  assert.match(source('src/app/admin/layout.tsx'), /staff\.role === "owner" \? <DashboardCacheProvider key=\{staff\.userId\}/);
  assert.ok(page.indexOf('Recent bookings') < page.indexOf('Finance this month'));
});

test('finance reporting uses the Dashboard KPI cards', () => {
  assert.match(source('src/components/admin/dashboard/hero-stats.tsx'), /<KpiCard\b/);
  assert.match(source('src/app/admin/finance/cash-activity.tsx'), /from "@\/components\/admin\/kpi-row";[\s\S]*<KpiCard\b/);
  assert.match(source('src/app/admin/finance/report-stats.tsx'), /from "@\/components\/admin\/kpi-row";[\s\S]*<KpiRow\b/);
});

test('shell avoids unsupported nav-summary polling and misleading create menu', () => {
  const shell = source('src/components/admin/admin-sidebar.tsx') + source('src/components/admin/admin-topbar.tsx');
  assert.doesNotMatch(shell, /nav-summary|useNavSummary|Create new/);
  assert.doesNotMatch(shell, /\/admin\/bookings\/new/);
});
