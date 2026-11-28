import { randomInt } from "node:crypto";
import type { PoolClient } from "pg";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function writeWithTrackingCode(client: Pick<PoolClient, "query">, write: (code: string) => Promise<unknown>) {
  await client.query("SAVEPOINT tracking_code");
  for (let attempt = 1; ; attempt++) {
    const code = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join("");
    try {
      await write(code);
    } catch (error) {
      const conflict = error as { code?: string; constraint?: string } | null;
      if (attempt === 5 || conflict?.code !== "23505" || conflict.constraint !== "bookings_tracking_code_key") throw error;
      await client.query("ROLLBACK TO SAVEPOINT tracking_code");
      continue;
    }
    await client.query("RELEASE SAVEPOINT tracking_code");
    return code;
  }
}
