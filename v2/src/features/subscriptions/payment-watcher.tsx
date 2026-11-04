"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { paymentCommand } from "@/app/(workspace)/clubs/[clubId]/subscription/actions";

export function PaymentWatcher({ clubId, orderCode, csrf }: { clubId: number; orderCode: number; csrf: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("Đang kiểm tra thanh toán với payOS…");
  useEffect(() => {
    let stopped = false; let attempts = 0; let timer: ReturnType<typeof setTimeout>;
    async function check() {
      const form = new FormData(); form.set("csrf", csrf);
      try {
        const result = await paymentCommand(clubId, orderCode, "refresh", {}, form);
        if (stopped) return;
        if (result.status && ["PAID", "CANCELLED", "EXPIRED"].includes(result.status)) { setMessage(result.success || "Đã cập nhật."); router.refresh(); return; }
        if (result.error) { setMessage(result.error + " Bạn có thể bấm Kiểm tra thanh toán để thử lại."); return; }
      } catch { if (!stopped) setMessage("Kết nối bị gián đoạn. Bấm Kiểm tra thanh toán để thử lại."); return; }
      if (++attempts < 12 && !stopped) timer = setTimeout(check, 5000);
      else if (!stopped) setMessage("Chưa nhận được xác nhận. Nếu đã chuyển khoản, bấm Kiểm tra thanh toán; bạn không cần thanh toán lại.");
    }
    void check();
    return () => { stopped = true; clearTimeout(timer); };
  }, [clubId, orderCode, csrf, router]);
  return <p role="status" className="mt-4 text-sm text-muted-foreground">{message}</p>;
}
