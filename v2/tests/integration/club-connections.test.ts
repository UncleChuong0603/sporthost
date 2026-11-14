import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { installTestEnv } from "./environment";
import { closePool, getDb, getPool } from "@/server/db/client";
import { signup } from "@/server/auth/service";
import { createClub } from "@/server/modules/clubs/service";
import { deleteClub } from "@/server/modules/clubs/deletion";
import { grantAccess } from "@/server/modules/clubs/access";
import { saveMember } from "@/server/modules/members/service";
import { playerProfiles, linkMemberAccount, unlinkMemberAccount } from "@/server/modules/member-portal/service";
import { requireClubAccess } from "@/server/access/permissions";
import { cancelConnection, changeConnectionInvite, connectionClub, connectionCode, ownerConnections, playerConnections, requestConnection, reviewConnection } from "@/server/modules/member-portal/connections";
import { dashboardData } from "@/server/modules/clubs/dashboard";

const prefix = "v2-connect-" + randomBytes(5).toString("hex"), hosts: number[] = [];
let owner: number, manager: number, player: number, second: number, unverified: number, outsider: number;
let club: number, foreignClub: number, member: number, foreignMember: number, code: string, requestId: number;
beforeAll(async () => {
  installTestEnv();
  for (const role of ["owner", "manager", "player", "second", "unverified", "outsider"]) hosts.push((await signup(prefix + role + "@example.com", "connection-password-123")).id);
  [owner, manager, player, second, unverified, outsider] = hosts;
  await getPool().query("UPDATE clubhost.hosts SET email_verified=true WHERE id=ANY($1::int[])", [[player, second]]);
  club = (await createClub(owner, { name: prefix })).id;
  foreignClub = (await createClub(outsider, { name: prefix + " foreign" })).id;
  member = (await saveMember(owner, club, null, { name: "Verified player", phone: "0901004401", gender: "female", kind: "fixed" })).id;
  foreignMember = (await saveMember(outsider, foreignClub, null, { name: "Foreign player", phone: "0901004402", gender: "female", kind: "fixed" })).id;
  await grantAccess(owner, club, prefix + "manager@example.com", "manager", []);
  await getPool().query("UPDATE clubhost.clubs SET trial_ends_at=NULL,pro_ends_at=NULL WHERE id=$1", [club]);
  await changeConnectionInvite(owner, club, "rotate"); code = (await ownerConnections(owner, club)).invite!.token;
});
afterAll(async () => {
  if (club) await deleteClub(owner, club, prefix);
  if (foreignClub) await deleteClub(outsider, foreignClub, prefix + " foreign");
  if (hosts.length) {
    await getPool().query("DELETE FROM clubhost.audit_logs WHERE host_id=ANY($1::int[])", [hosts]);
    await getPool().query("DELETE FROM clubhost.hosts WHERE id=ANY($1::int[])", [hosts]);
  }
  await closePool();
});
describe("Free club connection requests preserve explicit owner identity approval", () => {
  it("requires verification and owner rights, accepts only local invitation URLs", async () => {
    expect(connectionCode(`http://127.0.0.1:3000/connect/${code}`)).toBe(code);
    expect(connectionCode(`/me/connect/${code}`)).toBe(code);
    for (const value of [`https://evil.test/connect/${code}`, `//evil.test/connect/${code}`, `/connect/${code}?x=1`, "bad"]) expect(() => connectionCode(value)).toThrow();
    await expect(changeConnectionInvite(manager, club, "rotate")).rejects.toMatchObject({ status: 403 });
    await expect(ownerConnections(manager, club)).rejects.toMatchObject({ status: 403 });
    await expect(requestConnection(unverified, code, { name: "Unverified" })).rejects.toMatchObject({ status: 403 });
    expect(await playerProfiles(player)).toEqual([]);
  });
  it("serializes duplicate requests and shows the queue only to the owner", async () => {
    const ids = await Promise.all([requestConnection(player, code, { name: "Verified player", note: "Please connect" }), requestConnection(player, code, { name: "Verified player" })]);
    expect(ids[0]).toBe(ids[1]); requestId = ids[0];
    expect((await ownerConnections(owner, club)).queue).toMatchObject([{ id: requestId, email: prefix + "player@example.com" }]);
    expect((await playerConnections(second))).toEqual([]);
    expect(await playerProfiles(player)).toEqual([]);
    expect((await dashboardData(owner)).work.connections).toEqual([{ clubId: club, clubName: prefix, total: 1 }]);
    expect((await dashboardData(manager)).work.connections).toEqual([]);
    await expect(requireClubAccess(getDb(), player, club)).rejects.toMatchObject({ status: 404 });
  });
  it("rejects unauthorized reviews, foreign profiles and withdrawal by another account", async () => {
    await expect(reviewConnection(manager, club, requestId, "approve", member)).rejects.toMatchObject({ status: 403 });
    await expect(reviewConnection(outsider, foreignClub, requestId, "approve", foreignMember)).rejects.toMatchObject({ status: 404 });
    await expect(reviewConnection(owner, club, requestId, "approve", foreignMember)).rejects.toMatchObject({ status: 400 });
    await expect(cancelConnection(second, requestId)).rejects.toMatchObject({ status: 404 });
    expect((await playerConnections(player))[0].status).toBe("pending");
  });
  it("supports a reasoned rejection, resubmission, withdrawal and explicit owner approval", async () => {
    await expect(reviewConnection(owner, club, requestId, "reject", null)).rejects.toMatchObject({ status: 400 });
    await reviewConnection(owner, club, requestId, "reject", null, "Please confirm identity");
    expect((await playerConnections(player))[0]).toMatchObject({ status: "rejected", reason: "Please confirm identity" });
    expect(await requestConnection(player, code, { name: "Confirmed identity" })).toBe(requestId);
    await cancelConnection(player, requestId);
    expect((await playerConnections(player))[0].status).toBe("cancelled");
    await requestConnection(player, code, { name: "Confirmed identity" });
    await reviewConnection(owner, club, requestId, "approve", member);
    expect((await playerProfiles(player)).map(row => row.id)).toEqual([member]);
    expect((await connectionClub(player, code)).linked).toBe(true);
    expect((await playerConnections(player))[0].status).toBe("approved");
    expect((await dashboardData(owner)).work.connections).toEqual([]);
    await expect(requireClubAccess(getDb(), player, club)).rejects.toMatchObject({ status: 404 });
    await expect(requestConnection(player, code, { name: "Already linked" })).rejects.toMatchObject({ status: 409 });
  });
  it("cannot overwrite a link or resurrect a removed identity using an old approval", async () => {
    await unlinkMemberAccount(owner, club, member);
    await expect(reviewConnection(owner, club, requestId, "approve", member)).rejects.toMatchObject({ status: 409 });
    expect(await playerProfiles(player)).toEqual([]);
    await requestConnection(player, code, { name: "Try again" });
    await linkMemberAccount(owner, club, member, prefix + "second@example.com");
    await expect(reviewConnection(owner, club, requestId, "approve", member)).rejects.toMatchObject({ status: 409 });
    expect((await playerConnections(player))[0].status).toBe("pending");
    expect((await playerProfiles(second)).map(row => row.id)).toEqual([member]);
    await unlinkMemberAccount(owner, club, member);
  });
  it("rotates/disables invitations while retaining existing requests and denies suspended accounts", async () => {
    await changeConnectionInvite(owner, club, "rotate");
    const replacement = (await ownerConnections(owner, club)).invite!.token;
    expect(replacement).not.toBe(code);
    await expect(connectionClub(player, code)).rejects.toMatchObject({ status: 404 });
    await expect(requestConnection(second, code, { name: "Old invitation" })).rejects.toMatchObject({ status: 404 });
    await changeConnectionInvite(owner, club, "disable");
    await expect(requestConnection(second, replacement, { name: "Disabled invitation" })).rejects.toMatchObject({ status: 404 });
    expect((await ownerConnections(owner, club)).queue).toHaveLength(1);
    await getPool().query("INSERT INTO clubhost.account_controls(account_id,suspended) VALUES($1,true) ON CONFLICT(account_id) DO UPDATE SET suspended=true", [player]);
    await expect(reviewConnection(owner, club, requestId, "approve", member)).rejects.toMatchObject({ status: 403 });
    await getPool().query("DELETE FROM clubhost.account_controls WHERE account_id=$1", [player]);
    await reviewConnection(owner, club, requestId, "approve", member);
    expect((await playerProfiles(player)).map(row => row.id)).toEqual([member]);
  });
  it("serializes competing approvals for the same profile without linking the wrong account", async () => {
    await getPool().query("UPDATE clubhost.hosts SET email_verified=true WHERE id=$1", [unverified]);
    await changeConnectionInvite(owner, club, "rotate");
    const currentCode = (await ownerConnections(owner, club)).invite!.token;
    const target = (await saveMember(owner, club, null, { name: "Only one identity", phone: "0901004403", gender: "female", kind: "fixed" })).id;
    const ids = await Promise.all([requestConnection(second, currentCode, { name: "Second" }), requestConnection(unverified, currentCode, { name: "Third" })]);
    const outcomes = await Promise.allSettled(ids.map(id => reviewConnection(owner, club, id, "approve", target)));
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
    const connected = (await getPool().query("SELECT account_id FROM clubhost.member_account_links WHERE member_id=$1", [target])).rows;
    expect(connected).toHaveLength(1);
    const winner = outcomes[0].status === "fulfilled" ? second : unverified;
    expect(connected[0].account_id).toBe(winner);
    await expect(requireClubAccess(getDb(), winner, club)).rejects.toMatchObject({ status: 404 });
  });
});
