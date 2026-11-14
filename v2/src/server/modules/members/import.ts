import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { transaction } from "@/server/db/client";
import { requireClubAccess } from "@/server/access/permissions";
import { getConfig } from "@/server/config";
import { AppError } from "@/server/errors";
import { normalizePhone } from "@/domain/catalog";
import { membersInClubhost as members } from "@/server/db/schema";
import { parseMembersExcel, type ImportRow } from "./xlsx";

const hash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const signature = (value: string) => createHmac("sha256", getConfig().SECRET_KEY).update("member-import-v1:" + value).digest("base64url");
export async function membersExcelImport(hostId: number, clubId: number, bytes: Buffer, token?: string) {
  // Check before CPU/file parsing, then repeat under the club lock on commit.
  if (!Number.isSafeInteger(clubId) || clubId < 1 || clubId > 2147483647) throw new AppError(404, "Không tìm thấy CLB.");
  await transaction(client => requireClubAccess(drizzle(client), hostId, clubId, "manage_bookings"), { readOnly: true });
  const parsed = await parseMembersExcel(bytes);
  return transaction(async client => {
    if (token !== undefined) await client.query("SELECT id FROM clubhost.clubs WHERE id=$1 FOR UPDATE", [clubId]);
    await requireClubAccess(drizzle(client), hostId, clubId, "manage_bookings");
    const current = (await client.query<{ phone: string }>("SELECT phone FROM clubhost.members WHERE club_id=$1", [clubId])).rows;
    const existing = new Set(current.map(m => { try { return normalizePhone(m.phone); } catch { return m.phone; } }));
    const rows: ImportRow[] = parsed.map(row => row.status === "ready" && existing.has(row.phone) ? { ...row, status: "duplicate", message: "Số điện thoại đã có trong CLB; không ghi đè." } : row);
    const fingerprint = hash(JSON.stringify([hostId, clubId, hash(bytes), rows]));
    if (token !== undefined) {
      const parts = token.split(".");
      if (parts.length !== 3 || !/^\d+$/.test(parts[1])) throw new AppError(400, "Bản xem trước chưa hợp lệ.");
      const expected = signature(parts[0] + "." + parts[1]), left = Buffer.from(expected), right = Buffer.from(parts[2]);
      if (left.length !== right.length || !timingSafeEqual(left, right)) throw new AppError(403, "Bản xem trước chưa hợp lệ.");
      if (Date.now() - Number(parts[1]) > 15 * 60000 || Number(parts[1]) > Date.now() + 1000 || parts[0] !== fingerprint) throw new AppError(409, "File hoặc danh sách CLB đã thay đổi. Bấm Xem trước để kiểm tra lại trước khi nhập.");
      const ready = rows.filter(row => row.status === "ready");
      if (!ready.length) throw new AppError(400, "Không có dòng hợp lệ mới để nhập.");
      // Same lock as saveMember: a concurrent manual add/import cannot race a
      // duplicate check. All accepted rows commit together; retries need preview.
      await drizzle(client).insert(members).values(ready.map(row => ({ ...row.values!, clubId })));
      return { imported: ready.length, skipped: rows.length - ready.length };
    }
    const time = Date.now(), value = fingerprint + "." + time;
    return { rows, ready: rows.filter(r => r.status === "ready").length, invalid: rows.filter(r => r.status === "invalid").length, duplicate: rows.filter(r => r.status === "duplicate").length, token: value + "." + signature(value) };
  }, { readOnly: token === undefined });
}
