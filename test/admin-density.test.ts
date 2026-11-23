import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('admin density stays scoped and keeps mobile controls usable', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const density = css.split('/* Compact page headings')[1].split('.dark [data-admin-shell] .admin-workspace')[0];
  assert.match(density, /\[data-admin-shell\] \.admin-workspace h1\.text-3xl/);
  assert.match(density, /max-width: 47\.999rem[\s\S]*min-height: 2\.75rem/);
  assert.doesNotMatch(density, /\bzoom\s*:|transform\s*:|!important|text-xs/);
  assert.doesNotMatch(density, /(?:^|\n)\s*(?:button|input|h1|section)\s*[{,]/);
});
