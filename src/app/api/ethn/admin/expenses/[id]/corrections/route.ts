import { hasValidOrigin } from "@/lib/request-origin";
import { correctExpense, listExpenseCorrections } from "@/lib/admin/ethn-expense-corrections";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context = { params: Promise<{id:string}> };
export async function GET(_request: Request, {params}: Context) { try { return adminResponse(await listExpenseCorrections(staffPool,verifyStaffIdentity,(await params).id)); } catch(error) { return adminError(error); } }
export async function POST(request: Request, {params}: Context) {
  if(!hasValidOrigin(request)) return adminResponse({error:"FORBIDDEN"},403);
  try { if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json") throw new Error("INVALID_INPUT"); const reader=request.body?.getReader(); if(!reader) throw new Error("INVALID_INPUT"); const chunks:Uint8Array[]=[]; let size=0; while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw new Error("INVALID_INPUT")}chunks.push(value)} let body:unknown;try{body=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)))}catch{throw new Error("INVALID_INPUT")}return adminResponse(await correctExpense(staffPool,verifyStaffIdentity,(await params).id,body),201); } catch(error) { return adminError(error); }
}
