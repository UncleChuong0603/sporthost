import "server-only";
import { createHmac } from "node:crypto";
import { getConfig } from "@/server/config";
import { transaction } from "@/server/db/client";
import { AppError } from "@/server/errors";

let lastSweep = 0;

export async function rateLimit(identity: string, scope: string, limit = 30, seconds = 60) {
  const now = Math.floor(Date.now() / 1000);
  const id = createHmac("sha256", getConfig().SECRET_KEY).update(scope + "|" + identity).digest("hex") + ":" + Math.floor(now / seconds);
  const hits = await transaction(async client => {
    // Bound housekeeping and its frequency; live buckets continue to be shared
    // atomically across workers. Expired counters contain no business history.
    if (now >= lastSweep + 60) {
      lastSweep = now;
      await client.query(`WITH expired AS (
        SELECT id FROM clubhost.request_limits WHERE bucket < $1 LIMIT 500 FOR UPDATE SKIP LOCKED
      ) DELETE FROM clubhost.request_limits WHERE id IN (SELECT id FROM expired)`, [now]);
    }
    const { rows } = await client.query<{ hits: number }>(`INSERT INTO clubhost.request_limits(id,bucket,hits) VALUES($1,$2,1)
      ON CONFLICT(id) DO UPDATE SET hits=clubhost.request_limits.hits+1 RETURNING hits`, [id, now + seconds]);
    return rows[0].hits;
  });
  if (hits > limit) throw new AppError(429, "Bạn thao tác quá nhanh. Vui lòng chờ một lát rồi thử lại.", "rate_limited");
}
