import { setNoShow } from '@/lib/admin/ethn-outcomes';
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from '@/lib/admin/ethn-staff-server';
import { readAdminJson } from '@/lib/admin/ethn-json';
import { hasValidOrigin } from '@/lib/request-origin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
  if(!hasValidOrigin(request))return adminResponse({error:'FORBIDDEN'},403);
  try{
    const b=await readAdminJson(request);
    if(!b||typeof b!=='object'||Array.isArray(b))throw new Error('INVALID_INPUT');
    const v=b as Record<string,unknown>;
    if(v.action!=='noShow'||Object.keys(v).sort().join(',')!=='action,bookingId,expectedNoShow,noShow,reason'||typeof v.bookingId!=='string'||typeof v.noShow!=='boolean'||typeof v.expectedNoShow!=='boolean'||typeof v.reason!=='string')throw new Error('INVALID_INPUT');
    return adminResponse(await setNoShow(staffPool,verifyStaffIdentity,v.bookingId,{noShow:v.noShow,expectedNoShow:v.expectedNoShow,reason:v.reason}));
  }catch(e){if(e instanceof Error&&['NOT_COMPLETED','NOT_READY_TO_COMPLETE','STALE_OUTCOME'].includes(e.message))return adminResponse({error:e.message},409);return adminError(e);}
}
