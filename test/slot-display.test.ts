import { test } from "node:test";
import { strict as assert } from "node:assert";
import { availabilityCellState, customerCellState, customerSlotDisplay, slotDisplay, unavailableSlotDisplay } from "../src/lib/booking/slot-display";

test("slot states retain distinct public labels and availability", () => {
  for (const state of ["held", "pending", "approved"] as const) {
    assert.equal(availabilityCellState({ state, bookable: false }), state);
    assert.equal(unavailableSlotDisplay({ state, bookable: false }), slotDisplay[state]);
  }
  assert.deepEqual(Object.values(slotDisplay).map((status) => status.label), ["Held", "Pending approval", "Booked"]);
  assert.equal(availabilityCellState({ state: "free", bookable: true }), "open");
  assert.equal(availabilityCellState({ state: "free", bookable: false }), "closed");
  assert.equal(unavailableSlotDisplay(null), null);
  assert.equal(customerSlotDisplay("held").label, "Held");
  assert.equal(customerSlotDisplay("pending"), slotDisplay.approved);
  assert.equal(customerSlotDisplay("approved"), slotDisplay.approved);
});

test("customer past slots close at the end of their hour without changing admin status", () => {
  const start = "2026-11-15T06:00:00.000Z";
  for (const state of ["held", "pending", "approved"] as const) {
    const slot = { state, bookable: false };
    assert.equal(customerCellState(start, slot, new Date("2026-11-15T06:59:59.999Z")), state);
    assert.equal(customerCellState(start, slot, new Date("2026-11-15T07:00:00.000Z")), "closed");
    assert.equal(unavailableSlotDisplay(slot), slotDisplay[state]);
  }
  assert.equal(customerCellState(start, { state: "free", bookable: true }, new Date("2026-11-15T07:00:00.000Z")), "closed");
});
