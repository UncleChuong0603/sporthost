import "server-only";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { transaction } from "@/server/db/client";
import { bookingsInClubhost as bookings, paymentProofsInClubhost as proofs } from "@/server/db/schema";
import { gameActor, mutableAttendance } from "@/server/modules/scheduling/service";
import { participants, auditChange } from "@/server/modules/bookings/core";
import { markAttendance } from "@/server/modules/attendance/service";
import { batchFor } from "@/server/modules/finance/queries";
import { scopedBooking } from "@/server/modules/finance/service";
import { AppError } from "@/server/errors";

export async function legacyBookingAction(hostId: number, gameId: number, bookingId: number, action: string, reason = "") {
  if (!["paid", "unpaid", "refund", "attended", "absent"].includes(action)) throw new AppError(400, "Thao tác chưa hợp lệ.");
  return transaction(async client => {
    const db = drizzle(client); const money = ["paid", "unpaid", "refund"].includes(action);
    const { game } = await gameActor(db, hostId, gameId, money ? "manage_finance" : "check_in", true);
    const booking = await scopedBooking(db, gameId, bookingId);
    if (money) {
      if (await batchFor(db, gameId)) throw new AppError(409, "Đã phát hành tiền. Ghi thu / hoàn / hoàn tác trong đối soát để giữ lịch sử.");
      if (game.feeMode === "COST_SHARING") throw new AppError(409, "Chia đều cần phát hành tiền trước khi xác nhận thực nhận.");
      await db.update(bookings).set({ paid: action === "paid", paymentStatus: action === "paid" ? "confirmed" : action === "refund" ? "refunded" : "unpaid" }).where(eq(bookings.id, bookingId));
      if (action === "paid") await db.update(proofs).set({ status: "confirmed", reviewedBy: hostId, reviewedAt: new Date().toISOString(), note: "Host ghi nhận đã thu trực tiếp" }).where(and(eq(proofs.bookingId, bookingId), eq(proofs.status, "reported")));
    } else {
      mutableAttendance(game); const party = await participants(db, bookingId);
      if (party.length !== 1) throw new AppError(409, "Điểm danh riêng từng người trong danh sách người chơi.");
      await markAttendance(db, game, booking, party[0], action === "attended" ? "check_in" : "reset", hostId, party[0].attendanceVersion, reason);
    }
    await auditChange(db, game.clubId, hostId, "Cập nhật booking", null, { booking_id: bookingId, action });
  });
}
