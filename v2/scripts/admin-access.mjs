// Offline operator tool. Never imported by the application; never run by startup.
import { readFileSync, existsSync } from "node:fs";
import { parse } from "dotenv";
import pg from "pg";

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (
    ![
      "--account-id",
      "--confirm-account-id",
      "--actor-id",
      "--action",
      "--reason",
      "--environment",
    ].includes(args[i]) ||
    !args[i + 1] ||
    options[args[i]]
  )
    throw Error("Use documented --key value arguments");
  options[args[i]] = args[i + 1];
}
const id = Number(options["--account-id"]),
  actor = Number(options["--actor-id"] || 0);
const grant = options["--action"] === "grant",
  reason = options["--reason"]?.trim();
if (
  !Number.isSafeInteger(id) ||
  id < 1 ||
  id > 2147483647 ||
  String(id) !== options["--confirm-account-id"] ||
  !["grant", "revoke"].includes(options["--action"]) ||
  !reason ||
  reason.length < 5 ||
  reason.length > 500 ||
  !["test", "development", "staging", "production"].includes(
    options["--environment"],
  )
)
  throw Error(
    "Explicit account confirmation, environment, action and 5–500 character reason required",
  );
let env, url;
try {
  env = {
    ...(existsSync(".env.local") ? parse(readFileSync(".env.local")) : {}),
    ...process.env,
  };
  url = new URL(
    env.DATABASE_URL.replace(/^postgresql\+psycopg:\/\//, "postgresql://"),
  );
  if (!["postgresql:", "postgres:"].includes(url.protocol)) throw Error();
} catch {
  throw Error("Invalid private operator database configuration");
}
if ((env.APP_ENV || "development") !== options["--environment"])
  throw Error("Environment does not match private configuration");
const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
if (
  options["--environment"] === "test" &&
  (!local || !url.pathname.endsWith("_test"))
)
  throw Error("Test mode requires disposable loopback database");
for (const key of [
  "sslmode",
  "sslcert",
  "sslkey",
  "sslrootcert",
  "channel_binding",
  "options",
])
  url.searchParams.delete(key);
const client = new pg.Client({
  connectionString: url.toString(),
  ssl: local ? false : { rejectUnauthorized: true },
  connectionTimeoutMillis: 10000,
});
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL statement_timeout='15s'");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SELECT pg_advisory_xact_lock(84621031)");
  const activeAdmins = (
    await client.query(
      "SELECT h.id FROM clubhost.hosts h WHERE h.is_platform_admin AND NOT EXISTS(SELECT 1 FROM clubhost.account_controls a WHERE a.account_id=h.id AND a.suspended) ORDER BY h.id FOR UPDATE OF h",
    )
  ).rows;
  const target = (
    await client.query(
      "SELECT h.id,h.email_verified,h.is_platform_admin,coalesce(a.suspended,false) AS suspended FROM clubhost.hosts h LEFT JOIN clubhost.account_controls a ON a.account_id=h.id WHERE h.id=$1 FOR UPDATE OF h",
      [id],
    )
  ).rows[0];
  if (!target || !target.email_verified || target.suspended)
    throw Error("Target must be an existing verified, active, trusted account");
  if (target.is_platform_admin === grant)
    throw Error("Account already has requested access");
  if (activeAdmins.length) {
    if (!activeAdmins.some((a) => a.id === actor))
      throw Error("Existing active Super Admin actor required");
  } else if (!grant || actor) {
    throw Error(
      "Only a first-admin grant without actor is permitted for bootstrap",
    );
  }
  if (!grant && (id === actor || activeAdmins.length <= 1))
    throw Error("Cannot revoke self or last active Super Admin");
  await client.query(
    "UPDATE clubhost.hosts SET is_platform_admin=$2,session_version=session_version+1 WHERE id=$1",
    [id, grant],
  );
  await client.query(
    "INSERT INTO clubhost.admin_audit_events(actor_id,action,target_type,target_id,reason,changes) VALUES($1,$2,'user',$3,$4,$5)",
    [
      actor || id,
      grant ? "grant_admin" : "revoke_admin",
      id,
      reason,
      JSON.stringify({
        before: { is_platform_admin: target.is_platform_admin },
        after: { is_platform_admin: grant },
        bootstrap: activeAdmins.length === 0,
      }),
    ],
  );
  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      updated_account_id: id,
      action: grant ? "grant_admin" : "revoke_admin",
      login_again_required: true,
    }),
  );
} catch {
  await client.query("ROLLBACK").catch(() => {});
  console.error(
    "Admin access change failed. Verify target, active administrator, migration and private configuration. No secrets printed.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
