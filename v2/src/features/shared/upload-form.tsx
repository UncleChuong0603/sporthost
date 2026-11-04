"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function UploadForm({ action, csrf, label, children }: { action: string; csrf: string; label: string; children: React.ReactNode }) {
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const form = useRef<HTMLFormElement>(null); const router = useRouter();
  return <form ref={form} action={action} method="post" encType="multipart/form-data" className="space-y-4" onSubmit={async event => {
    event.preventDefault(); if (pending) return; setPending(true); setError(""); setSuccess("");
    try {
      const response = await fetch(action, { method: "POST", headers: { Accept: "application/json" }, body: new FormData(event.currentTarget) });
      const data = await response.json();
      if (!response.ok) { setError(data.detail || "Chưa lưu được ảnh. Vui lòng thử lại."); return; }
      setSuccess("Đã lưu thay đổi."); form.current?.reset(); router.refresh();
    } catch { setError("Chưa gửi được yêu cầu. Kiểm tra trạng thái trước khi tải lại ảnh."); }
    finally { setPending(false); }
  }}><input name="csrf" type="hidden" value={csrf} />{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-destructive">{error}</p>}{success && <p role="status" className="rounded-lg bg-teal-50 p-3 text-sm text-primary">{success}</p>}{children}<Button disabled={pending}>{pending ? "Đang tải ảnh…" : label}</Button></form>;
}
