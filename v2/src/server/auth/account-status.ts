import "server-only";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppError } from "@/server/errors";

// Repeated at business mutation boundaries so suspension also applies to direct service calls.
export async function requireActiveAccount(db: NodePgDatabase, accountId: number) {
  if (!Number.isSafeInteger(accountId) || accountId < 1 || accountId > 2147483647) throw new AppError(404, "Không tìm thấy tài khoản.");
  const result = await db.execute(sql`SELECT h.id FROM clubhost.hosts h WHERE h.id=${accountId}
    AND NOT EXISTS (SELECT 1 FROM clubhost.account_controls ac WHERE ac.account_id=h.id AND ac.suspended)`);
  if (!result.rows.length) throw new AppError(403, "Tài khoản không hoạt động.", "account_suspended");
}
