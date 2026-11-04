"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FormState } from "@/features/clubs/settings-form";
export function ActionForm({ action, csrf, label, children, variant = "outline", className }: { action: (state: FormState, form: FormData) => Promise<FormState>; csrf: string; label: string; children?: React.ReactNode; variant?: "default" | "outline" | "ghost" | "destructive"; className?: string }) {
  const [state, dispatch, pending] = useActionState(action, {});
  return <form action={dispatch} className={cn("space-y-3", className)}><input type="hidden" name="csrf" value={csrf} />{state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-destructive">{state.error}</p>}{state.success && <p role="status" className="rounded-lg bg-teal-50 p-3 text-sm text-primary">{state.success}</p>}{children}<Button variant={variant} disabled={pending}>{pending ? "Đang xử lý…" : label}</Button></form>;
}
