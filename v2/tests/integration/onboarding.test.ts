import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { installTestEnv } from "./environment";
import { getPool, closePool } from "@/server/db/client";
import { signup } from "@/server/auth/service";
import { createClub } from "@/server/modules/clubs/service";
import { deleteClub } from "@/server/modules/clubs/deletion";
import { saveMember } from "@/server/modules/members/service";
import { createSession, cancelSession, inviteFixed } from "@/server/modules/scheduling/service";
import { grantAccess, revokeAccess } from "@/server/modules/clubs/access";
import { onboardingSnapshot, onboardingSessionSnapshot, updateOnboarding } from "@/server/modules/onboarding/service";
import { localNow } from "@/domain/session-policy";
import { addFixed } from "@/server/modules/bookings/host";
import { attendanceCommand, lifecycle } from "@/server/modules/attendance/service";
import { financeView } from "@/server/modules/finance/queries";
import { hostRecordMoney, issueCharges } from "@/server/modules/finance/service";
import { saveDue, updateBank } from "@/server/modules/finance/club";
import { reviewProof } from "@/server/modules/finance/proofs";
import { linkMemberAccount } from "@/server/modules/member-portal/service";
import { saveClubReminders } from "@/server/modules/notifications/service";
import type { MissionId } from "@/features/onboarding/registry";

const prefix = "v2-tour-" + randomBytes(5).toString("hex"), accounts: number[] = [], clubs: number[] = [];
let owner: number, cohost: number, other: number, club: number, second: number, session: number, member: number;
beforeAll(async () => {
  installTestEnv();
  for (const role of ["owner", "cohost", "other"]) accounts.push((await signup(`${prefix}-${role}@example.com`, "tour-password-123")).id);
  [owner, cohost, other] = accounts;
  await getPool().query("UPDATE clubhost.hosts SET email_verified=true WHERE id=ANY($1::int[])", [accounts]);
});
afterAll(async () => {
  for (const clubId of clubs) {
    await getPool().query("DELETE FROM clubhost.audit_logs WHERE club_id=$1 AND host_id IS NULL", [clubId]);
    await deleteClub(owner, clubId, prefix);
  }
  await getPool().query("DELETE FROM clubhost.audit_logs WHERE host_id=ANY($1::int[])", [accounts]);
  await getPool().query("DELETE FROM clubhost.hosts WHERE id=ANY($1::int[])", [accounts]);
  await closePool();
});
const progress = async (id: MissionId, account = owner, clubId = club) => (await onboardingSnapshot(account, clubId)).progress.find(p => p.id === id)!;
async function command(accountId: number, action: string, extras: Record<string, unknown> = {}) {
  const s = await onboardingSnapshot(accountId);
  return updateOnboarding(accountId, { action, revision: s.revision, clubId: s.context.clubId, ...extras });
}
describe("server-authoritative host onboarding", () => {
  it("reads without creating rows and persists Explore later only for that account", async () => {
    expect((await onboardingSnapshot(owner)).status).toBe("new");
    expect((await getPool().query("SELECT 1 FROM clubhost.host_tour_preferences WHERE account_id=$1", [owner])).rowCount).toBe(0);
    await command(owner, "dismiss"); expect((await onboardingSnapshot(owner)).status).toBe("dismissed");
    expect((await onboardingSnapshot(other)).status).toBe("new");
    const started = await command(owner, "start"); expect(started.missionId).toBe("club");
    expect(started.progress.find(p => p.id === "club")?.done).toBe(false);
  });
  it("cannot complete by viewing, posting completion flags or selecting blocked missions", async () => {
    await expect(command(owner, "refresh", { completed: ["club"] })).rejects.toMatchObject({ status: 400 });
    await expect(command(owner, "select", { missionId: "billing" })).rejects.toMatchObject({ status: 403 });
    await expect(command(owner, "select", { missionId: "invented" })).rejects.toMatchObject({ status: 400 });
    expect((await command(owner, "refresh")).progress.some(p => p.done)).toBe(false);
    expect((await command(owner, "skip", { missionId: "club" })).status).toBe("paused");
  });
  it("recognizes existing real clubs, members and sessions, without creating duplicates", async () => {
    club = (await createClub(owner, { name: prefix })).id; clubs.push(club);
    second = (await createClub(owner, { name: prefix })).id; clubs.push(second);
    member = (await saveMember(owner, club, null, { name: "Real tour member", phone: "0907755112", kind: "fixed" })).id;
    session = (await createSession(owner, club, { title: prefix, starts_at: localNow(new Date(Date.now() + 86400000)), capacity: 12, fixed_fee: 70000 })).gameId!;
    const result = await command(owner, "start", { clubId: club });
    expect(result.missionId).toBe("share");
    expect((await progress("club")).done).toBe(true); expect((await progress("session")).done).toBe(true); expect((await progress("members")).done).toBe(true);
    expect((await progress("share")).done).toBe(false); expect((await progress("receipt")).done).toBe(false);
  });
  it("persists skips per club, replays completed missions and restarts without erasing facts", async () => {
    await command(owner, "skip", { missionId: "share", clubId: club });
    expect((await progress("share")).skipped).toBe(true); expect((await progress("share", owner, second)).skipped).toBe(false);
    const replay = await command(owner, "select", { missionId: "members", clubId: club });
    expect(replay.missionId).toBe("members"); expect((await command(owner, "pause")).status).toBe("paused");
    expect((await command(owner, "resume")).missionId).toBe("members");
    const restarted = await command(owner, "restart"); expect(restarted.missionId).toBe("share");
    expect((await progress("share")).skipped).toBe(false); expect((await progress("members")).done).toBe(true);
  });
  it("rejects cross-account and cross-club share receipts; accepts a real scoped success receipt", async () => {
    await expect(onboardingSnapshot(other, club)).rejects.toMatchObject({ status: 404 });
    await expect(command(other, "share", { clubId: club, sessionId: session })).rejects.toMatchObject({ status: 404 });
    await expect(command(owner, "share", { clubId: second, sessionId: session })).rejects.toMatchObject({ status: 403 });
    await command(owner, "share", { clubId: club, sessionId: session }); expect((await progress("share")).done).toBe(true);
    expect((await progress("share", owner, second)).done).toBe(false);
    await expect(onboardingSessionSnapshot(other, session)).rejects.toMatchObject({ status: 404 });
    const contextual = await onboardingSessionSnapshot(owner, session);
    expect(contextual.context.clubId).toBe(club); expect(contextual.context.sessionId).toBe(session);
  });
  it("serializes concurrent tabs and rejects stale revisions", async () => {
    const s = await onboardingSnapshot(owner);
    const results = await Promise.allSettled(["pause", "dismiss"].map(action => updateOnboarding(owner, { action, clubId: club, revision: s.revision })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
  });
  it("respects cohost capabilities and access revocation, without leaking private data", async () => {
    await grantAccess(owner, club, `${prefix}-cohost@example.com`, "custom", ["check_in"]);
    expect((await progress("access")).done).toBe(true);
    const s = await onboardingSnapshot(cohost, club);
    expect(s.progress.find(p => p.id === "club")?.done).toBe(true);
    expect(s.progress.find(p => p.id === "members")?.available).toBe(false);
    expect(s.progress.find(p => p.id === "payment")?.done).toBe(false);
    expect(JSON.stringify(s)).not.toContain("0907755112");
    await expect(command(cohost, "share", { clubId: club, sessionId: session })).rejects.toMatchObject({ status: 403 });
    const accessId = (await getPool().query("SELECT id FROM clubhost.club_access WHERE club_id=$1 AND host_id=$2", [club, cohost])).rows[0].id;
    await revokeAccess(owner, club, accessId);
    await expect(onboardingSnapshot(cohost, club)).rejects.toMatchObject({ status: 404 });
    expect((await onboardingSnapshot(cohost)).clubs).toHaveLength(0);
  });
  it("gates new Pro missions after expiry and rejects inactive account progress", async () => {
    await getPool().query("UPDATE clubhost.clubs SET trial_ends_at=NULL,pro_ends_at=NULL WHERE id=$1", [second]);
    expect((await progress("recurrence", owner, second)).available).toBe(false);
    await expect(command(owner, "select", { clubId: second, missionId: "recurrence" })).rejects.toMatchObject({ status: 403 });
    await getPool().query("INSERT INTO clubhost.account_controls(account_id,suspended) VALUES($1,true)", [other]);
    await expect(onboardingSnapshot(other)).rejects.toMatchObject({ status: 403 });
    await expect(updateOnboarding(other, { action: "start", clubId: null, revision: 0 })).rejects.toMatchObject({ status: 403 });
  });
  it("counts invitation, attendance and money only from real business actions", async () => {
    await inviteFixed(owner, session); expect((await progress("invitations")).done).toBe(true);
    await addFixed(owner, session, member);
    expect((await progress("invitations")).done).toBe(true);
    const booking = (await getPool().query("SELECT id FROM clubhost.bookings WHERE session_id=$1 AND member_id=$2", [session, member])).rows[0].id;
    const person = (await getPool().query("SELECT id,attendance_version FROM clubhost.booking_participants WHERE booking_id=$1", [booking])).rows[0];
    await lifecycle(owner, session, "start");
    await attendanceCommand(owner, session, person.id, "check_in", person.attendance_version);
    expect((await progress("attendance")).done).toBe(true); expect((await progress("billing")).done).toBe(false);
    await lifecycle(owner, session, "finish"); await issueCharges(owner, session, (await financeView(owner, session)).draftHash);
    expect((await progress("billing")).done).toBe(true); expect((await progress("receipt")).done).toBe(false);
    await hostRecordMoney(owner, session, booking, { amount: 70000, kind: "RECEIVED", source: "CASH", requestKey: prefix + "-receipt", payerParticipantId: null, reason: "Verified disposable test receipt" });
    expect((await progress("receipt")).done).toBe(true);
    await expect(command(owner, "share", { clubId: club, sessionId: session })).rejects.toMatchObject({ status: 409 });
  });
  it("does not count cancelled sessions as a usable first session", async () => {
    const game = (await createSession(owner, second, { title: prefix, starts_at: localNow(new Date(Date.now() + 86400000)), capacity: 12 })).gameId!;
    expect((await progress("session", owner, second)).done).toBe(true);
    await cancelSession(owner, game); expect((await progress("session", owner, second)).done).toBe(false);
    await expect(command(owner, "share", { clubId: second, sessionId: game })).rejects.toMatchObject({ status: 409 });
  });
  it("does not credit an empty RSVP action for unrelated later bookings", async () => {
    const raw = { title: prefix, starts_at: localNow(new Date(Date.now() + 86400000)), capacity: 12 };
    const empty = (await createSession(owner, second, raw)).gameId!;
    await inviteFixed(owner, empty);
    const fixed = (await saveMember(owner, second, null, { name: "Later fixed member", phone: "0903344556", kind: "fixed" })).id;
    const otherGame = (await createSession(owner, second, raw)).gameId!;
    await addFixed(owner, otherGame, fixed);
    expect((await progress("invitations", owner, second)).done).toBe(false);
    await addFixed(owner, empty, fixed);
    await inviteFixed(owner, empty); // No new invitation, so this is still incomplete.
    expect((await progress("invitations", owner, second)).done).toBe(false);
    await saveMember(owner, second, null, { name: "New invitee", phone: "0903344557", kind: "fixed" });
    await inviteFixed(owner, empty); expect((await progress("invitations", owner, second)).done).toBe(true);
  });
  it("recognizes payment settings, monthly dues, linked profiles and reviewed proofs only after real saves", async () => {
    expect((await progress("payment")).done).toBe(false);
    await updateBank(owner, club, { bankName: "Test bank", accountHolder: "Club owner", accountNumber: "123456789", paymentNote: "CLB" });
    expect((await progress("payment")).done).toBe(true);
    expect((await progress("connections")).done).toBe(false);
    await linkMemberAccount(owner, club, member, `${prefix}-cohost@example.com`);
    expect((await progress("connections")).done).toBe(true);
    expect((await progress("monthly")).done).toBe(false);
    const due = await saveDue(owner, club, member, { period: "2026-11", amount: 70000 });
    expect((await progress("monthly")).done).toBe(true);
    const asset = (await getPool().query("INSERT INTO clubhost.stored_assets(club_id,key,kind,sha256,size,created_at) VALUES($1,$2,'proof',$3,0,$4) RETURNING id", [club, prefix + ".webp", "0".repeat(64), new Date().toISOString()])).rows[0].id;
    const proof = (await getPool().query("INSERT INTO clubhost.payment_proofs(due_id,asset_id,status,note,created_at) VALUES($1,$2,'reported','',$3) RETURNING id", [due.id, asset, new Date().toISOString()])).rows[0].id;
    expect((await progress("proofs")).done).toBe(false);
    await reviewProof(owner, proof, { action: "reject", note: "Reviewed disposable proof" });
    expect((await progress("proofs")).done).toBe(true);
  });
  it("recognizes saved Pro recurrence and opt-in settings, never just their screens", async () => {
    expect((await progress("recurrence")).done).toBe(false);
    await createSession(owner, club, { title: prefix, starts_at: localNow(new Date(Date.now() + 7 * 86400000)), capacity: 12, weeks: 2 });
    expect((await progress("recurrence")).done).toBe(true);
    expect((await progress("reminders")).done).toBe(false);
    await saveClubReminders(owner, club, { rsvpEnabled: false, paymentEnabled: false, rsvpLeadHours: 24, paymentIntervalDays: 3 });
    expect((await progress("reminders")).done).toBe(false);
    await saveClubReminders(owner, club, { rsvpEnabled: true, paymentEnabled: false, rsvpLeadHours: 24, paymentIntervalDays: 3 });
    expect((await progress("reminders")).done).toBe(true);
  });
  it("cascades club progress and drops selected club after actual deletion", async () => {
    const temporary = (await createClub(owner, { name: prefix })).id;
    await command(owner, "start", { clubId: temporary });
    expect((await getPool().query("SELECT 1 FROM clubhost.host_tour_progress WHERE account_id=$1 AND club_id=$2", [owner, temporary])).rowCount).toBeGreaterThan(0);
    await deleteClub(owner, temporary, prefix);
    expect((await getPool().query("SELECT 1 FROM clubhost.host_tour_progress WHERE club_id=$1", [temporary])).rowCount).toBe(0);
    expect((await getPool().query("SELECT club_id FROM clubhost.host_tour_preferences WHERE account_id=$1", [owner])).rows[0].club_id).toBeNull();
    expect((await onboardingSnapshot(owner)).context.clubId).not.toBe(temporary);
  });
});
