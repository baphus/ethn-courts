import { getCheckoutPool } from '@/db/checkout-client';
import { listPaymentMethods } from '@/lib/admin/ethn-payment-methods';
export const runtime = 'nodejs';
export async function GET() {
 try { return Response.json(await listPaymentMethods(getCheckoutPool()),{headers:{'Cache-Control':'no-store'}}); }
 catch { return Response.json({error:'Service unavailable'},{status:503,headers:{'Cache-Control':'no-store'}}); }
}
