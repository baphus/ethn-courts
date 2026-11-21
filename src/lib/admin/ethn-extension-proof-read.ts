import "server-only";
import type { Pool } from "pg";
import { getStaff, type StaffVerifier } from "./ethn-payments";
import { proofStorage } from "../booking/proof-storage";

export async function readExtensionProof(pool: Pick<Pool, "connect">, verify: StaffVerifier, extensionId: string) {
  await getStaff(pool, verify);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(extensionId)) throw new Error("INVALID_INPUT");
  const client = await pool.connect();
  let path: string | undefined;
  try {
    const { rows } = await client.query(`SELECT q.object_path FROM ethn.extensions e JOIN ethn.payments p ON p.extension_id=e.id JOIN ethn.extension_proofs q ON q.id=p.extension_proof_id AND q.extension_id=e.id WHERE e.id=$1 AND q.state='attached' ORDER BY p.created_at DESC,p.id DESC LIMIT 1`, [extensionId]);
    path = rows[0]?.object_path;
  } finally { client.release(); }
  if (!path) return null;
  await getStaff(pool, verify);
  return { signedUrl: await proofStorage.signRead(path, 300), expiresIn: 300 };
}
