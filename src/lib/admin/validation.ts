import { z } from "zod";

export const loginBodySchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
});

export const forgotBodySchema = z.object({
  email: z.string().trim().email().max(254),
});

export const resetPasswordBodySchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters.").max(256),
  // SHA-256 recovery token_hash from the template email link (optional — a
  // signed-in user refreshing their password goes without it).
  token_hash: z.string().min(32).max(128).optional(),
});

/** Payload accepted from the authenticated Admin → Users add-user form. */
export const createAdminBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(256),
});

export const profilePatchSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
});
