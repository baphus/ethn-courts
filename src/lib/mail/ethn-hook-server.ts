import "server-only";
import { getCheckoutPool } from "@/db/checkout-client";
import { getSharedTransport } from "./transport";
import { drainEthnOutbox } from "./ethn-worker";
import { runEthnMailBestEffort } from "./ethn-hook";

export function sendEthnMailBestEffort(bookingId: string) {
  return runEthnMailBestEffort(bookingId, process.env, { pool: getCheckoutPool, transport: getSharedTransport, drain: drainEthnOutbox });
}
