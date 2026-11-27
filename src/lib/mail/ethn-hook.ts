import { drainEthnOutbox, EthnOutboxError, validateEthnOutboxConfig } from "./ethn-worker";

type Dependencies = {
  pool: () => Parameters<typeof drainEthnOutbox>[0];
  transport: () => Parameters<typeof drainEthnOutbox>[1];
  drain: typeof drainEthnOutbox;
};

export async function runEthnMailBestEffort(bookingId: string, env: Record<string, string | undefined>, deps: Dependencies) {
  if (env.ETHN_MAIL_ENABLED !== "1") return;
  let stage = "config";
  try {
    const config = { bookingId, from: env.ETHN_MAIL_FROM ?? "", appUrl: env.ETHN_APP_URL ?? "", allowLocalHttp: env.NODE_ENV === "development" };
    validateEthnOutboxConfig(config);
    stage = "database setup";
    const pool = deps.pool();
    stage = "transport setup";
    const transport = deps.transport();
    stage = "worker";
    await deps.drain(pool, transport, config);
  } catch (error) {
    console.error("ETHN mail delivery unavailable", error instanceof EthnOutboxError ? error.message : stage);
  }
}
