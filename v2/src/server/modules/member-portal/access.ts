import "server-only";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { hostsInClubhost as accounts } from "@/server/db/schema";
import { memberAccountLinks as links } from "@/server/db/member-schema";
import { AppError } from "@/server/errors";

export type PlayerBookingAccess = string | { accountId: number; bookingId: number };
export type PlayerDueAccess = string | { accountId: number; dueId: number };

export async function requireLinkedMember(db: NodePgDatabase, accountId: number, memberId: number, lock = false) {
  if (!Number.isSafeInteger(accountId) || accountId < 1 || !Number.isSafeInteger(memberId) || memberId < 1) throw new AppError(404, "Không tìm thấy hồ sơ người chơi.");
  const query = db.select({ memberId: links.memberId }).from(links).innerJoin(accounts, eq(accounts.id, links.accountId))
    .where(and(eq(links.accountId, accountId), eq(links.memberId, memberId), eq(accounts.emailVerified, true)));
  // Hold both the link and verified account stable through the mutation. Avoid
  // Drizzle's schema-qualified OF clause, which PostgreSQL does not accept.
  const [link] = await (lock ? query.for("share") : query);
  if (!link) throw new AppError(404, "Không tìm thấy hồ sơ người chơi.");
  return link;
}
