import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { installTestEnv } from "./environment";
import { getPool, closePool } from "@/server/db/client";
import { signup } from "@/server/auth/service";
import { createClub } from "@/server/modules/clubs/service";
import { deleteClub } from "@/server/modules/clubs/deletion";
import { saveMember } from "@/server/modules/members/service";
import { linkMemberAccount, unlinkMemberAccount } from "@/server/modules/member-portal/service";
import { saveDue, toggleDue } from "@/server/modules/finance/club";
import { notificationInbox, saveClubReminders, setReminderPreference } from "@/server/modules/notifications/service";
import { monthlyReminderDue, runReminderPage } from "@/server/modules/notifications/reminders";

const prefix = "v2-monthly-" + randomBytes(5).toString("hex"), ids: number[] = [];
let host: number, player: number, outsider: number, club: number, member: number, due: number;
const now = new Date("2030-06-08T00:00:00+07:00");
const settings = { rsvpEnabled: false, paymentEnabled: false, rsvpLeadHours: 24, paymentIntervalDays: 3, monthlyEnabled: true, monthlyDay: 5, monthlyIntervalDays: 3 };
beforeAll(async () => {
  installTestEnv(); for (const role of ["host", "player", "outsider"]) ids.push((await signup(`${prefix}-${role}@example.com`, "monthly-integration-password")).id); [host, player, outsider] = ids;
  await getPool().query("UPDATE clubhost.hosts SET email_verified=true WHERE id=ANY($1::int[])", [ids]);
  club = (await createClub(host, { name: prefix })).id;
  await getPool().query("UPDATE clubhost.clubs SET trial_ends_at=$2 WHERE id=$1", [club, "2031-01-01T00:00:00Z"]);
  member = (await saveMember(host, club, null, { name: "Monthly player", phone: "0904455667", kind: "fixed" })).id;
  await linkMemberAccount(host, club, member, `${prefix}-player@example.com`);
  due = (await saveDue(host, club, member, { period: "2030-06", amount: 100000 })).id;
});
afterAll(async () => {
  if (club) await deleteClub(host, club, prefix);
  await getPool().query("DELETE FROM clubhost.audit_logs WHERE host_id=ANY($1::int[])", [ids]); await getPool().query("DELETE FROM clubhost.hosts WHERE id=ANY($1::int[])", [ids]); await closePool();
});
const notices = async () => (await getPool().query("SELECT * FROM clubhost.notifications WHERE club_id=$1 AND kind='monthly_reminder' ORDER BY id", [club])).rows;
it("uses Vietnam midnight, validates month/day and requires a separate explicit opt-in", async () => {
  expect(monthlyReminderDue("2030-06", 5, new Date("2030-06-04T23:59:59+07:00"))).toBe(false);
  expect(monthlyReminderDue("2030-06", 5, new Date("2030-06-05T00:00:00+07:00"))).toBe(true);
  expect(monthlyReminderDue("2030-07", 5, now)).toBe(false); expect(monthlyReminderDue("2030-13", 5, now)).toBe(false);
  expect(monthlyReminderDue("2030-06", 29, now)).toBe(false);
  await saveClubReminders(host, club, settings);
  await setReminderPreference(player, true); await runReminderPage(0, now); expect(await notices()).toHaveLength(0);
  await setReminderPreference(player, false, true); await runReminderPage(0, new Date("2030-06-04T23:00:00+07:00")); expect(await notices()).toHaveLength(0);
  await Promise.all([runReminderPage(0, now), runReminderPage(0, now)]); expect(await notices()).toHaveLength(1);
  const item = (await notificationInbox(player)).rows.find(n => n.kind === "monthly_reminder")!; expect(item.href).toBe(`/me/dues/${due}`);
  expect((await notificationInbox(outsider)).rows).toEqual([]);
});
it("enforces one account/club cooldown across overdue months and linked profiles, including a changed interval", async () => {
  await saveDue(host, club, member, { period: "2030-05", amount: 200000 });
  const extra = (await saveMember(host, club, null, { name: "Other linked profile", phone: "0904455668", kind: "fixed" })).id;
  await linkMemberAccount(host, club, extra, `${prefix}-player@example.com`); await saveDue(host, club, extra, { period: "2030-04", amount: 300000 });
  await Promise.all([runReminderPage(0, now), runReminderPage(0, now)]); expect(await notices()).toHaveLength(1);
  await saveClubReminders(host, club, { ...settings, monthlyIntervalDays: 1 });
  await runReminderPage(0, new Date(now.valueOf() + 3600000)); expect(await notices()).toHaveLength(1);
  await Promise.all([runReminderPage(0, new Date(now.valueOf() + 86400000)), runReminderPage(0, new Date(now.valueOf() + 86400000))]); expect(await notices()).toHaveLength(2);
});
it("suppresses paid, zero, future and pending-proof dues and resumes only after rechecking real state", async () => {
  await getPool().query("UPDATE clubhost.monthly_dues SET paid=true WHERE member_id IN (SELECT id FROM clubhost.members WHERE club_id=$1)", [club]);
  await toggleDue(host, due); // Real transition back to unpaid.
  await getPool().query("UPDATE clubhost.monthly_dues SET payment_status='reported' WHERE id=$1", [due]);
  const later = new Date(now.valueOf() + 7 * 86400000);
  await runReminderPage(0, later); expect(await notices()).toHaveLength(2);
  await getPool().query("UPDATE clubhost.monthly_dues SET payment_status='unpaid',amount=0 WHERE id=$1", [due]);
  await runReminderPage(0, later); expect(await notices()).toHaveLength(2);
  await saveDue(host, club, member, { period: "2030-07", amount: 50000 }); await runReminderPage(0, later); expect(await notices()).toHaveLength(2);
  await getPool().query("UPDATE clubhost.monthly_dues SET amount=100000 WHERE id=$1", [due]);
  const asset = (await getPool().query("INSERT INTO clubhost.stored_assets(club_id,key,kind,sha256,size,created_at) VALUES($1,$2,'proof',$3,0,$4) RETURNING id", [club, `clubs/${club}/proof/${randomBytes(24).toString("base64url")}.png`, "0".repeat(64), new Date().toISOString()])).rows[0].id;
  const proof = (await getPool().query("INSERT INTO clubhost.payment_proofs(due_id,asset_id,status,note,created_at,reported_amount) VALUES($1,$2,'reported','',$3,100000) RETURNING id", [due, asset, new Date().toISOString()])).rows[0].id;
  await runReminderPage(0, later); expect(await notices()).toHaveLength(2);
  await getPool().query("UPDATE clubhost.payment_proofs SET status='rejected' WHERE id=$1", [proof]); await runReminderPage(0, later); expect(await notices()).toHaveLength(3);
  await toggleDue(host, due); await runReminderPage(0, new Date(later.valueOf() + 86400000)); expect(await notices()).toHaveLength(3);
});
it("rechecks consent, verification, suspension, membership, Pro and read-only mode", async () => {
  await toggleDue(host, due); const later = new Date(now.valueOf() + 12 * 86400000);
  await setReminderPreference(player, true, false); await runReminderPage(0, later); expect(await notices()).toHaveLength(3);
  await setReminderPreference(player, false, true); await getPool().query("UPDATE clubhost.hosts SET email_verified=false WHERE id=$1", [player]); await runReminderPage(0, later); expect(await notices()).toHaveLength(3);
  await expect(setReminderPreference(player, false, true)).rejects.toMatchObject({ status: 403 });
  await getPool().query("UPDATE clubhost.hosts SET email_verified=true WHERE id=$1", [player]);
  await getPool().query("INSERT INTO clubhost.account_controls(account_id,suspended) VALUES($1,true)", [player]); await runReminderPage(0, later); expect(await notices()).toHaveLength(3);
  await getPool().query("DELETE FROM clubhost.account_controls WHERE account_id=$1", [player]);
  await getPool().query("UPDATE clubhost.clubs SET trial_ends_at=NULL,pro_ends_at=NULL WHERE id=$1", [club]); await runReminderPage(0, later); expect(await notices()).toHaveLength(3);
  await expect(saveClubReminders(host, club, settings)).rejects.toMatchObject({ code: "pro_required" });
  await saveClubReminders(host, club, { ...settings, monthlyEnabled: false });
  await getPool().query("UPDATE clubhost.clubs SET trial_ends_at=$2 WHERE id=$1", [club, "2031-01-01T00:00:00Z"]); await saveClubReminders(host, club, settings);
  await unlinkMemberAccount(host, club, member); await runReminderPage(0, later); expect(await notices()).toHaveLength(3);
  expect((await notificationInbox(player)).rows.some(n => n.dueId === due)).toBe(false);
  await expect(saveClubReminders(outsider, club, settings)).rejects.toMatchObject({ status: 404 });
  await expect(saveClubReminders(host, club, { ...settings, monthlyDay: 31 })).rejects.toMatchObject({ status: 400 });
  vi.stubEnv("APP_READ_ONLY", "true"); try { await expect(runReminderPage()).rejects.toMatchObject({ status: 503 }); } finally { vi.stubEnv("APP_READ_ONLY", "false"); }
});
it("paginates over 100 monthly debts using the existing cron cursor and sends no burst", async () => {
  await getPool().query(`WITH fresh AS (
    INSERT INTO clubhost.members(club_id,name,phone,kind,gender,level)
    SELECT $1,'Pagination '||g,'0911'||lpad(g::text,6,'0'),'fixed','unspecified','' FROM generate_series(1,105) g RETURNING id)
    INSERT INTO clubhost.member_account_links(member_id,account_id,linked_at) SELECT id,$2,$3 FROM fresh`, [club, player, new Date().toISOString()]);
  await getPool().query("INSERT INTO clubhost.monthly_dues(member_id,period,amount,paid,access_key) SELECT id,'2030-01',1000,false,$2||id FROM clubhost.members WHERE club_id=$1 AND name LIKE 'Pagination %'", [club, prefix]);
  const at = new Date(now.valueOf() + 20 * 86400000), before = (await notices()).length;
  const first = await runReminderPage(0, at); expect(first.next).not.toBeNull(); expect(first.scanned).toBe(100);
  const second = await runReminderPage(first.next!, at); expect(second.next).toBeNull(); expect(second.scanned).toBe(5);
  expect(await notices()).toHaveLength(before + 1);
});
