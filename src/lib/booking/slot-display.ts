import type { SlotState } from "./availability";
import { isBookableSlot } from "./slots";

export const slotDisplay = {
  held: { label: "Held", className: "border-amber-300 bg-amber-100 text-amber-950" },
  pending: { label: "Pending approval", className: "border-blue-300 bg-blue-100 text-blue-950" },
  approved: { label: "Booked", className: "border-rose-300 bg-rose-100 text-rose-950" },
} satisfies Record<Exclude<SlotState, "free">, { label: string; className: string }>;

export function availabilityCellState(slot: { state: SlotState; bookable: boolean }) {
  return slot.state !== "free" ? slot.state : slot.bookable ? "open" : "closed";
}

export function customerCellState(start: string, slot: { state: SlotState; bookable: boolean }, now?: Date) {
  return isBookableSlot(new Date(start), now) ? availabilityCellState(slot) : "closed";
}

export function customerSlotDisplay(state: Exclude<SlotState, "free">) {
  return slotDisplay[state === "pending" ? "approved" : state];
}

export function unavailableSlotDisplay(slot: { state: SlotState; bookable: boolean } | null) {
  return slot && slot.state !== "free" ? slotDisplay[slot.state] : null;
}
