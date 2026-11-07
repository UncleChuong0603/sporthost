"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ShareSession({ publicId, title }: { publicId: string; title: string }) {
  const path = `/join/${encodeURIComponent(publicId)}`;
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function copy() {
    const url = new URL(path, window.location.origin).href;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setMessage("Đã sao chép link đăng ký.");
    } catch {
      if (input.current) { input.current.value = url; input.current.focus(); input.current.select(); }
      setMessage("Chọn link bên dưới rồi sao chép để gửi cho người chơi.");
    }
  }
  async function share() {
    if (busy) return;
    setBusy(true);
    try {
      if (navigator.share) await navigator.share({ title, text: `Tham gia ${title} trên SportHost`, url: new URL(path, window.location.origin).href });
      else await copy();
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) await copy();
    } finally { setBusy(false); }
  }
  return <div className="w-full space-y-3 border-t pt-4">
    <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={copy}>Sao chép link đăng ký</Button><Button type="button" variant="outline" disabled={busy} onClick={share}>{busy ? "Đang chia sẻ…" : "Chia sẻ buổi chơi"}</Button></div>
    <label className="block space-y-2 text-sm font-semibold"><span className="block">Link đăng ký công khai</span><Input ref={input} readOnly defaultValue={path} onFocus={event => { event.currentTarget.value = new URL(path, window.location.origin).href; event.currentTarget.select(); }} /></label>
    <p className="text-xs text-muted-foreground">Gửi link này vào nhóm của CLB để nhận đăng ký.</p>
    <p role="status" aria-live="polite" className="text-sm text-primary">{message}</p>
  </div>;
}
