import { memberProof } from "@/server/modules/member-portal/http";
export async function POST(request: Request, { params }: { params: Promise<{ bookingId: string }> }) { return memberProof(request, "booking", (await params).bookingId); }
