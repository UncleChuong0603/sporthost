import { memberProof } from "@/server/modules/member-portal/http";
export async function POST(request: Request, { params }: { params: Promise<{ dueId: string }> }) { return memberProof(request, "due", (await params).dueId); }
