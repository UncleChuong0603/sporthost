"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function UploadForm({ action, csrf, label, children }: { action: string; csrf: string; label: string; children: React.ReactNode }) {
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const form = useRef<HTMLFormElement>(null); const router = useRouter();
  const lock = useRef(false);
  return <form ref={form} action={action} method="post" encType="multipart/form-data" aria-busy={pending} className="space-y-4" onSubmit={async event => {
    event.preventDefault(); if (lock.current) return; lock.current = true; setPending(true); setError(""); setSuccess("");
    try {
      const response = await fetch(action, { method: "POST", headers: { Accept: "application/json" }, body: new FormData(event.currentTarget) });
      const data = await response.json().catch(() => null);
      if (!response.ok) { setError(response.status === 401 ? "Phiên đăng nhập đã hết hạn. Mở lại trang đăng nhập rồi thử lại." : response.status === 413 ? "Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn." : typeof data?.detail === "string" ? data.detail : "Chưa lưu được ảnh. Vui lòng thử lại."); return; }
      if (typeof data?.location !== "string" || !data.location.startsWith("/")) { setError("Chưa xác nhận được kết quả tải ảnh. Kiểm tra trạng thái trước khi gửi lại."); return; }
      setSuccess(action.endsWith("/proof") ? "Đã gửi biên nhận. Chờ host đối soát tiền thực nhận; khoản này chưa được xác nhận đã thu." : "Đã lưu thay đổi."); form.current?.reset(); router.refresh();
    } catch { setError("Chưa gửi được yêu cầu. Kiểm tra trạng thái trước khi tải lại ảnh."); }
    finally { lock.current = false; setPending(false); }
  }}><input name="csrf" type="hidden" value={csrf} />{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-destructive">{error}</p>}{success && <p role="status" className="rounded-lg bg-teal-50 p-3 text-sm text-primary">{success}</p>}{children}<Button disabled={pending}>{pending ? "Đang tải ảnh…" : label}</Button></form>;
}
