import "server-only";
import { Pool } from "pg";
import { checkoutConfig } from "./checkout-config";

let pool: Pool | undefined;
export function getCheckoutPool(): Pool {
  if (!pool) {
    pool = new Pool(checkoutConfig(process.env));
    pool.on("error", () => { console.error("Checkout database pool error."); });
  }
  return pool;
}
