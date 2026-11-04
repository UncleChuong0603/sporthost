import { mediaResponse } from "@/server/media-response";
import { proofImage } from "@/server/modules/finance/proofs";
import { requireHost } from "@/server/auth/service";
export async function GET(_request: Request, { params }: { params: Promise<{ proofId: string }> }) { return mediaResponse(async () => proofImage((await requireHost()).id, Number((await params).proofId))); }
