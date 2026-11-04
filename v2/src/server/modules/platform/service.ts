import "server-only";
import { and, eq, desc, like, isNull, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { getDb, transaction } from "@/server/db/client";
import { hostsInClubhost as hosts, clubsInClubhost as clubs, platformLedgerEntriesInClubhost as entries, auditLogsInClubhost as logs } from "@/server/db/schema";
import { auditChange } from "@/server/modules/bookings/core";
import { periodSchema } from "@/server/modules/finance/club";
import { moneySchema } from "@/domain/session-policy";
import { AppError } from "@/server/errors";

async function admin(db: NodePgDatabase, hostId: number, lock = false) {
  const query = db.select({ id: hosts.id, admin: hosts.isPlatformAdmin }).from(hosts).where(eq(hosts.id, hostId));
  const [host] = await (lock ? query.for("update") : query);
  if (!host?.admin) throw new AppError(403, "Chỉ quản trị nền tảng được thực hiện thao tác này.");
}
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(value + "T00:00:00Z"); return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value; });
const entrySchema = z.object({ entryDate: day, direction: z.enum(["INCOME", "EXPENSE"]), category: z.string().trim().min(1).max(80), amount: moneySchema.refine(value => value > 0), note: z.string().trim().max(1000).default("") });
const snapshot = (entry: typeof entries.$inferSelect) => ({ id: entry.id, entry_date: entry.entryDate, direction: entry.direction, category: entry.category, amount: entry.amount, note: entry.note, version: entry.version });
export async function platformLedger(hostId: number, period = "") {
  const db = getDb(); await admin(db, hostId);
  if (period && !periodSchema.safeParse(period).success) throw new AppError(400, "Tháng chưa hợp lệ.");
  const records = await db.select({ id: entries.id, entryDate: entries.entryDate, direction: entries.direction, category: entries.category, amount: entries.amount, note: entries.note, version: entries.version }).from(entries).where(period ? like(entries.entryDate, period + "-%") : undefined).orderBy(desc(entries.entryDate), desc(entries.id));
  const history = await db.select({ id: logs.id, action: logs.action, details: logs.details, createdAt: logs.createdAt }).from(logs).where(and(isNull(logs.clubId), inArray(logs.action, ["Ghi sổ nền tảng", "Sửa sổ nền tảng"]))).orderBy(desc(logs.id)).limit(100);
  return { entries: records, received: records.filter(entry => entry.direction === "INCOME").reduce((sum, entry) => sum + entry.amount, 0), expenses: records.filter(entry => entry.direction === "EXPENSE").reduce((sum, entry) => sum + entry.amount, 0), logs: history };
}
export async function createPlatformEntry(hostId: number, raw: unknown, requestKey: string) {
  const parsed = entrySchema.safeParse(raw); if (!parsed.success || requestKey.length < 8 || requestKey.length > 128) throw new AppError(400, "Kiểm tra ngày, số tiền và nội dung thu chi.");
  return transaction(async client => {
    const db = drizzle(client); await admin(db, hostId, true);
    const [old] = await db.select().from(entries).where(eq(entries.requestKey, requestKey));
    if (old) { if (Object.entries(parsed.data).some(([key, value]) => old[key as keyof typeof old] !== value)) throw new AppError(409, "Mã thao tác đã được dùng."); return old; }
    const [entry] = await db.insert(entries).values({ ...parsed.data, createdBy: hostId, createdAt: new Date().toISOString(), version: 0, requestKey }).returning();
    await auditChange(db, null, hostId, "Ghi sổ nền tảng", null, snapshot(entry)); return entry;
  });
}
export async function editPlatformEntry(hostId: number, entryId: number, raw: unknown, version: number, reason: string) {
  const parsed = entrySchema.safeParse(raw);
  if (!parsed.success || !reason.trim() || reason.length > 500 || !Number.isSafeInteger(version) || version < 0) throw new AppError(400, "Cần lý do và thông tin thu chi hợp lệ.");
  return transaction(async client => {
    const db = drizzle(client); await admin(db, hostId);
    const [old] = await db.select().from(entries).where(eq(entries.id, entryId)).for("update");
    if (!old) throw new AppError(404, "Không tìm thấy khoản thu chi.");
    if (old.version !== version) throw new AppError(409, "Khoản đã được sửa. Vui lòng tải lại trang.");
    const [entry] = await db.update(entries).set({ ...parsed.data, version: version + 1, updatedBy: hostId, updatedAt: new Date().toISOString() }).where(eq(entries.id, entryId)).returning();
    await auditChange(db, null, hostId, "Sửa sổ nền tảng", snapshot(old), snapshot(entry), reason.trim()); return entry;
  });
}
export async function platformOverview(hostId: number) {
  const db = getDb(); await admin(db, hostId);
  return { clubs: await db.select({ id: clubs.id, ownerId: clubs.ownerId, name: clubs.name, trialEndsAt: clubs.trialEndsAt, proEndsAt: clubs.proEndsAt }).from(clubs).orderBy(desc(clubs.id)),
    hosts: await db.select({ id: hosts.id, email: hosts.email, emailVerified: hosts.emailVerified, isPlatformAdmin: hosts.isPlatformAdmin }).from(hosts).orderBy(desc(hosts.id)),
    logs: await db.select({ id: logs.id, action: logs.action, details: logs.details, createdAt: logs.createdAt }).from(logs).where(isNull(logs.clubId)).orderBy(desc(logs.id)).limit(60) };
}
export async function extendTrial(hostId: number, clubId: number, days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new AppError(400, "Gia hạn từ 1 đến 365 ngày.");
  return transaction(async client => {
    const db = drizzle(client); await admin(db, hostId);
    const [club] = await db.select({ id: clubs.id, trialEndsAt: clubs.trialEndsAt }).from(clubs).where(eq(clubs.id, clubId)).for("update");
    if (!club) throw new AppError(404, "Không tìm thấy CLB.");
    const trialEndsAt = new Date(Date.now() + days * 86400000).toISOString();
    await db.update(clubs).set({ trialEndsAt }).where(eq(clubs.id, clubId));
    await auditChange(db, clubId, hostId, "Gia hạn Pro trial miễn phí", { trial_ends_at: club.trialEndsAt }, { trial_ends_at: trialEndsAt, days });
  });
}
