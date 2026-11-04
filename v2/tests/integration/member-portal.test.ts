import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { installTestEnv } from "./environment";
import { getPool, getDb, closePool, transaction } from "@/server/db/client";
import { signup } from "@/server/auth/service";
import { issueEmailToken, consumeEmailToken } from "@/server/auth/email-tokens";
import { createClub, listClubs } from "@/server/modules/clubs/service";
import { saveMember } from "@/server/modules/members/service";
import { createSession, inviteFixed } from "@/server/modules/scheduling/service";
import { guestContext, guestDecision, joinGuest, editGuestGroup } from "@/server/modules/bookings/guest";
import { guestBooking, guestFinance } from "@/server/modules/bookings/queries";
import { saveDue, duePage } from "@/server/modules/finance/club";
import { attendanceCommand, lifecycle } from "@/server/modules/attendance/service";
import { financeView } from "@/server/modules/finance/queries";
import { issueCharges, hostRecordMoney, guestPayer, adjustCharge } from "@/server/modules/finance/service";
import { reportBookingProof, reportDueProof, reviewProof } from "@/server/modules/finance/proofs";
import { legacyBookingAction } from "@/server/compatibility/booking-actions";
import { playerOpenSessions, registerPlayer } from "@/server/modules/member-portal/registration";
import { linkMemberAccount, unlinkMemberAccount, playerProfiles, playerCalendar, playerPayments } from "@/server/modules/member-portal/service";
import { deleteClub } from "@/server/modules/clubs/deletion";
import { localNow } from "@/domain/session-policy";
import sharp from "sharp";

const prefix = "v2-player-" + randomBytes(5).toString("hex");
let owner: number, player: number, other: number, manager: number, club: number, fixed: number, fixedOther: number;
const accounts: number[] = [], clubs: number[] = [];
let storage = "";
const email = (label: string) => `${prefix}-${label}@example.com`;
beforeAll(async () => {
  installTestEnv();
  storage = await mkdtemp(join(tmpdir(), "sporthost-member-test-")); vi.stubEnv("STORAGE_ROOT", storage);
  for (const role of ["owner", "player", "other", "unverified", "manager"]) accounts.push((await signup(email(role), "member-password-123")).id);
  [owner, player, other, , manager] = accounts;
  for (const account of [player, other]) await consumeEmailToken(await issueEmailToken(account, "verify"), "verify");
  club = (await createClub(owner, { name: prefix })).id; clubs.push(club);
  fixed = (await saveMember(owner, club, null, { name: "Người chơi A", phone: "0901111222", kind: "fixed" })).id;
  fixedOther = (await saveMember(owner, club, null, { name: "Người chơi B", phone: "0901111333", kind: "fixed" })).id;
  await getPool().query("INSERT INTO clubhost.club_access(club_id,host_id,role,permissions) VALUES($1,$2,'manager',NULL)", [club, manager]);
});
afterAll(async () => {
  // Club deletion intentionally preserves guest audit history (null actor).
  // Capture only this suite's club IDs so a restored production copy stays exact.
  const guestAuditIds = (await getPool().query("SELECT id FROM clubhost.audit_logs WHERE club_id=ANY($1::int[])", [clubs])).rows.map(row => row.id);
  for (const id of clubs) await deleteClub(owner, id, prefix);
  await transaction(async client => {
    await client.query("DELETE FROM clubhost.audit_logs WHERE host_id=ANY($1::int[]) OR id=ANY($2::int[])", [accounts,guestAuditIds]);
    await client.query("DELETE FROM clubhost.email_tokens WHERE host_id=ANY($1::int[])", [accounts]);
    await client.query("DELETE FROM clubhost.hosts WHERE id=ANY($1::int[])", [accounts]);
  });
  await closePool();
  if (storage && resolve(dirname(storage)) === resolve(tmpdir()) && basename(storage).startsWith("sporthost-member-test-")) await rm(storage, { recursive:true });
});
async function game(title: string, capacity = 10) {
  const result = await createSession(owner, club, { title, starts_at: localNow(new Date(Date.now()+7*86400000)), capacity, fixed_fee: 70000, guest_fee: 70000, approval_mode: "AUTO_APPROVE" });
  return result.gameId!;
}
async function bookingFor(gameId: number, memberId: number) {
  return (await getPool().query("SELECT id FROM clubhost.bookings WHERE session_id=$1 AND member_id=$2", [gameId,memberId])).rows[0].id as number;
}

describe("verified member portal boundaries and existing business rules", () => {
  it("creates only the additive table with member uniqueness and cascading revocation", async () => {
    const { rows } = await getPool().query("SELECT column_name FROM information_schema.columns WHERE table_schema='clubhost' AND table_name='member_account_links' ORDER BY ordinal_position");
    expect(rows.map(row => row.column_name)).toEqual(["member_id","account_id","linked_by_host_id","linked_at"]);
    const keys = await getPool().query("SELECT confdeltype FROM pg_constraint WHERE conrelid='clubhost.member_account_links'::regclass AND contype='f'");
    expect(keys.rows.map(row => row.confdeltype).sort()).toEqual(["c","c","n"]);
  });
  it("starts empty and never infers membership from contact or account creation", async () => {
    expect(await playerProfiles(player)).toEqual([]);
    expect((await playerCalendar(player)).rows).toEqual([]);
    expect((await playerPayments(player)).total).toBe(0);
  });
  it("requires the club owner, verified email and the correct club-scoped member", async () => {
    await expect(linkMemberAccount(manager, club, fixed, email("player"))).rejects.toMatchObject({ status:403 });
    await expect(linkMemberAccount(other, club, fixed, email("player"))).rejects.toMatchObject({ status:404 });
    await expect(linkMemberAccount(owner, club, fixed, email("unverified"))).rejects.toMatchObject({ status:400 });
    await expect(linkMemberAccount(owner, club, 2147483647, email("player"))).rejects.toMatchObject({ status:404 });
    await linkMemberAccount(owner, club, fixed, email("player"));
    await linkMemberAccount(owner, club, fixed, email("player"));
    await expect(linkMemberAccount(owner, club, fixed, email("other"))).rejects.toMatchObject({ status:409 });
    await linkMemberAccount(owner, club, fixedOther, email("other"));
    expect((await playerProfiles(player)).map(profile => profile.id)).toEqual([fixed]);
    expect(await listClubs(player)).toEqual([]); // Link grants no host or cohost access.
  });
  it("serializes the last seat across authenticated RSVP requests and preserves waitlist behavior", async () => {
    const id = await game("Last seat", 1); await inviteFixed(owner,id);
    const a = await bookingFor(id,fixed), b = await bookingFor(id,fixedOther);
    await Promise.all([guestDecision({ accountId:player, bookingId:a },"yes"),guestDecision({ accountId:other, bookingId:b },"yes")]);
    const { rows } = await getPool().query("SELECT status FROM clubhost.bookings WHERE session_id=$1 ORDER BY status", [id]);
    expect(rows.map(row => row.status).sort()).toEqual(["confirmed","waitlist"]);
    expect((await playerCalendar(player)).rows.map(row => row.id)).toContain(a);
    await expect(guestBooking({ accountId:player,bookingId:b })).rejects.toMatchObject({ status:404 });
    const own = (await guestBooking({ accountId:player,bookingId:a })).status;
    const confirmed = own === "confirmed" ? { accountId:player,bookingId:a } : { accountId:other,bookingId:b };
    await guestDecision(confirmed,"cancel");
    expect((await getPool().query("SELECT count(*)::int AS count FROM clubhost.bookings WHERE session_id=$1 AND status='confirmed'", [id])).rows[0].count).toBe(1);
  });
  it("denies foreign bookings, dues and mutations including zero/NaN IDs", async () => {
    const id = await game("Private invitation"); await inviteFixed(owner,id);
    const bookingId = await bookingFor(id,fixedOther), due = await saveDue(owner,club,fixedOther,{ period:"2026-11",amount:100000 });
    const access = { accountId:player,bookingId };
    await expect(guestContext(getDb(),access)).rejects.toMatchObject({ status:404 });
    await expect(guestDecision(access,"yes")).rejects.toMatchObject({ status:404 });
    await expect(guestPayer(access,"GROUP")).rejects.toMatchObject({ status:404 });
    await expect(editGuestGroup(access,[])).rejects.toMatchObject({ status:404 });
    await expect(duePage({ accountId:player,dueId:due.id })).rejects.toMatchObject({ status:404 });
    for (const accountId of [0,NaN,-1]) await expect(guestBooking({ accountId,bookingId })).rejects.toMatchObject({ status:404 });
  });
  it("uses account authorization without revealing or depending on a guest bearer link", async () => {
    const id = await game("Revoked guest link"); await inviteFixed(owner,id);
    const bookingId = await bookingFor(id,fixed);
    await getPool().query("UPDATE clubhost.bookings SET token_revoked=true,token_expires_at='2000-01-01T00:00:00Z' WHERE id=$1",[bookingId]);
    expect(await guestBooking({ accountId:player,bookingId })).toMatchObject({ status:"invited" });
    const listed = JSON.stringify(await playerCalendar(player));
    for (const field of ["token_digest","access_key","token_nonce","phone","password"]) expect(listed).not.toContain(field);
    await unlinkMemberAccount(owner,club,fixed);
    await expect(guestBooking({ accountId:player,bookingId })).rejects.toMatchObject({ status:404 });
    expect((await playerCalendar(player)).total).toBe(0);
    await linkMemberAccount(owner,club,fixed,email("player"));
  });
  it("scopes monthly debt to the linked member and handles outstanding summaries beyond one page", async () => {
    for (let month=1;month<=12;month++) for (const year of [2025,2026]) await saveDue(owner,club,fixed,{ period:`${year}-${String(month).padStart(2,"0")}`,amount:1000 });
    const payments = await playerPayments(player);
    expect(payments.total).toBe(24); expect(payments.rows).toHaveLength(20); expect(payments.outstanding).toBe(24000);
    expect((await playerPayments(player,2)).rows).toHaveLength(4);
    expect(payments.rows.every(row => row.type === "due")).toBe(true);
  });
  it("matches issued group/split balances, preserves separate credit/debt, and never pays on proof upload", async () => {
    const id = await game("Member bill");
    const publicId = (await getPool().query("SELECT public_id FROM clubhost.game_sessions WHERE id=$1",[id])).rows[0].public_id;
    const joined = await joinGuest(publicId,{name:"Guest payer",phone:"0901111444",gender:"male",companions:[{name:"Companion",gender:"female"}]});
    const bookingId = joined.bookingId!, memberId = (await getPool().query("SELECT member_id FROM clubhost.bookings WHERE id=$1",[bookingId])).rows[0].member_id;
    await linkMemberAccount(owner,club,memberId,email("player"));
    const access = { accountId:player,bookingId };
    await guestPayer(access,"SPLIT");
    await lifecycle(owner,id,"start");
    const people = (await getPool().query("SELECT id FROM clubhost.booking_participants WHERE booking_id=$1 ORDER BY position",[bookingId])).rows;
    for (const person of people) await attendanceCommand(owner,id,person.id,"check_in",0);
    await lifecycle(owner,id,"finish");
    await issueCharges(owner,id,(await financeView(owner,id)).draftHash);
    await hostRecordMoney(owner,id,bookingId,{ amount:70000,kind:"RECEIVED",source:"CASH",requestKey:"member-receipt-"+prefix,payerParticipantId:people[0].id,reason:"Verified receipt" });
    const view = await financeView(owner,id), charge = view.payers[0].people[0];
    await adjustCharge(owner,id,{chargeId:charge.charge_id,amount:-10000,reason:"Host correction",version:view.batch!.version,requestKey:"member-adjust-"+prefix});
    const finance = await guestFinance(access), row = (await playerPayments(player)).rows.find(row => row.type === "booking" && row.id===bookingId)!;
    expect(row.amount).toBe(finance.payers.reduce((sum,payer)=>sum+payer.amount,0));
    expect(row.net).toBe(70000); expect(row.outstanding).toBe(70000); expect(row.credit).toBe(10000);
    const png = await sharp({create:{width:4,height:4,channels:3,background:"teal"}}).png().toBuffer();
    const moneyBefore = (await getPool().query("SELECT count(*) FROM clubhost.money_movements WHERE booking_id=$1",[bookingId])).rows;
    const proof = await reportBookingProof(access,new File([new Uint8Array(png)],"receipt.png",{type:"image/png"}),{reportedAmount:70000,payerParticipantId:people[1].id});
    expect((await getPool().query("SELECT count(*) FROM clubhost.money_movements WHERE booking_id=$1",[bookingId])).rows).toEqual(moneyBefore);
    await expect(guestDecision(access,"cancel")).rejects.toMatchObject({ status:409 });
    const privateOther = { accountId:other,bookingId };
    await expect(reportBookingProof(privateOther,new File([new Uint8Array(png)],"other.png",{type:"image/png"}),{})).rejects.toMatchObject({ status:404 });
    await expect(reportBookingProof(access,new File([new Uint8Array(png)],"settled.png",{type:"image/png"}),{reportedAmount:1,payerParticipantId:people[0].id})).rejects.toMatchObject({status:409});
    await reviewProof(owner,proof.id,{action:"confirm",receivedAmount:30000});
    expect((await guestFinance(access)).payers.find(p=>p.payerParticipantId===people[1].id)?.outstanding).toBe(40000);
    // An issued obligation survives a later cancellation; the debtor can still pay it.
    await getPool().query("UPDATE clubhost.game_sessions SET is_cancelled=true WHERE id=$1",[id]);
    await getPool().query("UPDATE clubhost.bookings SET status='cancelled' WHERE id=$1",[bookingId]);
    expect((await guestFinance(access)).canReport).toBe(true);
    const blue = await sharp({create:{width:4,height:4,channels:3,background:"blue"}}).png().toBuffer();
    const remainder = await reportBookingProof(access,new File([new Uint8Array(blue)],"remainder.png",{type:"image/png"}),{reportedAmount:40000,payerParticipantId:people[1].id});
    await reviewProof(owner,remainder.id,{action:"confirm",receivedAmount:40000});
    expect((await guestFinance(access)).canReport).toBe(false);
    const paidRows = [...(await playerPayments(player)).rows,...(await playerPayments(player,2)).rows];
    expect(paidRows.find(row=>row.type==="booking"&&row.id===bookingId)).toMatchObject({outstanding:0,credit:10000,net:140000});
  });
  it("revokes all portal reads when verification or a link is removed", async () => {
    await getPool().query("UPDATE clubhost.hosts SET email_verified=false WHERE id=$1",[player]);
    expect(await playerProfiles(player)).toEqual([]); expect((await playerPayments(player)).total).toBe(0);
    expect((await playerCalendar(player)).total).toBe(0);
    await getPool().query("UPDATE clubhost.hosts SET email_verified=true WHERE id=$1",[player]);
  });
  it("lists only open sessions in approved clubs and atomically registers the last seat without an invitation", async () => {
    const id = await game("Direct last seat",1);
    const listed = (await playerOpenSessions(player)).filter(row=>row.id===id);
    expect(listed).toHaveLength(2); // This account has two approved member profiles in this club.
    expect(JSON.stringify(listed)).not.toMatch(/token|password|phone|publicId/);
    const [a,b] = await Promise.all([registerPlayer(player,id,fixed),registerPlayer(other,id,fixedOther)]);
    const rows = (await getPool().query("SELECT id,status FROM clubhost.bookings WHERE session_id=$1",[id])).rows;
    expect(rows.map(row=>row.status).sort()).toEqual(["confirmed","waitlist"]);
    expect(await registerPlayer(player,id,fixed)).toBe(a);
    expect((await getPool().query("SELECT count(*)::int AS count FROM clubhost.bookings WHERE session_id=$1",[id])).rows[0].count).toBe(2);
    expect((await playerOpenSessions(player)).filter(row=>row.id===id&&row.memberId===fixed)).toEqual([]);
    await expect(registerPlayer(player,id,fixedOther)).rejects.toMatchObject({status:404});
    expect(a).not.toBe(b);
  });
  it("uses the linked guest profile, host approval and gender price; repeats never duplicate a booking", async () => {
    const guest = await saveMember(owner,club,null,{name:"Approved guest",phone:"0901111555",kind:"guest",gender:"female"});
    await linkMemberAccount(owner,club,guest.id,email("player"));
    const result = await createSession(owner,club,{title:"Direct guest",starts_at:localNow(new Date(Date.now()+7*86400000)),capacity:4,guest_fee:90000,guest_fee_female:40000,approval_mode:"MANUAL_APPROVE"});
    const id = result.gameId!;
    expect((await playerOpenSessions(player)).find(row=>row.id===id&&row.memberId===guest.id)?.fee).toBe(40000);
    const ids = await Promise.all([registerPlayer(player,id,guest.id),registerPlayer(player,id,guest.id)]);
    expect(ids[0]).toBe(ids[1]);
    expect(await guestBooking({accountId:player,bookingId:ids[0]})).toMatchObject({status:"pending",feeAmount:40000});
    await unlinkMemberAccount(owner,club,guest.id);
    await expect(registerPlayer(player,id,guest.id)).rejects.toMatchObject({status:404});
  });
  it("rejects closed sessions, expired RSVP, foreign clubs and unverified registrations", async () => {
    const id = await game("Closed direct registration");
    await getPool().query("UPDATE clubhost.game_sessions SET is_open=false WHERE id=$1",[id]);
    expect((await playerOpenSessions(player)).filter(row=>row.id===id)).toEqual([]);
    await expect(registerPlayer(player,id,fixed)).rejects.toMatchObject({status:409});
    await getPool().query("UPDATE clubhost.game_sessions SET is_open=true,rsvp_deadline='2000-01-01T00:00' WHERE id=$1",[id]);
    await expect(registerPlayer(player,id,fixed)).rejects.toMatchObject({status:409});
    const foreign = (await createClub(owner,{name:prefix})).id; clubs.push(foreign);
    const otherGame = await createSession(owner,foreign,{title:"Foreign club",starts_at:localNow(new Date(Date.now()+7*86400000)),capacity:4});
    await expect(registerPlayer(player,otherGame.gameId!,fixed)).rejects.toMatchObject({status:404});
    expect((await playerOpenSessions(player)).filter(row=>row.id===otherGame.gameId)).toEqual([]);
    await getPool().query("UPDATE clubhost.hosts SET email_verified=false WHERE id=$1",[player]);
    try { await expect(registerPlayer(player,id,fixed)).rejects.toMatchObject({status:404}); expect(await playerOpenSessions(player)).toEqual([]); }
    finally { await getPool().query("UPDATE clubhost.hosts SET email_verified=true WHERE id=$1",[player]); }
  });
  it("allows a fixed member to rejoin before RSVP closes and hides responses after host rejection", async () => {
    const id = await game("RSVP again"); await inviteFixed(owner,id);
    const access = {accountId:player,bookingId:await bookingFor(id,fixed)};
    expect((await guestBooking(access)).canRsvp).toBe(true);
    await guestDecision(access,"no"); expect((await guestBooking(access)).canRsvp).toBe(true);
    await guestDecision(access,"yes"); expect(await guestBooking(access)).toMatchObject({status:"confirmed",canRsvp:false});
    await getPool().query("UPDATE clubhost.bookings SET status='rejected' WHERE id=$1",[access.bookingId]);
    expect((await guestBooking(access)).canRsvp).toBe(false);
    await expect(guestDecision(access,"yes")).rejects.toMatchObject({status:409});
  });
  it("hides paid payer changes and refuses proof uploads for free session/monthly obligations", async () => {
    const id = await game("Prepaid payer");
    const access = {accountId:player,bookingId:await registerPlayer(player,id,fixed)};
    expect((await guestFinance(access)).canChoosePayer).toBe(true);
    await legacyBookingAction(owner,id,access.bookingId,"paid");
    expect(await guestFinance(access)).toMatchObject({canChoosePayer:false,canReport:false});
    const due = await saveDue(owner,club,fixed,{period:"2030-01",amount:0});
    expect((await duePage({accountId:player,dueId:due.id})).canReport).toBe(false);
    const png = await sharp({create:{width:4,height:4,channels:3,background:"teal"}}).png().toBuffer();
    const file = () => new File([new Uint8Array(png)],"free.png",{type:"image/png"});
    await expect(reportDueProof({accountId:player,dueId:due.id},file())).rejects.toMatchObject({status:409});
    const free = await createSession(owner,club,{title:"Free session",starts_at:localNow(new Date(Date.now()+7*86400000)),capacity:4,fixed_fee:0});
    const freeAccess = {accountId:player,bookingId:await registerPlayer(player,free.gameId!,fixed)};
    expect(await guestFinance(freeAccess)).toMatchObject({canReport:false,draft:{amount:0}});
    await expect(reportBookingProof(freeAccess,file(),{})).rejects.toMatchObject({status:400});
  });
});
