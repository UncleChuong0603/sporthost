"use client";
import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
export function ExcelDownload({ href, label }: { href: string; label: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false), alert = useRef<HTMLParagraphElement>(null), pending = useRef(false);
  async function download() {
    if (pending.current) return; pending.current = true; setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch(href, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) { const result = await response.json(); throw Error(result.error || result.detail || "Chưa xuất được báo cáo. Vui lòng kiểm tra bộ lọc rồi thử lại."); }
      if (!response.headers.get("content-type")?.includes("spreadsheetml.sheet")) throw Error("Phiên tải chưa hợp lệ. Vui lòng tải lại trang rồi thử lại.");
      const filename = response.headers.get("content-disposition")?.match(/filename="([a-z0-9-]+\.xlsx)"/)?.[1] || "sporthost-bao-cao.xlsx";
      const blob = await response.blob(), url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); setSaved(true);
    } catch (e) { setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "Tải báo cáo mất quá lâu. Thu hẹp bộ lọc rồi thử lại."); requestAnimationFrame(() => alert.current?.focus()); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="min-w-0"><Button type="button" variant="outline" disabled={busy} aria-busy={busy} onClick={() => void download()}><Download aria-hidden="true" className="size-4 shrink-0" />{busy ? "Đang xuất Excel…" : label}</Button>{error && <p ref={alert} role="alert" tabIndex={-1} className="mt-2 max-w-prose text-sm text-destructive">{error}</p>}{saved && <p role="status" className="mt-2 text-xs text-primary">File Excel đã sẵn sàng trong mục tải xuống.</p>}</div>;
}
