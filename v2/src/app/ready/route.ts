import { transaction } from "@/server/db/client";
import { privateHeaders } from "@/server/errors";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await transaction(async client => {
      await client.query("SELECT id,password_hash,session_version FROM clubhost.hosts LIMIT 0");
      await client.query("SELECT fixed_fee,fixed_fee_male,fixed_fee_female FROM clubhost.clubs LIMIT 0");
      await client.query("SELECT snapshot,closed_at,version FROM clubhost.charge_batches LIMIT 0");
      const result = await client.query("SELECT version_num FROM clubhost.alembic_version");
      if (result.rows[0]?.version_num !== "0011_fixed_member_fees") throw new Error("Unexpected baseline");
    }, { readOnly: true });
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch { return Response.json({ detail: "Database not ready" }, { status: 503, headers: privateHeaders }); }
}
