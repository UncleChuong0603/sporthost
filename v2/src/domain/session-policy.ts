import { z } from "zod";

export function localNow(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date).replace(" ", "T");
}
export function validLocalTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(value + ":00+07:00");
  return Number.isFinite(date.valueOf()) && localNow(date) === value;
}
export const moneySchema = z.union([z.number(), z.string().trim().regex(/^\+?\d+$/).transform(Number)]).pipe(z.number().int().min(0).max(100000000));
export const optionalMoney = z.preprocess(value => value === undefined || value === null || (typeof value === "string" && !value.trim()) ? null : value, moneySchema.nullable());
const deadline = z.preprocess(v => v === "" || v === undefined ? null : v, z.string().refine(validLocalTime, "Thời gian chưa hợp lệ.").nullable());
const maps = z.string().max(500).default("").refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && ["maps.google.com", "www.google.com", "google.com", "maps.app.goo.gl", "goo.gl"].includes(url.hostname); } catch { return false; }
}, "Vui lòng dùng liên kết Google Maps HTTPS hợp lệ.");
export const sessionSchema = z.object({
  title: z.string().trim().min(1).max(150), venue: z.string().trim().max(180).default(""),
  starts_at: z.string().refine(validLocalTime, "Ngày giờ bắt đầu chưa hợp lệ."), capacity: z.coerce.number().int().min(1).max(200),
  capacity_male: z.preprocess(v => v === "" || v === undefined ? null : v, z.coerce.number().int().min(0).nullable()),
  capacity_female: z.preprocess(v => v === "" || v === undefined ? null : v, z.coerce.number().int().min(0).nullable()),
  fixed_fee: moneySchema.default(0), guest_fee: moneySchema.default(0),
  fixed_fee_male: optionalMoney, fixed_fee_female: optionalMoney, guest_fee_male: optionalMoney, guest_fee_female: optionalMoney,
  approval_mode: z.enum(["AUTO_APPROVE", "MANUAL_APPROVE"]).default("MANUAL_APPROVE"),
  fee_mode: z.enum(["FIXED_PRICE", "COST_SHARING"]).default("FIXED_PRICE"),
  no_show_policy: z.enum(["FREE", "FULL"]).default("FREE"), monthly_policy: z.enum(["EXEMPT_PAID", "SESSION_FEE"]).default("SESSION_FEE"),
  skill_guidance: z.string().max(500).default(""), venue_instructions: z.string().max(2000).default(""),
  cancellation_policy: z.string().max(2000).default(""), participation_conditions: z.string().max(2000).default(""), maps_url: maps,
  registration_deadline: deadline, cancellation_deadline: deadline,
  weeks: z.coerce.number().int().min(1).max(12).default(1), rsvp_hours: z.coerce.number().int().min(0).max(168).default(24),
}).superRefine((value, ctx) => {
  for (const name of ["capacity_male", "capacity_female"] as const) if (value[name] !== null && value[name] > value.capacity) ctx.addIssue({ code: "custom", path: [name], message: "Giới hạn nam/nữ không được vượt tổng sức chứa." });
  for (const name of ["registration_deadline", "cancellation_deadline"] as const) if (value[name] && value[name] > value.starts_at) ctx.addIssue({ code: "custom", path: [name], message: "Thời hạn không được sau giờ bắt đầu." });
});
export type SessionInput = z.infer<typeof sessionSchema>;
export type RegistrationState = { isOpen: boolean; isCancelled: boolean; lifecycleStatus: string; startsAt: string; registrationDeadline: string | null; recurringRuleId: number | null; rsvpDeadline: string | null };
export function registrationOpen(game: RegistrationState, now = localNow()) { return game.isOpen && !game.isCancelled && game.lifecycleStatus === "OPEN" && now < (game.registrationDeadline || game.startsAt); }
export function guestOpen(game: RegistrationState, now = localNow()) { return registrationOpen(game, now) && (!game.recurringRuleId || !game.rsvpDeadline || now >= game.rsvpDeadline); }
export function addWeeks(value: string, weeks: number) { return localNow(new Date(new Date(value + ":00+07:00").valueOf() + weeks * 7 * 86400000)); }
