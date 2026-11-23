import { staffPool, adminError } from "@/lib/admin/ethn-staff-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[1-9]\d{0,18}$/.test(id)) return new Response(null, { status: 404 });
  try {
    const c = await staffPool.connect();
    try {
      const row = (await c.query("SELECT photo FROM ethn.courts WHERE id=$1", [id])).rows[0];
      if (!row?.photo) return new Response(null, { status: 404 });
      return new Response(new Uint8Array(row.photo), { headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });
    } finally { c.release(); }
  } catch (error) { return adminError(error); }
}
