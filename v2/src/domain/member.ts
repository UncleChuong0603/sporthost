import { z } from "zod";
import { normalizePhone } from "./catalog";
export const memberSchema = z.object({ name: z.string().trim().min(1).max(100), phone: z.string().transform((value, ctx) => { try { return normalizePhone(value); } catch { ctx.addIssue({ code: "custom", message: "Số điện thoại chưa hợp lệ." }); return z.NEVER; } }), kind: z.enum(["fixed", "guest"]), gender: z.enum(["male", "female", "unspecified"]).default("unspecified"), level: z.string().trim().max(40).default("") });
export type MemberInput = z.infer<typeof memberSchema>;
