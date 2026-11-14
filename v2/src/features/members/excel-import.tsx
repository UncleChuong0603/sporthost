"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportRow } from "@/server/modules/members/xlsx";
type Preview = { rows: ImportRow[]; ready: number; invalid: number; duplicate: number; token: string };
export function ExcelImport({ clubId, clubName, csrf }: { clubId: number; clubName: string; csrf: string }) {
  const router = useRouter(), file = useRef<HTMLInputElement>(null), alert = useRef<HTMLParagraphElement>(null), summary = useRef<HTMLHeadingElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null), [error, setError] = useState(""), [success, setSuccess] = useState(""), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [visible, setVisible] = useState(50);
  async function send(mode: "preview" | "commit", event?: FormEvent) {
    event?.preventDefault(); if (busy) return;
    const selected = file.current?.files?.[0]; if (!selected) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const form = new FormData(); form.set("file", selected); form.set("mode", mode); if (preview) form.set("token", preview.token);
      const response = await fetch(`/api/clubs/${clubId}/members-import`, { method: "POST", body: form, headers: { "x-csrf-token": csrf }, signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok) { if (mode === "commit") setPreview(null); throw Error(result.error || "Chưa nhập được danh sách. Hãy xem trước lại để kiểm tra trạng thái."); }
      if (mode === "preview") { setPreview(result); setConfirmed(false); setVisible(50); requestAnimationFrame(() => summary.current?.focus()); }
      else { setPreview(null); setSuccess(`Đã thêm ${result.imported} thành viên. Bỏ qua ${result.skipped} dòng lỗi hoặc trùng; danh sách cũ được giữ nguyên.`); if (file.current) file.current.value = ""; window.dispatchEvent(new Event("sporthost:mutation-success")); router.refresh(); }
    } catch (error) { setError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Kết nối bị gián đoạn. Xem trước lại để kiểm tra thành viên đã được nhập trước khi thử tiếp."); requestAnimationFrame(() => alert.current?.focus()); }
    finally { setBusy(false); }
  }
  return <section data-tour="members-excel" className="mt-6 rounded-2xl border bg-white p-5 sm:p-8" aria-labelledby="excel-import-title"><h2 id="excel-import-title" className="text-xl font-bold">Nhập thành viên từ Excel · {clubName}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Dùng file .xlsx, tối đa 2 MB và 500 thành viên. Hệ thống đọc sheet đầu tiên; giữ dòng tiêu đề. Chỉ Họ tên và Số điện thoại là bắt buộc.</p>
    <Button asChild variant="outline" className="my-4"><a href="/templates/thanh-vien-sporthost.xlsx" download><Download aria-hidden="true" className="size-4" />Tải file Excel mẫu</a></Button>
    <form onSubmit={event => void send("preview", event)} aria-busy={busy} className="space-y-4"><label className="block space-y-2 text-sm font-semibold"><span>File danh sách thành viên</span><input ref={file} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required disabled={busy} className="block w-full rounded-lg border bg-white p-3" onChange={() => { setPreview(null); setError(""); setSuccess(""); }} /></label><Button type="submit" variant="outline" disabled={busy}><FileSpreadsheet aria-hidden="true" className="size-4" />{busy ? "Đang xử lý…" : "Xem trước danh sách"}</Button></form>
    {error && <p ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-destructive">{error}</p>}{success && <p role="status" className="mt-4 rounded-lg bg-teal-50 p-4 text-sm text-primary">{success}</p>}
    {preview && <div className="mt-6 border-t pt-5"><h3 ref={summary} tabIndex={-1} className="font-bold">Xem trước · {preview.ready} hợp lệ · {preview.invalid} lỗi · {preview.duplicate} trùng</h3><p className="my-3 text-sm text-muted-foreground">Chưa lưu thành viên nào. Các dòng trùng hoặc lỗi sẽ được bỏ qua. Không ghi đè hồ sơ và không tự liên kết tài khoản.</p><ul className="max-h-[32rem] space-y-3 overflow-y-auto rounded-xl border p-3" aria-label="Kết quả kiểm tra file Excel">{preview.rows.slice(0, visible).map(row => <li key={row.row} className="rounded-lg bg-muted p-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold">Dòng {row.row} · {row.name || "Thiếu họ tên"}</p><p className="text-xs font-semibold">{row.status === "ready" ? "Hợp lệ" : row.status === "duplicate" ? "Bỏ qua: trùng" : "Cần sửa"}</p></div><p className="mt-1 text-sm">{row.phone || "Thiếu số điện thoại"}</p><p className={`mt-1 text-xs ${row.status === "invalid" ? "text-destructive" : "text-muted-foreground"}`}>{row.message}</p></li>)}</ul>
      {preview.rows.length > visible && <Button type="button" variant="ghost" onClick={() => setVisible(v => v + 50)}>Hiện thêm 50 dòng</Button>}
      {!!(preview.invalid + preview.duplicate) && <label className="my-4 flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-5 shrink-0" />Tôi đồng ý bỏ qua {preview.invalid + preview.duplicate} dòng lỗi/trùng và chỉ nhập các dòng hợp lệ.</label>}
      <div className="mt-4 flex flex-wrap gap-3"><Button type="button" disabled={busy || !preview.ready || !!(preview.invalid + preview.duplicate) && !confirmed} onClick={() => void send("commit")}>Nhập {preview.ready} thành viên hợp lệ</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setPreview(null)}>Hủy xem trước</Button></div></div>}
  </section>;
}
