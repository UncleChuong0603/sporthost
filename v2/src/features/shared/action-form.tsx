"use client";
import { useActionState, useEffect, useRef, type ChangeEventHandler } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FormState } from "@/features/clubs/settings-form";
export function ActionForm({ action, csrf, label, children, variant = "outline", className, onChange }: { action: (state: FormState, form: FormData) => Promise<FormState>; csrf: string; label: string; children?: React.ReactNode; variant?: "default" | "outline" | "ghost" | "destructive"; className?: string; onChange?: ChangeEventHandler<HTMLFormElement> }) {
  const preserve = useRef(false), error = useRef<HTMLParagraphElement>(null);
  const [state, dispatch, pending] = useActionState(async (previous: FormState, form: FormData) => {
    const result = await action(previous, form);
    preserve.current = !!result.error;
    return result;
  }, {});
  useEffect(() => { if (!pending && state.error) error.current?.focus(); }, [pending, state]);
  return <form action={dispatch} onChange={onChange} onReset={event => { if (preserve.current) event.preventDefault(); }} onInvalidCapture={event => {
    const target = event.target as HTMLElement;
    let parent = target.parentElement;
    while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
  }} className={cn("space-y-3", className)}><input type="hidden" name="csrf" value={csrf} />{state.error && <p ref={error} tabIndex={-1} role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-destructive">{state.error}</p>}{state.success && <p role="status" className="rounded-lg bg-teal-50 p-3 text-sm text-primary">{state.success}</p>}{children}<Button variant={variant} disabled={pending}>{pending ? "Đang xử lý…" : label}</Button></form>;
}
