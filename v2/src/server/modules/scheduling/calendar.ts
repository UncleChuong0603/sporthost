import "server-only";
import { sessionCalendar, type CalendarSession } from "@/domain/calendar";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db/client";
import { AppError, privateHeaders } from "@/server/errors";
import { guestContext } from "@/server/modules/bookings/guest";
import type { PlayerBookingAccess } from "@/server/modules/member-portal/access";
import { gameActor } from "./service";

function download(game: CalendarSession, id: number) {
  return new Response(sessionCalendar(game, getConfig().origin), { headers: {
    ...privateHeaders,
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `attachment; filename="sporthost-game-${id}.ics"`,
    "X-Content-Type-Options": "nosniff",
  } });
}

export async function hostCalendar(hostId: number, gameId: number) {
  const { game, club } = await gameActor(getDb(), hostId, gameId, "view");
  return download({ ...game, clubName: club.name }, game.id);
}

export async function playerBookingCalendar(access: PlayerBookingAccess) {
  const { game, club, booking } = await guestContext(getDb(), access);
  if (booking.status !== "confirmed" || game.isCancelled) throw new AppError(409, "Chỉ lưu lịch khi đăng ký đã được xác nhận và buổi chơi chưa hủy.");
  return download({ ...game, clubName: club.name }, game.id);
}
