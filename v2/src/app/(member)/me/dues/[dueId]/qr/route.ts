import { mediaResponse } from "@/server/media-response";
import { requireHost } from "@/server/auth/service";
import { dueQr } from "@/server/modules/finance/proofs";
import { playerResourceId } from "@/server/modules/member-portal/http";
export async function GET(_request: Request, { params }: { params: Promise<{ dueId: string }> }) {
  return mediaResponse(async () => dueQr({ accountId: (await requireHost()).id, dueId: playerResourceId((await params).dueId) }));
}
