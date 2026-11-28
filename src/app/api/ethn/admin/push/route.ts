import { retiredResponse } from "@/lib/retired-response";

export function GET() {
  return retiredResponse();
}

export { GET as POST, GET as DELETE };
