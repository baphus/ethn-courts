import { hasValidOrigin } from "@/lib/request-origin";
import { addExpense, listExpenses } from "@/lib/admin/ethn-finance";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request: Request) {
  try { const u=new URL(request.url); for(const k of u.searchParams.keys()) if(!["from","to","page","limit"].includes(k)||u.searchParams.getAll(k).length!==1) throw new Error("INVALID_INPUT"); const n=(k:string,d:number)=>{const s=u.searchParams.get(k); return s===null?d:/^[1-9]\d*$/.test(s)?Number(s):NaN}; return adminResponse(await listExpenses(staffPool,verifyStaffIdentity,u.searchParams.get("from"),u.searchParams.get("to"),n("page",1),n("limit",50))); }
  catch(error){return adminError(error)}
}
export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({error:"FORBIDDEN"},403);
  try { if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json") throw new Error("INVALID_INPUT"); const reader=request.body?.getReader(); if(!reader) throw new Error("INVALID_INPUT"); const chunks:Uint8Array[]=[]; let size=0; while(true){const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>4096){await reader.cancel();throw new Error("INVALID_INPUT");} chunks.push(value);} let body:unknown; try{body=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new Error("INVALID_INPUT");} return adminResponse(await addExpense(staffPool,verifyStaffIdentity,body),201); }
  catch(error){return adminError(error)}
}
