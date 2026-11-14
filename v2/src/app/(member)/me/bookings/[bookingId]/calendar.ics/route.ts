import { requireHost } from "@/server/auth/service";
import { playerResourceId } from "@/server/modules/member-portal/http";
import { playerBookingCalendar } from "@/server/modules/scheduling/calendar";
import { safeError, privateHeaders } from "@/server/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  try {
    const account = await requireHost();
    return await playerBookingCalendar({ accountId: account.id, bookingId: playerResourceId((await params).bookingId) });
  } catch (error) {
    const safe = safeError(error);
    return Response.json({ detail: safe.message }, { status: safe.status, headers: privateHeaders });
  }
}
