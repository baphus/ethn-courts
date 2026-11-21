import { z } from "zod";
export { body, extensionError } from "../shared";
const id = z.string().uuid();
const key = z.string().min(1).max(200);
export const reserveSchema = z.object({ extensionId: id, mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), byteSize: z.number().int().min(1).max(5 * 1024 * 1024), key }).strict();
export const signSchema = z.object({ extensionId: id, proofId: id }).strict();
export const submitSchema = z.object({ extensionId: id, proofId: id, key, claimedReference: z.string(), claimedAmount: z.string() }).strict();
export const approveSchema = z.object({ extensionId: id, key, receivedAt: z.string(), amount: z.string(), acceptedReference: z.string() }).strict();
export const rejectSchema = z.object({ extensionId: id, key, reason: z.string() }).strict();
