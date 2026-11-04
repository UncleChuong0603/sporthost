import "server-only";
import { z } from "zod";
import { isAbsolute } from "node:path";

const bool = z.enum(["true", "false"]).transform(v => v === "true");
const configSchema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  APP_URL: z.string().url().default("http://127.0.0.1:3000"),
  DATABASE_URL: z.string().min(1),
  DB_SCHEMA: z.literal("clubhost").default("clubhost"),
  SECRET_KEY: z.string().min(32).refine(v => !v.includes("[SENSITIVE]") && !v.startsWith("replace-")),
  COOKIE_SECURE: bool.prefault("false"),
  APP_READ_ONLY: bool.prefault("false"),
  ALLOWED_HOSTS: z.string().default("127.0.0.1,localhost"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  TRUST_PROXY_HEADERS: bool.prefault("false"),
  STORAGE_ROOT: z.string().optional(),
  EMAIL_ENABLED: bool.prefault("false"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(), EMAIL_FROM: z.string().max(320).refine(value => !/[\r\n]/.test(value)).optional(),
  SMTP_TLS_CA_FILE: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  ADMIN_EMAILS: z.string().default(""),
  PAYOS_CLIENT_ID: z.string().optional(),
  PAYOS_API_KEY: z.string().optional(),
  PAYOS_CHECKSUM_KEY: z.string().optional(),
});

export function parseConfig(env: Record<string, string | undefined>) {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid server configuration: ${[...new Set(parsed.error.issues.map(i => i.path[0]))].join(", ")}`);
  const value = parsed.data;
  const origin = new URL(value.APP_URL);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("APP_URL must be an origin");
  const hosts = value.ALLOWED_HOSTS.split(",").map(v => v.trim()).filter(Boolean);
  if (!hosts.includes(origin.hostname) || hosts.some(h => !/^[a-zA-Z0-9.:[\]-]+$/.test(h))) throw new Error("Explicit ALLOWED_HOSTS must include APP_URL");
  const database = new URL(value.DATABASE_URL.replace(/^postgresql\+psycopg:\/\//, "postgresql://"));
  if (!["postgresql:", "postgres:"].includes(database.protocol) || value.DATABASE_URL.includes("[SENSITIVE]")) throw new Error("Valid PostgreSQL URL required");
  const deployed = value.APP_ENV === "production" || value.APP_ENV === "staging";
  if (deployed && (origin.protocol !== "https:" || !value.COOKIE_SECURE || !env.ALLOWED_HOSTS)) throw new Error("Deployed app requires HTTPS, secure cookies and explicit hosts");
  if (deployed && ["127.0.0.1", "localhost", "[::1]"].includes(database.hostname)) throw new Error("Deployed app requires an explicit network database host");
  if (deployed && (!value.STORAGE_ROOT || !isAbsolute(value.STORAGE_ROOT))) throw new Error("Persistent absolute STORAGE_ROOT required");
  if (value.EMAIL_ENABLED && (!value.SMTP_HOST || !value.EMAIL_FROM)) throw new Error("Enabled SMTP requires host and sender");
  if (value.SMTP_TLS_CA_FILE && !isAbsolute(value.SMTP_TLS_CA_FILE)) throw new Error("SMTP_TLS_CA_FILE must be absolute");
  // Resend supports SMTP using its API key as password. Never send that key to another SMTP host.
  const resendSmtp = value.SMTP_HOST === "smtp.resend.com";
  const smtpUser = value.SMTP_USER || (resendSmtp ? "resend" : undefined);
  const smtpPassword = value.SMTP_PASSWORD || (resendSmtp && smtpUser === "resend" ? value.RESEND_API_KEY : undefined);
  if (smtpUser && !smtpPassword) throw new Error("SMTP password missing");
  return { ...value, SMTP_USER: smtpUser, SMTP_PASSWORD: smtpPassword, allowedHosts: hosts, origin: origin.origin, databaseUrl: database.toString(), deployed };
}

export type Config = ReturnType<typeof parseConfig>;
export function getConfig(): Config { return parseConfig(process.env); }
