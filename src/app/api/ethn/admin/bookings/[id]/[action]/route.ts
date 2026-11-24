import { bookingAction, type BookingAction } from '@/lib/admin/ethn-booking-actions';
import { readAdminJson } from '@/lib/admin/ethn-json';
import { adminError,adminResponse,staffPool,verifyStaffIdentity } from '@/lib/admin/ethn-staff-server';
import { hasValidOrigin } from '@/lib/request-origin';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string;action:string}>}){
 if(!hasValidOrigin(request))return adminResponse({error:'FORBIDDEN'},403);
 const {id,action}=await params;if(!['refund','cancel','archive'].includes(action))return adminResponse({error:'NOT_FOUND'},404);
 try{return adminResponse(await bookingAction(staffPool,verifyStaffIdentity,id,action as BookingAction,await readAdminJson(request)));}
 catch(e){const code=e instanceof Error?e.message:'';if(['ACTION_CONFLICT','IDEMPOTENCY_INCOMPLETE'].includes(code))return adminResponse({error:code},409);if(code==='BOOKING_NOT_FOUND')return adminResponse({error:code},404);return adminError(e);}
}
