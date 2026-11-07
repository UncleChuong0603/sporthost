"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ImagePicker({ name, label, maxMB, required = false }: { name: string; label: string; maxMB: number; required?: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const element = input.current, form = element?.form;
    function reset() { setFile(null); setError(""); element?.setCustomValidity(""); }
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, []);
  return <div className="space-y-3 rounded-xl border border-dashed bg-muted/40 p-4">
    <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold"><ImagePlus className="size-4 text-primary" aria-hidden="true" />{label}</label>
    <Input id={id} name={name} type="file" required={required} accept="image/png,image/jpeg,image/webp" aria-invalid={!!error} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} onChange={event => {
      const selected = event.currentTarget.files?.[0];
      const issue = selected && (!["image/png", "image/jpeg", "image/webp"].includes(selected.type) ? "Chọn ảnh PNG, JPEG hoặc WebP." : !selected.size || selected.size > maxMB * 1024 * 1024 ? `Ảnh cần lớn hơn 0 và không quá ${maxMB} MB.` : "");
      event.currentTarget.setCustomValidity(issue || ""); setError(issue || ""); setFile(issue ? null : selected || null);
    }} ref={input} />
    <p id={`${id}-hint`} className="text-xs leading-5 text-muted-foreground">PNG, JPEG hoặc WebP · tối đa {maxMB} MB. Kiểm tra ảnh rõ nét trước khi gửi.</p>
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
    {preview && <div className="space-y-2"><img src={preview} alt="Xem trước ảnh đã chọn" className="max-h-64 w-full rounded-lg border bg-white object-contain" /><div className="flex items-center justify-between gap-2"><p className="min-w-0 text-xs text-muted-foreground">{file?.name} · {Math.ceil((file?.size || 0) / 1024)} KB</p><Button type="button" variant="ghost" aria-label="Bỏ ảnh đã chọn" onClick={() => { const input = document.getElementById(id) as HTMLInputElement; input.value = ""; input.setCustomValidity(""); setFile(null); setError(""); }}><X aria-hidden="true" />Bỏ ảnh</Button></div></div>}
  </div>;
}
