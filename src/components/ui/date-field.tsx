"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

function calendarDay(value = "") {
  if (!value) return undefined
  const [year, month, day] = value.split("T", 1)[0].split("-").map(Number)
  return new Date(year, month - 1, day, 12)
}

function dateValue(day: Date) {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
}

type DateFieldProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  name?: string
  required?: boolean
  min?: string
  max?: string
  className?: string
  id?: string
  "aria-label"?: string
  dateTime?: boolean
  disabled?: boolean
  triggerLabel?: string
  popupClassName?: string
}

function DateField({ value, defaultValue = "", onValueChange, name, required, min, max, className, id, dateTime = false, disabled, triggerLabel, popupClassName, ...aria }: DateFieldProps) {
  const [internal, setInternal] = React.useState(defaultValue)
  const current = value ?? internal
  const [partial, setPartial] = React.useState({ date: "", time: "" })
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState("")
  const trigger = React.useRef<HTMLButtonElement>(null)
  const errorId = React.useId()
  const [day, time = ""] = current ? current.split("T") : [partial.date, partial.time]
  const selected = calendarDay(day)
  const last = calendarDay(max)
  const firstDay = min?.split("T", 1)[0], lastDay = max?.split("T", 1)[0]
  const incomplete = dateTime && !!day !== !!time
  const type = dateTime ? "datetime-local" : "date"

  function update(nextDate: string, nextTime = "") {
    const next = dateTime ? (nextDate && nextTime ? `${nextDate}T${nextTime}` : "") : nextDate
    setPartial(dateTime && !next ? { date: nextDate, time: nextTime } : { date: "", time: "" })
    setError("")
    if (value === undefined) setInternal(next)
    if (next !== current) onValueChange?.(next)
  }

  return <div className={cn("grid min-w-0 gap-1", className)}>
    <div className={cn("grid min-w-0 gap-2", dateTime && "sm:grid-cols-2")}>
      <Popover open={open} onOpenChange={(next) => setOpen(next && !disabled)}>
        <PopoverTrigger render={<Button ref={trigger} id={id} type="button" variant="outline" size="lg" disabled={disabled} aria-invalid={!!error || undefined} aria-describedby={error ? errorId : undefined} {...aria} className="w-full min-w-0 justify-start font-normal" />}>
          <CalendarIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className={cn("truncate", !day && "text-muted-foreground")}>{triggerLabel ?? (day || "Choose date")}</span>
        </PopoverTrigger>
        <PopoverContent className={cn("w-auto p-1", popupClassName)}>
          <Calendar mode="single" selected={selected} defaultMonth={selected ?? last} autoFocus onSelect={(next) => { if (next) { update(dateValue(next), time); setOpen(false) } }} disabled={(next) => { const value = dateValue(next); return (!!firstDay && value < firstDay) || (!!lastDay && value > lastDay) }} />
          {!required && day && <Button type="button" variant="ghost" className="w-full" onClick={() => { update(""); setOpen(false) }}>Clear date</Button>}
        </PopoverContent>
      </Popover>
      {dateTime && <Input aria-label="Time" type="time" step="any" value={time} required={required || !!day} disabled={disabled} onChange={(event) => update(day, event.target.value)} />}
    </div>
    {/* Keep HTML constraint validation and FormData without opening a second calendar. */}
    <input type={type} className="sr-only" tabIndex={-1} aria-hidden="true" name={name} value={current} required={required || incomplete} min={min} max={max} disabled={disabled} readOnly={false} onChange={() => {}} onInvalid={(event) => { event.preventDefault(); setError(event.currentTarget.validationMessage); trigger.current?.focus() }} />
    {error && <span id={errorId} role="alert" className="text-xs font-normal text-destructive">{error}</span>}
  </div>
}

export { DateField }
