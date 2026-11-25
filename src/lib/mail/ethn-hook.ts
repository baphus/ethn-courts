import { drainEthnOutbox, validateEthnOutboxConfig } from "./ethn-worker";

type Dependencies = {
  pool: () => Parameters<typeof drainEthnOutbox>[0];
  transport: () => Parameters<typeof drainEthnOutbox>[1];
  drain: typeof drainEthnOutbox;
};

export async function runEthnMailBestEffort(bookingId: string, env: Record<string, string | undefined>, deps: Dependencies) {
  if (env.ETHN_MAIL_ENABLED !== "1") return;
  try {
    const config = { bookingId, from: env.ETHN_MAIL_FROM ?? "", appUrl: env.ETHN_APP_URL ?? "", allowLocalHttp: env.NODE_ENV === "development" };
    validateEthnOutboxConfig(config);
    await deps.drain(deps.pool(), deps.transport(), config);
  } catch {
    console.error("ETHN mail delivery unavailable");
  }
}
