import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { parsePesos } from "../booking/core";
import { getStaff, type StaffVerifier } from "./ethn-payments";

type Db = Pick<Pool, "connect">;
type Storage = {
  inspect(path: string): Promise<{ bytes: number; mimeType: string }>;
  sign(path: string): Promise<{ signedUrl: string; token: string; path: string }>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const mimes = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
const pesos = (c: bigint) => `${c / BigInt(100)}.${(c % BigInt(100)).toString().padStart(2, "0")}`;
const publicError = (e: unknown, names: string[]) => e instanceof Error && names.some(name => e.message === name || (name.endsWith("_") && e.message.startsWith(name)));
async function actor(pool: Db, verify: StaffVerifier) {
  const id = await verify();
  if (!id || !uuid.test(id)) throw new Error("UNAUTHENTICATED");
  await getStaff(pool, async () => id.toLowerCase());
  return id.toLowerCase();
}
async function idempotency(client: PoolClient, staff: string, operation: string, key: string, fingerprint: string) {
  const owner=hash(staff);
  const inserted=await client.query("INSERT INTO ethn.idempotency(owner_hash,operation,key,fingerprint,result) VALUES($1,$2,$3,$4,NULL) ON CONFLICT DO NOTHING RETURNING key",[owner,operation,key,fingerprint]);
  const row=(await client.query("SELECT fingerprint,result FROM ethn.idempotency WHERE owner_hash=$1 AND operation=$2 AND key=$3 FOR UPDATE",[owner,operation,key])).rows[0];
  if(!row || row.fingerprint!==fingerprint) throw new Error("IDEMPOTENCY_MISMATCH");
  if(!inserted.rows.length) { if(!row.result) throw new Error("IDEMPOTENCY_INCOMPLETE"); return row.result; }
  return null;
}
async function saveIdempotency(client: PoolClient, staff: string, operation: string, key: string, fingerprint: string, result: unknown) {
  await client.query("UPDATE ethn.idempotency SET result=$4::jsonb WHERE owner_hash=$1 AND operation=$2 AND key=$3 AND fingerprint=$5",[hash(staff),operation,key,JSON.stringify(result),fingerprint]);
}
async function rollback(client: PoolClient, uncertain: boolean) {
  if (uncertain) return true;
  try { await client.query("ROLLBACK"); return false; } catch { return true; }
}
async function locks(client: PoolClient, staff: string) {
  if (!(await client.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE", [staff])).rows.length) throw new Error("FORBIDDEN");
  await client.query("SELECT singleton FROM ethn.settings WHERE singleton=true FOR UPDATE");
  await client.query("SELECT id FROM ethn.courts ORDER BY id FOR UPDATE");
}
function validateProofInput(x: any) {
  if (!x || !uuid.test(x.extensionId ?? "") || !Object.hasOwn(mimes, x.mimeType) || !Number.isSafeInteger(x.byteSize) || x.byteSize < 1 || x.byteSize > 5 * 1024 * 1024 || typeof x.key !== "string" || !/^[\x21-\x7e]{1,200}$/.test(x.key)) throw new Error("INVALID_INPUT");
}

/** Reserve private object path for staff upload; never accepts a caller-selected path. */
export async function reserveExtensionProof(pool: Db, verify: StaffVerifier, x: { extensionId: string; mimeType: string; byteSize: number; key: string }) {
  validateProofInput(x);
  const staff = await actor(pool, verify), client = await pool.connect();
  const fingerprint=hash(JSON.stringify({extensionId:x.extensionId.toLowerCase(),mimeType:x.mimeType,byteSize:x.byteSize}));
  let committing=false,discard=false;
  try {
    await client.query("BEGIN"); await locks(client, staff);
    const prior=await idempotency(client,staff,"extension_proof_reserve",x.key,fingerprint);
    if(prior) { committing=true; await client.query("COMMIT"); return prior; }
    const ext = (await client.query("SELECT id,status,expires_at FROM ethn.extensions WHERE id=$1 FOR UPDATE", [x.extensionId])).rows[0];
    const now = (await client.query("SELECT clock_timestamp() now")).rows[0].now as Date;
    if (!ext || ext.status !== "held" || new Date(ext.expires_at) <= now) throw new Error("EXTENSION_EXPIRED");
    const id = randomUUID(), suffix = mimes[x.mimeType as keyof typeof mimes];
    const path = `extension-incoming/${randomBytes(32).toString("hex")}.${suffix}`;
    await client.query("INSERT INTO ethn.extension_proofs(id,extension_id,object_path,mime_type,byte_size,state,created_by) VALUES($1,$2,$3,$4,$5,'reserved',$6)", [id,x.extensionId,path,x.mimeType,x.byteSize,staff]);
    const result={ extensionId: x.extensionId, proofId: id, objectPath: path, mimeType: x.mimeType, byteSize: x.byteSize, state: "reserved" as const, expiresAt: new Date(ext.expires_at).toISOString() };
    await saveIdempotency(client,staff,"extension_proof_reserve",x.key,fingerprint,result);
    committing=true; await client.query("COMMIT"); return result;
  } catch (e) { discard=await rollback(client,committing); if(e instanceof Error && "code" in e && e.code==="23505") throw new Error("EXTENSION_ACTIVE"); throw publicError(e,["IDEMPOTENCY_","INVALID_INPUT","UNAUTHENTICATED","FORBIDDEN","EXTENSION_EXPIRED"]) ? e : new Error("EXTENSION_REVIEW_UNAVAILABLE"); } finally { client.release(discard); }
}

/** Issue narrowly scoped upload authorization for matching extension proof reservation. */
export async function signExtensionProof(pool: Db, verify: StaffVerifier, x: { extensionId: string; proofId: string }, storage: Storage) {
  if (!x || !uuid.test(x.extensionId ?? "") || !uuid.test(x.proofId ?? "")) throw new Error("INVALID_INPUT");
  const staff = await actor(pool, verify), client = await pool.connect();
  let row: any;
  try {
    const result = await client.query(`SELECT p.object_path,p.mime_type,p.byte_size,e.expires_at FROM ethn.extension_proofs p JOIN ethn.extensions e ON e.id=p.extension_id WHERE p.id=$1 AND p.extension_id=$2 AND p.created_by=$3 AND p.state='reserved' AND e.status='held' AND e.expires_at>clock_timestamp()`, [x.proofId,x.extensionId,staff]);
    row = result.rows[0];
  } finally { client.release(); }
  if (!row) throw new Error("EXTENSION_EXPIRED");
  let signed;
  try { signed = await storage.sign(row.object_path); } catch { throw new Error("STORAGE_UNAVAILABLE"); }
  if (!signed?.signedUrl || !signed.token || signed.path !== row.object_path) throw new Error("STORAGE_UNAVAILABLE");
  const check=await pool.connect();
  try { const stillValid=await check.query("SELECT 1 FROM ethn.staff_access s JOIN ethn.extension_proofs p ON p.created_by=s.user_id JOIN ethn.extensions e ON e.id=p.extension_id WHERE s.user_id=$1 AND s.enabled AND s.role='owner' AND p.id=$2 AND p.extension_id=$3 AND p.state='reserved' AND e.status='held' AND e.expires_at>clock_timestamp()",[staff,x.proofId,x.extensionId]); if(!stillValid.rows.length) throw new Error("EXTENSION_EXPIRED"); }
  finally { check.release(); }
  return { ...signed, expiresAt: new Date(row.expires_at).toISOString() };
}

/** Verify actual private object metadata before the transaction; pending extensions keep only added slot. */
export async function submitExtensionProof(pool: Db, verify: StaffVerifier, x: { extensionId: string; proofId: string; key: string; claimedReference: string; claimedAmount: string }, storage: Storage) {
  if (!x || !uuid.test(x.extensionId ?? "") || !uuid.test(x.proofId ?? "") || typeof x.key !== "string" || !/^[\x21-\x7e]{1,200}$/.test(x.key) || typeof x.claimedReference !== "string" || !x.claimedReference.trim() || x.claimedReference.trim().length > 200) throw new Error("INVALID_INPUT");
  let claimedAmount: string; try { claimedAmount = pesos(parsePesos(x.claimedAmount)); } catch { throw new Error("INVALID_INPUT"); }
  const staff = await actor(pool, verify);
  const fingerprint=hash(JSON.stringify({extensionId:x.extensionId.toLowerCase(),proofId:x.proofId.toLowerCase(),claimedReference:x.claimedReference.trim(),claimedAmount}));
  const replayClient=await pool.connect();
  try { const prior=(await replayClient.query("SELECT fingerprint,result FROM ethn.idempotency WHERE owner_hash=$1 AND operation='extension_proof_submit' AND key=$2",[hash(staff),x.key])).rows[0]; if(prior) { if(prior.fingerprint!==fingerprint) throw new Error("IDEMPOTENCY_MISMATCH"); if(!prior.result) throw new Error("IDEMPOTENCY_INCOMPLETE"); return prior.result; } }
  finally { replayClient.release(); }
  const pre=await pool.connect(); let proof:any;
  try { proof = (await pre.query("SELECT object_path,mime_type,byte_size,state FROM ethn.extension_proofs WHERE id=$1 AND extension_id=$2 AND created_by=$3", [x.proofId,x.extensionId,staff])).rows[0]; }
  finally { pre.release(); }
  if (!proof || !new RegExp(`^extension-incoming/[0-9a-f]{64}\\.${mimes[proof.mime_type as keyof typeof mimes] ?? "!"}$`).test(proof.object_path)) throw new Error("PROOF_UNAVAILABLE");
  if (proof.state !== "reserved") throw new Error("PROOF_UNAVAILABLE");
  let actual: {bytes:number;mimeType:string};
  try { actual = await storage.inspect(proof.object_path); } catch { throw new Error("PROOF_UNAVAILABLE"); }
  if (actual.bytes !== Number(proof.byte_size) || actual.mimeType !== proof.mime_type) throw new Error("PROOF_MISMATCH");
  const client = await pool.connect();
  let committing=false,discard=false;
  try {
    await client.query("BEGIN"); await locks(client, staff);
    const prior=await idempotency(client,staff,"extension_proof_submit",x.key,fingerprint);
    if(prior) { committing=true; await client.query("COMMIT"); return prior; }
    if (proof.state !== "reserved") throw new Error("PROOF_UNAVAILABLE");
    const extPeek = (await client.query("SELECT booking_id FROM ethn.extensions WHERE id=$1", [x.extensionId])).rows[0];
    if (!extPeek) throw new Error("EXTENSION_EXPIRED");
    const parent = (await client.query("SELECT id,status FROM ethn.bookings WHERE id=$1 FOR UPDATE", [extPeek.booking_id])).rows[0];
    const ext = (await client.query("SELECT id,booking_id,status,total::text,expires_at FROM ethn.extensions WHERE id=$1 FOR UPDATE", [x.extensionId])).rows[0];
    const now = (await client.query("SELECT clock_timestamp() now")).rows[0].now as Date;
    if (!ext) throw new Error("EXTENSION_EXPIRED");
    if (ext.status === "expired") {
      const proofRow=(await client.query("SELECT id,state FROM ethn.extension_proofs WHERE id=$1 AND extension_id=$2 FOR UPDATE",[x.proofId,x.extensionId])).rows[0];
      if (!proofRow || proofRow.state!=="reserved") throw new Error("PROOF_UNAVAILABLE");
      const latePay=randomUUID();
      await client.query("UPDATE ethn.court_allocations SET state='expired' WHERE extension_item_id IN (SELECT id FROM ethn.extension_items WHERE extension_id=$1) AND state='held'",[x.extensionId]);
      await client.query("UPDATE ethn.extension_proofs SET state='attached' WHERE id=$1",[x.proofId]);
      await client.query("INSERT INTO ethn.payments(id,booking_id,extension_id,extension_proof_id,method,merchant_snapshot,status,claimed_reference,claimed_amount,reviewed_at,reviewed_by,review_reason) SELECT $1,e.booking_id,e.id,$2,'gcash',e.merchant_snapshot,'exception',$3,$4,NULL,NULL,NULL FROM ethn.extensions e WHERE e.id=$5",[latePay,x.proofId,x.claimedReference.trim(),claimedAmount,x.extensionId]);
      await client.query("INSERT INTO ethn.audit(booking_id,actor,action,detail) VALUES($1,$2,'extension.proof.late',$3::jsonb)",[ext.booking_id,staff,JSON.stringify({extensionId:x.extensionId,proofId:x.proofId})]);
      const result={extensionId:x.extensionId,bookingId:ext.booking_id,proofId:x.proofId,paymentId:latePay,status:"exception",total:ext.total,expiresAt:new Date(ext.expires_at).toISOString()};
      await saveIdempotency(client,staff,"extension_proof_submit",x.key,fingerprint,result); committing=true; await client.query("COMMIT"); return result;
    }
    if (ext.status !== "held") throw new Error("EXTENSION_EXPIRED");
    const late = new Date(ext.expires_at) <= now || !parent || parent.status !== "confirmed";
    const alloc = (await client.query("SELECT a.id FROM ethn.court_allocations a JOIN ethn.extension_items i ON i.id=a.extension_item_id WHERE i.extension_id=$1 AND a.state='held' FOR UPDATE OF a", [x.extensionId])).rows[0];
    if (!late && (!alloc || !alloc.id || (await client.query("SELECT 1 FROM ethn.court_allocations WHERE id=$1 AND expires_at>$2", [alloc.id,now])).rows.length===0)) throw new Error("EXTENSION_EXPIRED");
    const p = (await client.query("SELECT id FROM ethn.extension_proofs WHERE id=$1 AND extension_id=$2 AND state='reserved' AND created_by=$3 FOR UPDATE", [x.proofId,x.extensionId,staff])).rows[0];
    if (!p) throw new Error("PROOF_UNAVAILABLE");
    const payId = randomUUID();
    await client.query("UPDATE ethn.extension_proofs SET state='attached' WHERE id=$1", [x.proofId]);
    await client.query("INSERT INTO ethn.payments(id,booking_id,extension_id,extension_proof_id,method,merchant_snapshot,status,claimed_reference,claimed_amount,reviewed_at,reviewed_by,review_reason) SELECT $1,e.booking_id,e.id,$2,'gcash',e.merchant_snapshot,$5,$3,$4,NULL,NULL,NULL FROM ethn.extensions e WHERE e.id=$6", [payId,x.proofId,x.claimedReference.trim(),claimedAmount,late?'exception':'unverified',x.extensionId]);
    await client.query("UPDATE ethn.extensions SET status=$2 WHERE id=$1 AND status='held'", [x.extensionId,late?'expired':'pending']);
    if (!late) await client.query("UPDATE ethn.court_allocations SET state='pending' WHERE id=$1 AND state='held'", [alloc.id]);
    else if (alloc?.id) await client.query("UPDATE ethn.court_allocations SET state='expired' WHERE id=$1 AND state='held'", [alloc.id]);
    await client.query("INSERT INTO ethn.audit(booking_id,actor,action,detail) VALUES($1,$2,'extension.proof.submit',$3::jsonb)", [ext.booking_id,staff,JSON.stringify({extensionId:x.extensionId,proofId:x.proofId})]);
    const result={ extensionId:x.extensionId, bookingId:ext.booking_id, proofId:x.proofId, paymentId:payId, status:late?"exception":"pending", total:ext.total, expiresAt:new Date(ext.expires_at).toISOString() };
    await saveIdempotency(client,staff,"extension_proof_submit",x.key,fingerprint,result);
    committing=true; await client.query("COMMIT"); return result;
  } catch(e) { discard=await rollback(client,committing); if(e && typeof e==="object" && "code" in e && e.code==="23505") throw new Error("REFERENCE_TAKEN"); throw publicError(e,["IDEMPOTENCY_","INVALID_INPUT","UNAUTHENTICATED","FORBIDDEN","EXTENSION_EXPIRED","EXTENSION_FINAL","PROOF_","AMOUNT_MISMATCH"]) ? e : new Error("EXTENSION_REVIEW_UNAVAILABLE"); } finally { client.release(discard); }
}

/** Staff approval accepts only exact extension total; original booking is never changed. */
export async function approveExtensionProof(pool: Db, verify: StaffVerifier, x: { extensionId: string; key: string; receivedAt: string; amount: string; acceptedReference: string }) {
  if (!x || !uuid.test(x.extensionId ?? "") || typeof x.key !== "string" || !/^[\x21-\x7e]{1,200}$/.test(x.key) || typeof x.acceptedReference !== "string" || !x.acceptedReference.trim() || x.acceptedReference.trim().length>200) throw new Error("INVALID_INPUT");
  let amount: string; try { amount=pesos(parsePesos(x.amount)); } catch { throw new Error("INVALID_INPUT"); }
  const received=new Date(x.receivedAt); if (!Number.isFinite(received.getTime()) || received.toISOString()!==x.receivedAt) throw new Error("INVALID_INPUT");
  const staff=await actor(pool,verify), client=await pool.connect();
  const fingerprint=hash(JSON.stringify({extensionId:x.extensionId.toLowerCase(),receivedAt:x.receivedAt,amount,acceptedReference:x.acceptedReference.trim()})); let committing=false,discard=false;
  try {
    await client.query("BEGIN"); await locks(client,staff);
    const prior=await idempotency(client,staff,"extension_proof_approve",x.key,fingerprint);
    if(prior) { committing=true; await client.query("COMMIT"); return prior; }
    const peek=(await client.query("SELECT booking_id FROM ethn.extensions WHERE id=$1",[x.extensionId])).rows[0];
    if(!peek) throw new Error("EXTENSION_FINAL");
    const parent=(await client.query("SELECT status FROM ethn.bookings WHERE id=$1 FOR UPDATE",[peek.booking_id])).rows[0];
    if(!parent || parent.status!=="confirmed") throw new Error("EXTENSION_FINAL");
    const ext=(await client.query("SELECT id,booking_id,status,total::text,merchant_snapshot FROM ethn.extensions WHERE id=$1 FOR UPDATE",[x.extensionId])).rows[0];
    if(!ext || ext.status!=="pending") throw new Error("EXTENSION_FINAL");
    const payment=(await client.query("SELECT id FROM ethn.payments WHERE extension_id=$1 AND status='unverified' FOR UPDATE",[x.extensionId])).rows[0];
    if(!payment) throw new Error("EXTENSION_FINAL");
    const alloc=(await client.query("SELECT id FROM ethn.court_allocations WHERE extension_item_id IN (SELECT id FROM ethn.extension_items WHERE extension_id=$1) AND state='pending' FOR UPDATE",[x.extensionId])).rows[0];
    const now=(await client.query("SELECT clock_timestamp() now")).rows[0].now as Date;
    if(!alloc) throw new Error("EXTENSION_FINAL"); if(received>now) throw new Error("INVALID_INPUT"); if(amount!==ext.total) throw new Error("AMOUNT_MISMATCH");
    await client.query("UPDATE ethn.payments SET status='accepted',accepted_reference=$2,collected_amount=$3,received_at=$4,verified_at=$5,verified_by=$6 WHERE id=$1",[payment.id,x.acceptedReference.trim(),amount,received,now,staff]);
    await client.query("UPDATE ethn.extensions SET status='confirmed' WHERE id=$1 AND status='pending'",[x.extensionId]);
    await client.query("UPDATE ethn.court_allocations SET state='confirmed',expires_at=NULL WHERE id=$1 AND state='pending'",[alloc.id]);
    await client.query("INSERT INTO ethn.audit(booking_id,actor,action,detail) VALUES($1,$2,'extension.proof.approve',$3::jsonb)",[ext.booking_id,staff,JSON.stringify({extensionId:x.extensionId,amount,receivedAt:x.receivedAt})]);
    const result={extensionId:x.extensionId,bookingId:ext.booking_id,status:"confirmed",total:amount};
    await saveIdempotency(client,staff,"extension_proof_approve",x.key,fingerprint,result);
    committing=true; await client.query("COMMIT"); return result;
  } catch(e) { discard=await rollback(client,committing); if(e && typeof e==="object" && "code" in e && e.code==="23505") throw new Error("REFERENCE_TAKEN"); throw publicError(e,["IDEMPOTENCY_","INVALID_INPUT","UNAUTHENTICATED","FORBIDDEN","EXTENSION_FINAL","AMOUNT_MISMATCH"]) ? e : new Error("EXTENSION_REVIEW_UNAVAILABLE"); } finally { client.release(discard); }
}

/** Reject pending evidence; release only its extension allocation. */
export async function rejectExtensionProof(pool: Db, verify: StaffVerifier, x: { extensionId: string; key: string; reason: string }) {
  if(!x || !uuid.test(x.extensionId ?? "") || typeof x.key!=="string" || !/^[\x21-\x7e]{1,200}$/.test(x.key) || typeof x.reason!=="string" || !x.reason.trim() || x.reason.trim().length>500) throw new Error("INVALID_INPUT");
  const staff=await actor(pool,verify), client=await pool.connect();
  const fingerprint=hash(JSON.stringify({extensionId:x.extensionId.toLowerCase(),reason:x.reason.trim()})); let committing=false,discard=false;
  try {
    await client.query("BEGIN"); await locks(client,staff);
    const prior=await idempotency(client,staff,"extension_proof_reject",x.key,fingerprint);
    if(prior) { committing=true; await client.query("COMMIT"); return prior; }
    const peek=(await client.query("SELECT booking_id FROM ethn.extensions WHERE id=$1",[x.extensionId])).rows[0];
    if(!peek) throw new Error("EXTENSION_FINAL");
    const parent=(await client.query("SELECT status FROM ethn.bookings WHERE id=$1 FOR UPDATE",[peek.booking_id])).rows[0];
    if(!parent || parent.status!=="confirmed") throw new Error("EXTENSION_FINAL");
    const ext=(await client.query("SELECT id,booking_id,status FROM ethn.extensions WHERE id=$1 FOR UPDATE",[x.extensionId])).rows[0];
    if(!ext || ext.status!=="pending") throw new Error("EXTENSION_FINAL");
    const payment=(await client.query("SELECT id FROM ethn.payments WHERE extension_id=$1 AND status='unverified' FOR UPDATE",[x.extensionId])).rows[0];
    const alloc=(await client.query("SELECT id FROM ethn.court_allocations WHERE extension_item_id IN (SELECT id FROM ethn.extension_items WHERE extension_id=$1) AND state='pending' FOR UPDATE",[x.extensionId])).rows[0];
    const now=(await client.query("SELECT clock_timestamp() now")).rows[0].now;
    if(!payment || !alloc) throw new Error("EXTENSION_FINAL");
    await client.query("UPDATE ethn.payments SET status='rejected',reviewed_at=$2,reviewed_by=$3,review_reason=$4 WHERE id=$1",[payment.id,now,staff,x.reason.trim()]);
    await client.query("UPDATE ethn.extensions SET status='rejected' WHERE id=$1 AND status='pending'",[x.extensionId]);
    await client.query("UPDATE ethn.court_allocations SET state='rejected',expires_at=NULL WHERE id=$1 AND state='pending'",[alloc.id]);
    await client.query("INSERT INTO ethn.audit(booking_id,actor,action,detail) VALUES($1,$2,'extension.proof.reject',$3::jsonb)",[ext.booking_id,staff,JSON.stringify({extensionId:x.extensionId,reason:x.reason.trim()})]);
    const result={extensionId:x.extensionId,bookingId:ext.booking_id,status:"rejected"};
    await saveIdempotency(client,staff,"extension_proof_reject",x.key,fingerprint,result);
    committing=true; await client.query("COMMIT"); return result;
  } catch(e) { discard=await rollback(client,committing); throw publicError(e,["IDEMPOTENCY_","INVALID_INPUT","UNAUTHENTICATED","FORBIDDEN","EXTENSION_FINAL"]) ? e : new Error("EXTENSION_REVIEW_UNAVAILABLE"); } finally { client.release(discard); }
}
