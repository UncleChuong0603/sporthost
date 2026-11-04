import "server-only";
import { subscriptionState } from "@/domain/subscription";
import { AppError } from "@/server/errors";

export function requirePro(club: { id: number; trialEndsAt: string | null; proEndsAt: string | null }) {
  if (!subscriptionState(club).active) throw new AppError(403, `Tính năng này cần SportHost Pro. Nâng cấp tại /clubs/${club.id}/subscription để tiếp tục.`, "pro_required");
}
