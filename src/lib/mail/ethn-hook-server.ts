import "server-only";
import { getCheckoutPool } from "@/db/checkout-client";
import { getStaffNotificationEmail } from "@/lib/admin/ethn-staff-server";
import { getSharedTransport } from "./transport";
import { drainEthnOutbox } from "./ethn-worker";
import { runEthnMailBestEffort } from "./ethn-hook";

export function sendEthnMailBestEffort(bookingId: string) {
  return runEthnMailBestEffort(bookingId, process.env, { pool: getCheckoutPool, transport: getSharedTransport, drain: (pool, transport, config) => drainEthnOutbox(pool, transport, { ...config, ownerEmail: getStaffNotificationEmail }) });
}
