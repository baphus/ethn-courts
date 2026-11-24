import { listPaymentMethods, savePaymentMethod } from '@/lib/admin/ethn-payment-methods';
import { readAdminJson } from '@/lib/admin/ethn-json';
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from '@/lib/admin/ethn-staff-server';
import { hasValidOrigin } from '@/lib/request-origin';
export const runtime = 'nodejs';
export async function GET() { try { return adminResponse(await listPaymentMethods(staffPool,verifyStaffIdentity)); } catch(e) { return adminError(e); } }
export async function POST(request: Request) {
 if (!hasValidOrigin(request)) return adminResponse({error:'FORBIDDEN'},403);
 try { return adminResponse(await savePaymentMethod(staffPool,verifyStaffIdentity,await readAdminJson(request))); } catch(e) { return adminError(e); }
}
