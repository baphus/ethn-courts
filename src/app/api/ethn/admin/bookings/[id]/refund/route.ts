import { POST as bookingAction } from "../[action]/route";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return bookingAction(request, { params: params.then(({ id }) => ({ id, action: "refund" })) });
}
