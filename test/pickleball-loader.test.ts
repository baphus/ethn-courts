import { test } from "node:test";
import assert from "node:assert/strict";
import { drawPickleball } from "../src/components/ui/pickleball.ts";

test("pickleball drawing renders body and visible holes", () => {
  let circles = 0, holes = 0;
  const gradient = { addColorStop() {} };
  const ctx = {
    clearRect() {}, createRadialGradient() { return gradient; }, beginPath() {},
    arc() { circles++; }, fill() {}, save() {}, translate() {}, rotate() {},
    ellipse() { holes++; }, restore() {}, fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  drawPickleball(ctx, 0.6);
  assert.equal(circles, 2);
  assert.ok(holes > 0 && holes < 26);
});
