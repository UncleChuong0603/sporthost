"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyText({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState("copied"); }
    catch { setState("manual"); }
  }
  return <div className="space-y-2"><Button type="button" variant="outline" onClick={copy} className="min-h-11 max-w-full whitespace-normal text-left">{state === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{label}</Button><p role="status" className="text-sm text-muted-foreground">{state === "copied" ? "Đã sao chép." : state === "manual" ? "Trình duyệt chưa cho phép sao chép. Chọn nội dung bên dưới để sao chép thủ công." : null}</p>{state === "manual" && <textarea readOnly aria-label={`Nội dung cho ${label}`} value={text} onFocus={event => event.currentTarget.select()} className="min-h-24 w-full rounded-lg border bg-white p-3 text-sm" />}</div>;
}
export function PaymentDetails({ bankName, accountNumber, accountHolder, note }: { bankName: string; accountNumber: string; accountHolder: string; note: string }) {
  if (!accountNumber) return null;
  return <div className="mt-5 space-y-3 rounded-xl bg-muted p-4 text-sm"><p className="font-semibold">{bankName}</p><p className="break-all text-xl font-bold">{accountNumber}</p><p>{accountHolder}</p><CopyText text={accountNumber} label="Sao chép số tài khoản" />{note && <><p className="whitespace-pre-wrap break-words">Nội dung: {note}</p><CopyText text={note} label="Sao chép nội dung chuyển khoản" /></>}</div>;
}
