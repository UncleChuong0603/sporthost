import { mediaResponse } from "@/server/media-response";
import { requireHost } from "@/server/auth/service";
import { bookingQr } from "@/server/modules/finance/proofs";
import { playerResourceId } from "@/server/modules/member-portal/http";
export async function GET(_request: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  return mediaResponse(async () => bookingQr({ accountId: (await requireHost()).id, bookingId: playerResourceId((await params).bookingId) }));
}
