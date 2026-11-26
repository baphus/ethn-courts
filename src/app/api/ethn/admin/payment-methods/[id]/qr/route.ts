import { paymentMethodQr } from '@/lib/admin/ethn-payment-methods';
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from '@/lib/admin/ethn-staff-server';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 try { const qr=await paymentMethodQr(staffPool,(await params).id,verifyStaffIdentity); return qr?new Response(new Uint8Array(qr),{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}):new Response(null,{status:404}); } catch(e){return adminError(e);}
}
export { retiredResponse as POST } from "@/lib/retired-response";
