import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { installTestEnv } from "./environment";
import { getPool, closePool, transaction } from "@/server/db/client";
import { signup } from "@/server/auth/service";
import { createClub } from "@/server/modules/clubs/service";
import { deleteClub } from "@/server/modules/clubs/deletion";
import { saveMember } from "@/server/modules/members/service";
import { linkMemberAccount, unlinkMemberAccount } from "@/server/modules/member-portal/service";
import { createSession, inviteFixed, editSession, cancelSession } from "@/server/modules/scheduling/service";
import { bookingDecision } from "@/server/modules/bookings/host";
import { guestDecision } from "@/server/modules/bookings/guest";
import { bookingNotification } from "@/server/modules/notifications/events";
import { markNotificationsRead, notificationInbox, saveClubReminders, setReminderPreference, unreadCount } from "@/server/modules/notifications/service";
import { runReminderPage, rsvpReminderDue } from "@/server/modules/notifications/reminders";
import { localNow } from "@/domain/session-policy";
import { lifecycle, attendanceCommand } from "@/server/modules/attendance/service";
import { issueCharges, hostRecordMoney } from "@/server/modules/finance/service";
import { financeView } from "@/server/modules/finance/queries";
import { saveDue } from "@/server/modules/finance/club";
import { reviewProof } from "@/server/modules/finance/proofs";

const prefix = "v2-notices-" + randomBytes(5).toString("hex");
const accountIds: number[] = [];
let owner: number, player: number, outsider: number, club: number, member: number, otherMember: number;
const email = (role: string) => `${prefix}-${role}@example.com`;
beforeAll(async () => {
  installTestEnv();
  for (const role of ["owner", "player", "outsider"]) accountIds.push((await signup(email(role), "notification-password-123")).id);
  [owner, player, outsider] = accountIds;
  await getPool().query("UPDATE clubhost.hosts SET email_verified=true WHERE id=ANY($1::int[])", [accountIds]);
  club = (await createClub(owner, { name: prefix })).id;
  member = (await saveMember(owner, club, null, { name: "Notification player", kind: "fixed", phone: "0903366001" })).id;
  otherMember = (await saveMember(owner, club, null, { name: "Other player", kind: "fixed", phone: "0903366002" })).id;
  await linkMemberAccount(owner, club, member, email("player"));
});
afterAll(async () => {
  const audit = (await getPool().query("SELECT id FROM clubhost.audit_logs WHERE club_id=$1", [club])).rows.map(row => row.id);
  if (club) await deleteClub(owner, club, prefix);
  await getPool().query("DELETE FROM clubhost.audit_logs WHERE id=ANY($1::int[]) OR host_id=ANY($2::int[])", [audit, accountIds]);
  await getPool().query("DELETE FROM clubhost.hosts WHERE id=ANY($1::int[])", [accountIds]);
  await closePool();
});
async function invitation(hours = 48, capacity = 10) {
  const startsAt = localNow(new Date(Date.now() + hours * 3600000));
  const game = (await createSession(owner, club, { title: prefix, starts_at: startsAt, capacity, fixed_fee: 70000, guest_fee: 70000, approval_mode: "AUTO_APPROVE" })).gameId!;
  await inviteFixed(owner, game);
  const rows = (await getPool().query("SELECT id,member_id FROM clubhost.bookings WHERE session_id=$1", [game])).rows;
  return { game, booking: rows.find(row => row.member_id === member)!.id as number, otherBooking: rows.find(row => row.member_id === otherMember)!.id as number };
}
const inbox = () => notificationInbox(player);
const settings = { rsvpEnabled: true, paymentEnabled: false, rsvpLeadHours: 24, paymentIntervalDays: 3 };
async function proofFixture(target: { bookingId?: number; dueId?: number }) {
  const asset = (await getPool().query("INSERT INTO clubhost.stored_assets(club_id,key,kind,sha256,size,created_at) VALUES($1,$2,'proof',$3,0,$4) RETURNING id", [club, `clubs/${club}/proof/${randomBytes(24).toString("base64url")}.png`, "0".repeat(64), new Date().toISOString()])).rows[0].id;
  return (await getPool().query("INSERT INTO clubhost.payment_proofs(booking_id,due_id,asset_id,status,note,created_at,reported_amount) VALUES($1,$2,$3,'reported','',$4,70000) RETURNING id", [target.bookingId ?? null, target.dueId ?? null, asset, new Date().toISOString()])).rows[0].id as number;
}
describe("transactional notifications, revocation and opt-in Pro reminders", () => {
  it("shows linked invitations only to their recipient and marks only their inbox", async () => {
    const { booking } = await invitation();
    expect((await inbox()).rows.some(row => row.bookingId === booking && row.kind === "invited")).toBe(true);
    expect((await notificationInbox(outsider)).rows).toEqual([]);
    expect(await unreadCount(player)).toBeGreaterThan(0);
    await markNotificationsRead(outsider); expect(await unreadCount(player)).toBeGreaterThan(0);
    await markNotificationsRead(player); expect(await unreadCount(player)).toBe(0);
  });
  it("rolls back notifications with the business transaction and deduplicates concurrent events", async () => {
    const { booking } = await invitation();
    await expect(transaction(async client => { await bookingNotification(drizzle(client), booking, "rollback:" + prefix, "confirmed"); throw Error("rollback"); })).rejects.toThrow("rollback");
    expect((await getPool().query("SELECT id FROM clubhost.notifications WHERE event_key=$1", ["rollback:" + prefix])).rowCount).toBe(0);
    await Promise.all([1, 2].map(() => transaction(client => bookingNotification(drizzle(client), booking, "duplicate:" + prefix, "confirmed"))));
    expect((await getPool().query("SELECT id FROM clubhost.notifications WHERE event_key=$1", ["duplicate:" + prefix])).rowCount).toBe(1);
  });
  it("notifies host decisions once and notifies waitlist promotion", async () => {
    const { game, booking, otherBooking } = await invitation(48, 1);
    await guestDecision({ accountId: player, bookingId: booking }, "yes");
    await bookingDecision(owner, game, booking, "waitlist");
    const before = (await getPool().query("SELECT count(*)::int n FROM clubhost.notifications WHERE booking_id=$1", [booking])).rows[0].n;
    await bookingDecision(owner, game, booking, "waitlist");
    expect((await getPool().query("SELECT count(*)::int n FROM clubhost.notifications WHERE booking_id=$1", [booking])).rows[0].n).toBe(before);
    await bookingDecision(owner, game, otherBooking, "approve");
    await bookingDecision(owner, game, otherBooking, "cancel");
    expect((await inbox()).rows.some(row => row.bookingId === booking && row.kind === "promoted")).toBe(true);
  });
  it("notifies schedule edits and cancellation while excluding already-cancelled registrations", async () => {
    const { game, booking } = await invitation();
    await editSession(owner, game, { venue: "New court" });
    await cancelSession(owner, game); await cancelSession(owner, game);
    const kinds = (await getPool().query("SELECT kind FROM clubhost.notifications WHERE booking_id=$1", [booking])).rows.map(row => row.kind);
    expect(kinds.filter(kind => kind === "session_changed")).toHaveLength(1);
    expect(kinds.filter(kind => kind === "session_cancelled")).toHaveLength(1);
    const cancelled = await invitation(); await bookingDecision(owner, cancelled.game, cancelled.booking, "cancel"); await cancelSession(owner, cancelled.game);
    expect((await getPool().query("SELECT id FROM clubhost.notifications WHERE booking_id=$1 AND kind='session_cancelled'", [cancelled.booking])).rowCount).toBe(0);
  });
  it("revokes historical content on unlink and never exposes it to a reassigned account", async () => {
    await unlinkMemberAccount(owner, club, member);
    expect((await inbox()).rows).toEqual([]); expect(await unreadCount(player)).toBe(0);
    await linkMemberAccount(owner, club, member, email("outsider"));
    expect((await notificationInbox(outsider)).rows).toEqual([]);
    await unlinkMemberAccount(owner, club, member); await linkMemberAccount(owner, club, member, email("player"));
    expect((await inbox()).rows).toEqual([]);
  });
  it("requires owner rights and active Pro, but always permits turning reminders off", async () => {
    await expect(saveClubReminders(outsider, club, settings)).rejects.toMatchObject({ status: 404 });
    await getPool().query("UPDATE clubhost.clubs SET trial_ends_at=NULL,pro_ends_at=NULL WHERE id=$1", [club]);
    await expect(saveClubReminders(owner, club, settings)).rejects.toMatchObject({ code: "pro_required" });
    await saveClubReminders(owner, club, { ...settings, rsvpEnabled: false });
    await expect(saveClubReminders(owner, club, { ...settings, rsvpLeadHours: 0 })).rejects.toMatchObject({ status: 400 });
    await getPool().query("UPDATE clubhost.clubs SET pro_ends_at=$2 WHERE id=$1", [club, new Date(Date.now() + 30 * 86400000).toISOString()]);
    await saveClubReminders(owner, club, settings);
  });
  it("notifies proof results for monthly dues and never repeats an already-reviewed result", async () => {
    for (const [period, action, kind] of [["2026-01", "reject", "proof_rejected"], ["2026-02", "confirm", "proof_confirmed"]] as const) {
      const due = await saveDue(owner, club, member, { period, amount: 70000 }); const proof = await proofFixture({ dueId: due.id });
      await reviewProof(owner, proof, { action, note: "Checked" });
      await expect(reviewProof(owner, proof, { action })).rejects.toMatchObject({ status: 409 });
      expect((await inbox()).rows.filter(row => row.dueId === due.id && row.kind === kind)).toHaveLength(1);
    }
  });
  it("honors recipient opt-in, cancellation, RSVP responses, expiry and duplicate cron runs", async () => {
    const near = await invitation(12), far = await invitation(72);
    await runReminderPage();
    expect((await inbox()).rows.some(row => row.kind === "rsvp_reminder")).toBe(false);
    await setReminderPreference(player, true);
    await Promise.all([runReminderPage(), runReminderPage()]);
    let rows = (await inbox()).rows.filter(row => row.kind === "rsvp_reminder");
    expect(rows.filter(row => row.bookingId === near.booking)).toHaveLength(1);
    expect(rows.some(row => row.bookingId === far.booking)).toBe(false);
    const declined = await invitation(12); await guestDecision({ accountId: player, bookingId: declined.booking }, "no");
    const cancelled = await invitation(12); await cancelSession(owner, cancelled.game);
    await runReminderPage(); rows = (await inbox()).rows.filter(row => row.kind === "rsvp_reminder");
    expect(rows.some(row => [declined.booking, cancelled.booking].includes(row.bookingId!))).toBe(false);
    const disabled = await invitation(12); await setReminderPreference(player, false); await runReminderPage();
    expect((await inbox()).rows.some(row => row.kind === "rsvp_reminder" && row.bookingId === disabled.booking)).toBe(false);
    await setReminderPreference(player, true);
    await getPool().query("UPDATE clubhost.clubs SET pro_ends_at=NULL WHERE id=$1", [club]); await runReminderPage();
    expect((await inbox()).rows.some(row => row.kind === "rsvp_reminder" && row.bookingId === disabled.booking)).toBe(false);
    await getPool().query("UPDATE clubhost.clubs SET pro_ends_at=$2 WHERE id=$1", [club, new Date(Date.now() + 30 * 86400000).toISOString()]);
  });
  it("stops reminders when a suspended account or read-only deployment blocks writes", async () => {
    const target = await invitation(12);
    await getPool().query("INSERT INTO clubhost.account_controls(account_id,suspended) VALUES($1,true)", [player]);
    await runReminderPage(); await expect(inbox()).rejects.toMatchObject({ code: "account_suspended" });
    expect((await getPool().query("SELECT id FROM clubhost.notifications WHERE booking_id=$1 AND kind='rsvp_reminder'", [target.booking])).rowCount).toBe(0);
    await getPool().query("DELETE FROM clubhost.account_controls WHERE account_id=$1", [player]);
    vi.stubEnv("APP_READ_ONLY", "true");
    try { await expect(runReminderPage()).rejects.toMatchObject({ status: 503 }); } finally { vi.stubEnv("APP_READ_ONLY", "false"); }
  });
  it("uses the earliest RSVP deadline and never reminds at or past that deadline", () => {
    const game = { startsAt: "2030-01-03T18:00", registrationDeadline: "2030-01-02T18:00", rsvpDeadline: null, isOpen: true, isCancelled: false, lifecycleStatus: "OPEN" };
    expect(rsvpReminderDue(game, 24, new Date("2030-01-01T18:00:00+07:00"))).toBe(true);
    expect(rsvpReminderDue(game, 24, new Date("2030-01-02T18:00:00+07:00"))).toBe(false);
  });
  it("reminds only real issued debt and stops after payment or a pending proof", async () => {
    const { game, booking } = await invitation(12);
    await guestDecision({ accountId: player, bookingId: booking }, "yes");
    await lifecycle(owner, game, "start");
    const person = (await getPool().query("SELECT id FROM clubhost.booking_participants WHERE booking_id=$1", [booking])).rows[0].id;
    await attendanceCommand(owner, game, person, "check_in", 0);
    await lifecycle(owner, game, "finish"); await issueCharges(owner, game, (await financeView(owner, game)).draftHash);
    await saveClubReminders(owner, club, { ...settings, rsvpEnabled: false, paymentEnabled: true });
    const at = new Date(Date.now() + 4 * 86400000);
    await runReminderPage(0, at); await runReminderPage(0, at);
    expect((await getPool().query("SELECT id FROM clubhost.notifications WHERE booking_id=$1 AND kind='payment_reminder'", [booking])).rowCount).toBe(1);
    const proof = await proofFixture({ bookingId: booking });
    const later = new Date(at.valueOf() + 4 * 86400000);
    await runReminderPage(0, later);
    expect((await getPool().query("SELECT id FROM clubhost.notifications WHERE booking_id=$1 AND kind='payment_reminder'", [booking])).rowCount).toBe(1);
    await reviewProof(owner, proof, { action: "reject", note: "Wrong receipt" });
    await runReminderPage(0, later);
    expect((await getPool().query("SELECT id FROM clubhost.notifications WHERE booking_id=$1 AND kind='payment_reminder'", [booking])).rowCount).toBe(2);
    await hostRecordMoney(owner, game, booking, { amount: 70000, kind: "RECEIVED", source: "CASH", requestKey: prefix + "-received", payerParticipantId: null, reason: "Payment verified" });
    await runReminderPage(0, new Date(later.valueOf() + 4 * 86400000));
    expect((await getPool().query("SELECT id FROM clubhost.notifications WHERE booking_id=$1 AND kind='payment_reminder'", [booking])).rowCount).toBe(2);
  });
  it("paginates the inbox without duplicates and counts all unread items", async () => {
    const { booking } = await invitation();
    await transaction(async client => { for (let i = 0; i < 25; i++) await bookingNotification(drizzle(client), booking, `page:${prefix}:${i}`, "confirmed"); });
    const first = await inbox(); expect(first.rows).toHaveLength(20); expect(first.next).toBeTruthy();
    const second = await notificationInbox(player, first.next!);
    expect(second.rows.length).toBeGreaterThan(0);
    expect(second.rows.every(row => !first.rows.some(prior => prior.id === row.id))).toBe(true);
    expect(await unreadCount(player)).toBeGreaterThan(20);
    await markNotificationsRead(player); expect(await unreadCount(player)).toBe(0);
  });
});
