export async function readAdminJson(request: Request, maxBytes = 8192): Promise<unknown> {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) throw new Error("INVALID_INPUT");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_INPUT");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { await reader.cancel(); throw new Error("INVALID_INPUT"); }
    chunks.push(value);
  }
  try { return JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(Buffer.concat(chunks))); }
  catch { throw new Error("INVALID_INPUT"); }
}
