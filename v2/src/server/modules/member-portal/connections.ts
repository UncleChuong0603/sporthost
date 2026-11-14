import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, desc, isNull } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { getDb, transaction } from "@/server/db/client";
import { clubsInClubhost as clubs, hostsInClubhost as accounts, membersInClubhost as members } from "@/server/db/schema";
import { memberAccountLinks as links } from "@/server/db/member-schema";
import { connectionInvites as invites, connectionRequests as requests } from "@/server/db/connection-schema";
import { requireClubAccess } from "@/server/access/permissions";
import { requireActiveAccount } from "@/server/auth/account-status";
import { auditChange } from "@/server/modules/bookings/core";
import { getConfig } from "@/server/config";
import { AppError } from "@/server/errors";

const codePattern = /^[A-Za-z0-9_-]{32}$/;
const input = z.object({ name: z.string().trim().min(1).max(100), note: z.string().trim().max(500).default("") });
const now = () => new Date().toISOString();
export function connectionCode(raw: string) {
  const value = raw.trim();
  if (codePattern.test(value)) return value;
  if (value.length <= 500) {
    try {
      const url = new URL(value, getConfig().origin);
      const match = url.pathname.match(/^\/(?:me\/)?connect\/([A-Za-z0-9_-]{32})\/?$/);
      if (url.origin === getConfig().origin && !url.username && !url.password && !url.search && !url.hash && match) return match[1];
    } catch {}
  }
  throw new AppError(400, "Nhập mã hoặc liên kết mời kết nối CLB do chủ CLB cung cấp.");
}
async function verified(db: NodePgDatabase, accountId: number) {
  await requireActiveAccount(db, accountId);
  const [account] = await db.select({ verified: accounts.emailVerified }).from(accounts).where(eq(accounts.id, accountId)).for("share");
  if (!account?.verified) throw new AppError(403, "Xác minh email trong Hồ sơ trước khi gửi yêu cầu kết nối CLB.");
}
async function hasClubLink(db: NodePgDatabase, accountId: number, clubId: number) {
  return (await db.select({ id: links.memberId }).from(links).innerJoin(members, eq(members.id, links.memberId)).where(and(eq(links.accountId, accountId), eq(members.clubId, clubId))).limit(1)).length > 0;
}
export async function connectionClub(accountId: number, rawCode: string) {
  const code = connectionCode(rawCode), db = getDb();
  await requireActiveAccount(db, accountId);
  const [club] = await db.select({ id: clubs.id, name: clubs.name }).from(invites).innerJoin(clubs, eq(clubs.id, invites.clubId)).where(and(eq(invites.token, code), eq(invites.enabled, true)));
  if (!club) throw new AppError(404, "Liên kết mời không còn hoạt động. Hãy xin liên kết mới từ chủ CLB.");
  const [request] = await db.select({ id: requests.id, status: requests.status }).from(requests).where(and(eq(requests.clubId, club.id), eq(requests.accountId, accountId)));
  return { ...club, linked: await hasClubLink(db, accountId, club.id), request };
}
export async function changeConnectionInvite(ownerId: number, clubId: number, command: "rotate" | "disable") {
  if (!["rotate", "disable"].includes(command)) throw new AppError(400, "Thao tác liên kết mời không hợp lệ.");
  return transaction(async client => {
    const db = drizzle(client);
    await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubId)).for("update");
    await requireClubAccess(db, ownerId, clubId, "owner");
    if (command === "disable") await db.update(invites).set({ enabled: false }).where(eq(invites.clubId, clubId));
    else {
      const values = { token: randomBytes(24).toString("base64url"), enabled: true, createdBy: ownerId, createdAt: now() };
      await db.insert(invites).values({ clubId, ...values }).onConflictDoUpdate({ target: invites.clubId, set: values });
    }
    await auditChange(db, clubId, ownerId, command === "disable" ? "Tắt lời mời kết nối CLB" : "Cấp lời mời kết nối CLB", null, { enabled: command !== "disable" });
  });
}
export async function requestConnection(accountId: number, rawCode: string, raw: unknown) {
  const code = connectionCode(rawCode), parsed = input.safeParse(raw);
  if (!parsed.success) throw new AppError(400, "Nhập họ tên (tối đa 100 ký tự) và lời nhắn tối đa 500 ký tự.");
  return transaction(async client => {
    const db = drizzle(client);
    const [invite] = await db.select({ clubId: invites.clubId }).from(invites).where(eq(invites.token, code));
    if (!invite) throw new AppError(404, "Liên kết mời không còn hoạt động.");
    await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, invite.clubId)).for("update");
    const [current] = await db.select().from(invites).where(and(eq(invites.clubId, invite.clubId), eq(invites.token, code), eq(invites.enabled, true)));
    if (!current) throw new AppError(404, "Liên kết mời không còn hoạt động.");
    await verified(db, accountId);
    if (await hasClubLink(db, accountId, invite.clubId)) throw new AppError(409, "Tài khoản đã kết nối với CLB này. Mở Lịch của tôi để tham gia.");
    const [existing] = await db.select().from(requests).where(and(eq(requests.clubId, invite.clubId), eq(requests.accountId, accountId))).for("update");
    if (existing?.status === "pending") return existing.id;
    const values = { ...parsed.data, status: "pending", requestedAt: now(), reviewedAt: null, reviewedBy: null, memberId: null, reason: "" };
    const [request] = await db.insert(requests).values({ clubId: invite.clubId, accountId, ...values }).onConflictDoUpdate({ target: [requests.clubId, requests.accountId], set: values }).returning({ id: requests.id });
    await auditChange(db, invite.clubId, accountId, "Yêu cầu kết nối CLB", null, { request_id: request.id, account_id: accountId });
    return request.id;
  });
}
export async function reviewConnection(ownerId: number, clubId: number, requestId: number, command: "approve" | "reject", memberId: number | null, reason = "") {
  if (!Number.isInteger(requestId) || requestId < 1 || requestId > 2147483647 || (command === "approve" && (!Number.isInteger(memberId) || !memberId || memberId < 1 || memberId > 2147483647))) throw new AppError(400, "Chọn yêu cầu và hồ sơ thành viên hợp lệ.");
  if (!["approve", "reject"].includes(command) || reason.trim().length > 500 || (command === "reject" && !reason.trim())) throw new AppError(400, "Nhập lý do từ chối tối đa 500 ký tự.");
  return transaction(async client => {
    const db = drizzle(client);
    await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubId)).for("update");
    await requireClubAccess(db, ownerId, clubId, "owner");
    const [request] = await db.select().from(requests).where(and(eq(requests.id, requestId), eq(requests.clubId, clubId))).for("update");
    if (!request) throw new AppError(404, "Không tìm thấy yêu cầu.");
    if (request.status !== "pending") throw new AppError(409, "Yêu cầu đã được xử lý hoặc người chơi đã rút lại. Hãy tải lại danh sách.");
    if (command === "approve") {
      await verified(db, request.accountId);
      const [member] = memberId ? await db.select({ id: members.id }).from(members).where(and(eq(members.id, memberId), eq(members.clubId, clubId))) : [];
      if (!member) throw new AppError(400, "Chọn đúng hồ sơ thành viên của CLB để liên kết.");
      const [existing] = await db.select().from(links).where(eq(links.memberId, member.id));
      if (existing || await hasClubLink(db, request.accountId, clubId)) throw new AppError(409, "Hồ sơ hoặc tài khoản đã được liên kết. Kiểm tra liên kết hiện tại trước khi duyệt.");
      await db.insert(links).values({ memberId: member.id, accountId: request.accountId, linkedByHostId: ownerId, linkedAt: now() });
    }
    await db.update(requests).set({ status: command === "approve" ? "approved" : "rejected", memberId: command === "approve" ? memberId : null, reviewedBy: ownerId, reviewedAt: now(), reason: reason.trim() }).where(eq(requests.id, requestId));
    await auditChange(db, clubId, ownerId, command === "approve" ? "Duyệt kết nối CLB" : "Từ chối kết nối CLB", { status: "pending" }, { request_id: requestId, account_id: request.accountId, member_id: command === "approve" ? memberId : null }, reason.trim());
  });
}
export async function cancelConnection(accountId: number, requestId: number) {
  if (!Number.isInteger(requestId) || requestId < 1 || requestId > 2147483647) throw new AppError(404, "Không tìm thấy yêu cầu.");
  return transaction(async client => {
    const db = drizzle(client);
    await requireActiveAccount(db, accountId);
    const [request] = await db.select().from(requests).where(and(eq(requests.id, requestId), eq(requests.accountId, accountId)));
    if (!request) throw new AppError(404, "Không tìm thấy yêu cầu.");
    await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, request.clubId)).for("update");
    const [changed] = await db.update(requests).set({ status: "cancelled", reviewedAt: now() }).where(and(eq(requests.id, requestId), eq(requests.accountId, accountId), eq(requests.status, "pending"))).returning({ id: requests.id });
    if (!changed) throw new AppError(409, "Yêu cầu đã được xử lý. Hãy tải lại danh sách.");
    await auditChange(db, request.clubId, accountId, "Rút yêu cầu kết nối CLB", null, { request_id: requestId });
  });
}
export async function ownerConnections(ownerId: number, clubId: number) {
  const db = getDb(); await requireClubAccess(db, ownerId, clubId, "owner");
  const [invite] = await db.select({ token: invites.token, enabled: invites.enabled }).from(invites).where(eq(invites.clubId, clubId));
  const queue = await db.select({ id: requests.id, name: requests.name, note: requests.note, email: accounts.email, requestedAt: requests.requestedAt }).from(requests).innerJoin(accounts, eq(accounts.id, requests.accountId)).where(and(eq(requests.clubId, clubId), eq(requests.status, "pending"))).orderBy(desc(requests.id));
  const available = await db.select({ id: members.id, name: members.name, phone: members.phone }).from(members).leftJoin(links, eq(links.memberId, members.id)).where(and(eq(members.clubId, clubId), isNull(links.memberId)));
  return { invite, queue, available };
}
export async function playerConnections(accountId: number) {
  const db = getDb(); await requireActiveAccount(db, accountId);
  return db.select({ id: requests.id, clubId: clubs.id, clubName: clubs.name, name: requests.name, status: requests.status, reason: requests.reason, requestedAt: requests.requestedAt }).from(requests).innerJoin(clubs, eq(clubs.id, requests.clubId)).where(eq(requests.accountId, accountId)).orderBy(desc(requests.id));
}
