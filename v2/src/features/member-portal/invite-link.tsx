"use client";
import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ConnectionInviteLink({ code }: { code: string }) {
  const [url, setUrl] = useState(`/connect/${code}`), [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setUrl(new URL(`/connect/${code}`, window.location.origin).href); setMessage(""); }, [code]);
  return <div className="mt-4 space-y-3"><label className="block space-y-2 text-sm font-semibold"><span className="block">Liên kết mời kết nối CLB</span><Input ref={input} value={url} readOnly onFocus={event => event.currentTarget.select()} /></label><Button type="button" variant="outline" onClick={async () => {
    try { await navigator.clipboard.writeText(url); setMessage("Đã sao chép liên kết mời."); }
    catch { input.current?.focus(); input.current?.select(); setMessage("Hãy sao chép liên kết trong ô bên trên để gửi cho người chơi."); }
  }}><Copy aria-hidden="true" />Sao chép lời mời kết nối</Button><p role="status" className="text-sm text-primary">{message}</p></div>;
}
