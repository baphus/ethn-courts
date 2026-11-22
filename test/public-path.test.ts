import { test } from "node:test";
import assert from "node:assert/strict";
import { activeNav, isPublicPath } from "../src/components/landing/public-path.ts";

test("public header excludes admin routes only", () => {
  for (const path of ["/", "/book", "/open-plays", "/contact", "/checkout/track/token", "/login", "/administrator"]) assert.equal(isPublicPath(path), true, path);
  for (const path of ["/admin", "/admin/bookings"]) assert.equal(isPublicPath(path), false, path);
});

test("active navigation matches route boundaries and tracking links", () => {
  for (const [path, active] of [["/book", "book"], ["/book/review", "book"], ["/open-plays", "plays"], ["/track", "track"], ["/track/token", "track"], ["/checkout/track/token", "track"], ["/contact", "contact"], ["/", null], ["/booking-other", null], ["/tracking", null], ["/checkout/tracker", null]] as const) assert.equal(activeNav(path), active, path);
});
