import "server-only";
import { createClient } from "@supabase/supabase-js";

export const proofStorage = {
  async inspect(path: string) {
    const url = process.env.ETHN_STORAGE_URL;
    const key = process.env.ETHN_STORAGE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("STORAGE_UNAVAILABLE");
    try {
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.storage.from("proofs").info(path);
      if (error || !data) throw new Error();
      const bytes = Number(data.size ?? data.metadata?.size);
      const mimeType = data.contentType ?? data.metadata?.mimetype;
      if (!Number.isSafeInteger(bytes) || typeof mimeType !== "string") throw new Error();
      return { bytes, mimeType };
    } catch { throw new Error("STORAGE_UNAVAILABLE"); }
  },
  async signRead(path: string, expiresIn: number) {
    const url = process.env.ETHN_STORAGE_URL;
    const key = process.env.ETHN_STORAGE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("STORAGE_UNAVAILABLE");
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.storage.from("proofs").createSignedUrl(path, expiresIn);
    if (error || !data) throw new Error("STORAGE_UNAVAILABLE");
    return data.signedUrl;
  },
  async sign(path: string) {
    const url = process.env.ETHN_STORAGE_URL;
    const key = process.env.ETHN_STORAGE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("STORAGE_UNAVAILABLE");
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.storage.from("proofs").createSignedUploadUrl(path, { upsert: false });
    if (error || !data) throw new Error("STORAGE_UNAVAILABLE");
    return data;
  },
};
