import { manilaTodayStr } from "../courts";

export const saleCategories = ["Food & Drinks", "Equipment Rentals", "Merchandise", "Other"] as const;
export const uncategorizedSale = "uncategorized";

const manilaClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function saleReceivedFields(now = new Date()) {
  return { date: manilaTodayStr(now), time: manilaClock.format(now) };
}
