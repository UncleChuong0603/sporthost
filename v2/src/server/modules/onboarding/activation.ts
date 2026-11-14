import "server-only";
import type { PoolClient } from "pg";
import { transaction } from "@/server/db/client";
import { assertAdmin } from "@/server/modules/admin/service";
import { AppError } from "@/server/errors";
export async function observeWelcome(client: PoolClient, accountId: number) {
  await client.query("INSERT INTO clubhost.host_activation(account_id,seen_at) VALUES($1,$2) ON CONFLICT(account_id) DO NOTHING", [accountId, new Date().toISOString()]);
}
export async function activationChoice(client: PoolClient, accountId: number, choice: "start" | "dismiss") {
  const column = choice === "start" ? "started_at" : "dismissed_at";
  await client.query(`UPDATE clubhost.host_activation SET ${column}=COALESCE(${column},$2) WHERE account_id=$1`, [accountId, new Date().toISOString()]);
}
// Called inside the real business transaction, so a rollback rolls back the
// milestone too. Pin the first club created after the welcome was observed.
export async function activationMilestone(client: PoolClient, accountId: number, clubId: number, stage: "club" | "session" | "share") {
  const now = new Date().toISOString();
  if (stage === "club") await client.query("UPDATE clubhost.host_activation SET club_id=$2,club_at=$3 WHERE account_id=$1 AND club_at IS NULL", [accountId, clubId, now]);
  else if (stage === "session") await client.query("UPDATE clubhost.host_activation SET session_at=$3 WHERE account_id=$1 AND club_id=$2 AND club_at IS NOT NULL AND session_at IS NULL", [accountId, clubId, now]);
  else await client.query("UPDATE clubhost.host_activation SET share_at=$3 WHERE account_id=$1 AND club_id=$2 AND session_at IS NOT NULL AND share_at IS NULL", [accountId, clubId, now]);
}
export async function activationReport(actorId: number, days = 30) {
  if (![7, 30, 90].includes(days)) throw new AppError(400, "Chọn khoảng 7, 30 hoặc 90 ngày.");
  return transaction(async client => {
    await assertAdmin(actorId, client);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const result = (await client.query<{ seen: number; started: number; dismissed: number; club: number; session: number; share: number }>(`SELECT count(*)::int AS seen,
      count(started_at)::int AS started,count(dismissed_at)::int AS dismissed,count(club_at)::int AS club,count(session_at)::int AS session,count(share_at)::int AS share
      FROM clubhost.host_activation WHERE seen_at >= $1`, [since])).rows[0];
    return { days, ...result };
  }, { readOnly: true });
}
