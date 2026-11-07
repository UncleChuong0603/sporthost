import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { installTestEnv } from "./environment";
import { getPool, closePool, getDb, transaction } from "@/server/db/client";
import { signup } from "@/server/auth/service";
import { createClub } from "@/server/modules/clubs/service";
import { saveMember } from "@/server/modules/members/service";
import { createSession, changeRule, inviteFixed } from "@/server/modules/scheduling/service";
import { joinGuest, guestDecision, editGuestGroup, guestContext, lookupGuest } from "@/server/modules/bookings/guest";
import { bookingDecision, changePrivateLink } from "@/server/modules/bookings/host";
import { attendanceCommand, lifecycle, walkIn } from "@/server/modules/attendance/service";
import { localNow } from "@/domain/session-policy";

const run = randomBytes(5).toString("hex"); let hostId: number, otherId: number, clubId: number, counter = 0;
const start = localNow(new Date(Date.now() + 7 * 86400000));
const guest = (size = 1) => { const n = counter++; return { name: `Guest ${n}`, phone: "090" + String(6000000 + n), gender: "male" as const, companions: Array.from({ length: size - 1 }, (_, i) => ({ name: `Companion ${i}`, gender: "female" as const })) }; };
async function game(capacity = 6, mode = "AUTO_APPROVE", extra: Record<string, unknown> = {}) {
  const created = await createSession(hostId, clubId, { title: "Test group", starts_at: start, capacity, guest_fee: 70000, approval_mode: mode, ...extra });
  const result = await getPool().query("SELECT * FROM clubhost.game_sessions WHERE id=$1", [created.gameId]);
  return result.rows[0] as { id: number; public_id: string; capacity: number };
}
async function records(gameId: number) { return (await getPool().query("SELECT * FROM clubhost.bookings WHERE session_id=$1 ORDER BY id", [gameId])).rows; }
beforeAll(async () => {
  installTestEnv(); hostId = (await signup(`v2-seats-${run}@example.com`, "seat-password-123")).id;
  otherId = (await signup(`v2-other-${run}@example.com`, "seat-password-123")).id;
  clubId = (await createClub(hostId, { name: "Isolated groups" })).id;
});
afterAll(async () => {
  if (clubId) await transaction(async c => {
    const games = "SELECT id FROM clubhost.game_sessions WHERE club_id=$1";
    const bookingIds = `SELECT id FROM clubhost.bookings WHERE session_id IN (${games})`;
    await c.query(`DELETE FROM clubhost.booking_participants WHERE booking_id IN (${bookingIds})`, [clubId]);
    await c.query(`DELETE FROM clubhost.bookings WHERE session_id IN (${games})`, [clubId]);
    await c.query("DELETE FROM clubhost.game_sessions WHERE club_id=$1", [clubId]);
    await c.query("DELETE FROM clubhost.recurring_rules WHERE club_id=$1", [clubId]);
    await c.query("DELETE FROM clubhost.members WHERE club_id=$1", [clubId]);
    await c.query("DELETE FROM clubhost.audit_logs WHERE club_id=$1", [clubId]);
    await c.query("DELETE FROM clubhost.clubs WHERE id=$1", [clubId]);
    await c.query("DELETE FROM clubhost.hosts WHERE id=ANY($1::int[])", [[hostId, otherId]]);
  }); await closePool();
});

describe("atomic group booking capacity on real PostgreSQL", () => {
  it.each([{ capacity: 1, size: 1 }, { capacity: 3, size: 2 }])("serializes last-seat race $capacity/$size without splitting groups", async ({ capacity, size }) => {
    const session = await game(capacity);
    await Promise.all([joinGuest(session.public_id, guest(size)), joinGuest(session.public_id, guest(size))]);
    const rows = await records(session.id); expect(rows.map(r => r.status).sort()).toEqual(["confirmed", "waitlist"]);
    const confirmed = await getPool().query("SELECT count(*)::int AS count FROM clubhost.booking_participants p JOIN clubhost.bookings b ON b.id=p.booking_id WHERE b.session_id=$1 AND b.status='confirmed'", [session.id]);
    expect(confirmed.rows[0].count).toBe(size);
  });
  it("two manual approvals serialize and cancellation never auto-approves a manual guest", async () => {
    const session = await game(3, "MANUAL_APPROVE");
    const a = await joinGuest(session.public_id, guest(2)); const b = await joinGuest(session.public_id, guest(2));
    await Promise.all([bookingDecision(hostId, session.id, a.bookingId!, "approve"), bookingDecision(hostId, session.id, b.bookingId!, "approve")]);
    const rows = await records(session.id); expect(rows.map(r => r.status).sort()).toEqual(["confirmed", "waitlist"]);
    await bookingDecision(hostId, session.id, rows.find(r => r.status === "confirmed")!.id, "cancel");
    expect((await records(session.id)).filter(r => r.status === "confirmed")).toHaveLength(0);
  });
  it("whole-group growth checks capacity; duplicate join and unknown ownership cannot take over", async () => {
    const session = await game(2); const input = guest();
    const a = await joinGuest(session.public_id, input); await joinGuest(session.public_id, guest());
    await expect(editGuestGroup(a.key!, [{ name: "Too many", gender: "female" }])).rejects.toMatchObject({ status: 409 });
    expect((await getPool().query("SELECT count(*)::int AS count FROM clubhost.booking_participants WHERE booking_id=$1", [a.bookingId])).rows[0].count).toBe(1);
    expect((await joinGuest(session.public_id, input)).message).toBe("already");
    await guestDecision(a.key!, "cancel");
    expect((await joinGuest(session.public_id, input)).message).toBe("already");
    expect((await joinGuest(session.public_id, input, { booking: a.bookingId!, key: a.key! })).message).toBe("success");
  });
  it("cancellation promotes one waiting whole group while a competing join waits", async () => {
    const session = await game(2); const first = await joinGuest(session.public_id, guest(2));
    const waiting = await joinGuest(session.public_id, guest(2));
    await Promise.all([guestDecision(first.key!, "cancel"), joinGuest(session.public_id, guest(2))]);
    const rows = await records(session.id);
    expect(rows.find(row => row.id === first.bookingId)?.status).toBe("cancelled");
    expect(rows.find(row => row.id === waiting.bookingId)?.status).toBe("confirmed");
    expect(rows.filter(row => row.status === "confirmed")).toHaveLength(1);
    expect((await getPool().query("SELECT count(*)::int AS count FROM clubhost.booking_participants p JOIN clubhost.bookings b ON b.id=p.booking_id WHERE b.session_id=$1 AND b.status='confirmed'", [session.id])).rows[0].count).toBe(2);
  });
  it("concurrent joins respect independent gender quotas without partial groups", async () => {
    const session = await game(4, "AUTO_APPROVE", { capacity_male: 1, capacity_female: 3 });
    await Promise.all(Array.from({ length: 4 }, () => joinGuest(session.public_id, guest(2))));
    expect((await records(session.id)).filter(row => row.status === "confirmed")).toHaveLength(1);
    const counts = (await getPool().query("SELECT p.gender,count(*)::int AS count FROM clubhost.booking_participants p JOIN clubhost.bookings b ON b.id=p.booking_id WHERE b.session_id=$1 AND b.status='confirmed' GROUP BY p.gender", [session.id])).rows;
    expect(Object.fromEntries(counts.map(row => [row.gender, row.count]))).toEqual({ male: 1, female: 1 });
  });
  it("approval waits for the club contact edit before checking the latest gender quota", async () => {
    const session = await game(4, "MANUAL_APPROVE", { capacity_male: 1, capacity_female: 1 });
    const female = await joinGuest(session.public_id, { ...guest(), gender: "female" });
    await bookingDecision(hostId, session.id, female.bookingId!, "approve");
    const male = await joinGuest(session.public_id, guest());
    const client = await getPool().connect(); let deciding: Promise<string> | undefined;
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM clubhost.clubs WHERE id=$1 FOR UPDATE", [clubId]);
      await client.query("UPDATE clubhost.bookings SET gender_at_booking='female' WHERE id=$1", [male.bookingId]);
      await client.query("UPDATE clubhost.booking_participants SET gender='female' WHERE booking_id=$1", [male.bookingId]);
      deciding = bookingDecision(hostId, session.id, male.bookingId!, "approve");
      // Hold the contact transaction until the independent approval connection waits.
      await expect.poll(async () => {
        // pg_stat_activity is cached for this open transaction. Refresh it so
        // an initial observation before the approval blocks cannot stay stale.
        await client.query("SELECT pg_stat_clear_snapshot()");
        return Number((await client.query("SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%clubhost%'")).rows[0].n);
      }).toBeGreaterThan(0);
      await client.query("COMMIT");
      expect(await deciding).toBe("waitlist");
    } finally { await client.query("ROLLBACK"); client.release(); if (deciding) await deciding.catch(() => undefined); }
  });
  it("enforces gender quotas, private token rotation and tenant isolation", async () => {
    const session = await game(4, "AUTO_APPROVE", { capacity_male: 1, capacity_female: 3 });
    const a = await joinGuest(session.public_id, guest()); const b = await joinGuest(session.public_id, guest());
    expect((await records(session.id)).map(r => r.status)).toEqual(["confirmed", "waitlist"]);
    const unknown = guest(); await joinGuest(session.public_id, { ...unknown, gender: "unspecified" });
    expect((await records(session.id))[2].status).toBe("waitlist");
    await expect(bookingDecision(otherId, session.id, a.bookingId!, "cancel")).rejects.toMatchObject({ status: 404 });
    await changePrivateLink(hostId, session.id, a.bookingId!, "rotate");
    await expect(guestContext(getDb(), a.key!)).rejects.toMatchObject({ status: 404 });
    await changePrivateLink(hostId, session.id, b.bookingId!, "revoke");
    await expect(guestContext(getDb(), b.key!)).rejects.toMatchObject({ status: 404 });
  });
  it("keeps phone lookup private and invalidates stale confirmation", async () => {
    const session = await game(6); const input = guest();
    const result = await joinGuest(session.public_id, input);
    const hidden = await lookupGuest(session.public_id, input.phone, null);
    expect(hidden.name).toBe(""); expect(hidden.found).toBe(false); expect(hidden.fee).toBeNull();
    const own = await lookupGuest(session.public_id, input.phone, { booking: result.bookingId!, key: result.key! });
    expect(own.name).toBe(input.name);
    const [record] = await records(session.id);
    await saveMember(hostId, clubId, record.member_id, { name: input.name, phone: input.phone, kind: "guest", level: "changed" });
    await expect(joinGuest(session.public_id, { ...input, lookup_token: hidden.token })).rejects.toMatchObject({ code: "stale_profile" });
  });
});

describe("attendance and recurrence preserve state independently from payment", () => {
  it("restoring a no-show competes atomically with a new walk-in for the same seat", async () => {
    const session = await game(1); const joined = await joinGuest(session.public_id, guest());
    const person = (await getPool().query("SELECT id FROM clubhost.booking_participants WHERE booking_id=$1", [joined.bookingId])).rows[0];
    await attendanceCommand(hostId, session.id, person.id, "no_show", 0);
    const results = await Promise.allSettled([attendanceCommand(hostId, session.id, person.id, "check_in", 1), walkIn(hostId, session.id, guest())]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const counts = await getPool().query("SELECT count(*)::int AS n FROM clubhost.booking_participants p JOIN clubhost.bookings b ON b.id=p.booking_id WHERE b.session_id=$1 AND b.status='confirmed' AND p.attendance_status<>'NO_SHOW'", [session.id]);
    expect(counts.rows[0].n).toBe(1);
  });
  it("conflicting attendance versions serialize; only one walk-in can take a no-show seat", async () => {
    const session = await game(1); const joined = await joinGuest(session.public_id, guest());
    const person = (await getPool().query("SELECT * FROM clubhost.booking_participants WHERE booking_id=$1", [joined.bookingId])).rows[0];
    const attempts = await Promise.allSettled([attendanceCommand(hostId, session.id, person.id, "check_in", 0), attendanceCommand(hostId, session.id, person.id, "no_show", 0)]);
    expect(attempts.filter(a => a.status === "fulfilled")).toHaveLength(1);
    const current = (await getPool().query("SELECT * FROM clubhost.booking_participants WHERE id=$1", [person.id])).rows[0];
    await attendanceCommand(hostId, session.id, person.id, "no_show", current.attendance_version, "Freed seat");
    const walks = await Promise.allSettled([walkIn(hostId, session.id, guest()), walkIn(hostId, session.id, guest())]);
    expect(walks.filter(a => a.status === "fulfilled")).toHaveLength(1);
    await expect(attendanceCommand(hostId, session.id, person.id, "check_in", current.attendance_version + (current.attendance_status === "NO_SHOW" ? 0 : 1))).rejects.toMatchObject({ status: 409 });
  });
  it("finish is not paid or settled; public registration stays closed after reopen", async () => {
    const session = await game(1); await joinGuest(session.public_id, guest());
    await lifecycle(hostId, session.id, "start"); await lifecycle(hostId, session.id, "finish");
    expect((await records(session.id))[0].paid).toBe(false);
    await expect(lifecycle(hostId, session.id, "reopen")).rejects.toMatchObject({ status: 400 });
    await lifecycle(hostId, session.id, "reopen", "Host reviewed");
    const state = (await getPool().query("SELECT lifecycle_status,is_open FROM clubhost.game_sessions WHERE id=$1", [session.id])).rows[0];
    expect(state).toEqual({ lifecycle_status: "IN_PROGRESS", is_open: false });
  });
  it("generates recurring invitations once and preserves fixed-member fee/payment snapshots", async () => {
    await saveMember(hostId, clubId, null, { name: "Fixed", phone: "0907775555", kind: "fixed", gender: "female" });
    const result = await createSession(hostId, clubId, { title: "Weekly", starts_at: start, capacity: 5, weeks: 2, fixed_fee: 50000, fixed_fee_female: 40000 });
    await changeRule(hostId, result.ruleId!, "generate");
    const games = (await getPool().query("SELECT id FROM clubhost.game_sessions WHERE recurring_rule_id=$1", [result.ruleId])).rows;
    expect(games).toHaveLength(2);
    await inviteFixed(hostId, games[0].id); await inviteFixed(hostId, games[0].id);
    const invitations = await records(games[0].id); expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({ status: "invited", fee_amount: 40000, access_key: "" });
    expect(JSON.parse(invitations[0].payment_snapshot)).toHaveProperty("bank_name");
    await changeRule(hostId, result.ruleId!, "stop");
    await expect(changeRule(hostId, result.ruleId!, "extend", 1)).rejects.toMatchObject({ status: 400 });
  });
});
