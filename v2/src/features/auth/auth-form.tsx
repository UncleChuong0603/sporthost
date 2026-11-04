"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { loginSchema, signupSchema, type AuthInput } from "@/lib/schemas/auth";
import { authenticate } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuthForm({ mode, csrf, audience = "host" }: { mode: "login" | "signup"; csrf: string; audience?: "host" | "member" }) {
  const [error, setError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError: setFieldError } = useForm<AuthInput>({ resolver: zodResolver(mode === "signup" ? signupSchema : loginSchema), defaultValues: { email: "", password: "", csrf } });
  return <form noValidate onSubmit={handleSubmit(async data => {
    setError("");
    const result = await authenticate(mode, data, audience === "member" ? "/me" : "/dashboard");
    if (result?.error) setError(result.error);
    for (const [key, message] of Object.entries(result?.fields || {})) setFieldError(key as keyof AuthInput, { message });
  })} className="space-y-5">
    {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-red-50 p-3 text-sm text-destructive">{error}</p>}
    <input type="hidden" {...register("csrf")} value={csrf} />
    <div className="space-y-2"><label htmlFor="email" className="block text-sm font-semibold">Email</label><Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} {...register("email")} />{errors.email && <p id="email-error" className="text-sm text-destructive">{errors.email.message}</p>}</div>
    <div className="space-y-2"><label htmlFor="password" className="block text-sm font-semibold">Mật khẩu</label><Input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : mode === "signup" ? "password-hint" : undefined} {...register("password")} />{errors.password ? <p id="password-error" className="text-sm text-destructive">{errors.password.message}</p> : mode === "signup" ? <p id="password-hint" className="text-sm text-muted-foreground">Từ 10 đến 256 ký tự.</p> : null}</div>
    <Button className="w-full" type="submit" disabled={isSubmitting}>{isSubmitting ? <><LoaderCircle className="animate-spin" aria-hidden="true" />Đang xử lý…</> : <>{mode === "signup" ? "Tạo tài khoản" : "Đăng nhập"}<ArrowRight aria-hidden="true" /></>}</Button>
    {mode === "login" && <Link href="/forgot-password" className="flex min-h-11 items-center justify-center text-sm font-semibold text-primary underline-offset-4 hover:underline">Quên mật khẩu?</Link>}
    <p className="text-center text-sm text-muted-foreground">{mode === "signup" ? "Đã có tài khoản? " : "Chưa có tài khoản? "}<Link className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline" href={`${audience === "member" ? "/me" : ""}${mode === "signup" ? "/login" : "/signup"}`}>{mode === "signup" ? "Đăng nhập" : "Tạo tài khoản"}</Link></p>
  </form>;
}
