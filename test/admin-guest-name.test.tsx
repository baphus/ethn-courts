// Run with: node --import ./test/register-loader.mjs --import tsx --test test/admin-guest-name.test.tsx
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GuestName } from "../src/app/admin/guest-name";

test("guest avatar uses name initials, then the email initial, then G", () => {
  const render = (name: string | null, email: string | null) =>
    renderToStaticMarkup(createElement(GuestName, { name, email }));
  assert.match(render("Maya Cruz", "a@example.com"), /aria-hidden="true"[^>]*>MC<\/span><span>Maya Cruz<\/span>/);
  assert.match(render(" ", "alex@example.com"), /aria-hidden="true"[^>]*>A<\/span><span>Guest<\/span>/);
  assert.match(render(null, null), /aria-hidden="true"[^>]*>G<\/span><span>Guest<\/span>/);
});
