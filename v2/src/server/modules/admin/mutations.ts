import "server-only";
import { z } from "zod";
import { adminCommand, assertAdmin } from "./service";
import { adminRefreshPayment } from "@/server/modules/subscriptions/service";
import { AppError } from "@/server/errors";

const verification = z
  .object({
    action: z.literal("verify_payment"),
    targetId: z.coerce.number().int().positive().max(2147483647),
    orderCode: z.coerce.number().int().positive().safe(),
    reason: z.string().trim().min(5).max(500),
    confirmed: z.literal(true),
    version: z.string().max(150),
    days: z.coerce.number().int().min(1).max(365).optional(),
  })
  .strict();

export async function runAdminCommand(actorId: number, raw: unknown) {
  await assertAdmin(actorId);
  if (
    typeof raw === "object" &&
    raw !== null &&
    "action" in raw &&
    raw.action === "verify_payment"
  ) {
    const parsed = verification.safeParse(raw);
    if (!parsed.success)
      throw new AppError(400, "Mã đơn hoặc xác nhận thanh toán không hợp lệ.");
    await adminRefreshPayment(
      actorId,
      parsed.data.targetId,
      parsed.data.orderCode,
      parsed.data.reason,
    );
  } else {
    // Blank optional UI field is excluded; arbitrary extra fields remain rejected by the strict schema.
    const value =
      typeof raw === "object" &&
      raw !== null &&
      "orderCode" in raw &&
      raw.orderCode === ""
        ? Object.fromEntries(
            Object.entries(raw).filter(([k]) => k !== "orderCode"),
          )
        : raw;
    await adminCommand(actorId, value);
  }
}
