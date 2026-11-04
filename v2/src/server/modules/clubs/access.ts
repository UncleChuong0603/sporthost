import "server-only";
import { and, eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getDb, transaction } from "@/server/db/client";
import { hostsInClubhost as hosts, clubAccessInClubhost as access, auditLogsInClubhost as audit, clubsInClubhost as clubs } from "@/server/db/schema";
import { requireClubAccess, capabilities, permissionLabels } from "@/server/access/permissions";
import { AppError } from "@/server/errors";
import { requirePro } from "@/server/modules/subscriptions/entitlements";

export async function clubAccessDetails(hostId: number, clubId: number) {
  const { owner } = await requireClubAccess(getDb(), hostId, clubId);
  if (!owner) return { cohosts: [], logs: [] };
  const cohosts = await getDb().select({ id: access.id, email: hosts.email, role: access.role, permissions: access.permissions }).from(access).innerJoin(hosts, eq(hosts.id, access.hostId)).where(eq(access.clubId, clubId));
  const logs = await getDb().select({ id: audit.id, action: audit.action, details: audit.details, createdAt: audit.createdAt }).from(audit).where(eq(audit.clubId, clubId)).orderBy(desc(audit.id)).limit(50);
  return { cohosts: cohosts.map(row => ({ id: row.id, email: row.email, role: row.role, rights: capabilities(row) })), logs };
}

export async function grantAccess(hostId: number, clubId: number, email: string, role: string, selected: string[]) {
  if (!["manager", "finance", "custom"].includes(role) || (role === "custom" && (!selected.length || selected.some(v => !Object.hasOwn(permissionLabels, v))))) throw new AppError(400, "Chọn vai trò và quyền hợp lệ.");
  await transaction(async client => {
    const db = drizzle(client);
    await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubId)).for("update");
    const { club } = await requireClubAccess(db, hostId, clubId, "owner");
    requirePro(club);
    const [person] = await db.select({ id: hosts.id }).from(hosts).where(eq(hosts.email, email.trim().toLowerCase()));
    if (!person) throw new AppError(400, "Đồng quản lý cần đăng ký tài khoản SportHost trước.");
    if (person.id === club.ownerId) throw new AppError(400, "Chủ câu lạc bộ đã có toàn quyền.");
    const [before] = await db.select().from(access).where(and(eq(access.clubId, clubId), eq(access.hostId, person.id)));
    const permissions = role === "custom" ? JSON.stringify([...new Set(selected)].sort()) : null;
    const values = { clubId, hostId: person.id, role, permissions };
    await db.insert(access).values(values).onConflictDoUpdate({ target: [access.clubId, access.hostId], set: { role, permissions } });
    await db.insert(audit).values({ clubId, hostId, action: "Cấp quyền đồng quản lý", details: JSON.stringify({ before: before ? { role: before.role, permissions: capabilities(before) } : null, after: { host_id: person.id, role, permissions: capabilities(values) } }), createdAt: new Date().toISOString() });
  });
}

export async function revokeAccess(hostId: number, clubId: number, accessId: number) {
  await transaction(async client => {
    const db = drizzle(client);
    await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubId)).for("update");
    await requireClubAccess(db, hostId, clubId, "owner");
    const deleted = await db.delete(access).where(and(eq(access.id, accessId), eq(access.clubId, clubId))).returning({ id: access.id });
    if (!deleted.length) throw new AppError(404, "Không tìm thấy đồng quản lý.");
    await db.insert(audit).values({ clubId, hostId, action: "Thu hồi quyền đồng quản lý", details: `Quyền #${accessId}`, createdAt: new Date().toISOString() });
  });
}
