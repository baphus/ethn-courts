import { adminError, adminResponse } from "./ethn-staff-server";

export function openPlayError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "CLOSED" || code === "INVALID_SCHEDULE") return adminResponse({ error: code }, 400);
  if (code === "STALE_OPEN_PLAY") return adminResponse({ error: code }, 409);
  if (code === "OPEN_PLAY_NOT_FOUND") return adminResponse({ error: code }, 404);
  return adminError(error);
}
