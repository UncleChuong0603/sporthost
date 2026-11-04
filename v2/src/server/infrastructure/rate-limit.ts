import "server-only";
import { createHmac } from "node:crypto";
import { getConfig } from "@/server/config";
import { transaction } from "@/server/db/client";
import { AppError } from "@/server/errors";

export async function rateLimit(identity: string, scope: string, limit = 30, seconds = 60) {
  const now = Math.floor(Date.now() / 1000);
  const id = createHmac("sha256", getConfig().SECRET_KEY).update(scope + "|" + identity).digest("hex") + ":" + Math.floor(now / seconds);
  const hits = await transaction(async client => {
    const { rows } = await client.query<{ hits: number }>(`INSERT INTO clubhost.request_limits(id,bucket,hits) VALUES($1,$2,1)
      ON CONFLICT(id) DO UPDATE SET hits=clubhost.request_limits.hits+1 RETURNING hits`, [id, now + seconds]);
    return rows[0].hits;
  });
  if (hits > limit) throw new AppError(429, "Bạn thao tác quá nhanh. Vui lòng chờ một lát rồi thử lại.", "rate_limited");
}
