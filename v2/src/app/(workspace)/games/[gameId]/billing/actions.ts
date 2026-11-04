"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireHost } from "@/server/auth/service";
import { ensureCsrf, sessionCookie } from "@/server/auth/session";
import { ensureMutation } from "@/server/http";
import { issueCharges, closeSession, adjustCharge, hostRecordMoney, changePayer, draftAdjustment, saveExpense, deleteExpense } from "@/server/modules/finance/service";
import { AppError, safeError } from "@/server/errors";
import type { FormState } from "@/features/clubs/settings-form";
import { validLocalTime } from "@/domain/session-policy";

export async function billingCommand(gameId: number, command: string, targetId: number | null, _state: FormState, form: FormData): Promise<FormState> {
  try {
    ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
    const host = await requireHost(); const text = (name: string) => String(form.get(name) ?? "");
    if (command === "issue") await issueCharges(host.id, gameId, text("draft_hash"));
    else if (command === "close") await closeSession(host.id, gameId);
    else if (command === "adjust") await adjustCharge(host.id, gameId, { chargeId: Number(form.get("charge_id")), amount: form.get("amount"), version: Number(form.get("version")), reason: text("reason"), requestKey: text("request_key") });
    else if (command === "money" && targetId) {
      const moment = text("occurred_at");
      if (moment && !validLocalTime(moment)) throw new AppError(400, "Thời điểm giao dịch chưa hợp lệ.");
      await hostRecordMoney(host.id, gameId, targetId, { amount: form.get("amount"), kind: text("kind"), source: text("source"), requestKey: text("request_key"), reason: text("reason"), reference: text("reference"), payerParticipantId: text("payer_participant_id") ? Number(text("payer_participant_id")) : null, reversesId: text("reverses_id") ? Number(text("reverses_id")) : null, ...(moment ? { occurredAt: moment + ":00+07:00" } : {}) });
    } else if (command === "payer" && targetId) await changePayer(host.id, gameId, targetId, text("mode"));
    else if (command === "waive" && targetId) await draftAdjustment(host.id, gameId, targetId, { exempt: text("exempt") === "true", discount: form.get("discount") ?? 0, reason: text("reason") });
    else if (command === "expense") await saveExpense(host.id, gameId, targetId, { title: text("title"), amount: form.get("amount"), category: text("category") || "OTHER", allocated: text("allocated") !== "false", note: text("note") });
    else if (command === "delete-expense" && targetId) await deleteExpense(host.id, gameId, targetId);
    else throw new AppError(400, "Thao tác chưa hợp lệ.");
    revalidatePath(`/games/${gameId}`); revalidatePath(`/games/${gameId}/billing`);
    return { success: "Đã cập nhật sổ thu chi." };
  } catch (error) { return { error: safeError(error).message }; }
}
