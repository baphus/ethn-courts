import { listPaymentMethods, savePaymentMethod } from '@/lib/admin/ethn-payment-methods';
import { normalizeCourtPhoto } from '@/lib/admin/ethn-court-photo';
import { readAdminJson } from '@/lib/admin/ethn-json';
import { adminError, adminResponse, getCurrentStaff, staffPool, verifyStaffIdentity } from '@/lib/admin/ethn-staff-server';
import { hasValidOrigin } from '@/lib/request-origin';

export const runtime = 'nodejs';
export async function GET() { try { return adminResponse(await listPaymentMethods(staffPool,verifyStaffIdentity)); } catch(e) { return adminError(e); } }
export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({error:'FORBIDDEN'},403);
  try {
    const type = request.headers.get('content-type') ?? '';
    if (!/^multipart\/form-data\s*;/i.test(type)) {
      return adminResponse(await savePaymentMethod(staffPool, verifyStaffIdentity, await readAdminJson(request, 32768)));
    }
    await getCurrentStaff();
    const reader = request.body?.getReader();
    if (!reader) throw new Error('INVALID_INPUT');
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1048576 + 32768) { await reader.cancel(); throw new Error('INVALID_INPUT'); }
      chunks.push(value);
    }
    let form: FormData;
    try { form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': type } }).formData(); }
    catch { throw new Error('INVALID_INPUT'); }
    if ([...form.keys()].some(key => !['method', 'qrAction', 'file'].includes(key)) || form.getAll('method').length !== 1 || form.getAll('qrAction').length !== 1) throw new Error('INVALID_INPUT');
    const raw = form.get('method'), action = form.get('qrAction'), file = form.get('file');
    if (typeof raw !== 'string' || !['keep', 'remove', 'replace'].some(value => value === action) || form.getAll('file').length !== (action === 'replace' ? 1 : 0)) throw new Error('INVALID_INPUT');
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new Error('INVALID_INPUT'); }
    if (action === 'replace' && (!(file instanceof File) || file.size > 1048576)) throw new Error('INVALID_INPUT');
    const qr = file instanceof File ? await normalizeCourtPhoto(Buffer.from(await file.arrayBuffer()), file.type) : action === 'remove' ? null : undefined;
    return adminResponse(await savePaymentMethod(staffPool, verifyStaffIdentity, body, qr));
  } catch(e) { return adminError(e); }
}
