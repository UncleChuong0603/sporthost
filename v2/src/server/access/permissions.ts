import "server-only";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { clubsInClubhost as clubs, clubAccessInClubhost as access } from "@/server/db/schema";
import { AppError } from "@/server/errors";

export const permissionLabels = { manage_session: "Quản lý buổi chơi", manage_bookings: "Quản lý người chơi", check_in: "Điểm danh tại sân", manage_finance: "Quản lý thu chi", edit_club_settings: "Sửa cài đặt CLB" } as const;
export type Permission = keyof typeof permissionLabels;
export type Capability = Permission | "view" | "owner" | "contacts";
const legacy: Record<string, Permission[]> = { manager: ["manage_session", "manage_bookings", "check_in"], finance: ["manage_finance"] };
export function capabilities(row: { role: string; permissions: string | null } | null): Permission[] {
  if (!row) return [];
  if (row.permissions === null) return legacy[row.role] || [];
  try { const values: unknown = JSON.parse(row.permissions); return Array.isArray(values) ? values.filter((v): v is Permission => typeof v === "string" && Object.hasOwn(permissionLabels, v)) : []; } catch { return []; }
}
export function hasPermission(owner: boolean, rights: Permission[], capability: Capability) {
  if (owner) return true;
  if (capability === "owner") return false;
  if (capability === "view") return true;
  if (capability === "contacts") return rights.includes("manage_bookings") || rights.includes("manage_finance");
  return rights.includes(capability);
}
export async function requireClubAccess(db: NodePgDatabase, hostId: number, clubId: number, capability: Capability = "view") {
  const [row] = await db.select({ club: clubs, access }).from(clubs).leftJoin(access, and(eq(access.clubId, clubs.id), eq(access.hostId, hostId))).where(eq(clubs.id, clubId));
  if (!row || (row.club.ownerId !== hostId && !row.access)) throw new AppError(404, "Không tìm thấy câu lạc bộ.");
  const owner = row.club.ownerId === hostId;
  const rights = owner ? Object.keys(permissionLabels) as Permission[] : capabilities(row.access);
  if (!hasPermission(owner, rights, capability)) throw new AppError(403, "Bạn chưa có quyền thực hiện thao tác này.");
  return { ...row, owner, rights };
}
