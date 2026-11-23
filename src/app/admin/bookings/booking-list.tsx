"use client";

import Link from "next/link";
import { formatDisplayDate } from "@/lib/display-date";

export type BookingSummary = { id: string; guestName: string | null; status: string; operatingDate: string; createdAt: string; total: string; itemCount: number };
export const money = (value: string) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value));
export const dateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
export const errorMessage = (status: number) => status === 401 ? "Your session has expired. Sign in again." : status === 403 ? "Staff access is unavailable or has been revoked." : status === 404 ? "Booking not found." : status === 400 ? "Check your search filters and try again." : "Service unavailable. Please try again.";
export async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(errorMessage(response.status));
  return response.json();
}
export function ErrorNotice({ message }: { message: string }) {
  return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{message} {message.includes("Sign in") && <Link className="underline" href="/login">Sign in</Link>}</div>;
}
export function BookingRows({ rows }: { rows: BookingSummary[] }) {
  return <ul className="divide-y">{rows.map(row => <li key={row.id}><Link href={`/admin/bookings/${encodeURIComponent(row.id)}`} className="flex flex-wrap items-center justify-between gap-3 py-4 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0"><strong className="block">{row.guestName || "Guest"}</strong><span className="text-sm text-muted-foreground">{formatDisplayDate(row.operatingDate)} · {row.itemCount} {row.itemCount === 1 ? "item" : "items"} · Created {dateTime(row.createdAt)}</span></span><span className="text-right text-sm"><span className="block font-semibold capitalize">{row.status}</span><span className="text-muted-foreground">Booking total {money(row.total)}</span></span></Link></li>)}</ul>;
}

export { default } from './bookings-view';
