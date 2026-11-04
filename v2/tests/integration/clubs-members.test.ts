import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { installTestEnv } from "./environment";
import { closePool, getPool, getDb, transaction } from "@/server/db/client";
import { signup } from "@/server/auth/service";
import { createClub, updateClub, clubSettings, listClubs } from "@/server/modules/clubs/service";
import { saveMember, listMembers } from "@/server/modules/members/service";
import { requireClubAccess } from "@/server/access/permissions";
import { sports } from "@/domain/catalog";

const prefix = "v2-club-test-" + randomBytes(6).toString("hex");
const ownedHosts: number[] = []; const ownedClubs: number[] = [];
let owner: number, checker: number, other: number, club: number;
beforeAll(async () => {
  installTestEnv();
  for (const role of ["owner", "checker", "other"]) ownedHosts.push((await signup(prefix + role + "@example.com", "local-password-123")).id);
  [owner, checker, other] = ownedHosts;
  club = (await createClub(owner, { name: "CLB kiểm thử", location: "Quận 8" })).id; ownedClubs.push(club);
  await getPool().query("INSERT INTO clubhost.club_access(club_id,host_id,role,permissions) VALUES($1,$2,'custom',$3)", [club, checker, '["check_in"]']);
});
afterAll(async () => {
  if (ownedClubs.length) await transaction(async client => {
    await client.query("DELETE FROM clubhost.audit_logs WHERE club_id=ANY($1::int[])", [ownedClubs]);
    await client.query("DELETE FROM clubhost.club_access WHERE club_id=ANY($1::int[])", [ownedClubs]);
    await client.query("DELETE FROM clubhost.members WHERE club_id=ANY($1::int[])", [ownedClubs]);
    await client.query("DELETE FROM clubhost.clubs WHERE id=ANY($1::int[])", [ownedClubs]);
    await client.query("DELETE FROM clubhost.hosts WHERE id=ANY($1::int[])", [ownedHosts]);
  });
  await closePool();
});
describe("club and contact boundaries", () => {
  it("preserves all seven sport codes and explicit defaults without rewriting finance", async () => {
    for (const code of Object.keys(sports)) {
      const created = await createClub(owner, { name: "Sport " + code, sport_type: code }); ownedClubs.push(created.id);
      expect((await clubSettings(owner, created.id)).sport_type).toBe(code);
    }
    await updateClub(owner, club, { name: "CLB đổi tên" });
    const settings = await clubSettings(owner, club);
    expect(settings.location).toBe("Quận 8");
    expect(settings.default_capacity).toBe(20);
    const before = await getPool().query("SELECT fixed_fee,monthly_fee,qr_key FROM clubhost.clubs WHERE id=$1", [club]);
    await expect(updateClub(owner, club, { default_capacity: 0, name: "must rollback" })).rejects.toMatchObject({ status: 400 });
    expect((await clubSettings(owner, club)).name).toBe("CLB đổi tên");
    expect((await getPool().query("SELECT fixed_fee,monthly_fee,qr_key FROM clubhost.clubs WHERE id=$1", [club])).rows).toEqual(before.rows);
  });
  it("does not disclose contacts, bank fields, or settings mutation to check-in-only cohost", async () => {
    const settings = await clubSettings(checker, club);
    expect(settings.canContacts).toBe(false); expect(settings.canFinance).toBe(false); expect(settings.canEdit).toBe(false);
    expect(settings).not.toHaveProperty("accountNumber");
    expect(await listClubs(checker)).not.toEqual([]);
    await expect(listMembers(checker, club)).rejects.toMatchObject({ status: 403 });
    await expect(updateClub(checker, club, { name: "forbidden" })).rejects.toMatchObject({ status: 403 });
    await expect(clubSettings(other, club)).rejects.toMatchObject({ status: 404 });
    expect(await listClubs(other)).toEqual([]);
  });
  it("normalizes VN phone aliases, rejects duplicates atomically, and leaves gender unspecified", async () => {
    const member = await saveMember(owner, club, null, { name: "Thành viên", phone: "+84 902 345 678", kind: "fixed" });
    const rows = await listMembers(owner, club);
    expect(rows.find(r => r.id === member.id)).toMatchObject({ phone: "0902345678", gender: "unspecified", kind: "fixed" });
    await expect(saveMember(owner, club, null, { name: "Trùng", phone: "84902345678", kind: "guest", gender: "female" })).rejects.toMatchObject({ status: 409 });
    expect(await listMembers(owner, club)).toHaveLength(1);
    await saveMember(owner, club, member.id, { name: "Thành viên sửa", phone: "0902345678", kind: "guest", level: "TB" });
    expect((await listMembers(owner, club))[0]).toMatchObject({ gender: "unspecified", kind: "guest", level: "TB" });
  });
  it("checks current access on each request and denies after revocation", async () => {
    await requireClubAccess(getDb(), checker, club, "check_in");
    await getPool().query("DELETE FROM clubhost.club_access WHERE club_id=$1 AND host_id=$2", [club, checker]);
    await expect(requireClubAccess(getDb(), checker, club, "check_in")).rejects.toMatchObject({ status: 404 });
  });
});
