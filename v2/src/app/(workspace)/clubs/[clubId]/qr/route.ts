import { mediaResponse } from "@/server/media-response";
import { hostQr } from "@/server/modules/finance/proofs";
import { requireHost } from "@/server/auth/service";
export async function GET(_request: Request, { params }: { params: Promise<{ clubId: string }> }) { return mediaResponse(async () => hostQr((await requireHost()).id, Number((await params).clubId))); }
