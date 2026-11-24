import { getCheckoutPool } from '@/db/checkout-client';
import { paymentMethodQr } from '@/lib/admin/ethn-payment-methods';
export const runtime = 'nodejs';
export async function GET(_request: Request,{params}:{params:Promise<{id:string}>}) {
 try {
  const version=(new URL(_request.url).searchParams.get('version')??new URL(_request.url).searchParams.get('v'))??undefined;
  const qr=await paymentMethodQr(getCheckoutPool(),(await params).id,undefined,version);
  if(!qr)return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
  return new Response(new Uint8Array(qr),{headers:{'Content-Type':'image/webp','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
 } catch { return new Response(null,{status:503}); }
}
