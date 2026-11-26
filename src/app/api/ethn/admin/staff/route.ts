export function GET() {
  return Response.json({ error: "GONE" }, { status: 410, headers: { "Cache-Control": "private, no-store" } });
}

export { GET as PUT };
