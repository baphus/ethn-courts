"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { BookingStatusBadge } from "@/components/admin/status-badge";
import { formatBookingDateRange, formatDateBooked, formatBookingTimeSpan, type BookingDetail } from "@/lib/admin/bookings";
import { formatCourtSlotGroup } from "@/lib/courts";
import BookingActions from "./booking-actions";

function pesos(total: string): string {
  return `₱${Number(total).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const columns: ColumnDef<BookingDetail>[] = [
  {
    // Not sortable: the table only sorts the current page, and the code is
    // the customer-facing lookup key rather than an ordering field.
    accessorKey: "trackingCode",
    header: "Tracking no.",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="font-mono text-xs font-medium tracking-wider">
        {row.original.trackingCode || "—"}
      </span>
    ),
  },
  {
    accessorKey: "fullName",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.fullName}</span>
    ),
  },
  {
    accessorKey: "email",
    id: "contact",
    header: "Contact",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="text-xs text-muted-foreground">
        <div>{row.original.email}</div>
        <div>{row.original.phone}</div>
      </div>
    ),
  },
  {
    accessorKey: "courts",
    header: "Courts",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.courts || "—"}
      </span>
    ),
  },
  {
    accessorKey: "date",
    header: "Play Date",
    cell: ({ row }) => (
      <div className="text-sm text-muted-foreground">
        <div>{formatBookingDateRange(row.original.date, row.original.slots.map((s) => s.slotStart))}</div>
        <div>{formatBookingTimeSpan(row.original.slots.map((s) => s.slotStart))}</div>
      </div>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Date booked",
    enableSorting: true,
    sortingFn: (a, b) => new Date(a.original.createdAt).getTime() - new Date(b.original.createdAt).getTime(),
    cell: ({ row }) => (
      <div className="text-sm text-muted-foreground">
        {formatDateBooked(row.original.createdAt).split(" · ").map((part, i) => <div key={i}>{part}</div>)}
      </div>
    ),
  },
  {
    id: "slots",
    header: "Slots",
    accessorFn: (b) => {
      const groups = new Map<string, string[]>();
      for (const slot of b.slots) {
        groups.set(slot.courtName, [...(groups.get(slot.courtName) ?? []), slot.slotStart]);
      }
      return [...groups].map(([court, starts]) => formatCourtSlotGroup(court, starts)).join("; ");
    },
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {(() => {
          const groups = new Map<string, string[]>();
          for (const slot of row.original.slots) {
            groups.set(slot.courtName, [...(groups.get(slot.courtName) ?? []), slot.slotStart]);
          }
          return [...groups].map(([court, starts]) => formatCourtSlotGroup(court, starts)).join("; ") || "—";
        })()}
      </span>
    ),
  },
  {
    id: "total",
    header: "Total",
    accessorFn: (b) => Number(b.total),
    sortingFn: "basic",
    cell: ({ row }) => (
      <span className="text-sm font-semibold">{pesos(row.original.total)}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <BookingStatusBadge status={row.original.status} />,
  },
  {
    id: "actions",
    header: "Actions",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => <BookingActions booking={row.original} />,
  },
];
