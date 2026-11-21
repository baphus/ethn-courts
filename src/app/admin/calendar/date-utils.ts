import { manilaDateStr } from "@/lib/booking/slots";

export const shiftDate = (date: string, days: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return manilaDateStr(d); };
export const toIso = (date: string, time: string) => { const d = new Date(`${date}T${time}:00+08:00`); return Number.isFinite(d.getTime()) ? d.toISOString() : null; };
