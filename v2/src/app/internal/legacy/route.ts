import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getConfig } from "@/server/config";
import { AppError, safeError, privateHeaders } from "@/server/errors";
import { ensureMutation, clientIdentity } from "@/server/http";
import { boundedForm } from "@/server/form-data";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { ensureCsrf, setSession } from "@/server/auth/session";
import { requireHost, changePassword } from "@/server/auth/service";
import { consumeEmailToken, requestReset, sendVerification } from "@/server/auth/email-tokens";
import { readGuestOwner, setGuestOwner } from "@/server/auth/guest-cookie";
import { createClub, updateClub } from "@/server/modules/clubs/service";
import { grantAccess, revokeAccess } from "@/server/modules/clubs/access";
import { saveMember } from "@/server/modules/members/service";
import { createSession, changeRule, inviteFixed, toggleSession, cancelSession, editSession } from "@/server/modules/scheduling/service";
import { guestDecision, editGuestGroup, joinGuest, lookupGuest } from "@/server/modules/bookings/guest";
import { bookingDecision, addFixed, changePrivateLink } from "@/server/modules/bookings/host";
import { attendanceCommand, lifecycle, replacePerson, walkIn } from "@/server/modules/attendance/service";
import { issueCharges, closeSession, adjustCharge, changePayer, hostRecordMoney, draftAdjustment, guestPayer, saveExpense } from "@/server/modules/finance/service";
import { bulkDues, saveDue, toggleDue, updatePrices, updateBank, removeQr } from "@/server/modules/finance/club";
import { updateBankWithQr, reportBookingProof, reportDueProof, reviewProof } from "@/server/modules/finance/proofs";
import { legacyBookingAction } from "@/server/compatibility/booking-actions";
import { isLegacyPostPath } from "@/server/compatibility/legacy-paths";
import { validLocalTime } from "@/domain/session-policy";
import { deleteClub } from "@/server/modules/clubs/deletion";
import { createPlatformEntry, editPlatformEntry, extendTrial } from "@/server/modules/platform/service";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
function html(title: string, body: string) {
  return new Response(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · SportHost</title><style>body{font:16px/1.6 system-ui;background:#f3f6f8;color:#142d35;margin:0;padding:24px}main{max-width:560px;margin:auto;background:white;padding:24px;border-radius:16px}label{display:block;margin:16px 0}input,select,button{box-sizing:border-box;min-height:44px;width:100%;font:inherit;padding:10px;border:1px solid #ccd9dd;border-radius:8px}button{background:#087f6b;color:white;cursor:pointer}a{color:#087f6b}</style></head><body><main><h1>${escape(title)}</h1>${body}</main></body></html>`, { headers: { ...privateHeaders, "Content-Type": "text/html; charset=utf-8" } });
}
export async function POST(request: NextRequest) {
  try {
    ensureMutation(request.headers);
    const path = request.headers.get("x-sporthost-legacy-path") || "";
    if (!isLegacyPostPath(path)) throw new AppError(404, "Không tìm thấy trang này.");
    const upload = /\/(?:proof|payment-settings)$/.test(path);
    const form = await boundedForm(request, upload ? 4 * 1024 * 1024 : 64 * 1024);
    const text = (name: string) => String(form.get(name) ?? "");
    const number = (name: string) => Number(text(name));
    const optionalId = (name: string) => text(name) ? number(name) : null;
    const body = Object.fromEntries(form);
    ensureCsrf(text("csrf"), request.cookies.get("clubhost")?.value || "");
    const parts = path.split("/").slice(1).map(decodeURIComponent);
    const routeId = (position: number) => { const value = Number(parts[position]); if (!Number.isSafeInteger(value) || value < 1) throw new AppError(404, "Không tìm thấy dữ liệu."); return value; };
    const image = (name: string) => { const file = form.get(name); if (!(file instanceof File) || !file.size) throw new AppError(400, "Vui lòng chọn ảnh hợp lệ."); return file; };
    const moment = () => { const value = text("occurred_at"); if (!value) return undefined; if (!validLocalTime(value)) throw new AppError(400, "Thời điểm giao dịch chưa hợp lệ."); return value + ":00+07:00"; };
    const companions = () => {
      const names = form.getAll("companion_name"), genders = form.getAll("companion_gender"), levels = form.getAll("companion_level");
      if (names.length > 19 || genders.length > names.length || levels.length > names.length) throw new AppError(400, "Thông tin nhóm chưa hợp lệ.");
      return names.map((name, index) => ({ name: String(name), gender: String(genders[index] ?? "unspecified") as "unspecified", level: String(levels[index] ?? "") }));
    };
    const done = (destination: string) => {
      revalidatePath(destination.split(/[?#]/)[0]);
      return request.headers.get("accept")?.includes("application/json") ? NextResponse.json({ location: destination }, { headers: privateHeaders }) : NextResponse.redirect(new URL(destination, getConfig().origin), 303);
    };
    if (parts[0] === "join") {
      const publicId = parts[1]; await rateLimit(clientIdentity(request.headers), `${parts[2] === "lookup" ? "lookup" : "join"}:${publicId}`, parts[2] === "lookup" ? 60 : 30, parts[2] === "lookup" ? 60 : 300);
      if (parts[2] === "lookup") {
        const review = await lookupGuest(publicId, text("phone"), await readGuestOwner(publicId));
        return html("Xác nhận đăng ký", `<form method="post" action="/join/${escape(encodeURIComponent(publicId))}"><input type="hidden" name="csrf" value="${escape(text("csrf"))}"><input type="hidden" name="lookup_token" value="${escape(review.token)}"><label>Số điện thoại<input name="phone" readonly value="${escape(review.phone)}"></label><label>Họ tên<input name="name" required maxlength="100" value="${escape(review.name)}"></label><label>Giới tính<select name="gender"><option value="unspecified">Chưa cập nhật</option><option value="male"${review.gender === "male" ? " selected" : ""}>Nam</option><option value="female"${review.gender === "female" ? " selected" : ""}>Nữ</option></select></label><label>Trình độ<input name="level" maxlength="40" value="${escape(review.level)}"></label><button>Xác nhận gửi yêu cầu</button></form><a href="/join/${escape(encodeURIComponent(publicId))}">Quay lại thông tin buổi chơi</a>`);
      }
      const result = await joinGuest(publicId, { name: text("name"), phone: text("phone"), gender: (text("gender") || "unspecified") as "unspecified", level: text("level"), lookup_token: text("lookup_token"), channel: text("channel") === "facebook_link" ? "facebook_link" : "direct", companions: companions() }, await readGuestOwner(publicId));
      if (result.key && result.bookingId) await setGuestOwner(publicId, result.bookingId, result.key);
      return done(`/join/${encodeURIComponent(publicId)}?message=${result.message}`);
    }
    if (parts[0] === "attend") {
      const key = parts[1]; await rateLimit(clientIdentity(request.headers), "guest-token", 120, 60);
      if (parts[2] === "proof") { await rateLimit(clientIdentity(request.headers), "proof-upload", 15, 300); await reportBookingProof(key, image("proof"), { reportedAmount: text("reported_amount"), payerParticipantId: optionalId("payer_participant_id") }); }
      else if (parts[2] === "payer") await guestPayer(key, text("mode"));
      else if (parts[2] === "edit") await editGuestGroup(key, companions());
      else if (parts[2] === "rsvp") { if (!["yes", "no"].includes(text("action"))) throw new AppError(400, "Lựa chọn chưa hợp lệ."); await guestDecision(key, text("action") as "yes" | "no"); }
      else await guestDecision(key, "cancel");
      return done(`/attend/${encodeURIComponent(key)}`);
    }
    if (parts[0] === "dues" && parts[1] === "pay") {
      await rateLimit(clientIdentity(request.headers), "proof-upload", 15, 300); await reportDueProof(parts[2], image("proof")); return done(`/dues/pay/${encodeURIComponent(parts[2])}`);
    }
    if (path === "/forgot-password") {
      await rateLimit(clientIdentity(request.headers), "password-reset", 5, 3600); await requestReset(text("email"));
      return html("Kiểm tra email", '<p>Nếu địa chỉ này đã đăng ký, liên kết đặt lại mật khẩu sẽ được gửi.</p><a href="/login">Đăng nhập</a>');
    }
    if (path === "/reset-password" || path === "/verify-email") {
      if (path === "/reset-password" && text("password") !== text("confirm_password")) throw new AppError(400, "Mật khẩu xác nhận chưa khớp.");
      await consumeEmailToken(text("token"), path === "/reset-password" ? "reset" : "verify", path === "/reset-password" ? text("password") : undefined);
      const response = done(path === "/reset-password" ? "/login?message=reset" : "/account?message=verified");
      if (path === "/reset-password") response.cookies.delete("clubhost"); return response;
    }
    const host = await requireHost();
    if (parts[0] === "admin") {
      if (parts[1] === "clubs") { await extendTrial(host.id, routeId(2), text("days") ? number("days") : 30); return done("/admin"); }
      const values = { entryDate: text("entry_date"), direction: text("direction"), category: text("category"), amount: form.get("amount"), note: text("note") };
      if (parts[2]) await editPlatformEntry(host.id, routeId(2), values, number("version"), text("reason"));
      else await createPlatformEntry(host.id, values, text("request_key"));
      return done("/admin/platform-ledger");
    }
    if (path === "/account/password") {
      if (text("password") !== text("confirm_password")) throw new AppError(400, "Mật khẩu xác nhận chưa khớp.");
      await setSession(await changePassword(host.id, text("current_password"), text("password"))); return done("/account?message=password");
    }
    if (path === "/account/verify-email") { await rateLimit(clientIdentity(request.headers), "verify-email", 5, 3600); await sendVerification(host.id); return done("/account?message=verification-sent"); }
    if (path === "/clubs") return done(`/clubs/${(await createClub(host.id, body)).id}`);
    if (path === "/workspace/members") { const club = number("club_id"); await saveMember(host.id, club, null, body); return done(`/members?club_id=${club}`); }
    if (path === "/workspace/games") { const club = number("club_id"); const created = await createSession(host.id, club, body); return done(created.gameId ? `/games/${created.gameId}` : `/schedule?club_id=${club}`); }
    if (parts[0] === "clubs") {
      const club = routeId(1); const command = parts[2];
      if (command === "delete") { await deleteClub(host.id, club, text("confirmation_name")); return done("/clubs?deleted=1"); }
      if (command === "settings") await updateClub(host.id, club, body);
      else if (command === "members") await saveMember(host.id, club, parts[3] ? routeId(3) : null, body);
      else if (command === "cohosts") { if (parts[3]) await revokeAccess(host.id, club, routeId(3)); else await grantAccess(host.id, club, text("email"), text("role"), form.getAll("permissions").map(String)); }
      else if (command === "games") { const created = await createSession(host.id, club, { ...body, weeks: 1 }); return done(`/games/${created.gameId}`); }
      else if (command === "dues") { if (parts[3] === "bulk") await bulkDues(host.id, club, text("period")); else await saveDue(host.id, club, number("member_id"), { period: text("period"), amount: form.get("amount") }); return done(`/finance?club_id=${club}&period=${encodeURIComponent(text("period"))}`); }
      else if (command === "fixed-prices" || command === "monthly-prices") { const prefix = command === "fixed-prices" ? "fixed_fee" : "monthly_fee"; await updatePrices(host.id, club, command === "fixed-prices" ? "fixed" : "monthly", { amount: form.get(prefix), male: form.get(prefix + "_male"), female: form.get(prefix + "_female") }); }
      else if (command === "payment-settings") {
        if (parts[3] === "remove-qr") await removeQr(host.id, club);
        else { const values = { bankName: text("bank_name"), accountHolder: text("account_holder"), accountNumber: text("account_number"), paymentNote: text("payment_note") }; const qr = form.get("qr"); if (qr instanceof File && qr.size) await updateBankWithQr(host.id, club, values, qr); else await updateBank(host.id, club, values); }
      } else throw new AppError(404, "Không tìm thấy thao tác.");
      return done(`/clubs/${club}/settings`);
    }
    if (parts[0] === "dues") return done(`/finance?club_id=${await toggleDue(host.id, routeId(1))}`);
    if (parts[0] === "rules") { if (!["extend", "stop", "generate"].includes(parts[2])) throw new AppError(404, "Không tìm thấy thao tác."); const club = await changeRule(host.id, routeId(1), parts[2] as "extend" | "stop" | "generate", text("weeks") ? number("weeks") : 4); return done(`/schedule?club_id=${club}`); }
    if (parts[0] === "proofs") { const club = await reviewProof(host.id, routeId(1), { action: text("action"), note: text("note"), receivedAmount: text("received_amount"), occurredAt: moment() }); return done(`/payments/review?club_id=${club}`); }
    if (parts[0] === "games") {
      const game = routeId(1); const command = parts[2];
      if (command === "billing") {
        if (parts[3] === "issue") await issueCharges(host.id, game, text("draft_hash"));
        else if (parts[3] === "close") await closeSession(host.id, game);
        else if (parts[3] === "adjustments") await adjustCharge(host.id, game, { chargeId: number("charge_id"), amount: form.get("amount"), version: number("version"), reason: text("reason"), requestKey: text("request_key") });
        else if (parts[3] === "participants") await draftAdjustment(host.id, game, routeId(4), { exempt: ["true", "on", "1"].includes(text("exempt")), discount: form.get("discount") ?? 0, reason: text("reason") });
        else if (parts[3] === "bookings" && parts[5] === "payer") await changePayer(host.id, game, routeId(4), text("mode"));
        else if (parts[3] === "bookings" && parts[5] === "money") await hostRecordMoney(host.id, game, routeId(4), { amount: form.get("amount"), kind: text("kind"), source: text("source"), requestKey: text("request_key"), payerParticipantId: optionalId("payer_participant_id"), reason: text("reason"), reference: text("reference"), occurredAt: moment(), reversesId: optionalId("reverses_id") });
        else throw new AppError(404, "Không tìm thấy thao tác.");
        return done(`/games/${game}/billing`);
      }
      if (command === "bookings") {
        const booking = routeId(3);
        if (parts[4] === "private-link") await changePrivateLink(host.id, game, booking, parts[5] as "rotate" | "revoke");
        else if (["approve", "waitlist", "cancel", "reject"].includes(parts[4])) await bookingDecision(host.id, game, booking, parts[4], text("reason"));
        else await legacyBookingAction(host.id, game, booking, parts[4], text("reason"));
      } else if (command === "participants") { if (parts[4] === "attendance") await attendanceCommand(host.id, game, routeId(3), text("action"), number("version"), text("reason")); else await replacePerson(host.id, game, routeId(3), { name: text("name"), gender: text("gender") || "unspecified", level: text("level"), reason: text("reason"), version: number("version") }); }
      else if (command === "lifecycle") await lifecycle(host.id, game, parts[3], text("reason"));
      else if (command === "fixed") await addFixed(host.id, game, number("member_id"));
      else if (command === "invite-fixed") await inviteFixed(host.id, game);
      else if (command === "toggle-open") await toggleSession(host.id, game);
      else if (command === "cancel") await cancelSession(host.id, game);
      else if (command === "settings") await editSession(host.id, game, body);
      else if (command === "walk-ins") await walkIn(host.id, game, { name: text("name"), phone: text("phone"), gender: text("gender") || "unspecified", level: text("level") });
      else if (command === "expenses") await saveExpense(host.id, game, null, { title: text("title"), amount: form.get("amount"), category: text("category") || "OTHER", note: text("note"), allocated: !["false", "0", "off"].includes(text("allocated")) });
      else throw new AppError(404, "Không tìm thấy thao tác.");
      return done(`/games/${game}`);
    }
    throw new AppError(404, "Không tìm thấy thao tác.");
  } catch (error) { const safe = safeError(error); return Response.json({ detail: safe.message }, { status: safe.status, headers: privateHeaders }); }
}
