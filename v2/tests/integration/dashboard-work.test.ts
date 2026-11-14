import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { installTestEnv } from "./environment";
import { closePool, getPool } from "@/server/db/client";
import { signup } from "@/server/auth/service";
import { createClub } from "@/server/modules/clubs/service";
import { deleteClub } from "@/server/modules/clubs/deletion";
import { grantAccess } from "@/server/modules/clubs/access";
import { dashboardData } from "@/server/modules/clubs/dashboard";
import { createSession } from "@/server/modules/scheduling/service";
import { joinGuest } from "@/server/modules/bookings/guest";
import { hostSession } from "@/server/modules/bookings/queries";
import { attendanceCommand, lifecycle } from "@/server/modules/attendance/service";
import { saveMember } from "@/server/modules/members/service";
import { saveDue } from "@/server/modules/finance/club";
import { financeView } from "@/server/modules/finance/queries";
import { hostRecordMoney, issueCharges } from "@/server/modules/finance/service";
import { localNow } from "@/domain/session-policy";

const prefix = "v2-work-" + randomBytes(5).toString("hex");
const hosts: number[] = [];
const clubs: { id: number; owner: number; name: string }[] = [];
let owner: number, checker: number, booker: number, mixed: number, other: number;
type Fixture = { club: number; pending: number; finished: number; participant: number; proof: number };
let first: Fixture, second: Fixture;

async function fixture(actor: number, name: string, monthly: number): Promise<Fixture> {
  const club = (await createClub(actor, { name })).id;
  clubs.push({ id: club, owner: actor, name });
  async function game(title: string, approval_mode: string) {
    const id = (await createSession(actor, club, { title, approval_mode, starts_at: localNow(new Date(Date.now() + 86400000)), capacity: 3, guest_fee: 70000 })).gameId!;
    const publicId = (await getPool().query("SELECT public_id FROM clubhost.game_sessions WHERE id=$1", [id])).rows[0].public_id;
    const joined = await joinGuest(publicId, { name: "Guest " + name, phone: "0901234001" });
    const participant = (await getPool().query("SELECT id FROM clubhost.booking_participants WHERE booking_id=$1", [joined.bookingId])).rows[0].id;
    return { id, participant, booking: joined.bookingId! };
  }
  const pending = await game("Needs approval " + name, "MANUAL_APPROVE");
  const finished = await game("Needs attendance " + name, "AUTO_APPROVE");
  await lifecycle(actor, finished.id, "start"); await lifecycle(actor, finished.id, "finish");
  const member = await saveMember(actor, club, null, { name: "Monthly " + name, phone: "0901234002", kind: "fixed", gender: "female" });
  const due = await saveDue(actor, club, member.id, { period: "2025-01", amount: monthly });
  const asset = (await getPool().query("INSERT INTO clubhost.stored_assets(club_id,key,kind,sha256,size,created_at) VALUES($1,$2,'proof',$3,0,$4) RETURNING id", [club, `clubs/${club}/proof/${randomBytes(16).toString("hex")}.png`, "0".repeat(64), new Date().toISOString()])).rows[0].id;
  const proof = (await getPool().query("INSERT INTO clubhost.payment_proofs(due_id,asset_id,status,created_at,note) VALUES($1,$2,'reported',$3,'') RETURNING id", [due.id, asset, new Date().toISOString()])).rows[0].id;
  return { club, pending: pending.id, finished: finished.id, participant: finished.participant, proof };
}

beforeAll(async () => {
  installTestEnv();
  for (const role of ["owner", "checker", "booker", "mixed", "other"]) hosts.push((await signup(prefix + role + "@example.com", "work-password-123")).id);
  [owner, checker, booker, mixed, other] = hosts;
  first = await fixture(owner, prefix + " first", 250000);
  second = await fixture(other, prefix + " second", 500000);
  await grantAccess(owner, first.club, prefix + "checker@example.com", "custom", ["check_in"]);
  await grantAccess(owner, first.club, prefix + "booker@example.com", "custom", ["manage_bookings"]);
  await grantAccess(owner, first.club, prefix + "mixed@example.com", "custom", ["check_in"]);
  await grantAccess(other, second.club, prefix + "mixed@example.com", "finance", []);
  // Core tasks must keep working after the trial, including existing cohost rights.
  await getPool().query("UPDATE clubhost.clubs SET trial_ends_at=NULL,pro_ends_at=NULL WHERE id=ANY($1::int[])", [clubs.map(club => club.id)]);
});

afterAll(async () => {
  for (const club of clubs) await deleteClub(club.owner, club.id, club.name);
  if (hosts.length) {
    await getPool().query("DELETE FROM clubhost.audit_logs WHERE host_id=ANY($1::int[])", [hosts]);
    await getPool().query("DELETE FROM clubhost.hosts WHERE id=ANY($1::int[])", [hosts]);
  }
  await closePool();
});

describe("actionable dashboard work with per-club permissions", () => {
  it("shows all-period debt and reported proofs without treating reports as received money", async () => {
    const data = await dashboardData(owner);
    expect(data.pending.map(row => row.gameId)).toEqual([first.pending]);
    expect(data.work.proofs).toEqual([{ clubId: first.club, clubName: prefix + " first", total: 1 }]);
    expect(data.work.receivables).toEqual([{ clubId: first.club, clubName: prefix + " first", total: 1, amount: 250000 }]);
    expect(data.work.sessions).toMatchObject([{ id: first.finished, unmarked: 1, href: `/games/${first.finished}#attendance` }]);
    expect(data.financial?.received).toBe(0);
  });
  it("does not disclose approvals or money to check-in-only cohosts, including the session read model", async () => {
    const data = await dashboardData(checker);
    expect(data.pending).toEqual([]); expect(data.financial).toBeNull();
    expect(data.work.credits).toEqual([]);
    expect(data.work.proofs).toEqual([]); expect(data.work.receivables).toEqual([]);
    expect(data.work.sessions.map(row => row.id)).toEqual([first.finished]);
    expect((await hostSession(checker, first.finished)).billing).toBeNull();
    const bookingOnly = await dashboardData(booker);
    expect(bookingOnly.pendingCount).toBe(1); expect(bookingOnly.work.sessions).toEqual([]);
    expect(bookingOnly.financial).toBeNull();
  });
  it("scopes finance independently when a cohost has different roles in two clubs", async () => {
    const data = await dashboardData(mixed);
    expect(data.pending).toEqual([]);
    expect(data.work.proofs.map(row => row.clubId)).toEqual([second.club]);
    expect(data.work.receivables.map(row => [row.clubId, row.amount])).toEqual([[second.club, 500000]]);
    expect(data.work.sessions.map(row => row.id).sort()).toEqual([first.finished, second.finished].sort());
  });
  it("moves a session from attendance to billing, then tracks the true remaining issued debt", async () => {
    await attendanceCommand(owner, first.finished, first.participant, "check_in", 0);
    expect((await dashboardData(checker)).work.sessions).toEqual([]);
    expect((await dashboardData(owner)).work.sessions).toMatchObject([{ id: first.finished, unmarked: 0, href: `/games/${first.finished}/billing` }]);
    await issueCharges(owner, first.finished, (await financeView(owner, first.finished)).draftHash);
    const booking = (await getPool().query("SELECT booking_id FROM clubhost.booking_participants WHERE id=$1", [first.participant])).rows[0].booking_id;
    await hostRecordMoney(owner, first.finished, booking, { amount: 30000, kind: "RECEIVED", source: "CASH", requestKey: randomBytes(16).toString("hex") });
    const data = await dashboardData(owner);
    expect(data.work.sessions).toEqual([]);
    expect(data.work.receivables[0]).toMatchObject({ total: 2, amount: 290000 });
    expect((await hostSession(owner, first.finished)).billing).toEqual({ issued: true, outstanding: 40000 });
    await getPool().query("UPDATE clubhost.payment_proofs SET status='rejected' WHERE id=$1", [first.proof]);
    expect((await dashboardData(owner)).work.proofs).toEqual([]);
  });
  it("tracks overpayments separately without adding them to debt or expenses", async () => {
    const booking = (await getPool().query("SELECT booking_id FROM clubhost.booking_participants WHERE id=$1", [first.participant])).rows[0].booking_id;
    await hostRecordMoney(owner, first.finished, booking, { amount: 60000, kind: "RECEIVED", source: "CASH", requestKey: randomBytes(16).toString("hex") });
    const data = await dashboardData(owner);
    expect(data.work.credits).toMatchObject([{ gameId: first.finished, bookingId: booking, amount: 20000 }]);
    expect(data.work.receivables[0]).toMatchObject({ total: 1, amount: 250000 });
    expect((await dashboardData(mixed)).work.credits).toEqual([]);
    await hostRecordMoney(owner, first.finished, booking, { amount: 20000, kind: "REFUND_RECORDED", source: "CASH", requestKey: randomBytes(16).toString("hex"), reason: "Return overpayment" });
    expect((await dashboardData(owner)).work.credits).toEqual([]);
  });
});
