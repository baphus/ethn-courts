import { useId, type ReactNode } from "react";
import { BookingDateStrip } from "@/components/booking/booking-date-strip";
import { CourtTimeline } from "./court-timeline";

type TimelineProps = Parameters<typeof CourtTimeline>[0];

export function CourtSchedule({ title, description, date, onDateChange, day, children, ...timeline }: Omit<TimelineProps, "day"> & {
  title: string;
  description: string;
  date: string;
  onDateChange: (date: string) => void;
  day: TimelineProps["day"] | null;
  children: ReactNode;
}) {
  const heading = useId();
  return <section aria-labelledby={heading} className="min-w-0 space-y-3">
    <div>
      <h2 id={heading} className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    <BookingDateStrip label="Court schedule date" value={date} onChange={onDateChange} disabled={!date} />
    {day ? <CourtTimeline day={day} {...timeline} /> : children}
  </section>;
}
