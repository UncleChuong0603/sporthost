"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SessionShare({ publicPath, title, startsAt, venue }: { publicPath: string; title: string; startsAt: string; venue: string | null }) {
  const [url, setUrl] = useState(publicPath);
  const [canShare, setCanShare] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setUrl(new URL(publicPath, window.location.origin).href);
    setCanShare(typeof navigator.share === "function");
  }, [publicPath]);
  async function copy(text: string, success: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(success);
    } catch {
      input.current?.focus();
      input.current?.select();
      setMessage("Chưa sao chép tự động được. Hãy sao chép liên kết trong ô bên trên để gửi cho người chơi.");
    }
  }
  async function share() {
    const text = [title, startsAt.replace("T", " · "), venue || "", "Đăng ký tham gia tại:"].filter(Boolean).join("\n");
    setMessage(""); setBusy(true);
    try {
      if (canShare) await navigator.share({ title, text, url });
      else await copy(text + "\n" + url, "Đã sao chép lời mời. Bạn có thể dán vào nhóm chat của CLB.");
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setMessage("Chưa chia sẻ được. Bạn có thể sao chép liên kết để gửi lời mời.");
    } finally { setBusy(false); }
  }
  return <section aria-label="Chia sẻ buổi chơi" className="mb-6 rounded-2xl border bg-white p-5">
    <h2 className="font-bold">Mời người chơi</h2>
    <p className="mt-2 text-sm text-muted-foreground">Gửi liên kết vào nhóm chat. Người chơi đăng ký trực tiếp, không cần tài khoản.</p>
    <label className="mt-4 block space-y-2 text-sm font-semibold"><span className="block">Liên kết đăng ký công khai</span><Input ref={input} readOnly value={url} onFocus={event => event.currentTarget.select()} /></label>
    <div className="mt-3 flex flex-wrap gap-3">
      <Button variant="outline" type="button" onClick={() => { setMessage(""); void copy(url, "Đã sao chép liên kết đăng ký."); }}><Copy aria-hidden="true" className="size-4" />Sao chép liên kết</Button>
      <Button variant="outline" type="button" disabled={busy} onClick={() => void share()}><Share2 aria-hidden="true" className="size-4" />{busy ? "Đang chia sẻ…" : canShare ? "Chia sẻ lời mời" : "Sao chép lời mời"}</Button>
    </div>
    <p role="status" className="mt-3 text-sm text-primary">{message}</p>
  </section>;
}
