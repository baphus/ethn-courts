import { releaseEthnBlock } from "@/lib/admin/ethn-calendar";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { hasValidOrigin } from "@/lib/request-origin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function DELETE(request: Request, context: { params: Promise<{id:string}> }) {
  if(!hasValidOrigin(request))return adminResponse({error:"FORBIDDEN"},403);
  try { await releaseEthnBlock(staffPool,verifyStaffIdentity,(await context.params).id);return new Response(null,{status:204,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}}); }
  catch(error) { if(error instanceof Error&&error.message==="BLOCK_NOT_FOUND")return adminResponse({error:error.message},404);return adminError(error); }
}
