import type { BookingSummary } from "./bookings/booking-list";

export type SlotState = "open" | "booked" | "held";

export type ScheduleItem = {
  id: string;
  customerName: string;
  courtName: string;
  startsAt: string; // ISO, UTC
  endsAt: string;
  players: number | null;
  status: "paid" | "pending" | "held";
  amount: number | null;
  note: string | null;
};

/**
 * GET /api/ethn/admin/dashboard
 *
 * Everything beyond `operatingDate`, `counts` and `recentBookings` is optional, and each widget
 * hides itself when its field is missing. Money fields live ONLY under `finance`; the server must
 * omit `finance` entirely for non-owner staff so revenue is never sent to their browsers.
 */
export type Dashboard = {
  operatingDate: string;
  counts: { held: number; pending: number; confirmed: number; completed: number; expired: number; pendingReviewOverdue: number };
  recentBookings: BookingSummary[];

  kpis?: { bookingsToday: number; bookingsMonth: number; bookingsPrevMonth: number; bookedHoursMonth: number; openHoursMonth: number };

  /** Owner only. Paid bookings only, refunded/cancelled excluded; outside sales reported separately. */
  finance?: {
    revenueToday: number;
    revenueMonth: number;
    revenuePrevMonth: number;
    outsideSalesMonth: number;
    dailyRevenue: { date: string; amount: number }[]; // YYYY-MM-DD, current month to date
    paymentMethods: { method: string; amount: number }[];
    courtRevenue: { courtId: string; amount: number }[];
  };

  schedule?: ScheduleItem[]; // today's bookings

  availability?: {
    slotLabels: string[]; // 30-min slots in order, e.g. "7:00 AM" ... "2:30 AM"
    days: { date: string; label: string; courts: { courtId: string; name: string; slots: SlotState[] }[] }[]; // today + next days
  };

  /** Month-to-date booking counts by Manila weekday (0 = Mon) and start hour (0-23). */
  peakHours?: { weekday: number; hour: number; count: number }[];

  courtOccupancy?: { courtId: string; name: string; bookedHours: number; openHours: number }[];

  openPlays?: { id: string; title: string; startsAt: string; spotsLeft: number | null }[];
};
