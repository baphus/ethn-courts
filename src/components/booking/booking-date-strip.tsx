import { DateField } from "@/components/ui/date-field";
import { addDays, bookingDate, validDate } from "./ethn-selection";

const weekday = new Intl.DateTimeFormat("en-PH", { weekday: "short", timeZone: "UTC" });

export function BookingDateStrip({ value, onChange, anchor = value, min, max, disabled, spacious, label = "Booking date", describedBy, popupClassName }: {
  value: string;
  onChange: (date: string) => void;
  anchor?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  spacious?: boolean;
  label?: string;
  describedBy?: string;
  popupClassName?: string;
}) {
  const dates = anchor ? Array.from({ length: 7 }, (_, i) => addDays(anchor, i - 3)) : [];
  return <div role="group" aria-label={label} aria-describedby={describedBy} className="grid min-w-0 items-center gap-2 pb-2 sm:grid-cols-[minmax(0,1fr)_auto]">
    <div className={`flex min-w-0 gap-2 overflow-x-auto ${spacious ? "p-1" : "py-2"}`}>
      {dates.filter(date => validDate(date) && (!min || date >= min) && (!max || date <= max)).map(date => (
        <button key={date} type="button" aria-label={bookingDate(date)} disabled={disabled} aria-pressed={date === value} onClick={() => onChange(date)} className={`shrink-0 rounded-full border focus-visible:outline-2 focus-visible:outline-ring ${spacious ? "min-h-14 min-w-20 px-3 text-base" : "min-h-11 min-w-[4.25rem] px-2 text-sm"} ${date === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"}`}>
          <span className="block text-xs">{weekday.format(new Date(`${date}T12:00:00Z`))}</span>
          <span className="font-semibold">{date.slice(8)}</span>
        </button>
      ))}
    </div>
    <DateField className="justify-self-start sm:justify-self-end" value={value} onValueChange={onChange} min={min} max={max} disabled={disabled} required triggerLabel="Choose date" popupClassName={popupClassName} />
  </div>;
}
