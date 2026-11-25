import { after } from 'next/server';
import { sendEthnMailBestEffort } from '@/lib/mail/ethn-hook-server';
import { bookingAction } from '@/lib/admin/ethn-booking-actions';
import { readAdminJson } from '@/lib/admin/ethn-json';
import { adminError,adminResponse,staffPool,verifyStaffIdentity } from '@/lib/admin/ethn-staff-server';
import { hasValidOrigin } from '@/lib/request-origin';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string;action:string}>}){
 if(!hasValidOrigin(request))return adminResponse({error:'FORBIDDEN'},403);
 const {id,action}=await params;
 if(action!=='cancel'&&action!=='archive')return adminResponse({error:'NOT_FOUND'},404);
 try{
  const result=await bookingAction(staffPool,verifyStaffIdentity,id,action,await readAdminJson(request));
  if (action !== 'archive') {
   try { after(() => sendEthnMailBestEffort(id)); } catch { /* Action already committed. */ }
  }
  return adminResponse(result);
 }
 catch(e){const code=e instanceof Error?e.message:'';if(['ACTION_CONFLICT','IDEMPOTENCY_INCOMPLETE'].includes(code))return adminResponse({error:code},409);if(code==='BOOKING_NOT_FOUND')return adminResponse({error:code},404);return adminError(e);}
}
