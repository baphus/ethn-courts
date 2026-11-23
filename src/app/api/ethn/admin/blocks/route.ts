import { createEthnBlock, createEthnBlocks, listUpcomingBlocks } from "@/lib/admin/ethn-calendar";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { hasValidOrigin } from "@/lib/request-origin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return adminResponse(await listUpcomingBlocks(staffPool, verifyStaffIdentity)); }
  catch (error) { return adminError(error); }
}
export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try {
    if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) throw new Error("INVALID_INPUT");
    const reader=request.body?.getReader(); if(!reader) throw new Error("INVALID_INPUT"); const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new Error("INVALID_INPUT");}chunks.push(value);}
    let body:unknown;try{body=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new Error("INVALID_INPUT");}
    const create=body && typeof body==="object" && Object.hasOwn(body,"courtIds") ? createEthnBlocks : createEthnBlock;
    return adminResponse(await create(staffPool,verifyStaffIdentity,body),201);
  } catch(error) { if(error instanceof Error&&error.message==="SLOT_TAKEN")return adminResponse({error:"SLOT_TAKEN"},409);if(error instanceof Error&&error.message==="COURT_NOT_FOUND")return adminResponse({error:error.message},404);return adminError(error); }
}
