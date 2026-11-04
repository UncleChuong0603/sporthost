import "server-only";
import { revalidatePath } from "next/cache";
import { requireHost } from "@/server/auth/service";
import { sessionCookie, ensureCsrf } from "@/server/auth/session";
import { ensureMutation, clientIdentity } from "@/server/http";
import { boundedForm } from "@/server/form-data";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { reportBookingProof, reportDueProof } from "@/server/modules/finance/proofs";
import { AppError, safeError, privateHeaders } from "@/server/errors";

export function playerResourceId(raw: string) {
  if (!/^[1-9]\d{0,9}$/.test(raw) || Number(raw) > 2147483647) throw new AppError(404, "Không tìm thấy thông tin.");
  return Number(raw);
}
export async function memberProof(request: Request, type: "booking" | "due", rawId: string) {
  try {
    ensureMutation(request.headers); const account = await requireHost(), id = playerResourceId(rawId);
    const form = await boundedForm(request, 4*1024*1024);
    ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
    await rateLimit(clientIdentity(request.headers), "proof-upload", 15, 300);
    const proof = form.get("proof"); if (!(proof instanceof File) || !proof.size) throw new AppError(400, "Chọn ảnh biên nhận hợp lệ.");
    if (type === "booking") {
      const payer = String(form.get("payer_participant_id") || "");
      await reportBookingProof({ accountId: account.id, bookingId: id }, proof, { reportedAmount: form.get("reported_amount"), payerParticipantId: payer ? playerResourceId(payer) : null });
    } else await reportDueProof({ accountId: account.id, dueId: id }, proof);
    revalidatePath("/me", "layout");
    const location = type === "booking" ? `/me/bookings/${id}` : `/me/dues/${id}`;
    if (request.headers.get("accept")?.includes("application/json")) return Response.json({ location }, { headers: privateHeaders });
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: location } });
  } catch (error) { const safe = safeError(error); return Response.json({ detail: safe.message }, { status: safe.status, headers: privateHeaders }); }
}
