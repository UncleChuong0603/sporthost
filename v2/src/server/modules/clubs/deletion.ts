import "server-only";
import { transaction } from "@/server/db/client";
import { drizzle } from "drizzle-orm/node-postgres";
import { requireClubAccess } from "@/server/access/permissions";
import { auditChange } from "@/server/modules/bookings/core";
import { deleteImage } from "@/server/infrastructure/storage";
import { AppError } from "@/server/errors";
import { auditLogsInClubhost as audit, clubsInClubhost as clubs } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";

export async function deleteClub(hostId: number, clubId: number, confirmationName: string) {
  const job = await transaction(async client => {
    const db = drizzle(client);
    await requireClubAccess(db, hostId, clubId, "owner");
    // Follow session -> club order used by bookings, then detect a newly inserted session before deleting.
    const locked = (await client.query<{ id: number }>("SELECT id FROM clubhost.game_sessions WHERE club_id=$1 ORDER BY id FOR UPDATE", [clubId])).rows.map(row => row.id);
    await client.query("SELECT id FROM clubhost.clubs WHERE id=$1 FOR UPDATE", [clubId]);
    const { club } = await requireClubAccess(db, hostId, clubId, "owner");
    if (confirmationName.trim() !== club.name) throw new AppError(400, "Vui lòng nhập chính xác tên CLB để xác nhận xóa.");
    const current = (await client.query<{ id: number }>("SELECT id FROM clubhost.game_sessions WHERE club_id=$1 ORDER BY id", [clubId])).rows.map(row => row.id);
    if (JSON.stringify(current) !== JSON.stringify(locked)) throw new AppError(409, "Lịch vừa thay đổi. Kiểm tra lại CLB trước khi xóa.");
    const assetKeys = (await client.query<{ key: string }>("SELECT key FROM clubhost.stored_assets WHERE club_id=$1", [clubId])).rows.map(row => row.key);
    const games = "SELECT id FROM clubhost.game_sessions WHERE club_id=$1";
    const members = "SELECT id FROM clubhost.members WHERE club_id=$1";
    const bookings = `SELECT id FROM clubhost.bookings WHERE session_id IN (${games})`;
    const dues = `SELECT id FROM clubhost.monthly_dues WHERE member_id IN (${members})`;
    const batches = `SELECT id FROM clubhost.charge_batches WHERE session_id IN (${games})`;
    for (const [table, condition] of [
      ["charge_adjustments", `batch_id IN (${batches})`], ["money_movements", `session_id IN (${games})`],
      ["charges", `batch_id IN (${batches})`], ["charge_batches", `session_id IN (${games})`],
      ["payment_proofs", `booking_id IN (${bookings}) OR due_id IN (${dues}) OR asset_id IN (SELECT id FROM clubhost.stored_assets WHERE club_id=$1)`],
      ["booking_participants", `booking_id IN (${bookings})`], ["bookings", `session_id IN (${games})`],
      ["expenses", `session_id IN (${games})`], ["monthly_dues", `member_id IN (${members})`],
      ...["game_sessions", "members", "recurring_rules", "club_access", "subscription_requests", "stored_assets"].map(table => [table, "club_id=$1"]),
    ]) await client.query(`DELETE FROM clubhost.${table} WHERE ${condition}`, [clubId]);
    await client.query("UPDATE clubhost.audit_logs SET club_id=NULL,details=$2 || details WHERE club_id=$1", [clubId, `CLB #${clubId} (${club.name}) đã xóa.\n`]);
    await auditChange(db, null, hostId, "Xóa CLB", { club_id: clubId, name: club.name }, null);
    await client.query("DELETE FROM clubhost.clubs WHERE id=$1", [clubId]);
    const details = { club_id: clubId, asset_keys: assetKeys, status: "pending" };
    const [queue] = await db.insert(audit).values({ clubId: null, hostId, action: "Dọn ảnh CLB đã xóa", details: JSON.stringify(details), createdAt: new Date().toISOString() }).returning({ id: audit.id });
    return { id: queue.id, keys: assetKeys, details };
  });
  let cleanupPending = 0;
  for (const key of job.keys) { try { await deleteImage(key); } catch { cleanupPending++; } }
  if (!cleanupPending) {
    try { await transaction(async client => { await drizzle(client).update(audit).set({ details: JSON.stringify({ ...job.details, status: "complete" }) }).where(eq(audit.id, job.id)); }); }
    catch { /* Committed pending journal makes retry safe even when final status write fails. */ }
  }
  // Missing/unavailable historical storage must not roll back an already committed explicit deletion.
  return { cleanupPending };
}

export async function retryDeletedClubMedia(hostId: number, jobId: number) {
  const db = getDb(); const [job] = await db.select().from(audit).where(eq(audit.id, jobId));
  if (!job || job.action !== "Dọn ảnh CLB đã xóa" || job.hostId !== hostId || job.clubId !== null) throw new AppError(404, "Không tìm thấy tác vụ dọn ảnh.");
  let details: { club_id: number; asset_keys: string[]; status: string };
  try { details = JSON.parse(job.details); } catch { throw new AppError(409, "Tác vụ dọn ảnh không hợp lệ."); }
  if (!Number.isSafeInteger(details.club_id) || !Array.isArray(details.asset_keys) || details.asset_keys.some(key => typeof key !== "string" || !key.startsWith(`clubs/${details.club_id}/`))) throw new AppError(409, "Tác vụ dọn ảnh không hợp lệ.");
  if (details.status === "complete") return { cleanupPending: 0 };
  if ((await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, details.club_id))).length) throw new AppError(409, "CLB vẫn tồn tại; chưa thể dọn ảnh.");
  let cleanupPending = 0;
  for (const key of details.asset_keys) { try { await deleteImage(key); } catch { cleanupPending++; } }
  if (!cleanupPending) await transaction(async client => { await drizzle(client).update(audit).set({ details: JSON.stringify({ ...details, status: "complete" }) }).where(eq(audit.id, job.id)); });
  return { cleanupPending };
}
