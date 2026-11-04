import { z } from "zod";

const email = z.string().trim().toLowerCase().max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Email chưa hợp lệ.");
export const loginSchema = z.object({ email, password: z.string().min(1, "Vui lòng nhập mật khẩu.").refine(v => [...v].length <= 256, "Mật khẩu quá dài."), csrf: z.string().min(1) });
export const signupSchema = loginSchema.extend({ password: z.string().refine(v => [...v].length >= 10 && [...v].length <= 256, "Mật khẩu cần từ 10 đến 256 ký tự.") });
export type AuthInput = z.infer<typeof loginSchema>;
