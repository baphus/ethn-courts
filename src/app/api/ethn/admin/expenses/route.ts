import { readAdminJson } from "@/lib/admin/ethn-json";
import { hasValidOrigin } from "@/lib/request-origin";
import { addExpense, listExpenses } from "@/lib/admin/ethn-finance";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request: Request) {
  try { const u=new URL(request.url); for(const k of u.searchParams.keys()) if(!["from","to","page","limit","category","q"].includes(k)||u.searchParams.getAll(k).length!==1) throw new Error("INVALID_INPUT"); const n=(k:string,d:number)=>{const s=u.searchParams.get(k); return s===null?d:/^[1-9]\d*$/.test(s)?Number(s):NaN}; return adminResponse(await listExpenses(staffPool,verifyStaffIdentity,u.searchParams.get("from"),u.searchParams.get("to"),n("page",1),n("limit",50),u.searchParams.get("category") ?? "",u.searchParams.get("q") ?? "")); }
  catch(error){return adminError(error)}
}
export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({error:"FORBIDDEN"},403);
  try { return adminResponse(await addExpense(staffPool, verifyStaffIdentity, await readAdminJson(request, 32768)), 201); }
  catch(error){return adminError(error)}
}
