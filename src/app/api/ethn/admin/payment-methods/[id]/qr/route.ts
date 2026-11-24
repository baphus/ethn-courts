import { paymentMethodQr, savePaymentMethod, listPaymentMethods } from '@/lib/admin/ethn-payment-methods';
import { normalizeCourtPhoto, MAX_COURT_PHOTO_BYTES } from '@/lib/admin/ethn-court-photo';
import { adminError, adminResponse, staffPool, verifyStaffIdentity, getCurrentStaff } from '@/lib/admin/ethn-staff-server';
import { hasValidOrigin } from '@/lib/request-origin';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 try { const qr=await paymentMethodQr(staffPool,(await params).id,verifyStaffIdentity); return qr?new Response(new Uint8Array(qr),{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}):new Response(null,{status:404}); } catch(e){return adminError(e);}
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 if(!hasValidOrigin(request))return adminResponse({error:'FORBIDDEN'},403);
 try {
  await getCurrentStaff();
  const reader=request.body?.getReader(); if(!reader)throw new Error('INVALID_INPUT');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_COURT_PHOTO_BYTES+16384){await reader.cancel();throw new Error('INVALID_INPUT');}chunks.push(value);}
  const form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('Content-Type')??''}}).formData();
  if([...form.keys()].some(k=>k!=='file')||form.getAll('file').length!==1)throw new Error('INVALID_INPUT');
  const file=form.get('file');if(!(file instanceof File))throw new Error('INVALID_INPUT');
  const id=(await params).id;
  const {methods}=await listPaymentMethods(staffPool,verifyStaffIdentity);const method=methods.find(m=>m.id===id);if(!method)throw new Error('INVALID_INPUT');
  const qr=await normalizeCourtPhoto(Buffer.from(await file.arrayBuffer()),file.type);
  return adminResponse(await savePaymentMethod(staffPool,verifyStaffIdentity,{id,name:method.name,instructions:method.instructions,enabled:method.enabled},qr));
 }catch(e){return adminError(e);}
}
