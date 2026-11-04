import { mediaResponse } from "@/server/media-response";
import { bookingQr } from "@/server/modules/finance/proofs";
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) { return mediaResponse(async () => bookingQr((await params).key)); }
