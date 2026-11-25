"use client";

import Link from "next/link";

export type BookingSummary = { id: string; guestName: string | null; status: string; operatingDate: string; createdAt: string; total: string; itemCount: number; archived: boolean };
export const money = (value: string) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value));
export const dateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
export const errorMessage = (status: number) => status === 401 ? "Your session has expired. Sign in again." : status === 403 ? "Staff access is unavailable or has been revoked." : status === 404 ? "Booking not found." : status === 400 ? "Check your search filters and try again." : "Service unavailable. Please try again.";
export class AdminRequestError extends Error {
  constructor(readonly status: number) { super(errorMessage(status)); }
}
export async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new AdminRequestError(response.status);
  return response.json();
}
export function ErrorNotice({ message }: { message: string }) {
  return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{message} {message.includes("Sign in") && <Link className="underline" href="/login">Sign in</Link>}</div>;
}

export { default } from './bookings-view';
