import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gcashReference, operatingDate, parsePesos, priceItems, validateGuest, validateRanges } from '../src/lib/booking/core';

test('exact money and bounded arithmetic', () => {
  assert.equal(parsePesos('101.01'), BigInt(10101));
  assert.equal(priceItems([{ rate: '101.01', minutes: 30 }, { rate: '1.01', minutes: 30 }]), BigInt(5102));
  for (const bad of ['1e2', '-1', '1.001', '10000000000', '', '01']) assert.throws(() => parsePesos(bad));
  assert.throws(() => priceItems([{ rate: '9999999999.99', minutes: 120 }]));
});

test('Manila operating date, horizon, alignment and full overnight containment', () => {
  const now = new Date('2026-11-18T18:00:00Z');
  assert.equal(operatingDate(now, 420), '2026-11-18');
  const make = (date: string, start = '00:00', end = '19:00') => ({ courtId: '1', opens: new Date(new Date(`${date}T23:00:00Z`).getTime() - 86400000), closes: new Date(`${date}T19:00:00Z`), start: new Date(`${date}T${start}:00Z`), end: new Date(`${date}T${end}:00Z`) });
  const range = make('2026-11-18', '18:30', '19:00');
  range.start = new Date('2026-11-18T18:30:00Z');
  assert.equal(validateRanges('2026-11-18', now, 420, 30, 30, 30, [range]), true);
  assert.equal(validateRanges('2026-11-18', now, 420, 60, 60, 30, [range]), false);
  assert.equal(validateRanges('2026-11-18', new Date('2026-11-18T18:31:00Z'), 420, 30, 30, 30, [range]), false);
  assert.equal(validateRanges('2026-11-18', now, 420, 30, 30, 30, [{ ...range, end: new Date('2026-11-18T19:30:00Z') }]), false);
  assert.equal(validateRanges('2026-11-18', now, 420, 30, 30, 30, [range, range]), false);
  assert.equal(validateRanges('2026-12-17', now, 420, 30, 30, 30, [make('2026-12-17')]), true);
  assert.equal(validateRanges('2026-12-18', now, 420, 30, 30, 30, [make('2026-12-18')]), false);
});

test('opening and closing stay within anchored operating day', () => {
  const now = new Date('2026-11-18T00:00:00Z');
  const range = { courtId: '1', opens: new Date('2026-11-18T18:00:00Z'), closes: new Date('2026-11-18T22:30:00Z'), start: new Date('2026-11-18T18:00:00Z'), end: new Date('2026-11-18T18:30:00Z') };
  assert.equal(validateRanges('2026-11-18', now, 420, 30, 30, 30, [range]), true);
  assert.equal(validateRanges('2026-11-18', now, 420, 30, 30, 30, [{ ...range, opens: new Date('2026-11-17T18:00:00Z') }]), false);
  assert.equal(validateRanges('2026-11-18', now, 420, 30, 30, 30, [{ ...range, closes: new Date('2026-11-18T23:30:00Z') }]), false);
  assert.equal(validateRanges('2026-11-18', now, 420, 30, 30, 30, [{ ...range, closes: new Date('2026-11-19T18:00:00Z') }]), false);
  assert.equal(validateRanges('2026-11-18', now, 420, 30, 30, 30, [{ ...range, opens: new Date('2026-11-17T23:00:00Z'), closes: new Date('2026-11-18T23:00:00Z') }]), true);
  assert.equal(validateRanges('2026-11-18', now, 540, 30, 30, 30, [{ ...range, closes: new Date('2026-11-19T00:30:00Z') }]), true);
  assert.equal(validateRanges('2026-11-18', now, 540, 30, 30, 30, [{ ...range, closes: new Date('2026-11-19T01:30:00Z') }]), false);
});

test('configurable horizon includes current date and validates input', () => {
  const now = new Date('2026-11-18T00:00:00Z');
  const range = (date: string) => ({ courtId: '1', opens: new Date(`${date}T00:00:00Z`), closes: new Date(`${date}T01:00:00Z`), start: new Date(`${date}T00:00:00Z`), end: new Date(`${date}T00:30:00Z`) });
  assert.equal(validateRanges('2026-11-19', now, 420, 30, 30, 2, [range('2026-11-19')]), true);
  assert.equal(validateRanges('2026-11-20', now, 420, 30, 30, 2, [range('2026-11-20')]), false);
  assert.equal(validateRanges('2026-11-19', now, 420, 30, 30, 0, [range('2026-11-19')]), false);
  assert.equal(validateRanges('2026-02-30', now, 420, 30, 30, 30, [range('2026-11-19')]), false);
});

test('money accepts zero and maximum numeric amount', () => {
  assert.equal(parsePesos('0'), BigInt(0));
  assert.equal(parsePesos('9999999999.99'), BigInt('999999999999'));
  assert.equal(priceItems([{ rate: '0', minutes: 30 }]), BigInt(0));
});

test('guest and reference rules', () => {
  assert.equal(validateGuest({ kind: 'online', name: 'A', email: 'a@b.co', phone: '1' }), true);
  assert.equal(validateGuest({ kind: 'online', name: 'A' }), false);
  assert.equal(validateGuest({ kind: 'walkin', name: 'A' }), true);
  assert.equal(validateGuest({ kind: 'walkin', name: 'A', notify: true }), false);
  assert.equal(gcashReference('  Ab C  '), 'Ab C');
  assert.throws(() => gcashReference('  '));
});

test('draft schema contains static overlap and closed access', () => {
  const sql = readFileSync('db/ethn/0001_core.sql', 'utf8');
  assert.match(sql, /tracking_code text unique, tracking_hash text unique/i);
  assert.match(sql, /status in \('unverified','accepted','rejected','exception'\)/i);
  assert.match(sql, /accepted_reference text collate "C"/i);
  assert.match(sql, /horizon_days integer not null default 30 check \(horizon_days > 0\)/i);
  assert.match(sql, /exclude using gist/i);
  assert.match(sql, /foreign key \(item_id,court_id,starts_at,ends_at\)/i);
  assert.equal((sql.match(/enable row level security/gi) ?? []).length, 12);
  assert.doesNotMatch(sql, /create (?:or replace )?(?:function|trigger)/i);
});
