export type Range = "week" | "month";
export type Cell = { percent: number; reservedHours: number; capacityHours: number } | null;
export type HourStat = { hourOffset: number; percent: number };

export type HeroStatsData = {
  operatingDate: string; calendarDate: string;
  bookings: { month: number; priorMonthToDate: number };
  collections?: { today: string; month: string; priorMonthToDate: string };
};
// Occupancy uses operating dates and current court hours; collections use Manila calendar dates.
export type ChartData = {
  month: string; today: string;
  occupancy: { days: { date: string; percent: number | null; reservedHours: number; capacityHours: number }[] };
  collections?: { included: string; totals: { collected: string; averagePerDay: string }; daily: { date: string; collected: string; average: string }[] };
};
export type OverviewData = {
  range: Range; from: string; to: string; asOf: string; operatingDate: string;
  kpis: { reservedHours: number; capacityHours: number; occupiedPercent: number | null; blockedHours: number; peak: HourStat | null; averageReservationMinutes: number | null; reservationCount: number };
  courts: { id: string; name: string; percent: number | null; reservedHours: number; blockedHours: number; capacityHours: number }[];
  heatmap: { hours: number[]; rows: Cell[][] };
  insight: { from: string; to: string; days: number; busiest: HourStat; quietest: HourStat } | { reason: string };
};
export type MethodsData = { range: Range; from: string; to: string; collected: string; paymentMethods: { id: string; name: string; amount: string }[] };
export type ScheduleItem = { id: string; bookingId: string; guestName: string | null; status: string; operatingDate: string; startsAt: string; endsAt: string; courts: string[] };
export type ScheduleData = { operatingDate: string; truncated: boolean; items: ScheduleItem[] };
export type WindowData = {
  operatingDate: string; date: string; dates: string[]; horizonDays: number; intervalMinutes: number;
  courts: { id: string; name: string; windows: { opensAt: string; closesAt: string }[]; occupied: { startsAt: string; endsAt: string; state: string }[] }[];
};
