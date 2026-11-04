"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ensureMutation } from "@/server/http";
import { ensureCsrf, sessionCookie } from "@/server/auth/session";
import { requireHost } from "@/server/auth/service";
import { createSession, changeRule, inviteFixed, toggleSession, cancelSession, editSession } from "@/server/modules/scheduling/service";
import { bookingDecision, addFixed, changePrivateLink } from "@/server/modules/bookings/host";
import { attendanceCommand, lifecycle, replacePerson, walkIn } from "@/server/modules/attendance/service";
import { AppError, safeError } from "@/server/errors";
import type { FormState } from "@/features/clubs/settings-form";
import { legacyBookingAction } from "@/server/compatibility/booking-actions";

export async function createGameAction(_state: FormState, form: FormData): Promise<FormState> {
  let destination = "/schedule";
  try {
    ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie()); const host = await requireHost();
    const clubId = Number(form.get("club_id")); if (!Number.isSafeInteger(clubId) || clubId < 1) throw new AppError(400, "Câu lạc bộ chưa hợp lệ.");
    const result = await createSession(host.id, clubId, Object.fromEntries(form));
    destination = result.gameId ? `/games/${result.gameId}` : `/schedule?club_id=${clubId}`;
    revalidatePath("/schedule");
  } catch (error) { return { error: safeError(error).message }; }
  redirect(destination);
}
export async function gameCommand(gameId: number, command: string, targetId: number | null, _state: FormState, form: FormData): Promise<FormState> {
  try {
    ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie()); const host = await requireHost(); const reason = String(form.get("reason") || "");
    if (["paid", "unpaid", "refund"].includes(command) && targetId) await legacyBookingAction(host.id, gameId, targetId, command, reason);
    else if (["approve", "waitlist", "cancel-booking", "reject"].includes(command) && targetId) await bookingDecision(host.id, gameId, targetId, command === "cancel-booking" ? "cancel" : command, reason);
    else if (["start", "finish", "reopen"].includes(command)) await lifecycle(host.id, gameId, command, reason);
    else if (["check_in", "no_show", "check_out", "reset"].includes(command) && targetId) await attendanceCommand(host.id, gameId, targetId, command, Number(form.get("version")), reason);
    else if (command === "replace" && targetId) await replacePerson(host.id, gameId, targetId, { name: String(form.get("name") || ""), gender: String(form.get("gender") || "unspecified"), level: String(form.get("level") || ""), reason, version: Number(form.get("version")) });
    else if (command === "walk-in") await walkIn(host.id, gameId, { name: String(form.get("name") || ""), phone: String(form.get("phone") || ""), gender: String(form.get("gender") || "unspecified"), level: String(form.get("level") || "") });
    else if (command === "invite") await inviteFixed(host.id, gameId);
    else if (command === "fixed") await addFixed(host.id, gameId, Number(form.get("member_id")));
    else if (command === "toggle") await toggleSession(host.id, gameId);
    else if (command === "cancel-session") await cancelSession(host.id, gameId);
    else if (command === "settings") await editSession(host.id, gameId, Object.fromEntries(form));
    else if (["rotate", "revoke"].includes(command) && targetId) await changePrivateLink(host.id, gameId, targetId, command as "rotate" | "revoke");
    else throw new AppError(400, "Thao tác chưa hợp lệ.");
    revalidatePath(`/games/${gameId}`); revalidatePath("/schedule"); return { success: "Đã cập nhật buổi chơi." };
  } catch (error) { return { error: safeError(error).message }; }
}
export async function ruleCommand(ruleId: number, command: "stop" | "generate" | "extend", _state: FormState, form: FormData): Promise<FormState> {
  try {
    ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie()); const host = await requireHost();
    await changeRule(host.id, ruleId, command, Number(form.get("weeks") || 4)); revalidatePath("/schedule"); return { success: "Đã cập nhật lịch lặp." };
  } catch (error) { return { error: safeError(error).message }; }
}
