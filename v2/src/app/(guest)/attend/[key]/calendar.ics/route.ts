import { playerBookingCalendar } from "@/server/modules/scheduling/calendar";
import { safeError, privateHeaders } from "@/server/errors";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    return await playerBookingCalendar((await params).key);
  } catch (error) {
    const safe = safeError(error);
    return Response.json({ detail: safe.message }, { status: safe.status, headers: privateHeaders });
  }
}
