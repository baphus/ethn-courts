import { createInternalBooking } from '@/lib/admin/ethn-internal-booking';
import { readAdminJson } from '@/lib/admin/ethn-json';
import { hasValidOrigin } from '@/lib/request-origin';
import { adminError,adminResponse,staffPool,verifyStaffIdentity } from '@/lib/admin/ethn-staff-server';
export const runtime='nodejs';
export async function GET(){return adminResponse({hold:null});}
export async function POST(request:Request){
 if(!hasValidOrigin(request))return adminResponse({error:'INVALID_ORIGIN'},403);
 try{return adminResponse(await createInternalBooking(staffPool,verifyStaffIdentity,await readAdminJson(request)));}
 catch(e){const code=e instanceof Error?e.message:'';if(['PRICE_CHANGED','SLOT_TAKEN','IDEMPOTENCY_INCOMPLETE','REFERENCE_TAKEN'].includes(code))return adminResponse({error:code},409);return adminError(e);}
}
