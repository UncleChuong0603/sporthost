import { mediaResponse } from "@/server/media-response";
import { dueQr } from "@/server/modules/finance/proofs";
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) { return mediaResponse(async () => dueQr((await params).key)); }
