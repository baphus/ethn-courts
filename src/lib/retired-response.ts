export function retiredResponse(): Response {
  return Response.json({ error: "RETIRED" }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
