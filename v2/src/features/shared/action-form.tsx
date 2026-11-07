"use client";
import { useId, useRef } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useRetainedAction } from "./retained-action";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FormState } from "@/features/clubs/settings-form";
export function ActionForm({ action, csrf, label, children, variant = "outline", className, confirmation }: { action: (state: FormState, form: FormData) => Promise<FormState>; csrf: string; label: string; children?: React.ReactNode; variant?: "default" | "outline" | "ghost" | "destructive"; className?: string; confirmation?: string }) {
  const { state, dispatch, pending, onReset } = useRetainedAction(action);
  const dialog = useRef<HTMLDialogElement>(null), form = useRef<HTMLFormElement>(null), approved = useRef(false), trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const message = confirmation || (variant === "destructive" ? "Thao tác này sẽ thay đổi dữ liệu hiện tại. Vui lòng kiểm tra thông tin trước khi xác nhận." : undefined);
  function close() { dialog.current?.close(); trigger.current?.focus(); }
  return <><form ref={form} action={dispatch} onReset={onReset} aria-busy={pending} onSubmit={event => {
    if (pending) { event.preventDefault(); return; }
    if (message && !approved.current) { event.preventDefault(); dialog.current?.showModal(); return; }
    approved.current = false;
  }} className={cn("space-y-3", className)}><input type="hidden" name="csrf" value={csrf} />{state.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-destructive">{state.error}</p>}{state.success && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-primary">{state.success}</p>}{children}<Button ref={trigger} variant={variant} disabled={pending}>{pending ? <><LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />Đang xử lý…</> : label}</Button></form>
    {message && <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onClose={() => trigger.current?.focus()} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}><span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-800"><TriangleAlert className="size-6" aria-hidden="true" /></span><h2 id={`${id}-title`} className="text-xl font-bold">{label}?</h2><p id={`${id}-description`} className="my-4 text-sm leading-7 text-muted-foreground">{message}</p><div className="mt-6 flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" autoFocus onClick={close}>Quay lại</Button><Button type="button" variant={variant === "destructive" ? "destructive" : "default"} onClick={() => { approved.current = true; close(); form.current?.requestSubmit(); }}>Xác nhận</Button></div></dialog>}
  </>;
}
