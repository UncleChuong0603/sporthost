// Operator-only, read-only deployment inspection. Credentials travel through stdin.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "v2/package.json"));
const { parse } = require("dotenv");
const pg = require("pg");
const targets = {
  production: { id: "oUctLiT_1JGDfDXbDDlwL", origin: "https://sporthost.online" },
  preview: { id: "jDjFowxqtg40YPaQ8y_NA", origin: "https://sporthost-v2-preview-bwtxar-42-96-4-79.sslip.io" },
};

// Inspect metadata only, in an explicit read-only PostgreSQL transaction.
export async function inspectDatabase(rawUrl) {
 const url = new URL((rawUrl||'').replace(/^postgresql\+psycopg:/,'postgresql:'));
 if (["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode"))) url.searchParams.set("sslmode", "verify-full");
 const c = new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:10000});
 try {
  await c.connect(); await c.query('BEGIN TRANSACTION READ ONLY');
  await c.query("SET LOCAL statement_timeout='10s'");
  const revision = (await c.query('SELECT version_num FROM clubhost.alembic_version')).rows;
  const present = (await c.query("SELECT to_regclass('clubhost.payment_orders') IS NOT NULL AS present")).rows[0].present;
  const columns = present ? (await c.query("SELECT column_name,data_type,is_nullable,character_maximum_length,column_default FROM information_schema.columns WHERE table_schema='clubhost' AND table_name='payment_orders' ORDER BY ordinal_position")).rows : [];
  const indexes = present ? (await c.query("SELECT indexname,indexdef,(SELECT indisvalid AND indisready FROM pg_index WHERE indexrelid=to_regclass(quote_ident(schemaname)||'.'||quote_ident(indexname))) AS ready FROM pg_indexes WHERE schemaname='clubhost' AND tablename='payment_orders' ORDER BY indexname")).rows : [];
  const constraints = present ? (await c.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='clubhost.payment_orders'::regclass AND contype IN ('p','f','c') ORDER BY conname")).rows : [];
  const privileges = present ? (await c.query("SELECT has_table_privilege(current_user,'clubhost.payment_orders','SELECT') AS select,has_table_privilege(current_user,'clubhost.payment_orders','INSERT') AS insert,has_table_privilege(current_user,'clubhost.payment_orders','UPDATE') AS update")).rows[0] : null;
  await c.query('ROLLBACK');
  const sourceFingerprint = createHash("sha256").update(`${url.hostname}|${url.port || "None"}|${decodeURIComponent(url.pathname.slice(1))}|clubhost`).digest("hex");
  return {ok:true,read_only:true,source_fingerprint:sourceFingerprint,legacy_revision_ok:revision.length===1&&revision[0].version_num==='0011_fixed_member_fees',payment_table_present:present,columns,indexes,constraints,privileges};
 } catch { return {ok:false,read_only:true,error:'database_inspection_failed'}; }
 finally { await c.end().catch(()=>{}); }
}

const normalDefinition = value => value.replace(/::character varying|::text(?:\[\])?/g, "").replace(/[()\[\]\s"]/g, "");
export function paymentSchemaIssues(database) {
  if (!database.ok) return ["database_inspection_failed"];
  if (!database.payment_table_present) return ["payment_migration_missing"];
  const expectedColumns = [
    ["order_code","bigint","NO",null,null], ["club_id","integer","YES",null,null], ["host_id","integer","NO",null,null],
    ["club_name","character varying","NO",100,null], ["amount","integer","NO",null,null], ["original_amount","integer","NO",null,null],
    ["period_days","integer","NO",null,null], ["status","character varying","NO",20,null], ["payment_link_id","character varying","YES",100,null],
    ["checkout_url","character varying","YES",500,null], ["created_at","timestamp with time zone","NO",null,"now()"],
    ["expires_at","timestamp with time zone","NO",null,null], ["paid_at","timestamp with time zone","YES",null,null], ["activated_until","character varying","YES",null,null],
  ];
  const columns = database.columns.map(row => [row.column_name,row.data_type,row.is_nullable,row.character_maximum_length,row.column_default]);
  const issues = JSON.stringify(columns) === JSON.stringify(expectedColumns) ? [] : ["payment_columns_mismatch"];
  const constraints = {
    ck_payment_order_amount: "CHECK (amount > 0 AND original_amount >= amount AND period_days > 0)",
    ck_payment_order_status: "CHECK (status = ANY (ARRAY['CREATING','PENDING','PAID','CANCELLED','EXPIRED']))",
    payment_orders_club_id_fkey: "FOREIGN KEY (club_id) REFERENCES clubhost.clubs(id) ON DELETE SET NULL",
    payment_orders_host_id_fkey: "FOREIGN KEY (host_id) REFERENCES clubhost.hosts(id)",
    payment_orders_pkey: "PRIMARY KEY (order_code)",
  };
  for (const [name, definition] of Object.entries(constraints)) {
    const actual = database.constraints.find(row => row.conname === name);
    if (!actual || normalDefinition(actual.definition) !== normalDefinition(definition)) issues.push("payment_constraint_mismatch:" + name);
  }
  const indexes = {
    ix_payment_orders_club: "CREATE INDEX ix_payment_orders_club ON clubhost.payment_orders USING btree (club_id,created_at)",
    payment_orders_pkey: "CREATE UNIQUE INDEX payment_orders_pkey ON clubhost.payment_orders USING btree (order_code)",
    uq_payment_orders_link: "CREATE UNIQUE INDEX uq_payment_orders_link ON clubhost.payment_orders USING btree (payment_link_id)",
    uq_payment_orders_active_club: "CREATE UNIQUE INDEX uq_payment_orders_active_club ON clubhost.payment_orders USING btree (club_id) WHERE status = ANY (ARRAY['CREATING','PENDING'])",
  };
  for (const [name, definition] of Object.entries(indexes)) {
    const actual = database.indexes.find(row => row.indexname === name);
    if (!actual || !actual.ready || normalDefinition(actual.indexdef) !== normalDefinition(definition)) issues.push("payment_index_mismatch:" + name);
  }
  return issues;
}

const remote = String.raw`
import json,sys,urllib.request,urllib.parse
p=json.load(sys.stdin)
assert p['application_id'] in ('oUctLiT_1JGDfDXbDDlwL','jDjFowxqtg40YPaQ8y_NA')
def get(endpoint,query):
 req=urllib.request.Request('http://127.0.0.1:3000/api/'+endpoint+'?'+urllib.parse.urlencode(query),headers={'x-api-key':p['key']})
 with urllib.request.urlopen(req,timeout=20) as response:return json.load(response)
try:
 app=get('application.one',{'applicationId':p['application_id']})
 pairs={}
 for line in (app.get('env') or '').splitlines():
  name,separator,value=line.partition('=')
  if not separator:continue
  value=value.strip()
  if value.startswith('"'):
   try:value=json.loads(value)
   except ValueError:pass
  elif value.startswith("'") and value.endswith("'"):value=value[1:-1]
  pairs[name.strip()]=value
 payment_keys=('PAYOS_CLIENT_ID','PAYOS_API_KEY','PAYOS_CHECKSUM_KEY')
 running=[row for row in get('docker.getContainersByAppNameMatch',{'appName':app['appName']}) if row.get('state')=='running']
 result={'application_id':p['application_id'],'application_status':app.get('applicationStatus'),'running_containers':len(running),'payment_key_presence':{name:bool(pairs.get(name)) for name in payment_keys},'configured_flags':{name:pairs.get(name) for name in ('APP_ENV','APP_READ_ONLY','COOKIE_SECURE','PORT','EMAIL_ENABLED')},'persistent_upload_mount':any(m.get('mountPath')=='/data/uploads' for m in app.get('mounts',[]))}
 if len(running)==1:
  config=get('docker.getConfig',{'containerId':running[0]['containerId']})
  if isinstance(config,str):config=json.loads(config)
  if isinstance(config.get('config'),str):config=json.loads(config['config'])
  runtime=dict(line.split('=',1) for line in config.get('Config',{}).get('Env',[]) if '=' in line)
  result['runtime_payment_key_presence']={name:bool(runtime.get(name)) for name in payment_keys}
  result['runtime_flags']={name:runtime.get(name) for name in ('APP_ENV','APP_READ_ONLY','COOKIE_SECURE','PORT','EMAIL_ENABLED')}
  result['runtime_configuration_matches']=all(runtime.get(name)==pairs.get(name) for name in (*payment_keys,'APP_ENV','APP_READ_ONLY','COOKIE_SECURE','PORT','EMAIL_ENABLED'))
  result['runtime_image']=config.get('Image')
  result['runtime_private_upload_mount']=any(m.get('Destination')=='/data/uploads' and m.get('RW') and m.get('Type')=='volume' for m in config.get('Mounts',[]))
 result['_database_url']=pairs.get('DATABASE_URL','')
 print(json.dumps({'ok':True,'result':result}))
except Exception as error:print(json.dumps({'ok':False,'error_category':type(error).__name__}))
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--target" || !targets[args[1]]) throw Error("Use --target production or --target preview");
  const target = args[1], configuration = targets[target];
  const values = parse(readFileSync(resolve(root, ".env.dokploy.local")));
  if (!values.DOKPLOY_API_KEY) throw Error("Missing operator key");
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  const ssh = spawnSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "sporthost", "python3 -c " + quote(remote)], {
    input: JSON.stringify({ key: values.DOKPLOY_API_KEY, application_id: configuration.id }),
    encoding: "utf8", timeout: 55000, windowsHide: true,
  });
  if (ssh.status !== 0) throw Error("SSH inspection failed");
  const inspection = JSON.parse(ssh.stdout);
  if (inspection.result) {
    const databaseUrl = inspection.result._database_url;
    delete inspection.result._database_url;
    inspection.result.database = await inspectDatabase(databaseUrl);
  }
  const http = await Promise.all(["/health", "/ready", "/me/login"].map(async path => {
    try {
      const response = await fetch(configuration.origin + path, { redirect: "manual", signal: AbortSignal.timeout(15000) });
      await response.body?.cancel();
      return { path, status: response.status };
    } catch { return { path, error: "http_check_failed" }; }
  }));
  const result = inspection.result;
  const blockers = [];
  if (!inspection.ok) blockers.push("operator_inspection_failed");
  if (result?.application_status !== "done") blockers.push("deployment_not_complete");
  if (result?.database) blockers.push(...paymentSchemaIssues(result.database));
  else blockers.push("database_inspection_failed");
  if (result?.database?.ok && !result.database.legacy_revision_ok) blockers.push("unexpected_legacy_revision");
  if (result?.payment_key_presence && Object.values(result.payment_key_presence).some(value => !value)) blockers.push("payment_keys_missing");
  if (!result?.runtime_payment_key_presence || Object.values(result.runtime_payment_key_presence).some(value => !value)) blockers.push("runtime_payment_keys_missing");
  if (!result?.runtime_configuration_matches) blockers.push("runtime_configuration_pending_deployment");
  if (result?.database?.privileges && Object.values(result.database.privileges).some(value => !value)) blockers.push("payment_table_privileges_missing");
  if (!result?.persistent_upload_mount || !result?.runtime_private_upload_mount) blockers.push("persistent_upload_mount_missing");
  if (result?.running_containers !== 1) blockers.push("expected_one_running_container");
  if (http.some(check => check.status !== 200)) blockers.push("http_check_failed");
  console.log(JSON.stringify({ target, checked_at: new Date().toISOString(), writes: 0, ...inspection, http, preflight_passed: blockers.length === 0, live_settlement_verified: false, blockers }, null, 2));
  if (blockers.length) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => {
  console.log(JSON.stringify({ ok: false, writes: 0, error: "release_inspection_failed", details: "Check the explicit target, operator configuration and SSH access; credentials are never logged." }));
  process.exitCode = 1;
});
